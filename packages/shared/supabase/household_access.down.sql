-- Rollback of household_access.sql: back to the state recorded on 2026-11-23 (policies, grants and RPC
-- bodies exactly as they were). This re-opens EC-01 and EC-02; use it only to undo a broken rollout.

do $$ declare t text; begin
  foreach t in array array['babies','feed_events','sleep_events','nappy_events','weight_events'] loop
    execute format('drop policy if exists "household members" on public.%I', t);
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);
    execute format('create policy "Authenticated users full access" on public.%I for all '
                   'using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
drop policy if exists "household members" on public.profiles;
create policy "household members" on public.profiles for all to authenticated using (true) with check (true);
grant all on public.profiles to anon, authenticated;
grant all on public.household_allowlist to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['workout_profile','workout_bodyweight','workout_runs','workout_benchmarks'] loop
    execute format('drop policy if exists "household read" on public.%I', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

create or replace function public.workout_save_profile(
  p_dob date, p_height numeric, p_sex text, p_goal text,
  p_target numeric, p_activity numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
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
  if p_weight is null or p_weight <= 0 then return false; end if;
  insert into workout_bodyweight (log_date, weight_kg) values (p_date, p_weight)
  on conflict (log_date) do update set weight_kg = excluded.weight_kg;
  return true;
end $$;

create or replace function public.workout_log_run(p_date date, p_seconds int, p_location text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
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
  delete from workout_benchmarks where routine_id = p_routine_id and log_date = p_date;
  return found;
end $$;

create or replace function public.workout_delete_run(p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from workout_runs where run_date = p_date;
  return found;
end $$;

grant execute on function public.workout_save_profile(date,numeric,text,text,numeric,numeric) to anon;
grant execute on function public.workout_log_bodyweight(date,numeric) to anon;
grant execute on function public.workout_log_run(date,int,text,text) to anon;
grant execute on function public.workout_set_program(text,date) to anon;
grant execute on function public.workout_log_benchmark(text,date,int,int,text) to anon;
grant execute on function public.workout_delete_benchmark(text,date) to anon;
grant execute on function public.workout_delete_run(date) to anon;

revoke execute on function public.is_household_member() from authenticated;
drop function if exists public.is_household_member();
