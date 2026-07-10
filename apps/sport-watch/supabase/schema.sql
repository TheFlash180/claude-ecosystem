-- SA Sport Watch: full server-side schema (copy of record — already applied
-- to the shared Supabase project).
--
--   sport_events           events live here, not in the app bundle
--   sport_settings         admin password (RLS, no policies)
--   sport_push_subs        Web Push subscriptions (writes via RPCs only)
--   sport_push_reminders   per-device reminders with per-reminder lead time
--
-- Edge functions (see ./functions/):
--   sync-f1                daily: Jolpica calendar + results -> sport_events
--   send-sport-reminders   every 15 min: due reminders -> Web Push
--   sport-calendar         subscribable ICS feed of all events

-- ---------------------------------------------------------------- events
create table sport_events (
  id text primary key,
  sport text not null check (sport in ('rugby','mma','f1')),
  competition text not null,
  home text not null,
  away text,
  home_flag text not null default '',
  away_flag text,
  event_date timestamptz,
  venue text,
  result text,
  note text,
  channel text,
  watch_url text,
  is_special boolean not null default false,
  is_conditional boolean not null default false,
  date_tbc boolean not null default false,
  f1_season int,
  f1_round int,
  f1_session text check (f1_session in ('race','qualifying','sprint')),
  updated_at timestamptz not null default now()
);
create unique index sport_events_f1_idx
  on sport_events (f1_season, f1_round, f1_session) where f1_season is not null;

alter table sport_events enable row level security;
create policy "public read" on sport_events for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- admin
create table sport_settings (
  key text primary key,
  value text not null
);
alter table sport_settings enable row level security;
-- no policies: only definer functions read it

-- >>> set the real password when applying; never commit it <<<
insert into sport_settings (key, value) values ('admin_password', 'CHANGE-ME');

create or replace function _sport_hash_token(p_token text)
returns text language sql immutable as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

create or replace function _sport_admin_ok(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from sport_settings
                  where key = 'admin_password' and value = p_password) $$;

create or replace function sport_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select _sport_admin_ok(p_password) $$;

