#!/bin/bash

# Build Docker image
docker build -t gcr.io/lucid-arch-451211-b0/my-strapi-app:latest .

# Push to Container Registry
docker push gcr.io/lucid-arch-451211-b0/my-strapi-app:latest

# Deploy to Cloud Run
gcloud run deploy my-strapi-app \
  --image gcr.io/lucid-arch-451211-b0/my-strapi-app:latest \
  --platform managed \
  --region us-west1 \
  --add-cloudsql-instances lucid-arch-451211-b0:us-west1:cloud-sql-server \
  --set-env-vars "CLOUD_SQL_INSTANCE=lucid-arch-451211-b0:us-west1:cloud-sql-server" \
  --set-env-vars "DATABASE_NAME=strapi-db2" \
  --set-env-vars "DATABASE_USERNAME=dbadmin" \
  --set-env-vars "DATABASE_PASSWORD=tj13in4link" \
  --set-env-vars "APP_URL=https://strapi.geniusParentingAI.ca" \
  --set-env-vars "ADMIN_URL=https://strapi.geniusParentingAI.ca/admin" \
  --memory 1Gi \
  --timeout 600 \
  --allow-unauthenticated

