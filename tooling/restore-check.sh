#!/usr/bin/env bash
# Check a restored copy against the dump it was restored from (see the
# restore-check job in backup.yml). Connects with the usual libpq variables;
# PG_RUN prefixes psql as in backup-dump.sh.
#
# Two questions, both answered from the dump itself:
#  - Did every row arrive? Each table's row count must equal the number of
#    rows in its COPY section.
#  - Is it the same project, not just the same data? The "-- manifest:" lines
#    the backup wrote from the live catalog must match the same query run here
#    (tooling/backup-manifest.sql): grants, RLS, policies, the auth.users
#    allowlist trigger, realtime membership.
#
# Prints table names, counts and schema facts only. The repo is public and
# so is this job's log: it must never show data.
set -euo pipefail

dump="${1:?usage: restore-check.sh dump.sql}"
here="$(cd "$(dirname "$0")" && pwd)"
q() { ${PG_RUN:-} psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail=0

# Rows per table, counted the same way backup-check.sh does. COPY names
# public tables with their schema here, so keep it.
awk '
  /^COPY / { t = $2; n = 0; inside = 1; next }
  inside && /^\\\.$/ { print t, n; inside = 0; next }
  inside { n++ }
' "$dump" > "$tmp/expected"

# psql reads nothing here: under `docker exec -i` it would otherwise swallow
# the rest of this loop's input.
while read -r table want; do
  got="$(q -c "select count(*) from $table" < /dev/null 2>/dev/null)" || got="no such table"
  if [ "$got" != "$want" ]; then
    echo "::error::$table: the dump has $want rows, the restored copy has $got"
    fail=1
  fi
done < "$tmp/expected"

tables="$(wc -l < "$tmp/expected" | tr -d ' ')"
rows="$(awk '{ s += $2 } END { print s + 0 }' "$tmp/expected")"

sed -n 's/^-- manifest: //p' "$dump" > "$tmp/want"
if [ ! -s "$tmp/want" ]; then
  echo "::error::the dump has no manifest; it predates tooling/backup-dump.sh"
  exit 1
fi
q < "$here/backup-manifest.sql" > "$tmp/got"
if ! diff -u --label live-project --label restored "$tmp/want" "$tmp/got" > "$tmp/diff"; then
  echo "::error::the restored copy differs from the live project (- live, + restored):"
  cat "$tmp/diff"
  fail=1
fi

[ "$fail" -eq 0 ] || exit 1
echo "Restore checked: $tables tables, $rows rows, and $(wc -l < "$tmp/want" | tr -d ' ') schema facts all match."
