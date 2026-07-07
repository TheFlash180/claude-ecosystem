-- ============================================================
-- Baby Logger: Supabase Schema Migration
-- ============================================================
-- Run this in the Supabase SQL Editor ONCE before first deploy.
-- This is the ecosystem's first authenticated app. The patterns
-- here (households, members, shared RLS) carry into FinTrack Pro.
-- ============================================================

-- 1. HOUSEHOLDS
-- A household groups users who share baby-logging duties.
-- Rickus creates one; Anjoné joins with an invite code.
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Family',
  invite_code text unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);
alter table households enable row level security;

-- 2. HOUSEHOLD MEMBERS
-- Links auth.users to households. A user belongs to exactly one household.
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text not null,
  role text not null default 'parent' check (role in ('parent', 'caregiver')),
  created_at timestamptz default now(),
  unique (user_id)  -- one household per user
);
alter table household_members enable row level security;

-- 3. BABIES
create table babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  name text,                        -- null until born / named
  due_date date not null,
  birth_date date,                  -- null = not yet born
  birth_weight_g int,
  created_at timestamptz default now()
);
alter table babies enable row level security;

-- 4. FEED EVENTS
create table feed_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  feed_type text not null check (feed_type in ('breast_left', 'breast_right', 'bottle', 'solid')),
  started_at timestamptz not null default now(),
  duration_minutes int,             -- for breast feeds
  amount_ml int,                    -- for bottle feeds
  notes text,
  created_at timestamptz default now()
);
alter table feed_events enable row level security;

-- 5. SLEEP EVENTS
create table sleep_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,             -- null = currently sleeping
  notes text,
  created_at timestamptz default now()
);
alter table sleep_events enable row level security;

-- 6. NAPPY EVENTS
create table nappy_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  nappy_type text not null check (nappy_type in ('wet', 'dirty', 'both')),
  logged_at timestamptz not null default now(),
  notes text,
  created_at timestamptz default now()
);
alter table nappy_events enable row level security;

-- 7. WEIGHT EVENTS
create table weight_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade not null,
  logged_by uuid references auth.users(id) not null,
  weight_g int not null,
  measured_at date not null default current_date,
  notes text,
  created_at timestamptz default now()
);
alter table weight_events enable row level security;

-- ============================================================
-- RLS POLICIES
-- Pattern: "user can access rows belonging to their household"
-- This same pattern transfers directly to FinTrack Pro.
-- ============================================================

-- Helper: returns the household_id for the current authenticated user
create or replace function my_household_id()
returns uuid
language sql
security definer
stable
as $$
  select household_id from household_members where user_id = auth.uid()
$$;

-- HOUSEHOLDS: members can read their own household
create policy "Members can view their household"
  on households for select using (id = my_household_id());

create policy "Authenticated users can create a household"
  on households for insert with check (auth.uid() is not null);

-- HOUSEHOLD_MEMBERS: members can see co-members; users can join
create policy "Members can view household members"
  on household_members for select using (household_id = my_household_id());

create policy "Users can join a household"
  on household_members for insert with check (user_id = auth.uid());

-- BABIES: household members can CRUD
create policy "Members can view babies"
  on babies for select using (household_id = my_household_id());

create policy "Members can add babies"
  on babies for insert with check (household_id = my_household_id());

create policy "Members can update babies"
  on babies for update using (household_id = my_household_id());

-- EVENT TABLES: same household pattern via baby_id join
-- (Feed, Sleep, Nappy, Weight all follow the identical pattern)

-- Feed events
create policy "Members can view feeds"
  on feed_events for select using (
    baby_id in (select id from babies where household_id = my_household_id())
  );
create policy "Members can log feeds"
  on feed_events for insert with check (
    baby_id in (select id from babies where household_id = my_household_id())
    and logged_by = auth.uid()
  );
create policy "Members can update own feeds"
  on feed_events for update using (logged_by = auth.uid());
create policy "Members can delete own feeds"
  on feed_events for delete using (logged_by = auth.uid());

-- Sleep events
create policy "Members can view sleeps"
  on sleep_events for select using (
    baby_id in (select id from babies where household_id = my_household_id())
  );
create policy "Members can log sleeps"
  on sleep_events for insert with check (
    baby_id in (select id from babies where household_id = my_household_id())
    and logged_by = auth.uid()
  );
create policy "Members can update own sleeps"
  on sleep_events for update using (logged_by = auth.uid());
create policy "Members can delete own sleeps"
  on sleep_events for delete using (logged_by = auth.uid());

-- Nappy events
create policy "Members can view nappies"
  on nappy_events for select using (
    baby_id in (select id from babies where household_id = my_household_id())
  );
create policy "Members can log nappies"
  on nappy_events for insert with check (
    baby_id in (select id from babies where household_id = my_household_id())
    and logged_by = auth.uid()
  );
create policy "Members can update own nappies"
  on nappy_events for update using (logged_by = auth.uid());
create policy "Members can delete own nappies"
  on nappy_events for delete using (logged_by = auth.uid());

-- Weight events
create policy "Members can view weights"
  on weight_events for select using (
    baby_id in (select id from babies where household_id = my_household_id())
  );
create policy "Members can log weights"
  on weight_events for insert with check (
    baby_id in (select id from babies where household_id = my_household_id())
    and logged_by = auth.uid()
  );
create policy "Members can update own weights"
  on weight_events for update using (logged_by = auth.uid());
create policy "Members can delete own weights"
  on weight_events for delete using (logged_by = auth.uid());

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
create index idx_feed_baby_time on feed_events (baby_id, started_at desc);
create index idx_sleep_baby_time on sleep_events (baby_id, started_at desc);
create index idx_nappy_baby_time on nappy_events (baby_id, logged_at desc);
create index idx_weight_baby_date on weight_events (baby_id, measured_at desc);
create index idx_members_user on household_members (user_id);
create index idx_members_household on household_members (household_id);
