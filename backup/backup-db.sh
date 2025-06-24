#!/bin/bash

# --- Configuration ---
# IMPORTANT: For better security, consider sourcing the password from a
# .env file or a secret manager instead of hardcoding it here.

SOCKET_PATH="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"
DB_USER="strapi"
DB_PASSWORD="Passw0rd@Strapi"
BACKUP_DIR="./database"

# --- Pre-flight Checks ---

# Check if a database name was provided as an argument.
if [ -z "$1" ]; then
  echo "Error: No database name provided."
  echo "Usage: $0 <database_name>"
  exit 1
fi

# --- Variables ---
DB_NAME=$1
# Generates a timestamp in YYYYMMDD-HHMMSS format.
TIMESTAMP=$(date +'%Y%m%d-%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql"

# Create the backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# --- Main Backup Logic ---

echo "Backing up PostgreSQL database '${DB_NAME}'..."

# The PGPASSWORD environment variable is used by pg_dump to authenticate.
export PGPASSWORD=$DB_PASSWORD

# Perform the database dump
pg_dump -h "$SOCKET_PATH" -U "$DB_USER" -d "$DB_NAME" --no-password > "$BACKUP_FILE"

# Check the exit code of pg_dump to confirm success
if [ $? -eq 0 ]; then
  echo "Successfully created backup: ${BACKUP_FILE}"
else
  echo "Error: Backup failed for database '${DB_NAME}'."
  # Optional: Remove the empty or partial file on failure
  rm -f "$BACKUP_FILE"
  # Unset the password variable and exit with an error code
  unset PGPASSWORD
  exit 1
fi

# Unset the password variable for security
unset PGPASSWORD

# The commented out GCS backup logic remains unchanged.
#echo "Backing up GCS..."
#gsutil -m cp -r gs://lucid-arch-451211-b0-strapi-storage/* ./storage/

echo "Backup script completed."