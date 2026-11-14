#!/usr/bin/env bash
# Sanity-check a pg_dump before it is encrypted and kept (see
# .github/workflows/backup.yml). A backup that "succeeds" with nothing in it
# is worse than a failed one: nobody finds out until the day it is needed.
#
# Completeness is checked against the live schema, not a hand-kept list:
# backup-dump.sh writes tooling/backup-manifest.sql's output into the dump,
# and its "data <table>" lines name every table the live project had at
# backup time. Each one must have a COPY section in the dump, so a retired
# app's tables stop being required when they are dropped and a new app's
# tables are required from the day they are created. (The hand-kept list
# named Baby Registry's tables, which were dropped when it was
# decommissioned in November 2026.) The tables below that can never
# legitimately be empty must have rows. Prints only table and row counts —
# the repo is public, so the job log must never show data.
set -euo pipefail

dump="${1:?usage: backup-check.sh dump.sql}"

# Rows per table: the lines between "COPY <schema>.<t> (...) FROM stdin;" and
# "\.". Public tables are named bare, others keep their schema (auth.users).
counts="$(awk '
  /^COPY / { t = $2; sub(/^public\./, "", t); n = 0; inside = 1; next }
  inside && /^\\\.$/ { print t, n; inside = 0; next }
  inside { n++ }
' "$dump")"

# Tables the live project had when the dump was taken, named the same way.
live="$(sed -n 's/^-- manifest: data //p' "$dump" | sed 's/^public\.//')"
if [ -z "$live" ]; then
  echo "::error::the dump has no 'data' manifest lines, so its completeness cannot be checked"
  exit 1
fi

# Must be present: every live table, plus the two auth tables the dump adds.
REQUIRED=(auth.users auth.identities)
while read -r t; do REQUIRED+=("$t"); done <<<"$live"
# Must be present *and* have rows: an empty one means the dump is wrong.
# (feed_events etc. are empty until the baby is born, so presence is all that
# can be asked of them.)
NONEMPTY=(profiles household_allowlist babies mealprep_recipes auth.users)

fail=0
for t in "${REQUIRED[@]}"; do
  if ! grep -q "^$t " <<<"$counts"; then
    echo "::error::backup is missing table $t"
    fail=1
  fi
done
for t in "${NONEMPTY[@]}"; do
  n="$(awk -v t="$t" '$1 == t { print $2 }' <<<"$counts")"
  if [ "${n:-0}" -eq 0 ]; then
    echo "::error::table $t is empty in the backup"
    fail=1
  fi
done
[ "$fail" -eq 0 ] || exit 1

tables="$(wc -l <<<"$counts" | tr -d ' ')"
rows="$(awk '{ s += $2 } END { print s + 0 }' <<<"$counts")"
echo "Backup looks complete: $tables tables ($(wc -l <<<"$live" | tr -d ' ') in the live schema, all present), $rows rows, $(du -h "$dump" | cut -f1) uncompressed."
