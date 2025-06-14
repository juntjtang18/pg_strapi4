#!/bin/bash

# Build and Push Docker image
docker build -t gcr.io/lucid-arch-451211-b0/my-strapi-app:latest .
docker push gcr.io/lucid-arch-451211-b0/my-strapi-app:latest

# Deploy to Cloud Run with each variable on its own line for readability
gcloud run deploy my-strapi-app \
  --image gcr.io/lucid-arch-451211-b0/my-strapi-app:latest \
  --platform managed \
  --region us-west1 \
  --add-cloudsql-instances lucid-arch-451211-b0:us-west1:cloud-sql-server \
  --set-env-vars "NODE_ENV=development" \
  --set-env-vars "CLOUD_SQL_INSTANCE=lucid-arch-451211-b0:us-west1:cloud-sql-server" \
  --set-env-vars "DATABASE_NAME=strapi-db3" \
  --set-env-vars "DATABASE_USERNAME=strapi" \
  --set-env-vars "DATABASE_PASSWORD=Passw0rd@Strapi" \
  --set-env-vars "APP_URL=https://strapi.geniusParentingAI.ca" \
  --set-env-vars "ADMIN_URL=https://strapi.geniusParentingAI.ca/admin" \
  --set-env-vars "APP_KEYS=qasqVyZOf8KJ/rgYYbE4/w==,JmDepwXWOjGxfNHgDhg43w==,ANPSI9a+z4WmnfBOaHxlHg==,V6CIUf0vcj/GJ8Gt4306TA==" \
  --set-env-vars "API_TOKEN_SALT=Xtz+i5IPW3ApE3eIsYQF9w==" \
  --set-env-vars "ADMIN_JWT_SECRET=4mvOKZ35kjlNVjjxB/+0xQ==" \
  --set-env-vars "JWT_SECRET=zNFVknwhnld60t/32I7iPA==" \
  --set-env-vars "TRANSFER_TOKEN_SALT=O35AEehAeD7N+1h6sS73Lw==" \
  --memory 1Gi \
  --timeout 600 \
  --allow-unauthenticated