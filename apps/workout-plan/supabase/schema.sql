-- Workout Plan: full server-side schema (copy of record — already applied to
-- the shared Supabase project as migration workout_plan_schema).
--
--   workout_programs           multi-week plans laid over the routine library
--   workout_program_days       the weekly split: one row per session
--   workout_program_phases     progression blocks (weeks 1-4, 5-8, 9-12)
--   workout_profile            single-row stats (drives calorie/protein targets)
--   workout_exercises          movement catalogue + demo photo + how-to
--   workout_routines           the workout library — types, not weekdays
--   workout_routine_exercises  target sets/reps per exercise in a routine
--   workout_bodyweight         daily weigh-ins
--   workout_benchmarks         AMRAP scores (rounds + reps), PB per workout
--   workout_runs               parkrun / run times (PB + trend)
--   workout_settings           admin password (RLS, no read policy)
--
-- The app is a guide, not a training log: routines and exercises are read-only
-- reference, and it records only whole-session results — bodyweight, run times
-- and AMRAP scores. One number, entered when you feel like it.
-- (workout_sessions / workout_sets, which logged each set of each day, were
-- dropped in the library rebuild — that logging went unused. The distinction
-- that matters is friction: every set of every session died, a parkrun time
-- survived. A round count is the second shape, not the first.)
--
-- Public-read RLS; writes via security-definer RPCs (open — single-user app).
-- Exercise photos are the public-domain free-exercise-db (Unlicense), served
-- from raw.githubusercontent.com and cached by the PWA for offline use.

-- Declared first: workout_profile and workout_routines both point at it.
create table workout_programs (
  id text primary key,
  title text not null,
  subtitle text not null default '',
  summary text not null default '',
  weeks int not null default 12 check (weeks > 0),
  sort_order int not null default 0
);

create table workout_profile (
  id int primary key default 1 check (id = 1),
  dob date,
  height_cm numeric,
  sex text not null default 'male' check (sex in ('male','female')),
  goal text not null default 'recomp' check (goal in ('recomp','cut','build')),
  target_weight_kg numeric,
  activity_factor numeric not null default 1.5,
  -- Which programme is running, and since when. The current week is DERIVED
  -- from the start date rather than stored, so there is nothing to keep up to
  -- date week by week — the upkeep that killed the old set logging.
  program_id text references workout_programs(id) on update cascade on delete set null,
  program_started_on date,
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
  title text not null,
  kind text not null check (kind in ('home','gym','run','mobility')),
  subtitle text not null default '',
  summary text not null default '',           -- the paragraph on the workout page
  est_minutes int,
  sort_order int not null default 0,
  -- A routine belonging to a programme is not part of the browsable library:
  -- the Workouts tab filters on program_id is null, so adding a programme
  -- leaves that tab showing exactly what it always showed.
  program_id text references workout_programs(id) on update cascade on delete set null,
  -- An AMRAP has a round count worth beating; a strength session does not, and
  -- offering to "log a score" for one would be noise.
  scored boolean not null default false
);

-- on update cascade: routine ids are readable slugs and get renamed.
create table workout_routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id text not null references workout_routines(id) on update cascade on delete cascade,
  exercise_id text not null references workout_exercises(id) on delete cascade,
  sort_order int not null default 0,
  target_sets int not null default 3,         -- 1 = a single hold, shown without "1 ×"
  target_reps text not null default '10',
  note text not null default ''
);

-- One row per session in a programme's weekly split. home_/gym_routine_id are
-- the two builds of the same session; a session that is setting-agnostic (the
-- conditioning day) fills only one and the UI shows no toggle.
create table workout_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references workout_programs(id) on update cascade on delete cascade,
  day_index int not null,
  label text not null,
  home_routine_id text references workout_routines(id) on update cascade on delete set null,
  gym_routine_id text references workout_routines(id) on update cascade on delete set null,
  note text not null default '',
  unique (program_id, day_index)
);

-- Progression blocks: what actually changes between week 1 and week 12.
create table workout_program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references workout_programs(id) on update cascade on delete cascade,
  from_week int not null check (from_week >= 1),
  to_week int not null,
  title text not null,
  guidance text not null default '',
  check (to_week >= from_week),
  unique (program_id, from_week)
);

create table workout_bodyweight (
  id uuid primary key default gen_random_uuid(),
  log_date date not null unique,
  weight_kg numeric not null check (weight_kg > 0)
);

