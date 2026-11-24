#!/usr/bin/env bash
# Tests packages/shared/supabase/default_privileges.sql and its rollback on a THROWAWAY local Postgres.
# Usage: PGURL=postgres://postgres@localhost:5432/postgres bash tooling/test-default-privileges.sh
#
# Recreates the project's default privileges for tables postgres creates in public as they were live on
# 23 November 2026 (every privilege for anon, authenticated and service_role), then checks that a table
# created after the change gives the API roles SELECT only, that service_role keeps everything, that
# existing tables are untouched, and that the rollback and a re-apply both work.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a throwaway server}"
q=""; case "$PGURL" in *\?*) q="?${PGURL#*\?}" ;; esac
base="${PGURL%%\?*}"; base="${base%/*}"; DB="$base/default_privs_test$q"
psql "$PGURL" -X -q -c "drop database if exists default_privs_test" -c "create database default_privs_test" || exit 1
admin() { psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

admin >/dev/null <<'SQL' || { echo "setup failed"; exit 1; }
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
create table public.before_fix (id int);
SQL

pass=0; failed=0
check() { if [ "$3" = "$2" ]; then pass=$((pass+1)); else failed=$((failed+1)); echo "  FAIL: $1 (expected '$2', got '$3')"; fi; }
privs() { admin -At -c "select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('$1', 'public.$2', p)"; }
ALL="DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"

echo "1. Before the change: a new table gives visitors everything"
admin -c "create table public.t1 (id int)"
check "visitor on a new table" "$ALL" "$(privs anon t1)"

echo "2. After the change"
admin -f packages/shared/supabase/default_privileges.sql >/dev/null || { echo "migration failed"; exit 1; }
admin -c "create table public.t2 (id int)"
check "visitor on a new table: read only" "SELECT" "$(privs anon t2)"
check "signed-in user on a new table: read only" "SELECT" "$(privs authenticated t2)"
check "service_role on a new table: everything" "$ALL" "$(privs service_role t2)"
check "an existing table is untouched" "$ALL" "$(privs anon before_fix)"
check "an explicit grant still works on a new table" "INSERT,SELECT" "$(admin -c "grant insert on public.t2 to anon" >/dev/null; privs anon t2)"
admin -f packages/shared/supabase/default_privileges.sql >/dev/null || { echo "re-running the migration failed"; exit 1; }
check "running it twice changes nothing" "SELECT" "$(admin -c "create table public.t3 (id int)" >/dev/null; privs anon t3)"

echo "3. Rollback, then the change again"
admin -f packages/shared/supabase/default_privileges.down.sql >/dev/null || { echo "rollback failed"; exit 1; }
check "after rollback a new table gives visitors everything" "$ALL" "$(admin -c "create table public.t4 (id int)" >/dev/null; privs anon t4)"
admin -f packages/shared/supabase/default_privileges.sql >/dev/null || { echo "re-apply failed"; exit 1; }
check "after re-applying, read only again" "SELECT" "$(admin -c "create table public.t5 (id int)" >/dev/null; privs anon t5)"

psql "$PGURL" -X -q -c "drop database default_privs_test"
echo "Passed: $pass. Failed: $failed."
[ "$failed" = 0 ]
