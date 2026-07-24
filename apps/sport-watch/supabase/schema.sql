-- SA Sport Watch: full server-side schema (copy of record — already applied
-- to the shared Supabase project).
--
--   sport_categories       dynamic sport categories (admin-manageable)
--   sport_events           events live here, not in the app bundle
--   sport_settings         admin password (RLS, no policies)
--   sport_push_subs        Web Push subscriptions (writes via RPCs only)
--   sport_push_reminders   per-device reminders with per-reminder lead time
--
-- Edge functions (see ./functions/):
--   sync-f1                daily: Jolpica calendar + results -> sport_events
--   send-sport-reminders   every 15 min: due reminders -> Web Push
--   sport-calendar         subscribable ICS feed of all events

-- ---------------------------------------------------------------- categories
create table sport_categories (
  key text primary key,
  label text not null,
  icon text not null,
  color text not null,
  bg text not null,
  live_minutes int not null default 120,
  sort_order int not null default 0
);

insert into sport_categories (key, label, icon, color, bg, live_minutes, sort_order) values
  ('rugby',    'Rugby',    '🏉',  '#3AA864', '#061B0E', 120, 1),
  ('mma',      'MMA',      '🥋',  '#D44040', '#1C0606', 300, 2),
  ('f1',       'F1',       '🏎️', '#E0762F', '#1C0F06', 120, 3),
  ('boxing',   'Boxing',   '🥊',  '#C9A227', '#1B1504', 300, 4),
  ('football', 'Football', '⚽',  '#4A9ED4', '#06131C', 120, 5);

alter table sport_categories enable row level security;
create policy "public read" on sport_categories for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- events
create table sport_events (
  id text primary key,
  sport text not null references sport_categories(key),
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

create or replace function sport_admin_upsert_category(
  p_key text, p_label text, p_icon text, p_color text, p_bg text,
  p_live_minutes int, p_sort int, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _sport_admin_ok(p_password) then return false; end if;
  if length(trim(coalesce(p_key,''))) = 0 or length(trim(coalesce(p_label,''))) = 0 then
    return false;
  end if;
  insert into sport_categories (key, label, icon, color, bg, live_minutes, sort_order)
  values (lower(trim(p_key)), trim(p_label), coalesce(p_icon,'🏅'),
          coalesce(p_color,'#3AA864'), coalesce(p_bg,'#0B130B'),
          greatest(coalesce(p_live_minutes,120), 30), coalesce(p_sort, 99))
  on conflict (key) do update set
    label = excluded.label, icon = excluded.icon, color = excluded.color,
    bg = excluded.bg, live_minutes = excluded.live_minutes,
    sort_order = excluded.sort_order;
  return true;
end $$;

-- Deleting a category with events still in it fails via the FK (on purpose).
create or replace function sport_admin_delete_category(p_key text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _sport_admin_ok(p_password) then return false; end if;
  begin
    delete from sport_categories where key = p_key;
  exception when foreign_key_violation then
    return false;
  end;
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
  event_id text not null references sport_events(id) on delete cascade,
  event_date timestamptz not null,
  event_label text not null,
  lead_minutes int not null default 60,
  notified boolean default false,
  unique (sub_id, event_id)
);
create index sport_push_reminders_event_id_idx on sport_push_reminders (event_id);

-- Reminders store a denormalized event_date; when an event is rescheduled
-- (F1 sync or admin), pending reminders follow it — and re-arm if the event
-- moved into the future. Deleting an event cascades its reminders away.
create or replace function sport_reminders_follow_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_date is distinct from old.event_date and new.event_date is not null then
    update sport_push_reminders
       set event_date = new.event_date,
           notified = case when new.event_date > now() then false else notified end
     where event_id = new.id;
  end if;
  return new;
end $$;

create trigger sport_reminders_follow_event
  after update of event_date on sport_events
  for each row execute function sport_reminders_follow_event();

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
revoke all on function sport_admin_upsert_category(text,text,text,text,text,int,int,text) from public, anon;
revoke all on function sport_admin_delete_category(text,text) from public, anon;
revoke all on function push_register(text,text,text,text) from public, anon;
revoke all on function push_set_reminder(text,text,timestamptz,text,int) from public, anon;
revoke all on function push_remove_reminder(text,text) from public, anon;
revoke all on function push_list_reminders(text) from public, anon;
revoke all on function get_vapid_private_key() from public, anon, authenticated;

grant execute on function sport_admin_check(text) to anon;
grant execute on function sport_admin_upsert_event(text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,text) to anon;
grant execute on function sport_admin_delete_event(text,text) to anon;
grant execute on function sport_admin_upsert_category(text,text,text,text,text,int,int,text) to anon;
grant execute on function sport_admin_delete_category(text,text) to anon;
grant execute on function push_register(text,text,text,text) to anon;
grant execute on function push_set_reminder(text,text,timestamptz,text,int) to anon;
grant execute on function push_remove_reminder(text,text) to anon;
grant execute on function push_list_reminders(text) to anon;
grant execute on function get_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- audit
-- Every result change and every delete on sport_events is recorded with the
-- acting role — added after F1 results once vanished with no way to tell
-- what wrote the nulls.
create table sport_events_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  op text not null,
  event_id text not null,
  event_home text,
  actor text not null default current_user,
  old_result text,
  new_result text
);
alter table sport_events_audit enable row level security;
-- no policies: dashboard/service-role only

create or replace function _sport_events_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into sport_events_audit (op, event_id, event_home, old_result)
    values ('DELETE', old.id, old.home, old.result);
    return old;
  end if;
  if new.result is distinct from old.result then
    insert into sport_events_audit (op, event_id, event_home, old_result, new_result)
    values ('UPDATE', old.id, old.home, old.result, new.result);
  end if;
  return new;
end $$;

create trigger sport_events_audit_trg
  after update or delete on sport_events
  for each row execute function _sport_events_audit();

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
  '37 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-f1',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Weekly prune of reminders for fixtures that finished a couple of days ago —
-- the app already filters the bell count to upcoming-only; this keeps the
-- table from growing without bound.
select cron.schedule('sport-prune-reminders', '35 3 * * 1',
  $$ delete from sport_push_reminders where event_date < now() - interval '2 days' $$);
