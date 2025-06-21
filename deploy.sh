#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Versioning Configuration ---
# The script will automatically increment the minor version number.
# To reset or change the major version, manually edit the 'VERSION' file.
VERSION_FILE="VERSION"

if [ ! -f "$VERSION_FILE" ]; then
  echo "1.0" > "$VERSION_FILE"
fi

# Read the version, increment the minor number
VERSION=$(awk -F. -v OFS=. '{$NF++;print}' "$VERSION_FILE")
echo "$VERSION" > "$VERSION_FILE"


# --- Configuration ---
PROJECT_ID="lucid-arch-451211-b0"
SERVICE_NAME="my-strapi-app"
REGION="us-west1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${VERSION}"
CLOUD_SQL_INSTANCE="lucid-arch-451211-b0:us-west1:cloud-sql-server"


# --- Deployment Steps ---

echo "--- Deploying version: ${VERSION} ---"

# 1. Build and tag the Docker image
echo "Building Docker image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

# 2. Push the Docker image to Google Container Registry
echo "Pushing Docker image..."
docker push "${IMAGE_NAME}"

# 3. Deploy to Cloud Run
# !!! --- SECURITY WARNING --- !!!
# For production, use Google Secret Manager for sensitive data.
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
  --revision-suffix "v${VERSION}"

echo "--- Deployment of ${SERVICE_NAME} version ${VERSION} complete! ---"