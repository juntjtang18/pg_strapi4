# ----- build-course5-restore.sql.sh -----
set -euo pipefail

TMP="/tmp/prev_gpa_full.sql"      # previous dump you already extracted
OUT="/tmp/course5_restore_from_prev.sql"
COURSE_ID="13"                    # from your run
[ -s "$TMP" ] || { echo "Missing $TMP"; exit 1; }

echo "Generating $OUT from $TMP for course id=$COURSE_ID …"

# 1) Pull the mapping for this course into a TSV: order, type, component_id
MAP_TSV="/tmp/_c5_map.tsv"
awk -F$'\t' -v cid="$COURSE_ID" '
  BEGIN{blk=0}
  /^COPY public\.courses_components /{blk=1; header=$0; next}
  blk && $0=="\\." {blk=0; next}
  blk && $2==cid { printf "%06d\t%s\t%s\n", $6, $4, $3 }
' "$TMP" | sort -n > "$MAP_TSV"

if [ ! -s "$MAP_TSV" ]; then
  echo "No mapping rows found for entity_id=$COURSE_ID"; exit 1
fi

# 2) Start the output SQL (transaction, safety deletes)
{
  echo "-- Course 5 restore generated $(date)"
  echo "BEGIN;"

  # wipe current mapping for this course (content field only)
  echo "DELETE FROM public.courses_components WHERE entity_id=$COURSE_ID AND field='content';"
} > "$OUT"

# helper to emit a subset COPY block for a given public table and a set of ids
emit_copy_block() {
  local pubtable="$1" ids_csv="$2"
  local ids_spc="${ids_csv//,/ }"

  # find the COPY header line for this table
  local header
  header=$(grep -m1 "^COPY ${pubtable} " "$TMP" || true)
  [ -n "$header" ] || { echo "-- (skip ${pubtable}: no COPY block in prev dump)" >> "$OUT"; return; }

  # delete existing ids to avoid conflicts, then emit COPY
  echo "DELETE FROM ${pubtable} WHERE id IN (${ids_csv});" >> "$OUT"
  echo "$header" >> "$OUT"

  # rows with matching ids
  awk -F$'\t' -v tbl="$pubtable" -v list="$ids_spc" '
    BEGIN{blk=0; n=split(list,a," "); for(i=1;i<=n;i++) w[a[i]]=1}
    $0 ~ "^COPY "tbl" " {blk=1; next}
    blk && $0=="\\."     {blk=0; print "\\."; print ""; next}
    blk && w[$1]         {print}
  ' "$TMP" >> "$OUT"
}

# 3) Rebuild courses_components for this course (exact rows from prev dump)
#    Grab the exact header first (columns must match)
CC_HEADER=$(grep -m1 '^COPY public\.courses_components ' "$TMP")
{
  echo "$CC_HEADER"
  awk -F$'\t' -v cid="$COURSE_ID" '
    BEGIN{blk=0}
    /^COPY public\.courses_components /{blk=1; next}
    blk && $0=="\\." {blk=0; next}
    blk && $2==cid   {print}
  ' "$TMP"
  echo '\.'
  echo
} >> "$OUT"

# 4) For each component type, collect ids and emit its subset COPY
# Map type "coursecontent.xxx" -> table "public.components_coursecontent_xxxs"
types=$(cut -f2 "$MAP_TSV" | sort -u)
for t in $types; do
  # build table name: replace . and - with _, and add plural "s"
  base=$(echo "$t" | tr '.-' '_' )
  table="public.components_${base}s"

  ids_csv=$(awk -F$'\t' -v ty="$t" '$2==ty{print $3}' "$MAP_TSV" | sort -u | paste -sd, -)
  [ -n "$ids_csv" ] || continue

  echo "-- ${table}  ids: ${ids_csv}" >> "$OUT"
  emit_copy_block "$table" "$ids_csv"
done

# 5) optional: ensure the course row exists (safe no-op if it does)
COURSES_HEADER=$(grep -m1 '^COPY public\.courses ' "$TMP" || true)
if [ -n "$COURSES_HEADER" ]; then
  echo "DELETE FROM public.courses WHERE id=${COURSE_ID};" >> "$OUT"
  {
    echo "$COURSES_HEADER"
    awk -F$'\t' -v cid="$COURSE_ID" '
      BEGIN{blk=0}
      /^COPY public\.courses /{blk=1; next}
      blk && $0=="\\." {blk=0; next}
      blk && $1==cid   {print}
    ' "$TMP"
    echo '\.'
    echo
  } >> "$OUT"
fi

echo "COMMIT;" >> "$OUT"

echo "Wrote $OUT"
