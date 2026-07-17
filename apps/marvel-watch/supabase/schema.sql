-- Marvel Watch: full server-side schema (copy of record — already applied
-- to the shared Supabase project).
--
--   marvel_titles          movies + shows, TMDB-synced or admin-managed
--   marvel_settings        admin password (RLS, no policies)
--   marvel_push_subs       Web Push subscriptions (writes via RPCs only)
--   marvel_push_reminders  stackable per-device leads (1w / 3d / 1d)
--
-- Edge functions (see ./functions/):
--   sync-marvel            daily: TMDB -> marvel_titles (needs Vault key
--                          'tmdb_api_key'; skips gracefully without it)
--   send-marvel-reminders  daily 07:10 UTC (09:10 SAST): due reminders +
--                          newly-announced pushes to every device

create table marvel_titles (
  id text primary key,                       -- tmdb-m-<id> | tmdb-s-<id> | mv-<rand>
  media_type text not null check (media_type in ('movie','show')),
  title text not null,
  release_date date,                         -- null = TBA
  date_tbc boolean not null default false,
  universe text not null default 'mcu' check (universe in ('mcu','sony','other')),
  overview text,
  poster_url text,
  backdrop_url text,
  watch_on text,
  is_special boolean not null default false,
  tmdb_id bigint,
  manual boolean not null default false,     -- admin-owned: sync won't overwrite
  announced_pushed boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index marvel_titles_tmdb_idx
  on marvel_titles (media_type, tmdb_id) where tmdb_id is not null;

alter table marvel_titles enable row level security;
create policy "public read" on marvel_titles for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- admin
create table marvel_settings (
  key text primary key,
  value text not null
);
alter table marvel_settings enable row level security;
-- no policies: definer functions only

-- >>> set the real password when applying; never commit it <<<
insert into marvel_settings (key, value) values ('admin_password', 'CHANGE-ME');

create or replace function _marvel_hash_token(p_token text)
returns text language sql immutable as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

create or replace function _marvel_admin_ok(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from marvel_settings
                  where key = 'admin_password' and value = p_password) $$;

create or replace function marvel_admin_check(p_password text)
returns boolean language sql stable security definer set search_path = public as
$$ select _marvel_admin_ok(p_password) $$;

create or replace function marvel_admin_upsert_title(
  p_id text, p_media_type text, p_title text, p_date date, p_tbc boolean,
  p_universe text, p_overview text, p_poster_url text, p_watch_on text,
  p_special boolean, p_password text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not _marvel_admin_ok(p_password) then return null; end if;
  if length(trim(coalesce(p_title,''))) = 0 then return null; end if;
  v_id := coalesce(p_id, 'mv-' || substr(gen_random_uuid()::text, 1, 8));
  insert into marvel_titles (id, media_type, title, release_date, date_tbc,
    universe, overview, poster_url, watch_on, is_special, manual, announced_pushed)
  values (v_id, p_media_type, trim(p_title), p_date, coalesce(p_tbc, false),
    coalesce(p_universe,'mcu'), nullif(trim(coalesce(p_overview,'')),''),
    nullif(trim(coalesce(p_poster_url,'')),''), nullif(trim(coalesce(p_watch_on,'')),''),
    coalesce(p_special,false), true, true)
  on conflict (id) do update set
    media_type = excluded.media_type, title = excluded.title,
    release_date = excluded.release_date, date_tbc = excluded.date_tbc,
    universe = excluded.universe, overview = excluded.overview,
    poster_url = excluded.poster_url, watch_on = excluded.watch_on,
    is_special = excluded.is_special, manual = true, updated_at = now();
  return v_id;
end $$;

create or replace function marvel_admin_delete_title(p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _marvel_admin_ok(p_password) then return false; end if;
  delete from marvel_titles where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------- push
create table marvel_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text,
  created_at timestamptz default now()
);

-- One row per (device, title, lead) — reminders are stackable.
create table marvel_push_reminders (
  id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references marvel_push_subs(id) on delete cascade,
  title_id text not null references marvel_titles(id) on delete cascade,
  title_label text not null,
  release_date date not null,
  lead_days int not null check (lead_days in (1, 3, 7)),
  notified boolean not null default false,
  unique (sub_id, title_id, lead_days)
);

alter table marvel_push_subs enable row level security;
alter table marvel_push_reminders enable row level security;
-- NO open policies: token-checked definer RPCs only.

create or replace function marvel_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_token,'')) < 8 or length(coalesce(p_endpoint,'')) < 8 then
    return false;
  end if;
  insert into marvel_push_subs (endpoint, p256dh, auth, device_token_hash)
  values (p_endpoint, p_p256dh, p_auth, _marvel_hash_token(p_token))
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    device_token_hash = excluded.device_token_hash;
  return true;
