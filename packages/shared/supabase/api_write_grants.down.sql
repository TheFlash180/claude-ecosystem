-- Rollback of api_write_grants.sql: gives anon and authenticated every privilege on the same 35 tables again,
-- as they were on 2026-11-23. This re-opens EC-06; use it only to undo a broken rollout.

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
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
