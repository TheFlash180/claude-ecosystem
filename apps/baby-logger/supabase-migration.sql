-- ============================================================
-- Baby Logger: Simplified Supabase Schema
-- ============================================================
-- Run this in the Supabase SQL Editor ONCE before first deploy.
-- This is a private 2-user app — no household/invite code system.
-- All authenticated users share full access to all data.
-- ============================================================

-- 1. PROFILES (shared with FinTrack — uses `id` as PK, not `user_id`)
-- The profiles table already exists from FinTrack setup.
-- Baby Logger reuses it: columns id (uuid PK → auth.users), display_name.
-- If creating fresh:
-- create table if not exists profiles (
--   id uuid primary key references auth.users(id) on delete cascade,
--   display_name text not null
-- );
-- alter table profiles enable row level security;
-- create policy "Authenticated users full access" on profiles
--   for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 2. BABIES
create table if not exists babies (
  id uuid primary key default gen_random_uuid(),
  name text,
  due_date date not null,
  birth_date date,
  birth_weight_g int,
  -- LMP-equivalent date the week counter counts from (scan dating can sit a
  -- few days off 280-days-before-due-date arithmetic); null = use due_date
  week_anchor date,
  created_at timestamptz default now()
);
alter table babies enable row level security;
create policy "Authenticated users full access" on babies
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 3. FEED EVENTS
create table if not exists feed_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  feed_type text not null check (feed_type in ('breast_left', 'breast_right', 'bottle', 'solid')),
  started_at timestamptz not null default now(),
  duration_minutes int,
  amount_ml int,
  notes text,
  created_at timestamptz default now()
);
alter table feed_events enable row level security;
create policy "Authenticated users full access" on feed_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 4. SLEEP EVENTS
create table if not exists sleep_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
alter table sleep_events enable row level security;
create policy "Authenticated users full access" on sleep_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 5. NAPPY EVENTS
create table if not exists nappy_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  nappy_type text not null check (nappy_type in ('wet', 'dirty', 'both')),
  logged_at timestamptz not null default now(),
  notes text,
  created_at timestamptz default now()
);
alter table nappy_events enable row level security;
create policy "Authenticated users full access" on nappy_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 6. WEIGHT EVENTS
create table if not exists weight_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  weight_g int not null,
  measured_at date not null default current_date,
  notes text,
  created_at timestamptz default now()
);
alter table weight_events enable row level security;
create policy "Authenticated users full access" on weight_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_feed_baby_time on feed_events (baby_id, started_at desc);
create index if not exists idx_sleep_baby_time on sleep_events (baby_id, started_at desc);
create index if not exists idx_nappy_baby_time on nappy_events (baby_id, logged_at desc);
create index if not exists idx_weight_baby_date on weight_events (baby_id, measured_at desc);
