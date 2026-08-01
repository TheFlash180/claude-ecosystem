-- Meal Prep: full server-side schema (copy of record — already applied to
-- the shared Supabase project).
--
--   mealprep_recipes    the recipe book: ingredients, method, time, meal type
--   mealprep_cook_list  what we have decided to cook (household-shared)
--   mealprep_ticks      shopping tick state + custom extras
--   mealprep_settings   admin password (RLS, no policies)
--   mealprep_push_subs  Sunday prep-reminder subscriptions (token RPCs only)
--
-- Edge function (see ./functions/):
--   send-mealprep-reminder  Sundays 06:25 UTC (08:25 SAST): pushes what is on
--                           the cook list and how much shopping is left.
--
-- This app used to be a weekly planner. The grid was used twice in four months
-- while the recipes were used constantly, so it became a recipe book: the
-- question it answers is "we cannot decide what to make", which needs the
-- method, not a calendar. mealprep_plan and mealprep_shopping were dropped
-- with the planner.

create table mealprep_recipes (
  id text primary key,                      -- seed slug or mp-<rand>
  name text not null,
  emoji text not null default '🍽️',
  -- 'any' means lunch or dinner. Sides, snacks and puddings are their own
  -- shelves and do not appear under lunch or dinner.
  meal_type text not null default 'any'
    check (meal_type in ('lunch','dinner','any','side','snack','dessert')),
  serves int not null default 4 check (serves between 1 and 20),
  ingredients jsonb not null default '[]'::jsonb,  -- [{n,q,u,c,f?}]
  steps jsonb not null default '[]'::jsonb,        -- ordered array of strings
  total_minutes integer,                    -- hands-on + cooking, for the time filters
  -- Serving-size scaling. false where the quantities are not really
  -- quantities: the pap guide is a ratio explainer, a mug cake is one mug and
  -- a fixed microwave time. An ingredient carrying "f": true is fixed too —
  -- the litre of oil you deep-fry in does not double because dinner did.
  scalable boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mealprep_recipes enable row level security;
create policy "public read" on mealprep_recipes for select to anon, authenticated using (true);

-- What we are cooking, household-shared. One person adding a recipe and the
-- other seeing it on the shopping list is the entire point, so no device token.
create table mealprep_cook_list (
  recipe_id text primary key references mealprep_recipes(id) on delete cascade,
  -- How many you are cooking for, so the shopping list agrees with the recipe
  -- sheet. null = the recipe's own serves.
  servings int check (servings between 1 and 20),
  added_at timestamptz not null default now()
);
alter table mealprep_cook_list enable row level security;
create policy "public read" on mealprep_cook_list for select to anon, authenticated using (true);

-- Tick state keyed by item rather than by week, so it does not silently reset
-- when the calendar rolls over mid-shop.
create table mealprep_ticks (
  item_key text primary key,
  label text not null,
  checked boolean not null default false,
  custom boolean not null default false,    -- true = a hand-added extra
  updated_at timestamptz not null default now()
);
alter table mealprep_ticks enable row level security;
create policy "public read" on mealprep_ticks for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- admin
create table mealprep_settings (
  key text primary key,
  value text not null
);
alter table mealprep_settings enable row level security;
-- no policies: definer functions only

-- >>> set the real password when applying; never commit it <<<
-- Seeded with a bcrypt hash of the literal 'CHANGE-ME'. Set the real password
-- after deploying, hashed, so plaintext never touches the repo or the database:
--   update mealprep_settings
--   set value = extensions.crypt('your-password', extensions.gen_salt('bf', 10))
--   where key = 'admin_password';
insert into mealprep_settings (key, value)
values ('admin_password', extensions.crypt('CHANGE-ME', extensions.gen_salt('bf', 10)));

create or replace function _mealprep_hash_token(p_token text)
returns text language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

-- The password is stored as a bcrypt hash (pgcrypto, cost 10), not plaintext:
-- this RPC is anon-callable by design, so a ~100ms hash makes brute-forcing it
-- over REST impractical.
create or replace function _mealprep_admin_ok(p_password text)
returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.mealprep_settings
                  where key = 'admin_password'
                    and value = extensions.crypt(p_password, value)) $$;

