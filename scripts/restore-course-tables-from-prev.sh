#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/restore-course-tables-from-prev.sh /tmp/prev_gpa_full.sql
# Defaults to /tmp/prev_gpa_full.sql

SQL_FILE="${1:-/tmp/prev_gpa_full.sql}"

# --- DB connection (edit/remove if you already export these) ---
export PGHOST="/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server"
export PGPORT=5432
export PGUSER="strapi"
export PGPASSWORD="Passw0rd@Strapi"
export PGDATABASE="strapi-db3"

# Options:
RESTORE_FILES=${RESTORE_FILES:-true}            # set false to skip files/files_related_morphs
RESTORE_COURSECATEGORIES=${RESTORE_COURSECATEGORIES:-false}  # set true if you want to restore categories too

[ -s "$SQL_FILE" ] || { echo "Prev dump not found: $SQL_FILE"; exit 1; }

# Detect uploads table names present in the PREVIOUS dump
FILES_TBL=""
MORPH_TBL=""
if grep -q '^COPY public\.files ' "$SQL_FILE"; then
  FILES_TBL="public.files"
  MORPH_TBL="public.files_related_morphs"
elif grep -q '^COPY public\.upload_files ' "$SQL_FILE"; then
  FILES_TBL="public.upload_files"
  if grep -q '^COPY public\.upload_files_related_morphs ' "$SQL_FILE"; then
    MORPH_TBL="public.upload_files_related_morphs"
  else
    MORPH_TBL="public.upload_files_related"
  fi
fi

# helper: stream one table's COPY block into psql
restore_table() {
  local T="$1"
  grep -q "^COPY $T " "$SQL_FILE" || { echo "Skip $T (no COPY in dump)"; return 0; }
  echo "Restoring $T ..."
  sed -n "/^COPY $T /,/^\\\./p" "$SQL_FILE" | psql -v ON_ERROR_STOP=1
}

echo "🔁 Truncating course-related tables..."
psql -v ON_ERROR_STOP=1 <<SQL
BEGIN;
-- media morphs before components
$( [ -n "$MORPH_TBL" ] && echo "TRUNCATE TABLE $MORPH_TBL RESTART IDENTITY CASCADE;" )
-- components
TRUNCATE TABLE public.components_coursecontent_quizzes RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.components_coursecontent_pagebreakers RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.components_coursecontent_videos RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.components_coursecontent_images RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.components_coursecontent_texts RESTART IDENTITY CASCADE;
-- mapping and courses
TRUNCATE TABLE public.courses_components RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.courses RESTART IDENTITY CASCADE;
-- optional: categories (default OFF)
$( [ "$RESTORE_COURSECATEGORIES" = "true" ] && echo "TRUNCATE TABLE public.coursecategories RESTART IDENTITY CASCADE;" )
-- files last (default ON)
$( [ "$RESTORE_FILES" = "true" ] && [ -n "$FILES_TBL" ] && echo "TRUNCATE TABLE $FILES_TBL RESTART IDENTITY CASCADE;" )
COMMIT;
SQL

echo "📥 Replaying tables from: $SQL_FILE"

# files (optional, before morphs)
if [ "$RESTORE_FILES" = "true" ] && [ -n "$FILES_TBL" ]; then
  restore_table "$FILES_TBL"
fi

# components (order doesn’t matter, do all)
restore_table public.components_coursecontent_texts
restore_table public.components_coursecontent_images
restore_table public.components_coursecontent_videos
restore_table public.components_coursecontent_pagebreakers
restore_table public.components_coursecontent_quizzes

# mapping + courses
restore_table public.courses
restore_table public.courses_components

# coursecategories (optional)
if [ "$RESTORE_COURSECATEGORIES" = "true" ]; then
  restore_table public.coursecategories
fi

# morphs (after components & files)
if [ -n "$MORPH_TBL" ]; then
  restore_table "$MORPH_TBL"
fi

echo "🛠  Post-fixes (conditional locale, reset sequences)..."
# Conditionally set mapping.locale to 'en' iff the column exists
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $do$
BEGIN
IF EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='courses_components'
    AND column_name='locale'
) THEN
  UPDATE public.courses_components
  SET locale = COALESCE(NULLIF(locale,''), 'en')
  WHERE field='content';
END IF;
END
$do$;
SQL

# Reset sequences (guard each; no-op if sequence missing)
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE WHEN pg_get_serial_sequence('public.courses','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.courses','id'),
                       COALESCE((SELECT MAX(id) FROM public.courses),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.courses_components','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.courses_components','id'),
                       COALESCE((SELECT MAX(id) FROM public.courses_components),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.components_coursecontent_texts','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.components_coursecontent_texts','id'),
                       COALESCE((SELECT MAX(id) FROM public.components_coursecontent_texts),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.components_coursecontent_images','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.components_coursecontent_images','id'),
                       COALESCE((SELECT MAX(id) FROM public.components_coursecontent_images),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.components_coursecontent_videos','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.components_coursecontent_videos','id'),
                       COALESCE((SELECT MAX(id) FROM public.components_coursecontent_videos),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.components_coursecontent_pagebreakers','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.components_coursecontent_pagebreakers','id'),
                       COALESCE((SELECT MAX(id) FROM public.components_coursecontent_pagebreakers),0)) END;
SELECT CASE WHEN pg_get_serial_sequence('public.components_coursecontent_quizzes','id') IS NOT NULL
            THEN setval(pg_get_serial_sequence('public.components_coursecontent_quizzes','id'),
                       COALESCE((SELECT MAX(id) FROM public.components_coursecontent_quizzes),0)) END;
SQL

echo "✅ Done. Now restart Strapi and check Courses 5 & 6 in Admin (locale en)."
