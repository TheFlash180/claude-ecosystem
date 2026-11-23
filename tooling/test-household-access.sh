#!/usr/bin/env bash
# Tests packages/shared/supabase/household_access.sql and its rollback on a THROWAWAY local Postgres.
# Usage: PGURL=postgres://postgres@localhost:5432/postgres bash tooling/test-household-access.sh
#
# Builds the Baby Logger and Workout Plan tables from their copies of record (plus profiles and
# household_allowlist as they are live), runs the ROLLBACK to reach the state the live project had before
# the fix (policies and grants of 2026-11-23), then checks:
#   before  the problems the fix is for are really there (so the test can see them, and so the rollback is
#           shown to recreate the old state);
#   after   household members keep full use; other signed-in users and anonymous visitors get nothing;
#           the workout library stays public;
#   rollback restores the old behaviour, and the fix applies again cleanly.
# Users: H1, H2 = the two household emails; X = any other signed-in user (e.g. a Cre-Grow login); anon.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a throwaway server}"
base="${PGURL%/*}"; DB="$base/household_test"
psql "$PGURL" -X -q -c "drop database if exists household_test" -c "create database household_test" || exit 1
admin() { psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

H1=11111111-1111-4111-8111-111111111111; H2=22222222-2222-4222-8222-222222222222; X=33333333-3333-4333-8333-333333333333
BABY=44444444-4444-4444-8444-444444444444

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
-- profiles and household_allowlist as they are live (columns, RLS, policy), from the 2026-11-23 metadata
create table public.household_allowlist (email text primary key, owner_key text, display_name text);
alter table public.household_allowlist enable row level security;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, owner_key text);
alter table public.profiles enable row level security;
create policy "household members" on public.profiles for all to authenticated using (true) with check (true);
SQL
# The copies of record use the household helper, so define it first (exactly as household_access.sql does).
awk '/^create or replace function public.is_household_member\(\)/,/^\$\$;/' packages/shared/supabase/household_access.sql | admin >/dev/null || { echo "helper failed"; exit 1; }
admin -f apps/baby-logger/supabase-migration.sql >/dev/null 2>&1 || { echo "baby-logger schema failed"; admin -f apps/baby-logger/supabase-migration.sql; exit 1; }
admin -f apps/workout-plan/supabase/schema.sql >/dev/null 2>&1 || { echo "workout-plan schema failed"; admin -f apps/workout-plan/supabase/schema.sql; exit 1; }
# Back to the live state before the fix: the rollback restores the old policies, grants and RPCs.
admin -f packages/shared/supabase/household_access.down.sql >/dev/null || { echo "rollback (to the old state) failed"; exit 1; }
# The other tables' grants as they were live: every API role had every privilege.
admin >/dev/null <<SQL
do \$\$ declare t text; begin
  foreach t in array array['babies','feed_events','sleep_events','nappy_events','weight_events','profiles','household_allowlist',
                           'workout_profile','workout_bodyweight','workout_runs','workout_benchmarks','workout_programs','workout_routines','workout_exercises'] loop
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end \$\$;
insert into auth.users (id, email) values ('$H1','Parent.One@example.com'), ('$H2','parent.two@example.com'), ('$X','someone.else@example.com');
insert into public.household_allowlist (email, owner_key, display_name) values ('parent.one@example.com','a','Een'), ('parent.two@example.com','b','Twee');
insert into public.profiles (id, display_name, owner_key) values ('$H1','Een','a'), ('$H2','Twee','b');
insert into public.babies (id, due_date) values ('$BABY', '2027-01-15');
insert into public.feed_events (baby_id, logged_by, feed_type, started_at) select '$BABY', '$H1', 'bottle', now() - (g || ' hours')::interval from generate_series(1, 3) g;
insert into public.workout_profile (id, dob, height_cm, sex, goal, target_weight_kg) values (1, '1990-01-01', 180, 'male', 'cut', 80);
insert into public.workout_bodyweight (log_date, weight_kg) values ('2026-11-01', 85), ('2026-11-08', 84);
insert into public.workout_runs (run_date, seconds, location, note) values ('2026-11-07', 1500, 'parkrun', '');
SQL
[ $? = 0 ] || { echo "seed failed"; exit 1; }

pass=0; failed=0
as() { local who="$1"; shift
  if [ "$who" = anon ]; then psql "$DB" -X -q -At -c "set role anon; $*" 2>&1 | tail -1
  else psql "$DB" -X -q -At -c "set role authenticated; set request.jwt.claim.sub = '$who'; $*" 2>&1 | tail -1; fi; }
check() { if [ "$3" = "$2" ]; then pass=$((pass+1)); else failed=$((failed+1)); echo "  FAIL: $1 (expected '$2', got '$3')"; fi; }
refused() { case "$2" in *"permission denied"*|*"row-level security"*) pass=$((pass+1)) ;; *) failed=$((failed+1)); echo "  FAIL: $1 should be refused, got '$2'" ;; esac; }
count() { echo "select count(*) from public.$1"; }
changed() { echo "with x as ($1 returning 1) select count(*) from x"; }

echo "1. Before the fix: the problems are really there"
check "a non-household login reads the feed log" 3 "$(as "$X" "$(count feed_events)")"
check "a non-household login changes profiles" 2 "$(as "$X" "$(changed "update public.profiles set display_name = display_name")")"
check "an anonymous visitor reads the workout profile" 1 "$(as anon "$(count workout_profile)")"
check "an anonymous visitor logs a run" t "$(as anon "select public.workout_log_run('2026-11-09', 1600, 'x', '')")"
admin -c "delete from public.workout_runs where run_date = '2026-11-09'" >/dev/null

