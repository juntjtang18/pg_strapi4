# the last commit that had Course 5
COMMIT=d625c8366e732baaaa6da53aa07efd5d64d680ac

# 1) Any later commit (reachable from HEAD but not from $COMMIT) whose message is exactly "database backup.."
git log --pretty='%H %ad %s' --date=short -i \
  --grep='^database backup\.\.$' \
  ${COMMIT}..HEAD

# 2) Same, but allow one or two dots (requires PCRE; most gits support -P)
git log --pretty='%H %ad %s' --date=short -i -P \
  --grep='^database backup\.{1,2}$' \
  ${COMMIT}..HEAD

# 3) Only if the commit also touched the backup file (follow renames)
git log --follow --pretty='%H %ad %s' --date=short -i \
  --grep='^database backup\.\.$' \
  ${COMMIT}.. -- database/backups/gpa_full.sql
