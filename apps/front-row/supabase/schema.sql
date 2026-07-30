-- Front Row: full server-side schema (copy of record — applied to the shared
-- Supabase project as migration frontrow_initial).
--
--   frontrow_events   normalised listings from every ticket source
--   frontrow_watches  what this device wants to hear about (geo / keyword)
--   frontrow_sources  per-source health, so a broken adapter is visible
--   frontrow_push_subs / frontrow_notified
--
-- Edge functions (see ./functions/):
--   sync-frontrow     daily: ticket sources -> frontrow_events
--   notify-frontrow   daily: newly listed events matching a watch -> push
--
-- Identity is the hashed random device token the other apps use; every table
-- also carries a nullable user_id for the eventual move to Supabase Auth.

create or replace function _frontrow_hash_token(p_token text)
returns text language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

-- ---------------------------------------------------------------- events
-- Shared world data: the same listings serve every device, exactly like
-- sport_events and marvel_titles. Only watches are per-device.
create table frontrow_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,                       -- 'quicket' | 'ticketmaster' | …
  external_id text not null,
  name text not null,
  url text,
  image_url text,
  summary text,                               -- plain text, truncated
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  lat double precision,
  lng double precision,
  locality text,                              -- "Gauteng · Fourways"
  categories text[] not null default '{}',
  organiser text,
  price_from numeric,
  -- When the source first listed it. This, not starts_at, is the "tickets are
  -- on sale" signal — the thing you can actually act on.
  listed_at timestamptz,
  -- Identity across sources: the same show on Quicket and Computicket must
  -- not alert twice. Name + venue + day, normalised.
  dedupe_key text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, external_id)
);
create index frontrow_events_starts_idx on frontrow_events (starts_at);
create index frontrow_events_listed_idx on frontrow_events (listed_at);
create index frontrow_events_dedupe_idx on frontrow_events (dedupe_key);

-- ---------------------------------------------------------------- watches
create table frontrow_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                               -- reserved for accounts
  device_token_hash text not null,
  label text not null,
  kind text not null check (kind in ('geo','keyword')),
  -- geo
  lat double precision,
  lng double precision,
  radius_km numeric,
  -- keyword
  term text,
  enabled boolean not null default true,
  created_at timestamptz default now()
);
create index frontrow_watches_device_idx on frontrow_watches (device_token_hash);

-- One row per (watch, event) already pushed, so re-running the notifier is
-- idempotent and a new watch doesn't replay months of back catalogue.
create table frontrow_notified (
  watch_id uuid not null references frontrow_watches(id) on delete cascade,
  event_id uuid not null references frontrow_events(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (watch_id, event_id)
);

create table frontrow_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- sources
-- A discovery tool that goes quiet is worse than none, so every adapter
-- records how its last run went and the UI surfaces anything stale.
create table frontrow_sources (
  key text primary key,
  label text not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_count int
);
insert into frontrow_sources (key, label) values
  ('quicket', 'Quicket')
on conflict (key) do nothing;

alter table frontrow_events enable row level security;
alter table frontrow_watches enable row level security;
alter table frontrow_notified enable row level security;
alter table frontrow_push_subs enable row level security;
alter table frontrow_sources enable row level security;

-- Events and source health are public read: they are world data, carry nothing
-- personal, and the client needs them to render. Everything device-scoped goes
-- through the token-checked definer RPCs below.
create policy "public read" on frontrow_events for select to anon, authenticated using (true);
create policy "public read" on frontrow_sources for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- rpcs
create or replace function frontrow_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hash text; v_sub uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  v_hash := _frontrow_hash_token(p_token);

  insert into frontrow_push_subs (endpoint, p256dh, auth, device_token_hash)
  values (p_endpoint, p_p256dh, p_auth, v_hash)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash
  returning id into v_sub;

  -- One row per device from day one; see the Marvel Watch retrofit for why.
  delete from frontrow_push_subs
   where device_token_hash = v_hash and id <> v_sub;
  return true;
end $$;

create or replace function frontrow_list_watches(p_token text)
returns setof frontrow_watches
language sql stable security definer set search_path = public as $$
  select * from frontrow_watches
   where device_token_hash = _frontrow_hash_token(p_token)
   order by created_at
$$;

create or replace function frontrow_save_watch(
  p_token text, p_id uuid, p_label text, p_kind text,
  p_lat double precision, p_lng double precision, p_radius_km numeric,
  p_term text, p_enabled boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hash text := _frontrow_hash_token(p_token); v_id uuid;
begin
  if length(coalesce(p_token,'')) < 8 or length(trim(coalesce(p_label,''))) = 0 then
    return null;
  end if;
  if p_kind not in ('geo','keyword') then return null; end if;

  if p_id is null then
    insert into frontrow_watches (device_token_hash, label, kind, lat, lng, radius_km, term, enabled)
    values (v_hash, trim(p_label), p_kind, p_lat, p_lng, p_radius_km,
            nullif(trim(coalesce(p_term,'')),''), coalesce(p_enabled, true))
    returning id into v_id;
    return v_id;
  end if;

  update frontrow_watches set
    label = trim(p_label), kind = p_kind,
    lat = p_lat, lng = p_lng, radius_km = p_radius_km,
    term = nullif(trim(coalesce(p_term,'')),''),
    enabled = coalesce(p_enabled, enabled)
   where id = p_id and device_token_hash = v_hash
   returning id into v_id;
  return v_id;
end $$;

create or replace function frontrow_delete_watch(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare deleted int;
begin
  delete from frontrow_watches
   where id = p_id and device_token_hash = _frontrow_hash_token(p_token);
  get diagnostics deleted = row_count;
  return deleted > 0;
end $$;

-- Seed a device's first watch so a fresh install is useful immediately rather
-- than an empty screen: Montecasino, 15km.
create or replace function frontrow_seed_default_watch(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hash text := _frontrow_hash_token(p_token); v_id uuid;
begin
  if length(coalesce(p_token,'')) < 8 then return null; end if;
  select id into v_id from frontrow_watches where device_token_hash = v_hash limit 1;
  if v_id is not null then return v_id; end if;

  insert into frontrow_watches (device_token_hash, label, kind, lat, lng, radius_km)
  values (v_hash, 'Montecasino', 'geo', -26.0256, 27.9989, 15)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function frontrow_push_register(text,text,text,text) from public, anon;
revoke all on function frontrow_list_watches(text) from public, anon;
revoke all on function frontrow_save_watch(text,uuid,text,text,double precision,double precision,numeric,text,boolean) from public, anon;
revoke all on function frontrow_delete_watch(text,uuid) from public, anon;
revoke all on function frontrow_seed_default_watch(text) from public, anon;

grant execute on function frontrow_push_register(text,text,text,text) to anon;
grant execute on function frontrow_list_watches(text) to anon;
grant execute on function frontrow_save_watch(text,uuid,text,text,double precision,double precision,numeric,text,boolean) to anon;
grant execute on function frontrow_delete_watch(text,uuid) to anon;
grant execute on function frontrow_seed_default_watch(text) to anon;

-- ---------------------------------------------------------------- vault
--   select vault.create_secret('<key>', 'quicket_api_key', 'Quicket API key');
create or replace function get_quicket_api_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets
    where name = 'quicket_api_key' limit 1 $$;
revoke all on function get_quicket_api_key() from public, anon, authenticated;
grant execute on function get_quicket_api_key() to service_role;

-- ---------------------------------------------------------------- crons
select cron.schedule('frontrow-sync', '15 4 * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-frontrow',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);

select cron.schedule('frontrow-notify', '45 4 * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/notify-frontrow',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);
