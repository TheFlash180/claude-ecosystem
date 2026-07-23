-- Workout Plan: full server-side schema (copy of record — already applied to
-- the shared Supabase project as migration workout_plan_schema).
--
--   workout_profile            single-row stats (drives calorie/protein targets)
--   workout_exercises          movement catalogue + demo photo + how-to
--   workout_routines           the weekly split (day 0=Mon; Wed has a gym main
--                              + a home fallback variant)
--   workout_routine_exercises  target sets/reps per exercise in a routine
--   workout_sessions           completed sessions (streaks + motivation)
--   workout_sets               logged sets (weight × reps) for progressive overload
--   workout_bodyweight         daily weigh-ins
--   workout_runs               parkrun / run times (PB + trend)
--   workout_settings           admin password (RLS, no read policy)
--
-- Public-read RLS; writes via security-definer RPCs (open — single-user app).
-- Exercise photos are the public-domain free-exercise-db (Unlicense), served
-- from raw.githubusercontent.com and cached by the PWA for offline use.

create table workout_profile (
  id int primary key default 1 check (id = 1),
  dob date,
  height_cm numeric,
  sex text not null default 'male' check (sex in ('male','female')),
  goal text not null default 'recomp' check (goal in ('recomp','cut','build')),
  target_weight_kg numeric,
  activity_factor numeric not null default 1.5,
  updated_at timestamptz not null default now()
);

create table workout_exercises (
  id text primary key,
  name text not null,
  muscle text not null default '',
  equipment text not null default '',
  setting text not null default 'both' check (setting in ('home','gym','both')),
  image_url text not null default '',
  instructions text not null default '',
  sort_order int not null default 0
);

create table workout_routines (
  id text primary key,
  day int check (day between 0 and 6),        -- 0 = Monday
  title text not null,
  kind text not null check (kind in ('home','gym','sport','run','rest')),
  subtitle text not null default '',
  variant text not null default 'main' check (variant in ('main','fallback')),
  sort_order int not null default 0
);

create table workout_routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id text not null references workout_routines(id) on delete cascade,
  exercise_id text not null references workout_exercises(id) on delete cascade,
  sort_order int not null default 0,
  target_sets int not null default 3,
  target_reps text not null default '10',
  note text not null default ''
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  routine_id text references workout_routines(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (session_date, routine_id)
);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  set_date date not null,
  exercise_id text not null references workout_exercises(id) on delete cascade,
  set_no int not null check (set_no between 1 and 20),
  weight_kg numeric,                          -- null = a bodyweight movement
  reps int check (reps >= 0),
  created_at timestamptz not null default now(),
  unique (set_date, exercise_id, set_no)
);

create table workout_bodyweight (
  id uuid primary key default gen_random_uuid(),
  log_date date not null unique,
  weight_kg numeric not null check (weight_kg > 0)
);

create table workout_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  seconds int not null check (seconds > 0),
  location text not null default 'parkrun',
  note text not null default ''
);

create table workout_settings (
  key text primary key,
  value text not null
);

-- ------------------------------------------------------------------ RLS
alter table workout_profile enable row level security;
alter table workout_exercises enable row level security;
alter table workout_routines enable row level security;
alter table workout_routine_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table workout_sets enable row level security;
alter table workout_bodyweight enable row level security;
alter table workout_runs enable row level security;
alter table workout_settings enable row level security;

create policy "public read" on workout_profile for select to anon, authenticated using (true);
create policy "public read" on workout_exercises for select to anon, authenticated using (true);
create policy "public read" on workout_routines for select to anon, authenticated using (true);
create policy "public read" on workout_routine_exercises for select to anon, authenticated using (true);
create policy "public read" on workout_sessions for select to anon, authenticated using (true);
create policy "public read" on workout_sets for select to anon, authenticated using (true);
create policy "public read" on workout_bodyweight for select to anon, authenticated using (true);
create policy "public read" on workout_runs for select to anon, authenticated using (true);
-- workout_settings: no read policy (admin password stays server-side)

-- >>> set the real password when applying; never commit it <<<
insert into workout_settings (key, value) values ('admin_password', 'CHANGE-ME');

-- ------------------------------------------------------------------ RPCs
create or replace function workout_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from workout_settings where key = 'admin_password' and value = p_password) $$;

create or replace function workout_save_profile(
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

create or replace function workout_log_set(
  p_date date, p_exercise_id text, p_set_no int, p_weight numeric, p_reps int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_set_no not between 1 and 20 then return false; end if;
  if not exists (select 1 from workout_exercises where id = p_exercise_id) then return false; end if;
  if p_reps is null then
    delete from workout_sets where set_date = p_date and exercise_id = p_exercise_id and set_no = p_set_no;
    return true;
  end if;
  insert into workout_sets (set_date, exercise_id, set_no, weight_kg, reps)
  values (p_date, p_exercise_id, p_set_no, p_weight, p_reps)
  on conflict (set_date, exercise_id, set_no) do update set
    weight_kg = excluded.weight_kg, reps = excluded.reps, created_at = now();
  return true;
end $$;

create or replace function workout_complete_session(p_date date, p_routine_id text, p_done boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_done, true) then
    insert into workout_sessions (session_date, routine_id) values (p_date, p_routine_id)
    on conflict (session_date, routine_id) do update set completed_at = now();
  else
    delete from workout_sessions where session_date = p_date and routine_id is not distinct from p_routine_id;
  end if;
  return true;
end $$;

create or replace function workout_log_bodyweight(p_date date, p_weight numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_weight is null or p_weight <= 0 then return false; end if;
  insert into workout_bodyweight (log_date, weight_kg) values (p_date, p_weight)
  on conflict (log_date) do update set weight_kg = excluded.weight_kg;
  return true;
end $$;

create or replace function workout_log_run(p_date date, p_seconds int, p_location text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_seconds is null or p_seconds <= 0 then return false; end if;
  insert into workout_runs (run_date, seconds, location, note)
  values (p_date, p_seconds, coalesce(nullif(trim(p_location),''),'parkrun'), coalesce(p_note,''))
  on conflict (run_date) do update set
    seconds = excluded.seconds, location = excluded.location, note = excluded.note;
  return true;
end $$;

create or replace function workout_delete_run(p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from workout_runs where run_date = p_date;
  return found;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function workout_admin_check(text) from public, anon;
revoke all on function workout_save_profile(date,numeric,text,text,numeric,numeric) from public, anon;
revoke all on function workout_log_set(date,text,int,numeric,int) from public, anon;
revoke all on function workout_complete_session(date,text,boolean) from public, anon;
revoke all on function workout_log_bodyweight(date,numeric) from public, anon;
revoke all on function workout_log_run(date,int,text,text) from public, anon;
revoke all on function workout_delete_run(date) from public, anon;

grant execute on function workout_admin_check(text) to anon;
grant execute on function workout_save_profile(date,numeric,text,text,numeric,numeric) to anon;
grant execute on function workout_log_set(date,text,int,numeric,int) to anon;
grant execute on function workout_complete_session(date,text,boolean) to anon;
grant execute on function workout_log_bodyweight(date,numeric) to anon;
grant execute on function workout_log_run(date,int,text,text) to anon;
grant execute on function workout_delete_run(date) to anon;
