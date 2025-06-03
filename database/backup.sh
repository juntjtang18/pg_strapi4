#!/bin/bash
SOCKET_PATH="/Users/James/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"

echo "Backing up PostgreSQL..."
pg_dump -h $SOCKET_PATH -U dbadmin -d strapi-db2 > ./backups/strapi-dev2_backup.sql

echo "Backing up GCS..."
mkdir -p ./backups/gcs
gsutil -m cp -r gs://lucid-arch-451211-b0-strapi-storage/* ./backups/gcs/

echo "Backup completed."

