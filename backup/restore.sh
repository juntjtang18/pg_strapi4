#!/bin/bash

echo "Restoring PostgreSQL..."

PGPASSWORD=tj13in4link psql \
  -h /cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server \
  -U dbadmin -d strapi-dev2 < ./backups/strapi-dev2_backup.sql

echo "PostgreSQL restore completed."

echo "Restoring GCS files..."
gsutil -m cp -r ./backups/gcs/* gs://lucid-arch-451211-b0-strapi-storage/
echo "GCS restore completed."