end $$;

-- Replace this device's reminder set for a title with exactly p_leads.
create or replace function marvel_set_reminders(
  p_token text, p_title_id text, p_label text, p_date date, p_leads int[])
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_sub uuid;
  v_lead int;
begin
  select id into v_sub from marvel_push_subs
   where device_token_hash = _marvel_hash_token(p_token);
  if v_sub is null then return false; end if;

  delete from marvel_push_reminders
   where sub_id = v_sub and title_id = p_title_id
     and (p_leads is null or not (lead_days = any (p_leads)));

  if p_leads is not null then
    foreach v_lead in array p_leads loop
      insert into marvel_push_reminders (sub_id, title_id, title_label, release_date, lead_days, notified)
      values (v_sub, p_title_id, p_label, p_date, v_lead, false)
      on conflict (sub_id, title_id, lead_days) do update set
        title_label = excluded.title_label,
        release_date = excluded.release_date,
        notified = case when marvel_push_reminders.release_date is distinct from excluded.release_date
                        then false else marvel_push_reminders.notified end;
    end loop;
  end if;
  return true;
end $$;

create or replace function marvel_list_reminders(p_token text)
returns table (title_id text, lead_days int)
language sql stable security definer set search_path = public as $$
  select r.title_id, r.lead_days
    from marvel_push_reminders r
    join marvel_push_subs s on s.id = r.sub_id
   where s.device_token_hash = _marvel_hash_token(p_token)
$$;

-- ---------------------------------------------------------------- vault
-- The TMDB API key lives in Vault; service role only. Create/rotate with:
--   select vault.create_secret('<key>', 'tmdb_api_key', 'TMDB API key');
create or replace function get_tmdb_api_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'tmdb_api_key' $$;

-- ---------------------------------------------------------------- grants
revoke all on function _marvel_hash_token(text) from public, anon;
revoke all on function _marvel_admin_ok(text) from public, anon;
revoke all on function marvel_admin_check(text) from public, anon;
revoke all on function marvel_admin_upsert_title(text,text,text,date,boolean,text,text,text,text,boolean,text) from public, anon;
revoke all on function marvel_admin_delete_title(text,text) from public, anon;
revoke all on function marvel_push_register(text,text,text,text) from public, anon;
revoke all on function marvel_set_reminders(text,text,text,date,int[]) from public, anon;
revoke all on function marvel_list_reminders(text) from public, anon;
revoke all on function get_tmdb_api_key() from public, anon, authenticated;

grant execute on function marvel_admin_check(text) to anon;
grant execute on function marvel_admin_upsert_title(text,text,text,date,boolean,text,text,text,text,boolean,text) to anon;
grant execute on function marvel_admin_delete_title(text,text) to anon;
grant execute on function marvel_push_register(text,text,text,text) to anon;
grant execute on function marvel_set_reminders(text,text,text,date,int[]) to anon;
grant execute on function marvel_list_reminders(text) to anon;
grant execute on function get_tmdb_api_key() to service_role;

-- ---------------------------------------------------------------- crons
select cron.schedule(
  'marvel-tmdb-sync',
  '20 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-marvel',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

select cron.schedule(
  'marvel-push-reminders',
  '10 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/send-marvel-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
