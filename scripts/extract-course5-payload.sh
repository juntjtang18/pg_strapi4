#!/usr/bin/env bash
set -euo pipefail

# Input: previous dump (COPY format) that you already extracted earlier
TMP="${TMP:-/tmp/prev_gpa_full.sql}"
# The course id IN THE DUMP you want to reconstruct (you found 13 earlier)
PREV_COURSE_ID="${PREV_COURSE_ID:-13}"

OUT_JSON="/tmp/course5_payload.json"

need() { command -v "$1" >/dev/null || { echo "Missing $1. On macOS: brew install $1"; exit 1; }; }
need jq
[ -s "$TMP" ] || { echo "ERROR: $TMP not found or empty. Set TMP or re-run the prev-commit dump step."; exit 1; }

# ---- helper: pull first-matching row from a COPY block as key\tvalue lines (BSD-awk safe)
fetch_row_kv() {
  local pubtable="$1" id="$2"
  awk -F$'\t' -v want="$id" -v tbl="$pubtable" '
    BEGIN{blk=0; haveCols=0}
    $0 ~ "^COPY "tbl" " {
      blk=1
      # Extract column list between first "(" and next ")"
      start=index($0,"("); end=index($0,")")
      if (start>0 && end>start) {
        cols_str=substr($0,start+1,end-start-1)
        n=split(cols_str, cols, /, */)
        for (i=1;i<=n;i++) {
          gsub(/"/,"",cols[i])
          colname[ i ] = cols[i]
        }
        haveCols=1
      }
      next
    }
    blk && $0=="\\." { blk=0; next }
    blk && $1==want {
      if (!haveCols) { exit } # safety
      n=split($0,f,"\t")
      for (i=1;i<=n;i++) {
        printf("%s\t%s\n", colname[i], f[i])
      }
      exit
    }
  ' "$TMP"
}

# ---- helper: rows for this course in courses_components (BSD-awk safe)
copy_block_rows_for_course() {
  local pubtable="$1" field="$2"
  awk -F$'\t' -v cid="$PREV_COURSE_ID" -v fld="$field" -v tbl="$pubtable" '
    BEGIN{blk=0}
    $0 ~ "^COPY "tbl" " { blk=1; next }
    blk && $0=="\\."   { blk=0; next }
    blk {
      # courses_components columns: 1=id, 2=entity_id, 3=component_id, 4=component_type, 5=field, 6=order, ...
      if ($2==cid && $5==fld) print $0
    }
  ' "$TMP"
}

# ---- key\tvalue lines -> JSON object (convert t/f, keep "", drop only \N, parse JSON when valid)
kv_to_json_obj() {
  jq -Rn --rawfile kv /dev/stdin '
    def parse($v):
      if   ($v=="t") then true
      elif ($v=="f") then false
      elif ($v=="\\N") then empty         # drop SQL NULL
      else (try ($v|fromjson) catch $v)   # keep "" as "", parse JSON-looking strings
      end;
    reduce (($kv | split("\n"))[] | select(length>0) | split("\t")) as $p
      ({}; . + { ($p[0]) : (parse($p[1])) })
  '
}

# ---- resolve media (files_related_morphs) for a component row (BSD-awk safe)
# Produces:   <field>\t<file_id>   lines for all media fields linked to this component
resolve_component_media() {
  local related_type="$1" comp_id="$2"
  awk -F$'\t' -v rt="$related_type" -v rid="$comp_id" '
    BEGIN{blk=0; haveCols=0}
    /^COPY public\.files_related_morphs /{
      blk=1
      start=index($0,"("); end=index($0,")")
      if (start>0 && end>start) {
        cols_str=substr($0,start+1,end-start-1)
        n=split(cols_str, cols, /, */)
        for (i=1;i<=n;i++){ gsub(/"/,"",cols[i]); colidx[cols[i]]=i }
        haveCols=1
      }
      next
    }
    blk && $0=="\\." { blk=0; next }
    blk && haveCols {
      split($0,f,"\t")
      # columns in your dump: id, file_id, related_id, related_type, field, "order"
      if (f[colidx["related_type"]]==rt && f[colidx["related_id"]]==rid) {
        printf("%s\t%s\n", f[colidx["field"]], f[colidx["file_id"]])
      }
    }
  ' "$TMP"
}

# ---- extract course meta (title, order, locale, category, icon_image) (BSD-awk safe)
awk -F$'\t' -v cid="$PREV_COURSE_ID" '
  BEGIN{blk=0; haveCols=0}
  /^COPY public\.courses /{
    blk=1
    start=index($0,"("); end=index($0,")")
    if (start>0 && end>start) {
      cols_str=substr($0,start+1,end-start-1)
      n=split(cols_str, cols, /, */)
      for (i=1;i<=n;i++){ gsub(/"/,"",cols[i]); colidx[cols[i]]=i }
      haveCols=1
    }
    next
  }
  blk && $0=="\\." { blk=0; next }
  blk && haveCols {
    split($0,f,"\t")
    if (f[colidx["id"]]==cid) {
      print "title\t" (colidx["title"]?f[colidx["title"]]:"Course 5")
      print "order\t" (colidx["order"]?f[colidx["order"]]:5)
      print "locale\t" (colidx["locale"]?f[colidx["locale"]]:"en")
      if (colidx["coursecategory_id"]) print "coursecategory_id\t" f[colidx["coursecategory_id"]]
      exit
    }
  }
' "$TMP" > /tmp/_c5_meta.tsv

TITLE=$(awk -F'\t' '$1=="title"{print substr($0,index($0,$2))}' /tmp/_c5_meta.tsv)
CORDER=$(awk -F'\t' '$1=="order"{print $2}' /tmp/_c5_meta.tsv)
CLOCALE=$(awk -F'\t' '$1=="locale"{print $2}' /tmp/_c5_meta.tsv)
CCATID=$(awk -F'\t' '$1=="coursecategory_id"{print $2}' /tmp/_c5_meta.tsv)

# icon_image (media on course itself) (BSD-awk safe)
COURSE_ICON_FILEID=$(
  awk -F$'\t' -v rid="$PREV_COURSE_ID" '
    BEGIN{blk=0; haveCols=0}
    /^COPY public\.upload_files_related /{
      blk=1
      start=index($0,"("); end=index($0,")")
      if (start>0 && end>start) {
        cols_str=substr($0,start+1,end-start-1)
        n=split(cols_str, cols, /, */)
        for (i=1;i<=n;i++){ gsub(/"/,"",cols[i]); colidx[cols[i]]=i }
        haveCols=1
      }
      next
    }
    blk && $0=="\\." { blk=0; next }
    blk && haveCols {
      split($0,f,"\t")
      if (f[colidx["related_type"]]=="api::course.course" && f[colidx["related_id"]]==rid && f[colidx["field"]]=="icon_image") {
        print f[colidx["file_id"]]; exit
      }
    }
  ' "$TMP"
)

# ---- build mapping (order, type, component_id) (BSD-awk safe)
MAP_TSV="/tmp/_c5_map.tsv"
copy_block_rows_for_course "public.courses_components" "content" \
  | awk -F$'\t' '{ printf "%06d\t%s\t%s\n", $6, $4, $3 }' \
  | sort -n > "$MAP_TSV"

[ -s "$MAP_TSV" ] || { echo "No content mapping rows for entity_id=$PREV_COURSE_ID"; exit 1; }

# ---- map type -> component table / related_type (quiz = irregular plural)
table_for_type() {
  local t="$1" ; local base="${t#coursecontent.}"
  base="${base//-/_}"
  if [ "$base" = "quiz" ]; then echo "public.components_coursecontent_quizzes"
  else echo "public.components_coursecontent_${base}s"
  fi
}
related_type_for_type() {
  local t="$1" ; local base="${t#coursecontent.}"
  base="${base//-/_}"
  if [ "$base" = "quiz" ]; then echo "components_coursecontent_quizzes"
  else echo "components_coursecontent_${base}s"
  fi
}

# ---- build the dynamic zone array (BSD-awk safe + jq merge)
CONTENT_JSON="[]"

while IFS=$'\t' read -r ORD TYPE CID; do
  CTABLE=$(table_for_type "$TYPE")
  RTYPE=$(related_type_for_type "$TYPE")

  # 1) fetch component row as key\tvalue, drop DB-managed metadata
  KV=$(fetch_row_kv "$CTABLE" "$CID" | awk -F$'\t' '
      $1!="id" && $1!="created_at" && $1!="updated_at" && $1!="published_at" && $1!="locale" {print}
  ')

  # 2) convert to JSON object (t/f, \N, parse JSON strings)
  BASE_OBJ=$(printf "%s\n" "$KV" | kv_to_json_obj)

  # 3) resolve media relations and merge (field\tfile_id)
  MAPPINGS=$(resolve_component_media "$RTYPE" "$CID" || true)
  if [ -n "${MAPPINGS:-}" ]; then
    MEDIA_OBJ=$(printf "%s\n" "$MAPPINGS" | jq -Rn --rawfile kv /dev/stdin '
      reduce (($kv|split("\n"))[] | select(length>0) | split("\t")) as $p
        ({}; . + { ($p[0]) : ($p[1]|tonumber) })
    ')
    BASE_OBJ=$(jq -c --argjson m "$MEDIA_OBJ" '$m as $m | . * $m' <<< "$BASE_OBJ")
  fi

  # 4) add __component marker and append
  COMP_JSON=$(jq -c --arg t "$TYPE" '. + {__component:$t}' <<< "$BASE_OBJ")
  CONTENT_JSON=$(jq -c --argjson item "$COMP_JSON" '. + [$item]' <<< "$CONTENT_JSON")
done < "$MAP_TSV"

# ---- assemble final payload { data: {...} }  (jq ternary-free, macOS-safe)
ICON_JSON=$( [ -n "${COURSE_ICON_FILEID:-}" ] && echo "$COURSE_ICON_FILEID" || echo "null" )

jq -n \
  --arg title   "${TITLE:-Course 5}" \
  --arg locale  "${CLOCALE:-en}" \
  --argjson order   "${CORDER:-5}" \
  --argjson content "$CONTENT_JSON" \
  --arg category    "${CCATID:-}" \
  --argjson icon    "$ICON_JSON" '
  def maybe_category(c):
    if (c|length) > 0 then { data: { coursecategory: (c|tonumber) } } else {} end;
  def maybe_icon(i):
    if (i|type) == "number" then { data: { icon_image: i } } else {} end;

  { data: { title:$title, order:$order, locale:$locale, content:$content } }
  + maybe_category($category)
  + maybe_icon($icon)
' > "$OUT_JSON"

echo "Wrote payload: $OUT_JSON"