create or replace function sport_admin_upsert_event(
  p_id text, p_sport text, p_competition text, p_home text, p_away text,
  p_home_flag text, p_away_flag text, p_date timestamptz, p_venue text,
  p_result text, p_note text, p_channel text, p_watch_url text,
  p_special boolean, p_password text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not _sport_admin_ok(p_password) then return null; end if;
  if length(trim(p_home)) = 0 then return null; end if;
  v_id := coalesce(p_id, 'ev-' || substr(gen_random_uuid()::text, 1, 8));
  insert into sport_events (id, sport, competition, home, away, home_flag,
    away_flag, event_date, venue, result, note, channel, watch_url, is_special)
  values (v_id, p_sport, coalesce(p_competition,''), trim(p_home), nullif(trim(coalesce(p_away,'')),''),
    coalesce(p_home_flag,''), nullif(trim(coalesce(p_away_flag,'')),''), p_date, p_venue,
    nullif(trim(coalesce(p_result,'')),''), nullif(trim(coalesce(p_note,'')),''),
    nullif(trim(coalesce(p_channel,'')),''), nullif(trim(coalesce(p_watch_url,'')),''),
    coalesce(p_special, false))
  on conflict (id) do update set
    sport = excluded.sport, competition = excluded.competition,
    home = excluded.home, away = excluded.away,
    home_flag = excluded.home_flag, away_flag = excluded.away_flag,
    event_date = excluded.event_date, venue = excluded.venue,
    result = excluded.result, note = excluded.note,
    channel = excluded.channel, watch_url = excluded.watch_url,
    is_special = excluded.is_special, updated_at = now();
  return v_id;
end $$;

create or replace function sport_admin_delete_event(p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _sport_admin_ok(p_password) then return false; end if;
  delete from sport_events where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------- push
create table sport_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text,
  created_at timestamptz default now()
);

create table sport_push_reminders (
  id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references sport_push_subs(id) on delete cascade,
  event_id text not null,
  event_date timestamptz not null,
  event_label text not null,
  lead_minutes int not null default 60,
  notified boolean default false,
  unique (sub_id, event_id)
);

alter table sport_push_subs enable row level security;
alter table sport_push_reminders enable row level security;
-- NO open policies: every write goes through the token-checked definer RPCs
-- below (a device can only touch reminders tied to its own random token),
-- and only the service role (edge function) can read subscriptions.

create or replace function push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  insert into sport_push_subs (endpoint, p256dh, auth, device_token_hash)
  values (p_endpoint, p_p256dh, p_auth, _sport_hash_token(p_token))
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash;
  return true;
end $$;

create or replace function push_set_reminder(
  p_token text, p_event_id text, p_event_date timestamptz,
  p_event_label text, p_lead_minutes int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_sub uuid;
begin
  select id into v_sub from sport_push_subs
   where device_token_hash = _sport_hash_token(p_token);
  if v_sub is null then return false; end if;
  insert into sport_push_reminders (sub_id, event_id, event_date, event_label, lead_minutes, notified)
  values (v_sub, p_event_id, p_event_date, p_event_label,
          greatest(coalesce(p_lead_minutes, 60), 5), false)
  on conflict (sub_id, event_id) do update set
    event_date = excluded.event_date, event_label = excluded.event_label,
    lead_minutes = excluded.lead_minutes,
    -- date or lead changed => allow it to fire again for the new time
    notified = case when sport_push_reminders.event_date is distinct from excluded.event_date
                      or sport_push_reminders.lead_minutes is distinct from excluded.lead_minutes
                    then false else sport_push_reminders.notified end;
  return true;
end $$;

create or replace function push_remove_reminder(p_token text, p_event_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare deleted int;
begin
  delete from sport_push_reminders r
   using sport_push_subs s
   where r.sub_id = s.id
     and s.device_token_hash = _sport_hash_token(p_token)
     and r.event_id = p_event_id;
  get diagnostics deleted = row_count;
  return deleted > 0;
end $$;

create or replace function push_list_reminders(p_token text)
returns table (event_id text, lead_minutes int)
language sql stable security definer set search_path = public as $$
  select r.event_id, r.lead_minutes
    from sport_push_reminders r
    join sport_push_subs s on s.id = r.sub_id
   where s.device_token_hash = _sport_hash_token(p_token)
$$;

-- ---------------------------------------------------------------- vault
-- The VAPID private key lives in Supabase Vault (encrypted at rest); only
-- the service role can read it back. Rotate with vault.update_secret.
create or replace function get_vapid_private_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' $$;

-- ---------------------------------------------------------------- grants
revoke all on function _sport_hash_token(text) from public, anon;
revoke all on function _sport_admin_ok(text) from public, anon;
revoke all on function sport_admin_check(text) from public, anon;
revoke all on function sport_admin_upsert_event(text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,text) from public, anon;
revoke all on function sport_admin_delete_event(text,text) from public, anon;
revoke all on function push_register(text,text,text,text) from public, anon;
revoke all on function push_set_reminder(text,text,timestamptz,text,int) from public, anon;
revoke all on function push_remove_reminder(text,text) from public, anon;
revoke all on function push_list_reminders(text) from public, anon;
revoke all on function get_vapid_private_key() from public, anon, authenticated;

grant execute on function sport_admin_check(text) to anon;
grant execute on function sport_admin_upsert_event(text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,text) to anon;
grant execute on function sport_admin_delete_event(text,text) to anon;
grant execute on function push_register(text,text,text,text) to anon;
grant execute on function push_set_reminder(text,text,timestamptz,text,int) to anon;
grant execute on function push_remove_reminder(text,text) to anon;
grant execute on function push_list_reminders(text) to anon;
grant execute on function get_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- cron
-- (extensions pg_cron and pg_net must be enabled)
select cron.schedule(
  'sport-push-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/send-sport-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

select cron.schedule(
  'sport-f1-sync',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-f1',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
