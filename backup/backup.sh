#!/bin/bash
SOCKET_PATH="/Users/James/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"

echo "Backing up PostgreSQL..."
pg_dump -h $SOCKET_PATH -U dbadmin -d strapi-db2 > ./database/strapi-dev2_backup.sql

echo "Backing up GCS..."
gsutil -m cp -r gs://lucid-arch-451211-b0-strapi-storage/* ./storage/

echo "Backup completed."

