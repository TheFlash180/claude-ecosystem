-- SA Sport Watch: Web Push server-side schema (copy of record — already
-- applied to the shared Supabase project). The client (src/App.tsx) upserts
-- subscriptions and reminders; the send-sport-reminders edge function
-- (functions/send-sport-reminders/index.ts) fires the pushes.

create table if not exists sport_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create table if not exists sport_push_reminders (
  id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references sport_push_subs(id) on delete cascade,
  event_id int not null,
  event_date timestamptz not null,
  event_label text not null,
  notified boolean default false,
  unique (sub_id, event_id)
);

alter table sport_push_subs enable row level security;
alter table sport_push_reminders enable row level security;

-- KNOWN TRADE-OFF: these policies let anyone holding the anon key (public by
-- design) read every subscription endpoint and add/remove any reminder. Fine
-- for a household toy app; if this ever grows an audience, move writes behind
-- token-checked security-definer RPCs like baby-registry-pwa does.
create policy "anon_insert_subs" on sport_push_subs for insert to anon with check (true);
create policy "anon_select_subs" on sport_push_subs for select to anon using (true);
create policy "anon_delete_subs" on sport_push_subs for delete to anon using (true);
create policy "anon_all_reminders" on sport_push_reminders for all to anon using (true) with check (true);

-- pg_cron: call the edge function every 15 minutes (extensions pg_cron and
-- pg_net must be enabled). Reminders fire ~1h before kick-off.
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
