# ===== setup =====
set -euo pipefail
FILE="database/backups/gpa_full.sql"
BASENAME="$(basename "$FILE")"

# 1) Find the PREVIOUS commit that touched this path (follow renames)
PREV_COMMIT="$(git log --follow --format=%H -- "$FILE" | sed -n '2p' || true)"
if [ -z "${PREV_COMMIT:-}" ]; then
  echo "No previous commit touching $FILE was found."; exit 1
fi
echo "Previous commit touching the file: $PREV_COMMIT"
git log -1 --pretty='%H %ad %s' --date=iso "$PREV_COMMIT"

# 2) Resolve the historical path at that commit (in case of rename)
if git cat-file -e "$PREV_COMMIT":"$FILE" 2>/dev/null; then
  HIST_PATH="$FILE"
else
  # fall back: find the same basename anywhere in that commit
  HIST_PATH="$(git ls-tree -r --name-only "$PREV_COMMIT" | grep -i -m1 -E "(^|/)$BASENAME$" || true)"
fi

if [ -z "${HIST_PATH:-}" ]; then
  echo "Could not find $BASENAME in $PREV_COMMIT (file may not exist in that snapshot)."; exit 1
fi
echo "Using historical path: $HIST_PATH"

# 3) Materialize that SQL to a temp file for fast grepping
TMP="/tmp/prev_gpa_full.sql"
git show "$PREV_COMMIT":"$HIST_PATH" > "$TMP"
echo "Wrote $TMP ($(wc -c < "$TMP") bytes)"

# 4) Quick presence check for 'Course 5'
echo "---- Presence check: 'Course 5' ----"
if ! grep -qiE '(^|[^A-Za-z])course[[:space:]_]*5([^0-9A-Za-z]|$)' "$TMP"; then
  echo "No 'Course 5' string found in $HIST_PATH at $PREV_COMMIT."
  echo "Open the dump to eyeball manually: less $TMP"
  exit 0
fi
grep -niE '(^|[^A-Za-z])course[[:space:]_]*5([^0-9A-Za-z]|$)' "$TMP" | head

# 5) Pull the Course row from COPY public.courses (if COPY format)
echo "---- Courses table row(s) containing 'Course 5' (COPY format) ----"
awk '
  BEGIN{inblk=0; idcol=-1; titlecol=-1}
  /^COPY public\.courses /{
    inblk=1
    # parse column list to find id and title positions
    if (match($0, /\(([^)]*)\)/, a)) {
      n=split(a[1], cols, /, */)
      for (i=1;i<=n;i++) {
        gsub(/"/,"",cols[i])
        if (cols[i]=="id") idcol=i
        if (cols[i]=="title") titlecol=i
      }
    }
    next
  }
  inblk && $0=="\\." { inblk=0 }
  inblk && $0 !~ /^COPY/ {
    split($0, f, "\t")
    line=$0
    if (titlecol>0 && index(tolower(f[titlecol]), "course 5")>0) {
      cid = (idcol>0 ? f[idcol] : "?")
      print "[COURSE ROW] id=" cid " | title=" f[titlecol]
      print line
      print ""
      # Print the id to stderr for capture in shell
      printf("%s\n", cid) > "/dev/stderr"
    }
  }
' "$TMP" 2> /tmp/_course5_ids.txt || true

COURSE_ID="$(head -n1 /tmp/_course5_ids.txt || true)"
if [ -n "${COURSE_ID:-}" ]; then
  echo "Detected Course 5 id from COPY header parsing: $COURSE_ID"
else
  echo "Could not determine Course 5 id from COPY block; proceeding with generic searches."
fi

# 6) Show dynamic zone mapping for that course (if we have an id) from COPY public.courses_components
if [ -n "${COURSE_ID:-}" ]; then
  echo "---- Components mapped to Course id=$COURSE_ID (order, type, component_id) ----"
  awk -v cid="$COURSE_ID" '
    BEGIN{inblk=0; ecol=-1; tcol=-1; ocol=-1; ccol=-1}
    /^COPY public\.courses_components /{
      inblk=1
      if (match($0, /\(([^)]*)\)/, a)) {
        n=split(a[1], cols, /, */)
        for (i=1;i<=n;i++) {
          gsub(/"/,"",cols[i])
          if (cols[i]=="entity_id") ecol=i
          if (cols[i]=="component_type") tcol=i
          if (cols[i]=="order") ocol=i
          if (cols[i]=="component_id") ccol=i
        }
      }
      next
    }
    inblk && $0=="\\." { inblk=0 }
    inblk && $0 !~ /^COPY/ {
      split($0, f, "\t")
      if (ecol>0 && f[ecol]==cid) {
        printf("%06d  %-28s  component_id=%s\n",
               (ocol>0?f[ocol]:0),
               (tcol>0?f[tcol]:"?"),
               (ccol>0?f[ccol]:"?"))
      }
    }
  ' "$TMP" | sort -n || true
else
  echo "Skipping component mapping detail (no course id)."
fi

# 7) High-level summary: which content types exist at all for this course?
if [ -n "${COURSE_ID:-}" ]; then
  echo "---- Summary of content types for Course $COURSE_ID ----"
  awk -v cid="$COURSE_ID" '
    BEGIN{inblk=0; ecol=-1; tcol=-1}
    /^COPY public\.courses_components /{
      inblk=1
      if (match($0, /\(([^)]*)\)/, a)) {
        n=split(a[1], cols, /, */)
        for (i=1;i<=n;i++) {
          gsub(/"/,"",cols[i])
          if (cols[i]=="entity_id") ecol=i
          if (cols[i]=="component_type") tcol=i
        }
      }
      next
    }
    inblk && $0=="\\." { inblk=0 }
    inblk && $0 !~ /^COPY/ {
      split($0, f, "\t")
      if (ecol>0 && f[ecol]==cid) {
        cnt[f[tcol]]++
      }
    }
    END{
      for (k in cnt) printf("%-28s %d\n", k, cnt[k])
    }
  ' "$TMP" | sort || true
fi

echo "Done. Open the dump to inspect manually if needed: less $TMP"
