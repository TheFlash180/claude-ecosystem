#!/usr/bin/env bash
# Do the deployed edge functions still match the repo? (See
# .github/workflows/functions-drift.yml and CLAUDE.md, "Copy of record".)
#
# The repo's apps/*/supabase/functions/** is the copy of record, but
# functions are deployed by hand, so nothing stops the two drifting: a fix
# deployed and never committed, a commit never deployed, a quick edit in the
# dashboard. Before this, the only check was comparing them by hand before a
# deploy. Fails, and says which, when:
#   - a function in the repo is not deployed, or its deployed files differ;
#   - a deployed function is not in the repo (other than RETIRED below);
#   - a function has verify_jwt switched on. None of the callers sends a
#     JWT (pg_cron, the Price Watch app's search, a calendar subscription),
#     so every call would get 401.
#
# Needs SUPABASE_ACCESS_TOKEN: a scoped token with Edge Functions: Read on
# this project and nothing else. Prints file names and line counts only,
# never code: the job log is public.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (Edge Functions: Read)}"
REF="${PROJECT_REF:-objkdeagyltvgcuxsnxu}"
CLI="${SUPABASE_CLI:-npx -y supabase@2.120.0}"

# Front Row was retired in October 2026; its two functions are left deployed
# as stubs that answer 410, so a stray call does nothing.
RETIRED=(sync-frontrow notify-frontrow)

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
problem() { echo "::error::$*"; fail=1; }

curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$REF/functions" > "$tmp/deployed.json" \
  || { echo "::error::could not list the deployed functions (check the token and its scope)"; exit 1; }

# slug verify_jwt, one per line
jq -r '.[] | "\(.slug) \(.verify_jwt)"' "$tmp/deployed.json" | sort > "$tmp/deployed"
for d in "$root"/apps/*/supabase/functions/*/; do basename "$d"; done | sort > "$tmp/repo"

while read -r slug jwt; do
  if [ "$jwt" != "false" ]; then
    problem "$slug has verify_jwt=$jwt; its callers send no JWT, so every call would get 401"
  fi
  if ! grep -qx "$slug" "$tmp/repo" && [[ ! " ${RETIRED[*]} " == *" $slug "* ]]; then
    problem "$slug is deployed but not in the repo: commit it under apps/<app>/supabase/functions/, or delete it"
  fi
done < "$tmp/deployed"

mkdir -p "$tmp/work/supabase/functions"
checked=0
while read -r slug; do
  if ! awk '{print $1}' "$tmp/deployed" | grep -qx "$slug"; then
    problem "$slug is in the repo but not deployed"
    continue
  fi
  repo_dir="$(dirname "$(ls "$root"/apps/*/supabase/functions/"$slug"/index.ts)")"

  if ! (cd "$tmp/work" && $CLI functions download "$slug" --project-ref "$REF" --use-api >/dev/null 2>"$tmp/dl.err"); then
    problem "$slug: download failed: $(tail -1 "$tmp/dl.err")"
    continue
  fi
  # The CLI writes supabase/functions/<slug>/…; find index.ts rather than
  # trusting that layout, so a CLI change reads as a clear error, not drift.
  index="$(find "$tmp/work" -path "*/$slug/*" -name index.ts -print -quit)"
  if [ -z "$index" ]; then
    problem "$slug: downloaded, but no index.ts in it ($(find "$tmp/work" -type f | wc -l) files)"
    continue
  fi
  live_dir="$(dirname "$index")"

  # Same set of source files, each identical. Only names and counts are
  # printed; see the content with `supabase functions download` locally.
  (cd "$repo_dir" && find . -type f -name '*.ts' | sort) > "$tmp/want"
  (cd "$live_dir" && find . -type f -name '*.ts' | sort) > "$tmp/got"
  while read -r f; do
    if ! grep -qx "$f" "$tmp/got"; then
      problem "$slug: ${f#./} is in the repo but not deployed"
    elif ! cmp -s "$repo_dir/$f" "$live_dir/$f"; then
      changed="$(diff "$repo_dir/$f" "$live_dir/$f" | grep -c '^[<>]' || true)"
      problem "$slug: ${f#./} differs from what is deployed ($changed lines)"
    fi
  done < "$tmp/want"
  while read -r f; do
    grep -qx "$f" "$tmp/want" || problem "$slug: ${f#./} is deployed but not in the repo"
  done < "$tmp/got"

  rm -rf "$tmp/work/supabase/functions/$slug"
  checked=$((checked + 1))
done < "$tmp/repo"

[ "$fail" -eq 0 ] || exit 1
echo "No drift: $checked functions match the repo, $(wc -l < "$tmp/deployed" | tr -d ' ') deployed, verify_jwt off on all."
