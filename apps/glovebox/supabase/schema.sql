-- Glovebox: full server-side schema (copy of record — applied to the shared
-- Supabase project as migration glovebox_initial).
--
--   glovebox_vehicles    one row per car: disc expiry + service interval
--   glovebox_people      one row per licence holder
--   glovebox_push_subs   Web Push subscriptions (writes via RPCs only)
--
-- Edge function (see ./functions/):
--   send-glovebox-reminders  daily 05:30 UTC (07:30 SAST): due renewals -> push
--
-- Identity is the same hashed random device token the other apps use. Every
-- table also carries a nullable user_id, unused today: when the ecosystem moves
-- to Supabase Auth this becomes a backfill rather than a schema rewrite.

-- search_path is pinned empty: sha256, convert_to and encode all live in
-- pg_catalog, which is always implicitly searched, so nothing here can be
-- shadowed by a schema on a caller's path.
create or replace function _glovebox_hash_token(p_token text)
returns text language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

create table glovebox_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                              -- reserved for accounts
  device_token_hash text not null,
  name text not null,
  make_model text,
  reg text,
  disc_expiry date,
  service_interval_km int,
  service_interval_months int,
  last_service_date date,
  last_service_km int,
  odometer int,
  odometer_at date,
  -- Projected client-side by projectServiceDue() and stored, so the push
  -- sender never re-derives it. Given fixed inputs the projection is a fixed
  -- date, so it only needs recomputing when the inputs change.
  service_due date,
  disc_leads int[] not null default '{30,14,7}',
  service_leads int[] not null default '{30,14}',
  -- Sent reminders, keyed "<kind>:<due date>:<lead>". Embedding the date makes
  -- the key self-invalidating: renewing pushes out a new date, which yields
  -- new keys, which re-arms the reminders without any explicit reset.
  notified text[] not null default '{}',
  created_at timestamptz default now()
);
create index glovebox_vehicles_device_idx on glovebox_vehicles (device_token_hash);

create table glovebox_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  device_token_hash text not null,
  name text not null,
  licence_expiry date,
  licence_leads int[] not null default '{90,60,30}',
  notified text[] not null default '{}',
  created_at timestamptz default now()
);
create index glovebox_people_device_idx on glovebox_people (device_token_hash);

create table glovebox_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text not null,
  created_at timestamptz default now()
);

alter table glovebox_vehicles enable row level security;
alter table glovebox_people enable row level security;
alter table glovebox_push_subs enable row level security;
-- NO open policies: every read and write goes through the token-checked
-- definer RPCs below, and only the service role (edge function) sees
-- subscriptions.

-- A browser mints a fresh endpoint whenever it rotates a push subscription, and
-- this table is unique on endpoint — so without the cleanup below one device
-- accumulates a row per rotation, which is what split Marvel Watch's reminders
-- across several sub_ids. Keep exactly one row per device from the start.
create or replace function glovebox_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_sub uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  v_hash := _glovebox_hash_token(p_token);

  insert into glovebox_push_subs (endpoint, p256dh, auth, device_token_hash)
  values (p_endpoint, p_p256dh, p_auth, v_hash)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash
  returning id into v_sub;

  delete from glovebox_push_subs
   where device_token_hash = v_hash and id <> v_sub;

  return true;
end $$;

create or replace function glovebox_list_vehicles(p_token text)
returns setof glovebox_vehicles
language sql stable security definer set search_path = public as $$
  select * from glovebox_vehicles
   where device_token_hash = _glovebox_hash_token(p_token)
   order by created_at
$$;

create or replace function glovebox_list_people(p_token text)
returns setof glovebox_people
language sql stable security definer set search_path = public as $$
  select * from glovebox_people
   where device_token_hash = _glovebox_hash_token(p_token)
   order by created_at
$$;

