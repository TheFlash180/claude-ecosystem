-- Meal Prep: full server-side schema (copy of record — already applied to
-- the shared Supabase project as migration mealprep_schema).
--
--   mealprep_recipes    recipe book (open add/edit; password-gated delete)
--   mealprep_plan       one row per planned slot (week Mon-start, lunch/dinner)
--   mealprep_shopping   per-week tick state + custom extras
--   mealprep_settings   admin password (RLS, no policies)
--   mealprep_push_subs  Sunday prep-reminder subscriptions (token RPCs only)
--
-- Edge function (see ./functions/):
--   send-mealprep-reminder  Sundays 06:25 UTC (08:25 SAST): pushes the
--                           coming week's menu + shopping-list size, and
--                           prunes weeks older than 10 weeks.

create table mealprep_recipes (
  id text primary key,                      -- seed slug or mp-<rand>
  name text not null,
  emoji text not null default '🍽️',
  meal_type text not null default 'any' check (meal_type in ('lunch','dinner','any')),
  serves int not null default 4 check (serves between 1 and 20),
  ingredients jsonb not null default '[]'::jsonb,  -- [{n,q,u,c}]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mealprep_recipes enable row level security;
create policy "public read" on mealprep_recipes for select to anon, authenticated using (true);

-- One row per planned slot; a missing row = empty slot.
create table mealprep_plan (
  id uuid primary key default gen_random_uuid(),
  week_start date not null check (extract(isodow from week_start) = 1),
  day int not null check (day between 0 and 6),   -- 0 = Monday
  slot text not null check (slot in ('lunch','dinner')),
  recipe_id text not null references mealprep_recipes(id) on delete cascade,
  is_leftover boolean not null default false,     -- filled by "cook double"
  updated_at timestamptz not null default now(),
  unique (week_start, day, slot)
);
alter table mealprep_plan enable row level security;
create policy "public read" on mealprep_plan for select to anon, authenticated using (true);

-- Shopping list state per week: ticked auto-items + custom extras.
create table mealprep_shopping (
  id uuid primary key default gen_random_uuid(),
  week_start date not null check (extract(isodow from week_start) = 1),
  item_key text not null,
  label text not null default '',
  checked boolean not null default false,
  custom boolean not null default false,
  unique (week_start, item_key)
);
alter table mealprep_shopping enable row level security;
create policy "public read" on mealprep_shopping for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- admin
create table mealprep_settings (
  key text primary key,
  value text not null
);
alter table mealprep_settings enable row level security;
-- no policies: definer functions only

-- >>> set the real password when applying; never commit it <<<
insert into mealprep_settings (key, value) values ('admin_password', 'CHANGE-ME');

create or replace function _mealprep_hash_token(p_token text)
returns text language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

create or replace function _mealprep_admin_ok(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from mealprep_settings
                  where key = 'admin_password' and value = p_password) $$;

create or replace function mealprep_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select _mealprep_admin_ok(p_password) $$;

-- ---------------------------------------------------------------- recipes
-- Open by design: the household adds/edits recipes without a password.
create or replace function mealprep_upsert_recipe(
  p_id text, p_name text, p_emoji text, p_meal_type text,
  p_serves int, p_ingredients jsonb, p_notes text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if length(trim(coalesce(p_name,''))) = 0 or length(p_name) > 120 then return null; end if;
  if p_meal_type not in ('lunch','dinner','any') then return null; end if;
  if jsonb_typeof(coalesce(p_ingredients,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_ingredients,'[]'::jsonb)) > 40 then return null; end if;
  if length(coalesce(p_notes,'')) > 2000 or length(coalesce(p_emoji,'')) > 8 then return null; end if;
  v_id := coalesce(p_id, 'mp-' || substr(gen_random_uuid()::text, 1, 8));
  insert into mealprep_recipes (id, name, emoji, meal_type, serves, ingredients, notes)
  values (v_id, trim(p_name), coalesce(nullif(p_emoji,''),'🍽️'), p_meal_type,
          coalesce(p_serves, 4), coalesce(p_ingredients,'[]'::jsonb),
          nullif(trim(coalesce(p_notes,'')),''))
  on conflict (id) do update set
    name = excluded.name, emoji = excluded.emoji, meal_type = excluded.meal_type,
    serves = excluded.serves, ingredients = excluded.ingredients,
    notes = excluded.notes, updated_at = now();
  return v_id;
end $$;

create or replace function mealprep_delete_recipe(p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _mealprep_admin_ok(p_password) then return false; end if;
  delete from mealprep_recipes where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------- plan
-- p_recipe_id null clears the slot. p_week normalized to its Monday.
create or replace function mealprep_set_slot(
  p_week date, p_day int, p_slot text, p_recipe_id text, p_leftover boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_week date;
begin
  if p_week is null or p_day not between 0 and 6 or p_slot not in ('lunch','dinner') then
    return false;
  end if;
  v_week := p_week - (extract(isodow from p_week)::int - 1);
  if p_recipe_id is null then
    delete from mealprep_plan where week_start = v_week and day = p_day and slot = p_slot;
    return true;
  end if;
  if not exists (select 1 from mealprep_recipes where id = p_recipe_id) then return false; end if;
  insert into mealprep_plan (week_start, day, slot, recipe_id, is_leftover)
  values (v_week, p_day, p_slot, p_recipe_id, coalesce(p_leftover, false))
  on conflict (week_start, day, slot) do update set
    recipe_id = excluded.recipe_id, is_leftover = excluded.is_leftover, updated_at = now();
  return true;
end $$;

-- ---------------------------------------------------------------- shopping
create or replace function mealprep_set_tick(
  p_week date, p_item_key text, p_label text, p_checked boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_week date;
begin
  if p_week is null or length(coalesce(p_item_key,'')) = 0 or length(p_item_key) > 160
     or length(coalesce(p_label,'')) > 200 then
    return false;
  end if;
  v_week := p_week - (extract(isodow from p_week)::int - 1);
  insert into mealprep_shopping (week_start, item_key, label, checked, custom)
  values (v_week, p_item_key, coalesce(p_label,''), coalesce(p_checked,false), false)
  on conflict (week_start, item_key) do update set
    checked = excluded.checked;
  return true;
end $$;

create or replace function mealprep_add_extra(p_week date, p_label text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_week date;
  v_key text;
begin
  if p_week is null or length(trim(coalesce(p_label,''))) = 0 or length(p_label) > 200 then
    return null;
  end if;
  v_week := p_week - (extract(isodow from p_week)::int - 1);
  v_key := 'x-' || substr(gen_random_uuid()::text, 1, 8);
  insert into mealprep_shopping (week_start, item_key, label, checked, custom)
  values (v_week, v_key, trim(p_label), false, true);
  return v_key;
end $$;

create or replace function mealprep_remove_extra(p_week date, p_item_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_week date;
begin
  if p_week is null then return false; end if;
  v_week := p_week - (extract(isodow from p_week)::int - 1);
  delete from mealprep_shopping
   where week_start = v_week and item_key = p_item_key and custom = true;
  return found;
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

create or replace function mealprep_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  insert into mealprep_push_subs (endpoint, p256dh, auth, device_token_hash, enabled)
  values (p_endpoint, p_p256dh, p_auth, _mealprep_hash_token(p_token), true)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash, enabled = true;
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
revoke all on function mealprep_upsert_recipe(text,text,text,text,int,jsonb,text) from public, anon;
revoke all on function mealprep_delete_recipe(text,text) from public, anon;
revoke all on function mealprep_set_slot(date,int,text,text,boolean) from public, anon;
revoke all on function mealprep_set_tick(date,text,text,boolean) from public, anon;
revoke all on function mealprep_add_extra(date,text) from public, anon;
revoke all on function mealprep_remove_extra(date,text) from public, anon;
revoke all on function mealprep_push_register(text,text,text,text) from public, anon;
revoke all on function mealprep_push_set_enabled(text,boolean) from public, anon;
revoke all on function mealprep_push_status(text) from public, anon;
revoke all on function get_mealprep_vapid_private_key() from public, anon, authenticated;

grant execute on function mealprep_admin_check(text) to anon;
grant execute on function mealprep_upsert_recipe(text,text,text,text,int,jsonb,text) to anon;
grant execute on function mealprep_delete_recipe(text,text) to anon;
grant execute on function mealprep_set_slot(date,int,text,text,boolean) to anon;
grant execute on function mealprep_set_tick(date,text,text,boolean) to anon;
grant execute on function mealprep_add_extra(date,text) to anon;
grant execute on function mealprep_remove_extra(date,text) to anon;
grant execute on function mealprep_push_register(text,text,text,text) to anon;
grant execute on function mealprep_push_set_enabled(text,boolean) to anon;
grant execute on function mealprep_push_status(text) to anon;
grant execute on function get_mealprep_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- cron
-- Sunday 06:25 UTC = 08:25 SAST: prep-day nudge for the week starting Monday.
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