create or replace function mealprep_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select _mealprep_admin_ok(p_password) $$;

-- ---------------------------------------------------------------- recipes
-- Open by design: the household adds/edits recipes without a password. Only
-- deleting needs it.
create or replace function mealprep_upsert_recipe(
  p_id text, p_name text, p_emoji text, p_meal_type text,
  p_serves int, p_ingredients jsonb, p_notes text,
  p_steps jsonb default '[]'::jsonb, p_total_minutes integer default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text; v_step jsonb;
begin
  if length(trim(coalesce(p_name,''))) = 0 or length(p_name) > 120 then return null; end if;
  if p_meal_type not in ('lunch','dinner','any','side','snack','dessert') then return null; end if;
  if jsonb_typeof(coalesce(p_ingredients,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_ingredients,'[]'::jsonb)) > 40 then return null; end if;
  if length(coalesce(p_notes,'')) > 2000 or length(coalesce(p_emoji,'')) > 8 then return null; end if;

  if jsonb_typeof(coalesce(p_steps,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_steps,'[]'::jsonb)) > 30 then return null; end if;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps,'[]'::jsonb)) loop
    if jsonb_typeof(v_step) <> 'string' or length(v_step #>> '{}') > 600 then return null; end if;
  end loop;
  if p_total_minutes is not null and (p_total_minutes < 0 or p_total_minutes > 2880) then
    return null;
  end if;

  v_id := coalesce(p_id, 'mp-' || substr(gen_random_uuid()::text, 1, 8));
  insert into mealprep_recipes (id, name, emoji, meal_type, serves, ingredients, notes, steps, total_minutes)
  values (v_id, trim(p_name), coalesce(nullif(p_emoji,''),'🍽️'), p_meal_type,
          coalesce(p_serves, 4), coalesce(p_ingredients,'[]'::jsonb),
          nullif(trim(coalesce(p_notes,'')),''),
          coalesce(p_steps,'[]'::jsonb), p_total_minutes)
  on conflict (id) do update set
    name = excluded.name, emoji = excluded.emoji, meal_type = excluded.meal_type,
    serves = excluded.serves, ingredients = excluded.ingredients,
    notes = excluded.notes, steps = excluded.steps,
    total_minutes = excluded.total_minutes, updated_at = now();
  return v_id;
end $$;

create or replace function mealprep_delete_recipe(p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _mealprep_admin_ok(p_password) then return false; end if;
  delete from mealprep_recipes where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------- cook list
create or replace function mealprep_cook_add(p_recipe_id text, p_servings int default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_servings is not null and (p_servings < 1 or p_servings > 20) then return false; end if;
  insert into mealprep_cook_list (recipe_id, servings) values (p_recipe_id, p_servings)
  on conflict (recipe_id) do update set servings = excluded.servings;
  return true;
end $$;

create or replace function mealprep_cook_remove(p_recipe_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from mealprep_cook_list where recipe_id = p_recipe_id;
  -- Ticks for items no longer on any selected recipe are meaningless; the
  -- client rebuilds the list, and orphaned rows would resurface as stale
  -- ticks the next time the same ingredient reappears.
  delete from mealprep_ticks where custom = false;
  return true;
end $$;

create or replace function mealprep_cook_clear()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from mealprep_cook_list;
  delete from mealprep_ticks;
  return true;
end $$;

-- ---------------------------------------------------------------- shopping
create or replace function mealprep_tick(p_item_key text, p_label text, p_checked boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into mealprep_ticks (item_key, label, checked, custom)
  values (p_item_key, p_label, p_checked, false)
  on conflict (item_key) do update
    set checked = excluded.checked, label = excluded.label, updated_at = now();
  return true;
end $$;

create or replace function mealprep_extra_add(p_label text)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if coalesce(btrim(p_label), '') = '' then return null; end if;
  v_key := 'x-' || encode(gen_random_bytes(6), 'hex');
  insert into mealprep_ticks (item_key, label, checked, custom)
  values (v_key, btrim(p_label), false, true);
  return v_key;
end $$;

create or replace function mealprep_extra_remove(p_item_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from mealprep_ticks where item_key = p_item_key and custom = true;
  return true;
end $$;

-- ---------------------------------------------------------------- push
create table mealprep_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text,
  enabled boolean not null default true,
  created_at timestamptz default now()
);
alter table mealprep_push_subs enable row level security;
-- NO open policies: token-checked definer RPCs only.

-- A browser mints a fresh endpoint whenever it rotates a push subscription
-- (VAPID change, service-worker or PWA reinstall), and this table is unique on
-- endpoint — so without the cleanup below a device accumulates a row per
-- rotation. The prep-day push goes to EVERY row, so N rows is N notifications.
-- Keep one row per device.
create or replace function mealprep_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_sub uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  v_hash := _mealprep_hash_token(p_token);

  insert into mealprep_push_subs (endpoint, p256dh, auth, device_token_hash, enabled)
  values (p_endpoint, p_p256dh, p_auth, v_hash, true)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash, enabled = true
  returning id into v_sub;

  delete from mealprep_push_subs
   where device_token_hash = v_hash and id <> v_sub;

  return true;
end $$;

create or replace function mealprep_push_set_enabled(p_token text, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update mealprep_push_subs set enabled = coalesce(p_enabled, false)
   where device_token_hash = _mealprep_hash_token(p_token);
  return found;
end $$;

create or replace function mealprep_push_status(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from mealprep_push_subs
                    where device_token_hash = _mealprep_hash_token(p_token)
                    limit 1), false)
$$;

-- ---------------------------------------------------------------- vault
-- Meal Prep has its OWN VAPID keypair (per-app keys since 2026-07-18).
-- Private key lives in Vault; create/rotate with:
--   select vault.create_secret('<key>', 'mealprep_vapid_private_key', '...');
create or replace function get_mealprep_vapid_private_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'mealprep_vapid_private_key' $$;

-- ---------------------------------------------------------------- grants
revoke all on function _mealprep_hash_token(text) from public, anon;
revoke all on function _mealprep_admin_ok(text) from public, anon;
revoke all on function mealprep_admin_check(text) from public, anon;
revoke all on function mealprep_upsert_recipe(text,text,text,text,int,jsonb,text,jsonb,integer) from public, anon;
revoke all on function mealprep_delete_recipe(text,text) from public, anon;
revoke all on function mealprep_cook_add(text,int) from public, anon;
revoke all on function mealprep_cook_remove(text) from public, anon;
revoke all on function mealprep_cook_clear() from public, anon;
revoke all on function mealprep_tick(text,text,boolean) from public, anon;
revoke all on function mealprep_extra_add(text) from public, anon;
revoke all on function mealprep_extra_remove(text) from public, anon;
revoke all on function mealprep_push_register(text,text,text,text) from public, anon;
revoke all on function mealprep_push_set_enabled(text,boolean) from public, anon;
revoke all on function mealprep_push_status(text) from public, anon;
revoke all on function get_mealprep_vapid_private_key() from public, anon, authenticated;

grant execute on function mealprep_admin_check(text) to anon;
grant execute on function mealprep_upsert_recipe(text,text,text,text,int,jsonb,text,jsonb,integer) to anon;
grant execute on function mealprep_delete_recipe(text,text) to anon;
grant execute on function mealprep_cook_add(text,int) to anon;
grant execute on function mealprep_cook_remove(text) to anon;
grant execute on function mealprep_cook_clear() to anon;
grant execute on function mealprep_tick(text,text,boolean) to anon;
grant execute on function mealprep_extra_add(text) to anon;
grant execute on function mealprep_extra_remove(text) to anon;
grant execute on function mealprep_push_register(text,text,text,text) to anon;
grant execute on function mealprep_push_set_enabled(text,boolean) to anon;
grant execute on function mealprep_push_status(text) to anon;
grant execute on function get_mealprep_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- cron
-- Sunday 06:25 UTC = 08:25 SAST: prep-day nudge.
-- Schedule this explicitly, once — do not apply it by running this file.
select cron.schedule(
  'mealprep-prep-reminder',
  '25 6 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/send-mealprep-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
