#!/usr/bin/env bash
# Tests packages/shared/supabase/api_write_grants.sql and its rollback on a THROWAWAY local Postgres.
# Usage: PGURL=postgres://postgres@localhost:5432/postgres bash tooling/test-api-write-grants.sh
#
# Builds every app's tables and RPCs from the copies of record (apps/*/supabase/schema.sql), with small
# stand-ins for what only Supabase has (auth, Vault, pg_cron, pg_net). Gives the API roles every privilege on
# the 35 listed tables, as they were live on 2026-11-23 (the state before the fix), then checks:
#   before   a visitor really can write to and empty those tables directly (so the test can see the problem);
#   after    visitors and signed-in users still read every table, but can't insert, update, delete or empty
#            any of them; the apps' own write paths (definer RPCs) still work for a visitor; service_role
#            (edge functions) still writes; no public table gives the API roles a write privilege;
#   rollback restores the old grants, and the fix applies again cleanly.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a throwaway server}"
# Keep any query string (e.g. ?host=/socket) when swapping the database name.
q=""; case "$PGURL" in *\?*) q="?${PGURL#*\?}" ;; esac
base="${PGURL%%\?*}"; base="${base%/*}"; DB="$base/api_grants_test$q"
psql "$PGURL" -X -q -c "drop database if exists api_grants_test" -c "create database api_grants_test" || exit 1
admin() { psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

admin >/dev/null <<'SQL' || { echo "stand-ins failed"; exit 1; }
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
create publication supabase_realtime;
create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(text) returns boolean language sql as $$ select true $$;
create schema net;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
  timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create table public.household_allowlist (email text primary key, owner_key text, display_name text);
SQL
awk '/^create or replace function public.is_household_member\(\)/,/^\$\$;/' packages/shared/supabase/household_access.sql | admin >/dev/null || { echo "helper failed"; exit 1; }
for f in apps/*/supabase/schema.sql; do
  admin -f "$f" >/dev/null 2>&1 || { echo "$f failed"; admin -f "$f" 2>&1 | grep -m3 ERROR; exit 1; }
done

TABLES=$(grep -o "'[a-z_]*'" packages/shared/supabase/api_write_grants.sql | tr -d "'")
[ "$(echo "$TABLES" | wc -l)" = 35 ] || { echo "expected 35 tables in the list"; exit 1; }
for t in $TABLES; do
  admin -c "select 'public.$t'::regclass" >/dev/null 2>&1 || { echo "listed table $t is not in the copies of record"; exit 1; }
done
# The state before the fix: the API roles had every privilege on these tables; the RPCs callable as they are live.
admin >/dev/null <<SQL || { echo "old state failed"; exit 1; }
$(for t in $TABLES; do echo "grant all on public.$t to anon, authenticated, service_role;"; done)
grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated;
insert into public.mealprep_recipes (id, name) values ('r1', 'Test recipe');
insert into public.marvel_titles (id, media_type, title) values ('movie/1', 'movie', 'Test film');
insert into public.sport_events (id, sport, competition, home, away, event_date) select 't1', key, 'Test', 'A', 'B', now() + interval '3 days' from public.sport_categories limit 1;
SQL

pass=0; failed=0
as() { local who="$1"; shift; psql "$DB" -X -q -At -c "set role $who; $*" 2>&1 | tail -1; }
rpc() { local out; out=$(psql "$DB" -X -q -At -v ON_ERROR_STOP=1 -c "set role anon; select $2" 2>&1); if [ $? = 0 ]; then
    check "$1" "$4" "$(admin -At -c "select count(*) from public.$3")"; else failed=$((failed+1)); echo "  FAIL: $1: ${out##*ERROR:}"; fi; }
check() { if [ "$3" = "$2" ]; then pass=$((pass+1)); else failed=$((failed+1)); echo "  FAIL: $1 (expected '$2', got '$3')"; fi; }
refused() { case "$2" in *"permission denied"*) pass=$((pass+1)) ;; *) failed=$((failed+1)); echo "  FAIL: $1 should be refused, got '$2'" ;; esac; }
writable() { echo "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and ($(for p in INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
  printf "has_table_privilege('%s', c.oid, '%s') or " "$1" "$p"; done) false)"; }

echo "1. Before the fix: the problem is really there"
check "a visitor can write to all 35 tables" 35 "$(admin -At -c "$(writable anon) and c.relname = any(string_to_array('$(echo $TABLES | tr ' ' ,)', ','))")"
check "a visitor empties a table directly (RLS doesn't cover TRUNCATE)" "TRUNCATE TABLE" "$(psql "$DB" -X -At -c "set role anon; truncate public.mealprep_ticks" 2>&1 | tail -1)"

echo "2. After the fix"
admin -f packages/shared/supabase/api_write_grants.sql >/dev/null || { echo "migration failed"; exit 1; }
for t in $TABLES; do
  check "a visitor still reads $t" 0 "$(as anon "select count(*) - count(*) from public.$t")"
  check "a signed-in user still reads $t" 0 "$(as authenticated "select count(*) - count(*) from public.$t")"
done
check "no public table gives a visitor a write privilege" 0 "$(admin -At -c "$(writable anon)")"
check "no public table gives a signed-in user a write privilege" 0 "$(admin -At -c "$(writable authenticated)")"
refused "a visitor empties a table" "$(as anon "truncate public.mealprep_ticks")"
refused "a signed-in user empties a table" "$(as authenticated "truncate public.sport_events")"
refused "a visitor inserts directly" "$(as anon "insert into public.mealprep_ticks (item_key, label, checked) values ('x', 'x', true)")"
refused "a visitor updates directly" "$(as anon "update public.sport_events set home = 'x'")"
refused "a visitor deletes directly" "$(as anon "delete from public.marvel_titles")"
refused "a signed-in user inserts directly" "$(as authenticated "insert into public.pricewatch_tracks (device_token_hash, product_id) values ('x', gen_random_uuid())")"
# The apps' real write paths: security definer RPCs called as a visitor, exactly as the apps call them.
rpc "Meal Prep: tick an item (RPC)" "public.mealprep_tick('k1', 'Milk', true)" "mealprep_ticks where item_key = 'k1'" 1
rpc "Meal Prep: cook list add (RPC)" "public.mealprep_cook_add('r1', 4)" "mealprep_cook_list" 1
rpc "Meal Prep: push register (RPC)" "public.mealprep_push_register('https://push.example/1', 'p', 'a', 'device-meal-0001')" "mealprep_push_subs" 1
rpc "Marvel Watch: mark watched (RPC)" "public.marvel_set_watched('device-marvel-01', 'movie/1', true)" "marvel_watched" 1
rpc "Marvel Watch: push register (RPC)" "public.marvel_push_register('https://push.example/2', 'p', 'a', 'device-marvel-01')" "marvel_push_subs" 1
rpc "Sport Watch: push register (RPC)" "public.push_register('https://push.example/3', 'p', 'a', 'device-sport-001')" "sport_push_subs" 1
rpc "Sport Watch: set a reminder (RPC)" "public.push_set_reminder('device-sport-001', 't1', now() + interval '3 days', 'A v B', 60)" "sport_push_reminders" 1
rpc "Glovebox: save a person (RPC)" "public.glovebox_save_person('device-glove-001', null, 'Test', '2027-06-01', array[30])" "glovebox_people" 1
rpc "Glovebox: push register (RPC)" "public.glovebox_push_register('https://push.example/4', 'p', 'a', 'device-glove-001')" "glovebox_push_subs" 1
rpc "Price Watch: push register (RPC)" "public.pricewatch_push_register('https://push.example/5', 'p', 'a', 'device-price-001')" "pricewatch_push_subs" 1
rpc "Hub: push register (RPC)" "public.dashboard_push_register('https://push.example/6', 'p', 'a', 'device-hub-00001', null)" "dashboard_push_subs" 1
check "service_role (edge functions) still writes directly" 1 "$(as service_role "insert into public.sport_sources (key, label) values ('test', 'Test') returning 1")"

echo "3. Rollback, then the fix again"
admin -f packages/shared/supabase/api_write_grants.down.sql >/dev/null || { echo "rollback failed"; exit 1; }
check "after rollback a visitor can write to all 35 tables again" 35 "$(admin -At -c "$(writable anon)")"
admin -f packages/shared/supabase/api_write_grants.sql >/dev/null || { echo "re-apply failed"; exit 1; }
check "after re-applying, no write privilege for a visitor" 0 "$(admin -At -c "$(writable anon)")"
check "after re-applying, a visitor still reads" 0 "$(as anon "select count(*) - count(*) from public.sport_events")"

psql "$PGURL" -X -q -c "drop database api_grants_test"
echo "Passed: $pass. Failed: $failed."
[ "$failed" = 0 ]
