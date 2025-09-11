#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status.

# --- Input Validation ---
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "❌ ERROR: Missing arguments."
  echo "Usage: $0 <new_database_name> <path_to_backup_file.sql>"
  echo "Example: $0 strapi-db3 /tmp/prev_gpa_full.sql"
  exit 1
fi

# --- Configuration ---
NEW_DBNAME="$1"
BACKUP_FILE="$2"

DB_ADMIN_USER="postgres"
DB_ADMIN_PASSWORD="Passw0rd@P0stgres"   # change if your actual admin password differs
DB_APP_USER="strapi"
DB_HOST="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"

# Set the password for the psql commands
export PGPASSWORD="$DB_ADMIN_PASSWORD"

echo "--- Starting Database Restore Process for '$NEW_DBNAME' ---"

# 1) Drop existing database if it exists
echo "--- Dropping existing database (if any)…"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "postgres" -c "DROP DATABASE IF EXISTS \"$NEW_DBNAME\";"
echo "✔️ Dropped database if it existed."

# 2) Create the new database
echo "--- Creating new database…"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "postgres" -c "CREATE DATABASE \"$NEW_DBNAME\";"
echo "✔️ Database created."

# 3) Grant initial privileges to the application user
echo "--- Granting privileges to user '$DB_APP_USER'…"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "postgres" -c "GRANT ALL PRIVILEGES ON DATABASE \"$NEW_DBNAME\" TO \"$DB_APP_USER\";"
echo "✔️ Privileges granted."

# 4) Restore the database from the plain-text backup file
echo "--- Restoring database from '$BACKUP_FILE'…"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "$NEW_DBNAME" -f "$BACKUP_FILE"
echo "✔️ Restore complete."

# 5) Reassign ownership of all database objects to the application user
echo "--- Reassigning ownership of all objects to '$DB_APP_USER'…"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "$NEW_DBNAME" -c "REASSIGN OWNED BY \"$DB_ADMIN_USER\" TO \"$DB_APP_USER\";"
psql -h "$DB_HOST" -U "$DB_ADMIN_USER" -d "postgres"   -c "ALTER DATABASE \"$NEW_DBNAME\" OWNER TO \"$DB_APP_USER\";"
echo "✔️ Ownership reassigned."

# Unset the password variable
unset PGPASSWORD

echo ""
echo "------------------------------------------------------------"
echo "✅ Database '$NEW_DBNAME' restored and configured successfully!"
echo "------------------------------------------------------------"