-- Benchmark scores: one row per attempt at a scored workout.
--
-- Deliberately the same shape as workout_runs, not the per-set logging that
-- was built here once and deleted. The difference is friction: sets meant
-- every set of every exercise every session; this is one number, entered when
-- you feel like it, exactly like a parkrun time. An AMRAP with nowhere to put
-- the round count is pointless, so this is what makes those workouts work.
--
-- rounds + extra_reps is how an AMRAP is actually scored ("11 rounds + 7").
-- Ordering by (rounds, extra_reps) gives the PB within a workout.
create table workout_benchmarks (
  id uuid primary key default gen_random_uuid(),
  routine_id text not null references workout_routines(id) on update cascade on delete cascade,
  log_date date not null,
  rounds int not null check (rounds >= 0),
  extra_reps int not null default 0 check (extra_reps >= 0),
  note text not null default '',
  -- One score per workout per day: a re-entry corrects, it does not stack.
  unique (routine_id, log_date)
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
alter table workout_programs enable row level security;
alter table workout_program_days enable row level security;
alter table workout_program_phases enable row level security;
alter table workout_profile enable row level security;
alter table workout_exercises enable row level security;
alter table workout_routines enable row level security;
alter table workout_routine_exercises enable row level security;
alter table workout_bodyweight enable row level security;
alter table workout_benchmarks enable row level security;
alter table workout_runs enable row level security;
alter table workout_settings enable row level security;

create policy "public read" on workout_programs for select to anon, authenticated using (true);
create policy "public read" on workout_program_days for select to anon, authenticated using (true);
create policy "public read" on workout_program_phases for select to anon, authenticated using (true);
create policy "public read" on workout_profile for select to anon, authenticated using (true);
create policy "public read" on workout_exercises for select to anon, authenticated using (true);
create policy "public read" on workout_routines for select to anon, authenticated using (true);
create policy "public read" on workout_routine_exercises for select to anon, authenticated using (true);
create policy "public read" on workout_bodyweight for select to anon, authenticated using (true);
create policy "public read" on workout_benchmarks for select to anon, authenticated using (true);
create policy "public read" on workout_runs for select to anon, authenticated using (true);
-- workout_settings: no read policy (admin password stays server-side)

-- >>> set the real password when applying; never commit it <<<
-- Seeded with a bcrypt hash of the literal 'CHANGE-ME'. Set the real password
-- after deploying, hashed, so plaintext never touches the repo or the database:
--   update workout_settings
--   set value = extensions.crypt('your-password', extensions.gen_salt('bf', 10))
--   where key = 'admin_password';
insert into workout_settings (key, value)
values ('admin_password', extensions.crypt('CHANGE-ME', extensions.gen_salt('bf', 10)));

-- ------------------------------------------------------------------ RPCs
-- The password is stored as a bcrypt hash (pgcrypto, cost 10), not plaintext:
-- this RPC is anon-callable by design, so a ~100ms hash makes brute-forcing it
-- over REST impractical.
create or replace function workout_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.workout_settings
                  where key = 'admin_password'
                    and value = extensions.crypt(p_password, value)) $$;

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

-- Start, change or clear the running programme. Passing a null programme
-- clears the start date with it, so a stopped programme cannot leave a stale
-- "week 7 of 12" behind. Defaults the start to today in SAST, matching how
-- every other date in this ecosystem is decided.
create or replace function workout_set_program(p_program_id text, p_started_on date)
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

create or replace function workout_log_benchmark(
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

create or replace function workout_delete_benchmark(p_routine_id text, p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from workout_benchmarks where routine_id = p_routine_id and log_date = p_date;
  return found;
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
revoke all on function workout_log_bodyweight(date,numeric) from public, anon;
revoke all on function workout_log_run(date,int,text,text) from public, anon;
revoke all on function workout_delete_run(date) from public, anon;
revoke all on function workout_set_program(text,date) from public, anon;
revoke all on function workout_log_benchmark(text,date,int,int,text) from public, anon;
revoke all on function workout_delete_benchmark(text,date) from public, anon;

grant execute on function workout_admin_check(text) to anon;
grant execute on function workout_save_profile(date,numeric,text,text,numeric,numeric) to anon;
grant execute on function workout_log_bodyweight(date,numeric) to anon;
grant execute on function workout_log_run(date,int,text,text) to anon;
grant execute on function workout_delete_run(date) to anon;
grant execute on function workout_set_program(text,date) to anon;
grant execute on function workout_log_benchmark(text,date,int,int,text) to anon;
grant execute on function workout_delete_benchmark(text,date) to anon;
