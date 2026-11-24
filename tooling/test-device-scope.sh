#!/usr/bin/env bash
# Tests the device-scoped access paths (foundation audit EC-03) on a THROWAWAY local Postgres.
# Usage: PGURL=postgres://postgres@localhost:5432/postgres bash tooling/test-device-scope.sh
#
# The apps without accounts keep each phone's rows behind a hashed device token: RLS with no policies on the
# tables, and security definer RPCs that only touch rows whose device_token_hash matches the caller's token
# (CLAUDE.md, "device-scoped, not user-scoped"). Nothing tested that until now. This builds every app's tables
# and RPCs from the copies of record, with the live table grants (api_write_grants.sql),
# lets phone A create rows in each app, and checks that:
#   - phone B's token sees none of them and can't change or remove them through any RPC;
#   - phone A still sees and controls its own;
#   - a visitor or signed-in user reading the tables directly gets no rows;
#   - a token shorter than 8 characters is refused.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a throwaway server}"
q=""; case "$PGURL" in *\?*) q="?${PGURL#*\?}" ;; esac
base="${PGURL%%\?*}"; base="${base%/*}"; DB="$base/device_scope_test$q"
psql "$PGURL" -X -q -c "drop database if exists device_scope_test" -c "create database device_scope_test" || exit 1
admin() { psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Supabase stand-ins and every app's copy of record (same as tooling/test-api-write-grants.sh).
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

# The live grants: definer RPCs callable by the API roles, tables read-only for them (EC-06).
TABLES=$(grep -o "'[a-z_]*'" packages/shared/supabase/api_write_grants.sql | tr -d "'")
admin >/dev/null <<SQL || { echo "grants failed"; exit 1; }
$(for t in $TABLES; do echo "grant all on public.$t to anon, authenticated, service_role;"; done)
grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated;
SQL
admin -f packages/shared/supabase/api_write_grants.sql >/dev/null || { echo "api_write_grants failed"; exit 1; }
admin >/dev/null <<'SQL' || { echo "seed failed"; exit 1; }
insert into public.marvel_titles (id, media_type, title) values ('movie/1', 'movie', 'Test film');
insert into public.sport_events (id, sport, competition, home, away, event_date)
  select 't1', key, 'Test', 'A', 'B', now() + interval '3 days' from public.sport_categories limit 1;
SQL

A=phone-a-token-0001; B=phone-b-token-0002
pass=0; failed=0
# Runs SQL as a visitor (the apps call every RPC with the anon key); prints the last line, errors included.
as() { psql "$DB" -X -q -At -c "set role ${2:-anon}; $1" 2>&1 | tail -1; }
count() { admin -At -c "select count(*) from public.$1"; }
check() { if [ "$3" = "$2" ]; then pass=$((pass+1)); else failed=$((failed+1)); echo "  FAIL: $1 (expected '$2', got '$3')"; fi; }

echo "1. Phone A creates rows in each app"
PA=$(as "select public.glovebox_save_person('$A', null, 'Person A', '2027-06-01', array[30])")
VA=$(as "select public.glovebox_save_vehicle('$A', null, 'Car A', 'Make', 'AB 12 CD GP', '2027-03-01', 15000, 12, '2026-06-01', 10000, 12000, '2026-11-01', null, array[30], array[30])")
check "Glovebox: A saves a person" 36 "${#PA}"
check "Glovebox: A saves a vehicle" 36 "${#VA}"
check "Glovebox: A push register" t "$(as "select public.glovebox_push_register('https://push.example/ga', 'p', 'a', '$A')")"
check "Marvel: A marks a film watched" t "$(as "select public.marvel_set_watched('$A', 'movie/1', true)")"
check "Marvel: A push register" t "$(as "select public.marvel_push_register('https://push.example/xa', 'p', 'a', '$A')")"
check "Marvel: A sets a reminder" t "$(as "select public.marvel_set_reminders('$A', 'movie/1', 'Test film', current_date + 30, array[1])")"
check "Sport: A push register" t "$(as "select public.push_register('https://push.example/sa', 'p', 'a', '$A')")"
check "Sport: A sets a reminder" t "$(as "select public.push_set_reminder('$A', 't1', now() + interval '3 days', 'A v B', 60)")"
TA=$(as "select public.pricewatch_track_product('$A', 'takealot', 'PLID1', 'Pram', 'Brand', null, 'https://www.takealot.com/pram/PLID1', 999, 999, true, 'in_stock', null, false)")
check "Price Watch: A tracks a product" 36 "${#TA}"
# The RPC returns the product; the app's track (what A controls) comes from A's own list.
TA=$(as "select id from public.pricewatch_list_tracks('$A')")
check "Price Watch: A push register" t "$(as "select public.pricewatch_push_register('https://push.example/pa', 'p', 'a', '$A')")"
LA=$(as "select public.pricewatch_add_link('$A', '$TA', 'babycity', 'pram-1', 'https://www.babycity.co.za/pram-1', 'Pram')")
check "Price Watch: A pastes a link at another shop" 36 "${#LA}"
check "Meal Prep: A push register" t "$(as "select public.mealprep_push_register('https://push.example/ma', 'p', 'a', '$A')")"
check "Hub: A push register" t "$(as "select public.dashboard_push_register('https://push.example/da', 'p', 'a', '$A', null)")"

echo "2. Phone B sees none of A's rows"
check "Glovebox: B lists no people" 0 "$(as "select count(*) from public.glovebox_list_people('$B')")"
check "Glovebox: B lists no vehicles" 0 "$(as "select count(*) from public.glovebox_list_vehicles('$B')")"
check "Marvel: B has no watched films" 0 "$(as "select count(*) from public.marvel_list_watched('$B')")"
check "Marvel: B has no reminders" 0 "$(as "select count(*) from public.marvel_list_reminders('$B')")"
check "Sport: B has no reminders" 0 "$(as "select count(*) from public.push_list_reminders('$B')")"
check "Price Watch: B has no tracks" 0 "$(as "select count(*) from public.pricewatch_list_tracks('$B')")"
check "Price Watch: B has no links" 0 "$(as "select count(*) from public.pricewatch_list_links('$B')")"
check "Meal Prep: B is not subscribed" f "$(as "select public.mealprep_push_status('$B')")"
check "Hub: B is not subscribed" f "$(as "select public.dashboard_push_status('$B')")"

echo "3. Phone B can't change or remove A's rows"
as "select public.glovebox_save_person('$B', '$PA', 'Changed by B', '2030-01-01', array[1])" >/dev/null
check "Glovebox: B can't overwrite A's person" "Person A" "$(admin -At -c "select name from public.glovebox_people where id = '$PA'")"
check "Glovebox: B can't delete A's person" f "$(as "select public.glovebox_delete_person('$B', '$PA')")"
check "Glovebox: B can't delete A's vehicle" f "$(as "select public.glovebox_delete_vehicle('$B', '$VA')")"
as "select public.glovebox_save_vehicle('$B', '$VA', 'Changed by B', null, null, null, null, null, null, null, null, null, null, null, null)" >/dev/null
check "Glovebox: B can't overwrite A's vehicle" "Car A" "$(admin -At -c "select name from public.glovebox_vehicles where id = '$VA'")"
as "select public.marvel_set_watched('$B', 'movie/1', false)" >/dev/null
check "Marvel: B un-watching leaves A's watched" 1 "$(as "select count(*) from public.marvel_list_watched('$A')")"
as "select public.marvel_set_reminders('$B', 'movie/1', 'Test film', current_date + 30, array[]::int[])" >/dev/null
check "Marvel: B clearing reminders leaves A's" 1 "$(as "select count(*) from public.marvel_list_reminders('$A')")"
as "select public.push_remove_reminder('$B', 't1')" >/dev/null
check "Sport: B removing a reminder leaves A's" 1 "$(as "select count(*) from public.push_list_reminders('$A')")"
check "Price Watch: B can't set A's target" f "$(as "select public.pricewatch_set_target('$B', '$TA', 1)")"
check "Price Watch: B can't untrack A's product" f "$(as "select public.pricewatch_untrack('$B', '$TA')")"
check "Price Watch: B can't add a link to A's track" "" "$(as "select public.pricewatch_add_link('$B', '$TA', 'checkers', 'pram-2', 'https://www.checkers.co.za/product/pram-2', 'Pram')")"
check "Price Watch: B can't decide A's link" f "$(as "select public.pricewatch_decide_link('$B', '$LA', false)")"
check "Price Watch: A's track and link unchanged" "1|1|confirmed" "$(admin -At -c "select (select count(*) from public.pricewatch_tracks where id = '$TA' and target_price is null), (select count(*) from public.pricewatch_links where track_id = '$TA'), (select status from public.pricewatch_links where id = '$LA')")"
as "select public.mealprep_push_set_enabled('$B', false)" >/dev/null
check "Meal Prep: B turning push off leaves A on" t "$(as "select public.mealprep_push_status('$A')")"
as "select public.dashboard_push_unregister('$B')" >/dev/null
check "Hub: B unsubscribing leaves A subscribed" t "$(as "select public.dashboard_push_status('$A')")"

echo "4. Phone A still controls its own rows"
check "Glovebox: A lists its person" 1 "$(as "select count(*) from public.glovebox_list_people('$A')")"
check "Price Watch: A sets its target" t "$(as "select public.pricewatch_set_target('$A', '$TA', 899)")"
check "Glovebox: A deletes its vehicle" t "$(as "select public.glovebox_delete_vehicle('$A', '$VA')")"

echo "5. Reading the tables directly gives nobody the rows"
for t in glovebox_people glovebox_push_subs marvel_watched marvel_push_reminders marvel_push_subs sport_push_reminders \
         sport_push_subs pricewatch_tracks pricewatch_push_subs mealprep_push_subs dashboard_push_subs; do
  n=$(count $t); [ "$n" -gt 0 ] || { failed=$((failed+1)); echo "  FAIL: $t has no rows to hide"; continue; }
  check "a visitor reads no rows of $t" 0 "$(as "select count(*) from public.$t")"
  check "a signed-in user reads no rows of $t" 0 "$(as "select count(*) from public.$t" authenticated)"
done
check "a visitor can't read pricewatch_links at all" "permission denied" "$(as "select count(*) from public.pricewatch_links" | grep -o 'permission denied')"

echo "6. Short tokens are refused"
check "Glovebox: a 7-character token" "" "$(as "select public.glovebox_save_person('short77', null, 'X', null, null)")"
check "Marvel: a 7-character token" f "$(as "select public.marvel_set_watched('short77', 'movie/1', true)")"
check "Price Watch: a 7-character token" "" "$(as "select public.pricewatch_track_product('short77', 'takealot', 'PLID2', 'X', null, null, null, 1, 1, true, 'in_stock', null, false)")"

psql "$PGURL" -X -q -c "drop database device_scope_test"
echo "Passed: $pass. Failed: $failed."
[ "$failed" = 0 ]
