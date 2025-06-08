#!/bin/bash

# Strapi Project Refresh Script
# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# !!! IMPORTANT: Update these variables to match your environment !!!

# Admin user for creating/dropping databases (typically 'postgres' in Cloud SQL)
DB_ADMIN_USER="postgres"

# Application user (this user will own the database objects and ideally the database itself)
DB_APP_USER="strapi"
DB_NAME="strapi-dev3"

# Connection info for psql.
# The script will append '-d <database_name>' as needed for each command.
DB_HOST_SOCKET="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server" # Path to your Cloud SQL Proxy socket

# Passwords - Ensure these are set correctly and securely managed.
# It's highly recommended to use environment variables or a secret manager for passwords in a real environment.
DB_ADMIN_PASSWORD="tj13in4link" # !!! SET YOUR POSTGRES/ADMIN USER PASSWORD HERE !!!
DB_APP_PASSWORD="Passw0rd@Strapi"   # !!! SET YOUR STRAPI APPLICATION USER PASSWORD HERE !!! (Must match .env)

# Git and project file paths
GIT_REPO_URL="https://github.com/juntjtang18/pg_strapi4.git"
PROJECT_DIR_NAME="pg_strapi4" # Just the directory name, not the full path here
DB_BACKUP_FILE_RELATIVE_PATH="backup/database/strapi-dev3_backup.sql" # Relative to the root of the cloned project

# --- Script Execution ---

echo "--- Starting Strapi Project Refresh ---"

# 1. Drop and Create the Database, Grant Roles to Admin for Restore
# Connects as the DB_ADMIN_USER to the 'postgres' maintenance database.
echo "Connecting as admin user '$DB_ADMIN_USER' to prepare database '$DB_NAME'..."
export PGPASSWORD=$DB_ADMIN_PASSWORD
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "CREATE DATABASE \"$DB_NAME\";"
# Grant dbadmin role to admin user to handle ownership in dump file during restore
# Assumes 'dbadmin' role exists.
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "GRANT dbadmin TO \"$DB_ADMIN_USER\";"
# Grant app user role to admin user to allow reassigning objects to app user later
# Assumes 'strapi' (DB_APP_USER) role exists.
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "GRANT \"$DB_APP_USER\" TO \"$DB_ADMIN_USER\";"
# Grant all privileges on the new database to the application user
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$DB_APP_USER\";"
# Note: Database is currently owned by DB_ADMIN_USER. Ownership will be changed after restore.
# unset PGPASSWORD # Keep PGPASSWORD set for the restore step by DB_ADMIN_USER
echo "Database '$DB_NAME' created. Admin user granted temporary roles for restore."
echo "--- Database Setup Initial Phase Complete ---"

# 2. Clean and Clone Git Repository
echo "Cleaning up old project directory (if exists) and cloning fresh repository..."
if [ -d "$PROJECT_DIR_NAME" ]; then
  echo "Removing existing directory: $PROJECT_DIR_NAME"
  rm -rf "$PROJECT_DIR_NAME"
fi
git clone "$GIT_REPO_URL" "$PROJECT_DIR_NAME"
cd "$PROJECT_DIR_NAME" # Change directory into the cloned project
echo "Cloned repository into $(pwd)"
echo "--- Git Clone Complete ---"

# 3. Create .env file
# Ensures DATABASE_USERNAME and DATABASE_PASSWORD match the DB_APP_USER and its password.
echo "Creating .env file in $(pwd)..."
cat << EOF > .env
HOST=0.0.0.0
PORT=8080
APP_KEYS=qasqVyZOf8KJ/rgYYbE4/w==,JmDepwXWOjGxfNHgDhg43w==,ANPSI9a+z4WmnfBOaHxlHg==,V6CIUf0vcj/GJ8Gt4306TA==
API_TOKEN_SALT=Xtz+i5IPW3ApE3eIsYQF9w==
ADMIN_JWT_SECRET=4mvOKZ35kjlNVjjxB/+0xQ==
TRANSFER_TOKEN_SALT=O35AEehAeD7N+1h6sS73Lw==
# IS_LOCAL=true # You can uncomment this if your Strapi setup uses it

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=${DB_HOST_SOCKET} # Use the variable for consistency
DATABASE_PORT=5432
DATABASE_NAME=${DB_NAME}
DATABASE_USERNAME=${DB_APP_USER}
DATABASE_PASSWORD=${DB_APP_PASSWORD} # Use the app user's password
DATABASE_SSL=false # Set to true if your proxy/connection requires SSL
JWT_SECRET=zNFVknwhnld60t/32I7iPA==
EOF
echo ".env file created."
echo "--- .env File Creation Complete ---"

# 4. Restore the database backup
# Connects as the DB_ADMIN_USER to restore the data.
# DB_ADMIN_USER (with PGPASSWORD still set from step 1) has been granted 'dbadmin' and 'strapi' roles.
DB_BACKUP_FILE_FULL_PATH="$(pwd)/$DB_BACKUP_FILE_RELATIVE_PATH" # Construct full path after cd

if [ ! -f "$DB_BACKUP_FILE_FULL_PATH" ]; then
    echo "ERROR: Backup file '$DB_BACKUP_FILE_FULL_PATH' not found."
    unset PGPASSWORD # Clear password before exiting on error
    exit 1
fi

echo "Restoring database '$DB_NAME' as user '$DB_ADMIN_USER' from '$DB_BACKUP_FILE_FULL_PATH'..."
# PGPASSWORD for DB_ADMIN_USER is still set from Step 1
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "$DB_NAME" < "$DB_BACKUP_FILE_FULL_PATH"
echo "Database restore by '$DB_ADMIN_USER' complete."
echo "--- Database Restore Complete ---"

# 5. Post-Restore Ownership Consolidation and Cleanup (as DB_ADMIN_USER)
echo "Consolidating object ownership to '$DB_APP_USER' and cleaning up admin roles..."
# PGPASSWORD for DB_ADMIN_USER is still set
# Connect to the restored database to reassign ownership of objects within it.
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "$DB_NAME" -c "REASSIGN OWNED BY dbadmin TO \"$DB_APP_USER\";"
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "$DB_NAME" -c "REASSIGN OWNED BY \"$DB_ADMIN_USER\" TO \"$DB_APP_USER\";"
echo "Object ownership reassigned to '$DB_APP_USER'."

# Attempt to change database owner to DB_APP_USER.
# Connect to 'postgres' maintenance database for ALTER DATABASE command.
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_APP_USER\";"
echo "Attempted to set '$DB_APP_USER' as owner of database '$DB_NAME'."

# Revoke temporary roles from DB_ADMIN_USER
psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "REVOKE dbadmin FROM \"$DB_ADMIN_USER\";"
# Optionally revoke app user role from admin if desired, though cloudsqlsuperuser typically has CREATEROLE
# psql -h "$DB_HOST_SOCKET" -U "$DB_ADMIN_USER" -d "postgres" -c "REVOKE \"$DB_APP_USER\" FROM \"$DB_ADMIN_USER\";"
unset PGPASSWORD
echo "--- Post-Restore Ownership and Cleanup Complete ---"

# 6. Install npm dependencies
echo "Installing npm dependencies..."
npm install
echo "--- NPM Install Complete ---"

echo ""
echo "-------------------------------------"
echo "Strapi project refresh complete!"
echo "Navigate to $(pwd) and run 'npm run develop'"
echo "-------------------------------------"
