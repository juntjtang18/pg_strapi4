#!/bin/bash

# === Config ===
STRAPI_URL="http://localhost:8080/api/upload"
IMAGE_TO_UPLOAD="/Users/James/Backup/Camera/20160527_101311.jpg"
AUTH_HEADER="Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMsImlhdCI6MTc1MDE4ODA5OCwiZXhwIjoxNzUyNzgwMDk4fQ.jNCYiE3R9uqRr8-Xe6Jsxoz9a7SWOgDcuH9LJH0VPx0"
TMP_RESPONSE="upload_response.json"
TMP_IMAGE="downloaded_from_gcs.jpg"

# === Step 1: Upload ===
echo "📤 Uploading image to Strapi..."
curl -s -X POST "$STRAPI_URL" \
  -H "$AUTH_HEADER" \
  -F "files=@$IMAGE_TO_UPLOAD" > "$TMP_RESPONSE"

# Check if upload worked
if ! jq -e '.[0].url' "$TMP_RESPONSE" >/dev/null; then
  echo "❌ Upload failed or unexpected response:"
  cat "$TMP_RESPONSE"
  exit 1
fi

# === Step 2: Extract URL ===
GCS_URL=$(jq -r '.[0].url' "$TMP_RESPONSE")
FULL_URL="${GCS_URL}"
echo "✅ Uploaded to GCS URL:"
echo "$FULL_URL"

# === Step 3: Download the image ===
echo "⬇️  Downloading image from GCS..."
curl -s -L -o "$TMP_IMAGE" "$FULL_URL"

if [[ ! -f "$TMP_IMAGE" ]]; then
  echo "❌ Failed to download the image."
  exit 1
fi

# === Step 4: Print EXIF ===
echo "🔍 Extracting EXIF metadata:"
exiftool "$TMP_IMAGE"

# Optional cleanup:
# rm "$TMP_RESPONSE" "$TMP_IMAGE"