-- Insert when p_id is null, update otherwise. The update is scoped by device
-- token as well as id, so a guessed uuid cannot touch another device's row.
create or replace function glovebox_save_vehicle(
  p_token text, p_id uuid, p_name text, p_make_model text, p_reg text,
  p_disc_expiry date, p_interval_km int, p_interval_months int,
  p_last_service_date date, p_last_service_km int,
  p_odometer int, p_odometer_at date, p_service_due date,
  p_disc_leads int[], p_service_leads int[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hash text := _glovebox_hash_token(p_token);
  v_id uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(trim(coalesce(p_name,''))) = 0 then
    return null;
  end if;

  if p_id is null then
    insert into glovebox_vehicles (
      device_token_hash, name, make_model, reg, disc_expiry,
      service_interval_km, service_interval_months, last_service_date,
      last_service_km, odometer, odometer_at, service_due,
      disc_leads, service_leads)
    values (
      v_hash, trim(p_name), nullif(trim(coalesce(p_make_model,'')),''),
      nullif(trim(coalesce(p_reg,'')),''), p_disc_expiry,
      p_interval_km, p_interval_months, p_last_service_date,
      p_last_service_km, p_odometer, p_odometer_at, p_service_due,
      coalesce(p_disc_leads, '{30,14,7}'), coalesce(p_service_leads, '{30,14}'))
    returning id into v_id;
    return v_id;
  end if;

  update glovebox_vehicles set
    name = trim(p_name),
    make_model = nullif(trim(coalesce(p_make_model,'')),''),
    reg = nullif(trim(coalesce(p_reg,'')),''),
    disc_expiry = p_disc_expiry,
    service_interval_km = p_interval_km,
    service_interval_months = p_interval_months,
    last_service_date = p_last_service_date,
    last_service_km = p_last_service_km,
    odometer = p_odometer,
    odometer_at = p_odometer_at,
    service_due = p_service_due,
    disc_leads = coalesce(p_disc_leads, disc_leads),
    service_leads = coalesce(p_service_leads, service_leads),
    -- Dropping keys whose date no longer matches re-arms a renewed item.
    notified = array(
      select k from unnest(notified) k
       where (split_part(k, ':', 1) = 'disc'    and split_part(k, ':', 2) = p_disc_expiry::text)
          or (split_part(k, ':', 1) = 'service' and split_part(k, ':', 2) = p_service_due::text))
   where id = p_id and device_token_hash = v_hash
   returning id into v_id;
  return v_id;
end $$;

create or replace function glovebox_save_person(
  p_token text, p_id uuid, p_name text, p_licence_expiry date, p_leads int[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hash text := _glovebox_hash_token(p_token);
  v_id uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(trim(coalesce(p_name,''))) = 0 then
    return null;
  end if;

  if p_id is null then
    insert into glovebox_people (device_token_hash, name, licence_expiry, licence_leads)
    values (v_hash, trim(p_name), p_licence_expiry, coalesce(p_leads, '{90,60,30}'))
    returning id into v_id;
    return v_id;
  end if;

  update glovebox_people set
    name = trim(p_name),
    licence_expiry = p_licence_expiry,
    licence_leads = coalesce(p_leads, licence_leads),
    notified = array(
      select k from unnest(notified) k
       where split_part(k, ':', 2) = p_licence_expiry::text)
   where id = p_id and device_token_hash = v_hash
   returning id into v_id;
  return v_id;
end $$;

create or replace function glovebox_delete_vehicle(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare deleted int;
begin
  delete from glovebox_vehicles
   where id = p_id and device_token_hash = _glovebox_hash_token(p_token);
  get diagnostics deleted = row_count;
  return deleted > 0;
end $$;

create or replace function glovebox_delete_person(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare deleted int;
begin
  delete from glovebox_people
   where id = p_id and device_token_hash = _glovebox_hash_token(p_token);
  get diagnostics deleted = row_count;
  return deleted > 0;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function glovebox_push_register(text,text,text,text) from public, anon;
revoke all on function glovebox_list_vehicles(text) from public, anon;
revoke all on function glovebox_list_people(text) from public, anon;
revoke all on function glovebox_save_vehicle(text,uuid,text,text,text,date,int,int,date,int,int,date,date,int[],int[]) from public, anon;
revoke all on function glovebox_save_person(text,uuid,text,date,int[]) from public, anon;
revoke all on function glovebox_delete_vehicle(text,uuid) from public, anon;
revoke all on function glovebox_delete_person(text,uuid) from public, anon;

grant execute on function glovebox_push_register(text,text,text,text) to anon;
grant execute on function glovebox_list_vehicles(text) to anon;
grant execute on function glovebox_list_people(text) to anon;
grant execute on function glovebox_save_vehicle(text,uuid,text,text,text,date,int,int,date,int,int,date,date,int[],int[]) to anon;
grant execute on function glovebox_save_person(text,uuid,text,date,int[]) to anon;
grant execute on function glovebox_delete_vehicle(text,uuid) to anon;
grant execute on function glovebox_delete_person(text,uuid) to anon;

-- ---------------------------------------------------------------- vault
-- The VAPID private key lives in Vault; service role only.
--   select vault.create_secret('<key>', 'glovebox_vapid_private_key', 'Glovebox VAPID');
create or replace function get_glovebox_vapid_private_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets
    where name = 'glovebox_vapid_private_key' limit 1 $$;
revoke all on function get_glovebox_vapid_private_key() from public, anon, authenticated;
grant execute on function get_glovebox_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- cron
-- Renewals are dates, so one daily pass at a civil hour is enough.
select cron.schedule(
  'glovebox-reminders',
  '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/send-glovebox-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
