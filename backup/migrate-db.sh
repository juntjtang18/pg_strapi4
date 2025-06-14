#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# The standard user for connecting to and managing the Strapi database.
# This user will own the new database.
PG_USER="strapi"
PG_USER_PASSWORD="Passw0rd@Strapi" # <-- IMPORTANT: Set your strapi user's password here

# The admin user with privileges to create new databases.
# This is typically 'postgres'.
PG_ADMIN_USER="postgres"
PG_ADMIN_PASSWORD="tj13in4link" # <-- IMPORTANT: Set your admin user's password here

# The original database to be backed up.
SOURCE_DB="strapi-dev3"

# The new database to be created and restored into.
DEST_DB="strapi-db3"

# The directory where the backup file will be stored.
BACKUP_DIR="./database"

# Generate a timestamp in the format YYYY-MM-DD_HH-MM-SS.
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# The full path to the backup file, including the timestamp.
BACKUP_FILE="$BACKUP_DIR/${SOURCE_DB}_${TIMESTAMP}.dump"

# The Google Cloud SQL instance connection name (Unix socket path).
# This is the directory where the socket file is located.
CLOUD_SQL_SOCKET_PATH="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"

# --- Script ---

echo "Starting database backup and restore process..."

# Create the backup directory if it doesn't exist.
if [ ! -d "$BACKUP_DIR" ]; then
  echo "Creating backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

# 1. Backup the source database using the standard user.
echo "Backing up database '$SOURCE_DB' to '$BACKUP_FILE'..."
export PGPASSWORD="$PG_USER_PASSWORD"
pg_dump -h "$CLOUD_SQL_SOCKET_PATH" -U "$PG_USER" -d "$SOURCE_DB" -Fc -f "$BACKUP_FILE"
unset PGPASSWORD
echo "Backup complete."

# Set the password for all subsequent admin operations.
export PGPASSWORD="$PG_ADMIN_PASSWORD"

# 2. Drop and recreate the destination database as the admin user.
echo "Connecting as admin user '$PG_ADMIN_USER' to prepare database '$DEST_DB'..."
# Connect to the default 'postgres' database to perform admin tasks.
psql -h "$CLOUD_SQL_SOCKET_PATH" -U "$PG_ADMIN_USER" -d "postgres" -c "DROP DATABASE IF EXISTS \"$DEST_DB\";"
createdb -h "$CLOUD_SQL_SOCKET_PATH" -U "$PG_ADMIN_USER" "$DEST_DB"
echo "Database '$DEST_DB' created."

# 3. Restore the backup to the new database using the admin user.
# The admin user has the necessary permissions to create all objects from the dump.
echo "Restoring backup from '$BACKUP_FILE' to '$DEST_DB' (as user '$PG_ADMIN_USER')..."
pg_restore -h "$CLOUD_SQL_SOCKET_PATH" -U "$PG_ADMIN_USER" -d "$DEST_DB" "$BACKUP_FILE"
echo "Restore complete."

# 4. Grant all privileges and transfer ownership to the application user.
# This ensures the 'strapi' user has full control over all objects.
echo "Finalizing ownership and privileges for user '$PG_USER'..."
psql -h "$CLOUD_SQL_SOCKET_PATH" -U "$PG_ADMIN_USER" -d "$DEST_DB" <<EOF
-- Grant all privileges on the database to the application user
GRANT ALL ON DATABASE "$DEST_DB" TO "$PG_USER";
-- Grant all privileges on the public schema and its contents
GRANT ALL ON SCHEMA public TO "$PG_USER";
GRANT ALL ON ALL TABLES IN SCHEMA public TO "$PG_USER";
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "$PG_USER";
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO "$PG_USER";
-- Reassign ownership of all objects created by the admin user to the application user
REASSIGN OWNED BY "$PG_ADMIN_USER" TO "$PG_USER";
-- Finally, change the database owner to the application user
ALTER DATABASE "$DEST_DB" OWNER TO "$PG_USER";
EOF
echo "Ownership and privileges have been transferred to '$PG_USER'."

# Unset the password after all admin operations are complete.
unset PGPASSWORD

echo "----------------------------------------"
echo "Database migration successful!"
echo "Source:      $SOURCE_DB"
echo "Destination: $DEST_DB"
echo "Backup file: $BACKUP_FILE"
echo "----------------------------------------"
