#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
BACKUP_DIR="${SCRIPT_DIR}/backups"
# Prefer Homebrew libpq if it is installed but not on PATH.
export PATH="/opt/homebrew/opt/libpq/bin:${PATH}"

usage() {
  cat <<'EOF'
Backup the Cloud SQL Postgres database as a plain-text SQL file.

Usage:
  ./backup.sh
  ./backup.sh --help

Reads DATABASE_HOST, DATABASE_NAME, DATABASE_USERNAME, and
DATABASE_PASSWORD / PGPASSWORD from ../.env.

The dump is written to:
  database/backups/<DATABASE_NAME>_backup.sql

GCS media backup is disabled (bucket is too large for git).
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

SOCKET_PATH="${DATABASE_HOST:-/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server}"
DB_NAME="${DATABASE_NAME:-strapi-db3}"
DB_USER="${DATABASE_USERNAME:-strapi}"
export PGPASSWORD="${PGPASSWORD:-${DATABASE_PASSWORD:-}}"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup.sql"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install it with:" >&2
  echo "  brew install libpq" >&2
  echo "  echo 'export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\"' >> ~/.zshrc" >&2
  exit 1
fi

if [[ ! -S "${SOCKET_PATH}/.s.PGSQL.5432" ]]; then
  echo "ERROR: Cloud SQL socket not found at ${SOCKET_PATH}/.s.PGSQL.5432" >&2
  echo "Start the proxy first:" >&2
  echo "  /Users/juntjtang/develop/cloud-sql-server/start-proxy.sh" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "Backing up PostgreSQL..."
echo "  host: ${SOCKET_PATH}"
echo "  database: ${DB_NAME}"
echo "  user: ${DB_USER}"
echo "  output: ${BACKUP_FILE}"

pg_dump \
  -h "${SOCKET_PATH}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-acl \
  --format=plain \
  --file="${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE}"

# GCS media backup is intentionally disabled — the bucket is ~10 GiB.
# echo "Backing up GCS..."
# mkdir -p "${BACKUP_DIR}/gcs"
# gsutil -m cp -r gs://lucid-arch-451211-b0-strapi-storage/* "${BACKUP_DIR}/gcs/"
