-- API write grants (foundation audit of 2026-11-23, finding EC-06).
-- Applied as migration api_write_grants. Rollback: api_write_grants.down.sql (same folder).
-- Test: tooling/test-api-write-grants.sh (throwaway local Postgres).
--
-- Why: these 35 tables gave the API roles (anon = any visitor, authenticated = any signed-in user) every
-- privilege, including insert, update, delete and truncate. Nothing used them: every write goes through a
-- security definer RPC (runs as the table owner) or an edge function (service_role). Only the absence of a
-- write policy stopped those writes, and row-level security doesn't govern TRUNCATE at all. Two locks, not one.
--
-- What: anon and authenticated keep SELECT (the read policies decide what they see, as before) and lose
-- everything else. service_role, the owner and backup_reader are untouched. No policy or function changes,
-- so no app behaves differently.
--
-- The list was read from the live project on 2026-11-23: every public table where anon could write. Tables
-- belonging to other repositories (baby-registry, arcade_*) and the household tables (household_access.sql)
-- are not in it.
-- A table added later is NOT covered: grant it only what it needs in the migration that creates it.

do $$ declare t text; begin
  foreach t in array array[
    'dashboard_push_subs',
    'glovebox_people','glovebox_push_subs','glovebox_vehicles',
    'marvel_push_reminders','marvel_push_subs','marvel_settings','marvel_sources','marvel_titles','marvel_watched',
    'mealprep_cook_list','mealprep_push_subs','mealprep_recipes','mealprep_settings','mealprep_ticks',
    'pricewatch_notified','pricewatch_prices','pricewatch_products','pricewatch_push_subs','pricewatch_sources','pricewatch_tracks',
    'sport_categories','sport_events','sport_events_audit','sport_push_reminders','sport_push_subs','sport_settings','sport_sources',
    'workout_exercises','workout_program_days','workout_program_phases','workout_programs','workout_routine_exercises',
    'workout_routines','workout_settings'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
