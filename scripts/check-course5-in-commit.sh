#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-b9946499492e0bc1d9a62e4690cbc00dc9357b12}"

# Candidate dump paths in the repo
CANDIDATES=(
  "database/backups/gpa_full.sql"
  "backups/gpa_full.sql"
  "database/backups/gpa-full.sql"
  "backups/gpa-full.sql"
)

# Pick first path that exists in this commit
FILE=""
for p in "${CANDIDATES[@]}"; do
  if git cat-file -e "${COMMIT}:${p}" 2>/dev/null; then
    FILE="$p"
    break
  fi
done

if [[ -z "$FILE" ]]; then
  echo "❌ Could not find a gpa_full.sql (or gpa-full.sql) in commit ${COMMIT}."
  exit 1
fi

TMP="/tmp/commit_${COMMIT}_dump.sql"
git show "${COMMIT}:${FILE}" > "$TMP"

echo "🔎 Checking commit: ${COMMIT}"
echo "📄 Dump path in commit: ${FILE}"
echo "📦 Saved to: $TMP"
echo

# 1) Find Course 5 row in courses (COPY style)
COURSE_ID="$(
  awk -F'\t' '
    BEGIN{copy=0}
    /^COPY public\.courses /{copy=1; next}
    copy && $0=="\\."{copy=0}
    copy {
      txt=tolower($2)
      gsub(/^[[:space:]]+|[[:space:]]+$/,"",txt)
      if (txt ~ /^course[[:space:]_]*5($|[^0-9a-z])/) { print $1; exit }
    }
  ' "$TMP"
)"

if [[ -z "${COURSE_ID}" ]]; then
  echo "❌ Course 5 not found in public.courses of this dump."
  exit 2
fi

echo "✅ Found Course 5 with id: ${COURSE_ID}"
echo

# 2) Pull mapping rows for that course from courses_components
MAP_TSV="/tmp/_c5_${COMMIT}_map.tsv"
awk -F'\t' -v cid="$COURSE_ID" '
  BEGIN{copy=0}
  /^COPY public\.courses_components /{copy=1; next}
  copy && $0=="\\."{copy=0}
  copy {
    # expected fields: 1=id 2=entity_id 3=component_id 4=component_type 5=field 6=order ...
    if ($2==cid && $5=="content") printf "%06d\t%s\t%s\n", $6, $4, $3
  }
' "$TMP" | sort -n > "$MAP_TSV"

TOTAL_MAP=$(wc -l < "$MAP_TSV" | tr -d ' ')
echo "🧩 courses_components rows for Course ${COURSE_ID}: ${TOTAL_MAP}"

if [[ "${TOTAL_MAP}" -eq 0 ]]; then
  echo "❌ No dynamic-zone mapping rows found for Course ${COURSE_ID}."
  exit 3
fi

printf "%-28s %s\n" "component_type" "count"
awk -F'\t' '{c[$2]++} END{for(k in c) printf "%-28s %d\n", k, c[k]}' "$MAP_TSV" \
  | sort

# Helper to build CSV of component_ids per type
ids_csv() { awk -F'\t' -v t="$1" '$2==t{print $3}' "$MAP_TSV" | sort -u | paste -sd, -; }

IDS_TEXT=$(ids_csv "coursecontent.text")
IDS_IMG=$(ids_csv "coursecontent.image")
IDS_VID=$(ids_csv "coursecontent.video")
IDS_PB=$(ids_csv "coursecontent.pagebreaker")
IDS_QZ=$(ids_csv "coursecontent.quiz")

# Helper: count present rows in a component table for a given id list
count_rows() {
  local tbl="$1" ids="$2"
  [[ -z "$ids" ]] && { echo 0; return; }
  awk -F'\t' -v tbl="$tbl" -v ids=" ${ids//,/ } " '
    BEGIN{copy=0; split(ids,a," "); for(i in a) if(a[i]!="") want[a[i]]=1; n=0}
    $0 ~ "^COPY "tbl" " {copy=1; next}
    copy && $0=="\\." {copy=0}
    copy {
      if (want[$1]) n++
    }
    END{print n}
  ' "$TMP"
}

echo
echo "📚 Component row presence (have/need):"
printf "  %-35s %s\n" "public.components_coursecontent_texts:"   "$(count_rows public.components_coursecontent_texts "$IDS_TEXT")/$(tr -cd , <<<"${IDS_TEXT}" | wc -c | awk '{print $1+0}')"
printf "  %-35s %s\n" "public.components_coursecontent_images:"  "$(count_rows public.components_coursecontent_images "$IDS_IMG")/$(tr -cd , <<<"${IDS_IMG}" | wc -c | awk '{print $1+0}')"
printf "  %-35s %s\n" "public.components_coursecontent_videos:"  "$(count_rows public.components_coursecontent_videos "$IDS_VID")/$(tr -cd , <<<"${IDS_VID}" | wc -c | awk '{print $1+0}')"
printf "  %-35s %s\n" "public.components_coursecontent_pagebreakers:" "$(count_rows public.components_coursecontent_pagebreakers "$IDS_PB")/$(tr -cd , <<<"${IDS_PB}" | wc -c | awk '{print $1+0}')"
printf "  %-35s %s\n" "public.components_coursecontent_quizzes:" "$(count_rows public.components_coursecontent_quizzes "$IDS_QZ")/$(tr -cd , <<<"${IDS_QZ}" | wc -c | awk '{print $1+0}')"

echo
echo "🧪 Quick verdict:"
if [[ "$TOTAL_MAP" -gt 0 ]]; then
  # If we have mapping plus at least 1 component row present, call it a "yes"
  HAVE_ANY=$(( $(count_rows public.components_coursecontent_texts "$IDS_TEXT") \
             + $(count_rows public.components_coursecontent_images "$IDS_IMG") \
             + $(count_rows public.components_coursecontent_videos "$IDS_VID") \
             + $(count_rows public.components_coursecontent_pagebreakers "$IDS_PB") \
             + $(count_rows public.components_coursecontent_quizzes "$IDS_QZ") ))
  if [[ "$HAVE_ANY" -gt 0 ]]; then
    echo "✅ Commit ${COMMIT} contains Course 5 (id=${COURSE_ID}) with detailed content rows."
    exit 0
  else
    echo "⚠️  Commit ${COMMIT} has Course 5 mapping, but component rows were not found."
    exit 4
  fi
else
  echo "❌ No mapping rows; Course 5 not fully present."
  exit 5
fi
