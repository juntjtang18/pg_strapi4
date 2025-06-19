#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
# This prevents unintended side effects if a command fails.
set -e

# --- Configuration ---
# Centralize your configuration here for easy updates.
PROJECT_ID="lucid-arch-451211-b0"
SERVICE_NAME="my-strapi-app"
REGION="us-west1"
CLOUD_SQL_INSTANCE="lucid-arch-451211-b0:us-west1:cloud-sql-server"

# Use the short Git commit hash as the version tag.
# Before running, make sure you have committed your changes to Git.
VERSION=$(git rev-parse --short HEAD)
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${VERSION}"

# --- Deployment Steps ---

echo "--- Deploying version: ${VERSION} ---"

# 1. Build and tag the Docker image with the version
echo "Building Docker image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

# 2. Push the versioned Docker image to Google Container Registry
echo "Pushing Docker image..."
docker push "${IMAGE_NAME}"

# 3. Deploy the new version to Cloud Run
# Each environment variable is set on its own line for better readability and maintainability.
#
# !!! --- SECURITY WARNING --- !!!
# Storing secrets (like passwords and API keys) directly in a script is a significant security risk.
# For production workloads, you should use Google Secret Manager to store sensitive data
# and grant your Cloud Run service account permission to access them.
# Learn more: https://cloud.google.com/secret-manager
echo "Deploying to Cloud Run service: ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --platform "managed" \
  --region "${REGION}" \
  --memory "1Gi" \
  --timeout "600" \
  --allow-unauthenticated \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}" \
  --set-env-vars "NODE_ENV=development" \
  --set-env-vars "CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE}" \
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
  --revision-suffix "${VERSION}" # This adds the git hash to the revision name in the GCP console for clarity

echo "--- Deployment of ${SERVICE_NAME} version ${VERSION} complete! ---"
