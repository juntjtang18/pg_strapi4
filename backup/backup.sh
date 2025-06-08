#!/bin/bash
SOCKET_PATH="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"

echo "Backing up PostgreSQL..."
pg_dump -h $SOCKET_PATH -U strapi -d strapi-dev3 > ./database/strapi-dev3_backup.sql

#echo "Backing up GCS..."
#gsutil -m cp -r gs://lucid-arch-451211-b0-strapi-storage/* ./storage/

echo "Backup completed."