echo "2. After the fix"
admin -f packages/shared/supabase/household_access.sql >/dev/null || { echo "migration failed"; exit 1; }
for t in babies feed_events profiles workout_profile workout_bodyweight workout_runs; do
  n=$(admin -At -c "$(count $t)")
  check "household member H1 reads $t" "$n" "$(as "$H1" "$(count $t)")"
  check "household member H2 reads $t" "$n" "$(as "$H2" "$(count $t)")"
  check "a non-household login reads no $t" 0 "$(as "$X" "$(count $t)")"
  refused "an anonymous visitor reads $t" "$(as anon "$(count $t)")"
done
for t in sleep_events nappy_events weight_events workout_benchmarks; do
  check "a non-household login reads no $t" 0 "$(as "$X" "$(count $t)")"
  refused "an anonymous visitor reads $t" "$(as anon "$(count $t)")"
done
check "H1 logs a feed" 1 "$(as "$H1" "insert into public.feed_events (baby_id, logged_by, feed_type) values ('$BABY', '$H1', 'bottle') returning 1")"
check "H2 changes the baby" 1 "$(as "$H2" "$(changed "update public.babies set name = 'Toets'")")"
check "H1 changes a display name" 1 "$(as "$H1" "$(changed "update public.profiles set display_name = 'Een' where id = '$H1'")")"
refused "a non-household login logs a feed" "$(as "$X" "insert into public.feed_events (baby_id, logged_by, feed_type) values ('$BABY', '$X', 'bottle')")"
check "a non-household login can't change the baby" 0 "$(as "$X" "$(changed "update public.babies set name = 'x'")")"
check "a non-household login can't delete feeds" 0 "$(as "$X" "$(changed "delete from public.feed_events")")"
check "a non-household login can't change profiles" 0 "$(as "$X" "$(changed "update public.profiles set display_name = 'x'")")"
refused "a non-household login adds itself to profiles" "$(as "$X" "insert into public.profiles (id, display_name, owner_key) values ('$X', 'x', 'a')")"
refused "a non-household login reads the household list" "$(as "$X" "$(count household_allowlist)")"
refused "a non-household login adds itself to the household list" "$(as "$X" "insert into public.household_allowlist (email) values ('someone.else@example.com')")"
check "H1 logs a run" t "$(as "$H1" "select public.workout_log_run('2026-11-09', 1600, 'parkrun', '')")"
check "H2 logs bodyweight" t "$(as "$H2" "select public.workout_log_bodyweight('2026-11-15', 83.5)")"
check "H1 starts a programme" t "$(as "$H1" "select public.workout_set_program(null, null)")"
check "a non-household login's run is refused (returns false)" f "$(as "$X" "select public.workout_log_run('2026-11-10', 1600, 'x', '')")"
check "a non-household login can't delete a run" f "$(as "$X" "select public.workout_delete_run('2026-11-07')")"
check "a non-household login can't change the profile" f "$(as "$X" "select public.workout_save_profile('2000-01-01', 1, 'male', 'cut', 1, 1.5)")"
refused "an anonymous visitor logs a run" "$(as anon "select public.workout_log_run('2026-11-11', 1600, 'x', '')")"
refused "an anonymous visitor deletes a run" "$(as anon "select public.workout_delete_run('2026-11-07')")"
refused "an anonymous visitor writes the workout profile directly" "$(as anon "update public.workout_profile set dob = null")"
check "workout data unchanged by the refused attempts" "2|0" "$(admin -At -c "select (select count(*) from public.workout_runs), (select count(*) from public.workout_profile where dob is null)" | tr -d ' ')"
check "the workout library stays public: programmes" "$(admin -At -c "$(count workout_programs)")" "$(as anon "$(count workout_programs)")"
check "the workout library stays public: routines" "$(admin -At -c "$(count workout_routines)")" "$(as anon "$(count workout_routines)")"
check "anon can still try the admin password" f "$(as anon "select public.workout_admin_check('wrong')")"
check "the household check is false for anon-equivalent callers" f "$(as "$X" "select public.is_household_member()")"
check "the household check is true for H1 whatever the email case" t "$(as "$H1" "select public.is_household_member()")"
refused "anon can't call the household check" "$(as anon "select public.is_household_member()")"

echo "3. Rollback, then the fix again"
admin -f packages/shared/supabase/household_access.down.sql >/dev/null || { echo "rollback failed"; exit 1; }
check "after rollback the old behaviour is back (non-household reads feeds)" 4 "$(as "$X" "$(count feed_events)")"
check "after rollback anon reads the workout profile again" 1 "$(as anon "$(count workout_profile)")"
check "after rollback anon RPC writes work again" t "$(as anon "select public.workout_log_run('2026-11-12', 1600, 'x', '')")"
admin -f packages/shared/supabase/household_access.sql >/dev/null || { echo "re-apply failed"; exit 1; }
check "after re-applying, a non-household login is out again" 0 "$(as "$X" "$(count feed_events)")"
refused "after re-applying, anon is out again" "$(as anon "$(count workout_profile)")"

psql "$PGURL" -X -q -c "drop database household_test"
echo "Passed: $pass. Failed: $failed."
[ "$failed" = 0 ]
