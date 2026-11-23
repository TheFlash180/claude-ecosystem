-- Household access (foundation audit of 2026-11-23, findings EC-01 and EC-02).
-- Applied as migration household_access. Rollback: household_access.down.sql (same folder).
-- Test: tooling/test-household-access.sh (throwaway local Postgres).
--
-- Why: the sign-up gate no longer admits only the two household emails. Since October 2026 it also admits
-- the Cre-Grow logins listed in lesson_print.allowed_users (another app in this shared project). So "any
-- signed-in user" no longer means "the household". Baby Logger's tables and profiles used that rule (EC-01),
-- and Workout Plan's personal data was public-read and publicly writable (EC-02).
--
-- What: one helper, is_household_member() (signed in AND email on household_allowlist), now guards
--   1. babies, feed_events, sleep_events, nappy_events, weight_events and profiles (read and write);
--   2. workout_profile, workout_bodyweight, workout_runs and workout_benchmarks (read), and the seven
--      Workout Plan write RPCs (which now need a signed-in household member, not anon).
-- The workout library (programmes, routines, exercises) stays public-read world data.
-- Household phones are unaffected: every app shares one origin and one Supabase client, so the Baby Logger
-- sign-in is the session Workout Plan and the hub already send. A device that isn't signed in sees the
-- library, and Workout Plan asks it to sign in for the personal parts.

create or replace function public.is_household_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_allowlist a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = (select auth.uid()))
$$;
revoke execute on function public.is_household_member() from public, anon;
grant execute on function public.is_household_member() to authenticated;

-- 1. Baby Logger and profiles: household members only (EC-01)
do $$ declare t text; begin
  foreach t in array array['babies','feed_events','sleep_events','nappy_events','weight_events'] loop
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);
    execute format('drop policy if exists "household members" on public.%I', t);
    execute format('create policy "household members" on public.%I for all to authenticated '
                   'using ((select public.is_household_member())) with check ((select public.is_household_member()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists "household members" on public.profiles;
create policy "household members" on public.profiles for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
-- household_allowlist is read only by the definer functions above and the sign-up trigger.
revoke all on public.household_allowlist from anon, authenticated;

-- 2. Workout Plan's personal tables: household members only (EC-02)
do $$ declare t text; begin
  foreach t in array array['workout_profile','workout_bodyweight','workout_runs','workout_benchmarks'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "household read" on public.%I', t);
    execute format('create policy "household read" on public.%I for select to authenticated '
                   'using ((select public.is_household_member()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- The write RPCs: unchanged except the household check on their first line.

create or replace function public.workout_save_profile(
  p_dob date, p_height numeric, p_sex text, p_goal text,
  p_target numeric, p_activity numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  if p_sex not in ('male','female') or p_goal not in ('recomp','cut','build') then return false; end if;
  insert into workout_profile (id, dob, height_cm, sex, goal, target_weight_kg, activity_factor, updated_at)
  values (1, p_dob, p_height, p_sex, p_goal, p_target, coalesce(p_activity, 1.5), now())
  on conflict (id) do update set
    dob = excluded.dob, height_cm = excluded.height_cm, sex = excluded.sex,
    goal = excluded.goal, target_weight_kg = excluded.target_weight_kg,
    activity_factor = excluded.activity_factor, updated_at = now();
  return true;
end $$;

create or replace function public.workout_log_bodyweight(p_date date, p_weight numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  if p_weight is null or p_weight <= 0 then return false; end if;
  insert into workout_bodyweight (log_date, weight_kg) values (p_date, p_weight)
  on conflict (log_date) do update set weight_kg = excluded.weight_kg;
  return true;
end $$;

create or replace function public.workout_log_run(p_date date, p_seconds int, p_location text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  if p_seconds is null or p_seconds <= 0 then return false; end if;
  insert into workout_runs (run_date, seconds, location, note)
  values (p_date, p_seconds, coalesce(nullif(trim(p_location),''),'parkrun'), coalesce(p_note,''))
  on conflict (run_date) do update set
    seconds = excluded.seconds, location = excluded.location, note = excluded.note;
  return true;
end $$;

create or replace function public.workout_set_program(p_program_id text, p_started_on date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  if p_program_id is not null
     and not exists (select 1 from workout_programs where id = p_program_id) then
    return false;
  end if;
  insert into workout_profile (id, program_id, program_started_on, updated_at)
  values (
    1,
    p_program_id,
    case when p_program_id is null then null
         else coalesce(p_started_on, (now() at time zone 'Africa/Johannesburg')::date) end,
    now())
  on conflict (id) do update set
    program_id = excluded.program_id,
    program_started_on = excluded.program_started_on,
    updated_at = now();
  return true;
end $$;

create or replace function public.workout_log_benchmark(
  p_routine_id text, p_date date, p_rounds int, p_reps int, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  if p_rounds is null or p_rounds < 0 then return false; end if;
  if not exists (select 1 from workout_routines where id = p_routine_id) then return false; end if;
  insert into workout_benchmarks (routine_id, log_date, rounds, extra_reps, note)
  values (p_routine_id, p_date, p_rounds, greatest(coalesce(p_reps, 0), 0), coalesce(p_note, ''))
  on conflict (routine_id, log_date) do update set
    rounds = excluded.rounds, extra_reps = excluded.extra_reps, note = excluded.note;
  return true;
end $$;

create or replace function public.workout_delete_benchmark(p_routine_id text, p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  delete from workout_benchmarks where routine_id = p_routine_id and log_date = p_date;
  return found;
end $$;

create or replace function public.workout_delete_run(p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member() then return false; end if;
  delete from workout_runs where run_date = p_date;
  return found;
end $$;

revoke all on function public.workout_save_profile(date,numeric,text,text,numeric,numeric) from public, anon;
grant execute on function public.workout_save_profile(date,numeric,text,text,numeric,numeric) to authenticated;
revoke all on function public.workout_log_bodyweight(date,numeric) from public, anon;
grant execute on function public.workout_log_bodyweight(date,numeric) to authenticated;
revoke all on function public.workout_log_run(date,int,text,text) from public, anon;
grant execute on function public.workout_log_run(date,int,text,text) to authenticated;
revoke all on function public.workout_set_program(text,date) from public, anon;
grant execute on function public.workout_set_program(text,date) to authenticated;
revoke all on function public.workout_log_benchmark(text,date,int,int,text) from public, anon;
grant execute on function public.workout_log_benchmark(text,date,int,int,text) to authenticated;
revoke all on function public.workout_delete_benchmark(text,date) from public, anon;
grant execute on function public.workout_delete_benchmark(text,date) to authenticated;
revoke all on function public.workout_delete_run(date) from public, anon;
grant execute on function public.workout_delete_run(date) to authenticated;
