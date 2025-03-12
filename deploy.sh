
docker build -t gcr.io/lucid-arch-451211-b0/my-strapi-app:latest .

docker push gcr.io/lucid-arch-451211-b0/my-strapi-app:latest

gcloud run deploy my-strapi-app \
  --image gcr.io/lucid-arch-451211-b0/my-strapi-app \
  --platform managed \
  --region us-west1 \
  --add-cloudsql-instances lucid-arch-451211-b0:us-west1:cloud-sql-server \
  --set-env-vars "CLOUD_SQL_INSTANCE=lucid-arch-451211-b0:us-west1:cloud-sql-server,DATABASE_NAME=strapi-db2,DATABASE_USERNAME=dbadmin,DATABASE_PASSWORD=tj13in4link" \
  --memory 1Gi \
  --allow-unauthenticated \
  --timeout 600