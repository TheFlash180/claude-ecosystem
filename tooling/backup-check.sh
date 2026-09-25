#!/usr/bin/env bash
# Sanity-check a pg_dump before it is encrypted and kept (see
# .github/workflows/backup.yml). A backup that "succeeds" with nothing in it
# is worse than a failed one: nobody finds out until the day it is needed.
#
# Fails unless every table below is in the dump, and the ones that can never
# legitimately be empty have rows. Prints only table and row counts — the
# repo is public, so the job log must never show data.
set -euo pipefail

dump="${1:?usage: backup-check.sh dump.sql}"

# Must be present. feed_events etc. are empty until the baby is born, so
# presence is all that can be asked of them.
REQUIRED=(
  transactions budgets profiles fintrack_accounts fintrack_settings
  babies feed_events sleep_events nappy_events weight_events
  items claims categories retailers
  glovebox_vehicles glovebox_people
  mealprep_recipes workout_profile workout_bodyweight workout_runs
  auth.users auth.identities
)
# Must be present *and* have rows: an empty one means the dump is wrong.
NONEMPTY=(transactions babies items mealprep_recipes auth.users)

# Rows per table: the lines between "COPY <schema>.<t> (...) FROM stdin;" and
# "\.". Public tables are named bare, others keep their schema (auth.users).
counts="$(awk '
  /^COPY / { t = $2; sub(/^public\./, "", t); n = 0; inside = 1; next }
  inside && /^\\\.$/ { print t, n; inside = 0; next }
  inside { n++ }
' "$dump")"

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
echo "Backup looks complete: $tables tables, $rows rows, $(du -h "$dump" | cut -f1) uncompressed."
