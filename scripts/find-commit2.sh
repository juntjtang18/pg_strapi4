# Analyze the previously written dump
TMP=/tmp/prev_gpa_full.sql
[ -s "$TMP" ] || { echo "Missing $TMP"; exit 1; }

echo "Checking COPY/INSERT style…"
grep -q '^COPY public\.courses ' "$TMP" && STYLE=COPY || STYLE=INSERT
echo "Dump style: $STYLE"

if [ "$STYLE" = COPY ]; then
  # 1) Detect Course 5's id (COPY format, tab-separated)
  COURSE_ID=$(
    awk -F$'\t' '
      BEGIN{blk=0}
      /^COPY public\.courses /{blk=1; next}
      blk && $0=="\\."        {blk=0}
      blk && tolower($2) ~ /course[ _]*5/ { print $1; exit }
    ' "$TMP"
  )
  echo "Detected Course ID: ${COURSE_ID:-<not found>}"

  # 2) Show the component mapping for that course (order, type, component_id)
  awk -F$'\t' -v cid="$COURSE_ID" '
    BEGIN{blk=0}
    /^COPY public\.courses_components /{blk=1; next}
    blk && $0=="\\."                      {blk=0}
    blk && $2 == cid {
      # columns: 1=id, 2=entity_id, 3=component_id, 4=component_type, 5=field, 6=order
      printf "%06d\t%-28s\tcomponent_id=%s\n", $6, $4, $3
    }
  ' "$TMP" | sort -n

  # 3) Summary by content type
  echo "---- Summary of content types ----"
  awk -F$'\t' -v cid="$COURSE_ID" '
    BEGIN{blk=0}
    /^COPY public\.courses_components /{blk=1; next}
    blk && $0=="\\."                      {blk=0}
    blk && $2 == cid { cnt[$4]++ }
    END { for (k in cnt) printf "%-28s %d\n", k, cnt[k] }
  ' "$TMP" | sort
else
  echo "Dump uses INSERT statements; quick search for Course 5:"
  grep -niE 'INSERT INTO[[:space:]]+public\.courses|VALUES' "$TMP" | head -n 1
  grep -niE 'Course[[:space:]_]*5|Resilience: Building Strength in Parenting and Life' "$TMP" | head
  echo "If you want, I can give you an INSERT-style parser next."
fi
