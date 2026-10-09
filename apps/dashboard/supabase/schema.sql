-- Hub (dashboard): the 07:00 morning summary (copy of record — applied as
-- migration dashboard_morning_digest).
--
--   dashboard_push_subs   one Web Push subscription per device (RPC writes only)
--
-- Edge function (see ./functions/):
--   send-morning-digest   daily 05:00 UTC (07:00 SAST): today's fixtures and
--                         releases, this device's Glovebox renewals, and any
--                         feed that has stopped syncing -> one push, or none
--
-- Anyone who opens the public hub can subscribe, so the summary carries only
-- world data plus rows the subscribing device already owns. The Glovebox link
-- is that: the hub shares an origin with Glovebox, reads its device token from
-- localStorage and passes it here, where only its hash is kept — the same
-- hash glovebox_vehicles.device_token_hash holds, so the sender can find that
-- device's own cars and people and nobody else's.

create or replace function _dashboard_hash_token(p_token text)
returns text language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

create table dashboard_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_token_hash text not null unique,
  -- Hash of this device's glovebox:device-token, when it has one.
  glovebox_token_hash text,
  created_at timestamptz not null default now(),
  -- The SAST day last sent to, so a retried or doubled cron run cannot push
  -- the same morning twice.
  last_sent_on date
);

alter table dashboard_push_subs enable row level security;
-- No policies: written only by the definer RPCs below, read only by the
-- service role in the edge function.

-- One row per device, collapsed on the device token — the rule that stopped
-- duplicate notifications ecosystem-wide (see CLAUDE.md). A rotated endpoint
-- replaces the old row rather than sitting next to it.
create or replace function dashboard_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text, p_glovebox_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if length(coalesce(p_token, '')) < 8 or length(coalesce(p_endpoint, '')) < 8 then
    return false;
  end if;
  v_hash := _dashboard_hash_token(p_token);

  delete from dashboard_push_subs where endpoint = p_endpoint and device_token_hash <> v_hash;

  insert into dashboard_push_subs (endpoint, p256dh, auth, device_token_hash, glovebox_token_hash)
  values (p_endpoint, p_p256dh, p_auth, v_hash,
          case when length(coalesce(p_glovebox_token, '')) >= 8
               then _dashboard_hash_token(p_glovebox_token) end)
  on conflict (device_token_hash) do update set
    endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
    glovebox_token_hash = excluded.glovebox_token_hash;
  return true;
end $$;

create or replace function dashboard_push_unregister(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from dashboard_push_subs where device_token_hash = _dashboard_hash_token(p_token);
  return found;
end $$;

create or replace function dashboard_push_status(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dashboard_push_subs
                  where device_token_hash = _dashboard_hash_token(p_token))
$$;

revoke all on function dashboard_push_register(text, text, text, text, text) from public;
revoke all on function dashboard_push_unregister(text) from public;
revoke all on function dashboard_push_status(text) from public;
grant execute on function dashboard_push_register(text, text, text, text, text) to anon, authenticated;
grant execute on function dashboard_push_unregister(text) to anon, authenticated;
grant execute on function dashboard_push_status(text) to anon, authenticated;

-- The hub's own VAPID keypair (never another app's). The private key lives in
-- Vault; set once, outside migrations, with:
--   select vault.create_secret('<key>', 'dashboard_vapid_private_key', 'Hub VAPID');
create or replace function get_dashboard_vapid_private_key()
returns text language sql stable security definer set search_path = '' as
$$ select decrypted_secret from vault.decrypted_secrets
    where name = 'dashboard_vapid_private_key' limit 1 $$;
revoke all on function get_dashboard_vapid_private_key() from public, anon, authenticated;
grant execute on function get_dashboard_vapid_private_key() to service_role;

-- ---------------------------------------------------------------- cron
-- Not applied by running this file (see CLAUDE.md) — scheduled once, by hand.
-- select cron.schedule(
--   'dashboard-morning-digest',
--   '0 5 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/send-morning-digest',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
