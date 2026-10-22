-- Price Watch — copy of record. Applied to the shared ecosystem project as
-- migrations; editing this file does not change the running database.
--
-- Shape:
--   pricewatch_products  the catalogue, shared world data (public read)
--   pricewatch_prices    sparse time series, one row per CHANGE (public read)
--   pricewatch_tracks    which products this device follows (token-scoped)
--   pricewatch_notified  what has already been pushed (token-scoped)
--   pricewatch_push_subs one row per device
--   pricewatch_sources   adapter health, so a dead scraper is visible
--
-- Products and prices are deliberately NOT device-scoped. Two devices tracking
-- the same SSD share one price history, which is both cheaper to collect and
-- more useful: the history predates either of them starting to watch.

-- ---------------------------------------------------------------- products
create table pricewatch_products (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  external_id text not null,
  title text not null,
  brand text,
  image_url text,
  url text,
  last_checked_at timestamptz,
  -- Set when the retailer stops returning it. Kept rather than deleted so the
  -- price history survives and the user is told the product went away, which
  -- is itself information.
  delisted_at timestamptz,
  -- Takealot returns two shapes. A "single" product has one real price; a
  -- variant parent (buybox_items_type = "summary", "From R 343") reports only
  -- the cheapest variant. Tracking the parent is still useful, but the number
  -- means "cheapest option", and the card has to say so — otherwise someone
  -- watching a 4TB drive gets told the 1TB went on sale.
  has_variants boolean not null default false,
  created_at timestamptz not null default now(),
  unique (retailer, external_id)
);

-- ---------------------------------------------------------------- prices
-- A row exists only where something changed, so this is a step function and
-- must never be interpolated. Daily rows for an unchanged price would be
-- mostly noise and would bury the moments that matter.
create table pricewatch_prices (
  id bigserial primary key,
  product_id uuid not null references pricewatch_products(id) on delete cascade,
  captured_at timestamptz not null default now(),
  price numeric(10,2) not null,
  -- The retailer's claimed "was" price. Recorded so the app can call out a
  -- permanent discount, not because it is believed.
  listing_price numeric(10,2),
  in_stock boolean not null default true,
  stock_status text
);
create index pricewatch_prices_product_idx on pricewatch_prices (product_id, captured_at desc);

-- ---------------------------------------------------------------- tracks
create table pricewatch_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                               -- reserved for accounts
  device_token_hash text not null,
  product_id uuid not null references pricewatch_products(id) on delete cascade,
  target_price numeric(10,2),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  -- Tracking the same product twice would double every notification.
  unique (device_token_hash, product_id)
);
create index pricewatch_tracks_device_idx on pricewatch_tracks (device_token_hash);

-- ---------------------------------------------------------------- notified
-- Keyed by the price row that triggered it, so re-running the notifier is
-- idempotent but a genuine second drop still alerts.
create table pricewatch_notified (
  track_id uuid not null references pricewatch_tracks(id) on delete cascade,
  price_id bigint not null references pricewatch_prices(id) on delete cascade,
  kind text not null,
  notified_at timestamptz not null default now(),
  primary key (track_id, price_id)
);

-- ---------------------------------------------------------------- push subs
create table pricewatch_push_subs (
  id uuid primary key default gen_random_uuid(),
  device_token_hash text not null unique,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- sources
create table pricewatch_sources (
  key text primary key,
  label text not null,
  enabled boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  last_count integer
);
insert into pricewatch_sources (key, label) values ('takealot', 'Takealot')
  on conflict (key) do nothing;

-- ---------------------------------------------------------------- RLS
-- The ecosystem pattern: RLS on with no write policies at all. Every write
-- goes through a security-definer RPC that checks the device token, so there
-- is no path for a caller holding only the anon key to write anything.
alter table pricewatch_products  enable row level security;
alter table pricewatch_prices    enable row level security;
alter table pricewatch_tracks    enable row level security;
alter table pricewatch_notified  enable row level security;
alter table pricewatch_push_subs enable row level security;
alter table pricewatch_sources   enable row level security;

-- Catalogue and history are public reads: they are not personal data, and the
-- app needs them before a device has any tracks.
create policy "public read" on pricewatch_products
  for select to anon, authenticated using (true);
create policy "public read" on pricewatch_prices
  for select to anon, authenticated using (true);
create policy "public read" on pricewatch_sources
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- helpers
create or replace function _pricewatch_hash_token(p_token text)
returns text language sql immutable
set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

-- ---------------------------------------------------------------- RPCs
create or replace function pricewatch_list_tracks(p_token text)
returns table (
  id uuid, product_id uuid, target_price numeric, enabled boolean,
  created_at timestamptz,
  retailer text, external_id text, title text, brand text,
  image_url text, url text, last_checked_at timestamptz, delisted_at timestamptz,
  has_variants boolean
)
language sql stable security definer
set search_path = 'public'
as $$
  select t.id, t.product_id, t.target_price, t.enabled, t.created_at,
         p.retailer, p.external_id, p.title, p.brand,
         p.image_url, p.url, p.last_checked_at, p.delisted_at, p.has_variants
    from pricewatch_tracks t
    join pricewatch_products p on p.id = t.product_id
   where t.device_token_hash = _pricewatch_hash_token(p_token)
   order by t.created_at
$$;

-- Adds the product to the catalogue if it is new, then tracks it. Returns the
-- product id so the caller can fetch history immediately.
create or replace function pricewatch_track_product(
  p_token text,
  p_retailer text,
  p_external_id text,
  p_title text,
  p_brand text,
  p_image_url text,
  p_url text,
  p_price numeric,
  p_listing_price numeric,
  p_in_stock boolean,
  p_stock_status text,
  p_target_price numeric default null,
  p_has_variants boolean default false
) returns uuid
language plpgsql security definer
set search_path = 'public'
as $$
declare
  v_hash text := _pricewatch_hash_token(p_token);
  v_product uuid;
  v_last numeric;
begin
  if length(coalesce(p_token, '')) < 8 then return null; end if;
  if coalesce(p_retailer, '') = '' or coalesce(p_external_id, '') = '' then return null; end if;

  insert into pricewatch_products (retailer, external_id, title, brand, image_url, url, last_checked_at, has_variants)
  values (p_retailer, p_external_id, coalesce(p_title, p_external_id), p_brand, p_image_url, p_url, now(), coalesce(p_has_variants, false))
  on conflict (retailer, external_id) do update
    set title = excluded.title,
        brand = coalesce(excluded.brand, pricewatch_products.brand),
        image_url = coalesce(excluded.image_url, pricewatch_products.image_url),
        url = coalesce(excluded.url, pricewatch_products.url),
        has_variants = excluded.has_variants,
        last_checked_at = now(),
        delisted_at = null
  returning id into v_product;

  -- Seed history only when this observation actually differs from the last
  -- one, so adding a product a second device already tracks does not create a
  -- duplicate point at the same price.
  if p_price is not null and p_price > 0 then
    select price into v_last
      from pricewatch_prices
     where product_id = v_product
     order by captured_at desc
     limit 1;

    if v_last is null or v_last <> p_price then
      insert into pricewatch_prices (product_id, price, listing_price, in_stock, stock_status)
      values (v_product, p_price, p_listing_price, coalesce(p_in_stock, true), p_stock_status);
    end if;
  end if;

  insert into pricewatch_tracks (device_token_hash, product_id, target_price)
  values (v_hash, v_product, p_target_price)
  on conflict (device_token_hash, product_id) do update
    set enabled = true,
        target_price = coalesce(excluded.target_price, pricewatch_tracks.target_price);

  return v_product;
end $$;

create or replace function pricewatch_set_target(p_token text, p_id uuid, p_target numeric)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $$
declare v_hash text := _pricewatch_hash_token(p_token); v_rows int;
begin
  if length(coalesce(p_token, '')) < 8 then return false; end if;
  update pricewatch_tracks
     set target_price = p_target
   where id = p_id and device_token_hash = v_hash;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function pricewatch_untrack(p_token text, p_id uuid)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $$
declare v_hash text := _pricewatch_hash_token(p_token); v_rows int;
begin
  if length(coalesce(p_token, '')) < 8 then return false; end if;
  delete from pricewatch_tracks
   where id = p_id and device_token_hash = v_hash;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- One row per device, not per subscription. Registering from the same phone
-- twice previously produced duplicate pushes across this ecosystem; collapsing
-- on device_token_hash from day one is the fix carried forward.
create or replace function pricewatch_push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_token text
) returns boolean
language plpgsql security definer
set search_path = 'public'
as $$
declare v_hash text := _pricewatch_hash_token(p_token);
begin
  if length(coalesce(p_token, '')) < 8 then return false; end if;
  if coalesce(p_endpoint, '') = '' then return false; end if;

  insert into pricewatch_push_subs (device_token_hash, endpoint, p256dh, auth)
  values (v_hash, p_endpoint, p_p256dh, p_auth)
  on conflict (device_token_hash) do update
    set endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
  return true;
end $$;

grant execute on function pricewatch_list_tracks(text)   to anon, authenticated;
grant execute on function pricewatch_track_product(text, text, text, text, text, text, text, numeric, numeric, boolean, text, numeric, boolean) to anon, authenticated;
grant execute on function pricewatch_set_target(text, uuid, numeric) to anon, authenticated;
grant execute on function pricewatch_untrack(text, uuid)  to anon, authenticated;
grant execute on function pricewatch_push_register(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- cron
-- Scheduled separately from applying this file.
select cron.schedule('pricewatch-sync', '5 4 * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-pricewatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb) AS request_id;
$$);

select cron.schedule('pricewatch-notify', '35 4 * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/notify-pricewatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb) AS request_id;
$$);

-- Twice an hour: give newly added products and pasted links their first
-- price, then look for a few tracks at the other shops (see sync-pricewatch,
-- mode "match"). Small batches, so each run stays well inside the timeout.
select cron.schedule('pricewatch-match', '7,37 * * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sync-pricewatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"mode":"match"}'::jsonb, timeout_milliseconds := 120000) AS request_id;
$$);

-- ------------------------------------------------- retailer probe (retired)
-- A three-day test, 18-21 October 2026, of whether other shops can be read
-- as reliably as Takealot: probe-retailers re-read one product page per shop
-- three times a day into pricewatch_probe. Baby City, Checkers and PnP (via
-- its product API, per store) read correctly on all 11 runs, including a real
-- Baby City price change; Dis-Chem answered every request with a Cloudflare
-- 403 and Woolworths exposed no readable product page. The cron job is
-- unscheduled, the function is a 410 stub, and pricewatch_probe is dropped.

-- ------------------------------------------------- other shops (October 2026)
-- Baby City, Checkers and PnP alongside Takealot, after a three-day probe
-- showed each could be read correctly on every run. A tracked product keeps
-- its own product row, the same thing at another shop is a second product
-- row, linked to the track. Its history is that shop’s own, and the card
-- shows the cheapest of them — but only across links that are confirmed: by
-- an identical retail barcode, or by a person.
alter table pricewatch_products
  -- A retail barcode, normalised to 14 digits, where the shop publishes one.
  -- In-store codes and marketplace sellers’ internal codes are never stored.
  add column if not exists gtin text,
  -- A move of more than 50% read off a shop’s page waits here until a later
  -- run reads the same price again (shops.ts, needsConfirming).
  add column if not exists pending_price numeric(10,2),
  add column if not exists pending_seen_at timestamptz,
  -- Tracked by someone, or confirmed as the same thing as a tracked product.
  -- Kept by the sync. The hub’s Today card reads only these, so a
  -- suggestion nobody has confirmed never shows there as if it were tracked.
  add column if not exists watched boolean not null default false;

update pricewatch_products p
   set watched = exists (select 1 from pricewatch_tracks t where t.product_id = p.id and t.enabled);

-- When the match job last searched the other shops for this track.
alter table pricewatch_tracks add column if not exists matched_at timestamptz;

create table if not exists pricewatch_links (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references pricewatch_tracks(id) on delete cascade,
  product_id uuid not null references pricewatch_products(id) on delete cascade,
  -- suggested: found by search, shown as "same product?", counts for nothing.
  -- confirmed: same barcode, or a person said yes (or pasted the link).
  -- rejected: a person said no, kept so it is never suggested again.
  status text not null check (status in ('suggested', 'confirmed', 'rejected')),
  reason text not null check (reason in ('barcode', 'search', 'pasted')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (track_id, product_id)
);
create index if not exists pricewatch_links_product_idx on pricewatch_links (product_id);

-- Device-scoped like the tracks: RLS on, no policies, read and written only
-- through the definer RPCs below. Grants are explicit (CLAUDE.md: from
-- 30 October 2026 new tables get none by default).
alter table pricewatch_links enable row level security;
revoke all on pricewatch_links from anon, authenticated;
grant select, insert, update, delete on pricewatch_links to service_role;

insert into pricewatch_sources (key, label) values
  ('babycity', 'Baby City'), ('checkers', 'Checkers'), ('pnp', 'PnP')
  on conflict (key) do nothing;

-- The newest p_n points per product. For the sync and the notifier, which
-- each used to read every price in one request, the API cuts that at 1000
-- rows without an error, after which an old price looks current.
create or replace function pricewatch_recent_prices(p_ids uuid[], p_n int)
returns table (id bigint, product_id uuid, captured_at timestamptz, price numeric, in_stock boolean)
language sql stable
set search_path = 'public'
as $$
  select x.id, x.product_id, x.captured_at, x.price, x.in_stock
    from (
      select pp.id, pp.product_id, pp.captured_at, pp.price, pp.in_stock,
             row_number() over (partition by pp.product_id order by pp.captured_at desc, pp.id desc) as rn
        from pricewatch_prices pp
       where pp.product_id = any(p_ids)
    ) x
   where x.rn <= greatest(p_n, 1)
$$;
revoke execute on function pricewatch_recent_prices(uuid[], int) from public, anon, authenticated;
grant execute on function pricewatch_recent_prices(uuid[], int) to service_role;

-- This device’s links, with the linked product. Rejected ones are left out.
create or replace function pricewatch_list_links(p_token text)
returns table (
  id uuid, track_id uuid, product_id uuid, status text, reason text,
  created_at timestamptz, decided_at timestamptz,
  retailer text, external_id text, title text, image_url text, url text,
  gtin text, last_checked_at timestamptz, delisted_at timestamptz
)
language sql stable security definer
set search_path = 'public'
as $$
  select l.id, l.track_id, l.product_id, l.status, l.reason, l.created_at, l.decided_at,
         p.retailer, p.external_id, p.title, p.image_url, p.url,
         p.gtin, p.last_checked_at, p.delisted_at
    from pricewatch_links l
    join pricewatch_tracks t on t.id = l.track_id
    join pricewatch_products p on p.id = l.product_id
   where t.device_token_hash = _pricewatch_hash_token(p_token)
     and l.status <> 'rejected'
   order by l.created_at
$$;

-- "Same product?" answered.
create or replace function pricewatch_decide_link(p_token text, p_id uuid, p_confirm boolean)
returns boolean
language plpgsql security definer
set search_path = 'public'
as $$
declare v_rows int;
begin
  if length(coalesce(p_token, '')) < 8 then return false; end if;
  update pricewatch_links l
     set status = case when p_confirm then 'confirmed' else 'rejected' end,
         decided_at = now()
    from pricewatch_tracks t
   where l.id = p_id
     and t.id = l.track_id
     and t.device_token_hash = _pricewatch_hash_token(p_token);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- A product link pasted from another shop: the person has said it is the
-- same thing, so it is confirmed. The URL must be on that shop’s own site,
-- the sync reads its price on the next run.
create or replace function pricewatch_add_link(
  p_token text, p_track uuid, p_retailer text, p_external_id text, p_url text, p_title text
) returns uuid
language plpgsql security definer
set search_path = 'public'
as $$
declare v_product uuid; v_link uuid; v_primary uuid;
begin
  if length(coalesce(p_token, '')) < 8 then return null; end if;
  if coalesce(p_external_id, '') = '' or coalesce(p_url, '') = '' then return null; end if;
  if p_url !~* (case p_retailer
      when 'babycity' then '^https://www\.babycity\.co\.za/[a-z0-9-]+$'
      when 'checkers' then '^https://www\.checkers\.co\.za/product/[a-z0-9-]+$'
      when 'pnp'      then '^https://www\.pnp\.co\.za/.*/p/[A-Za-z0-9_]+$'
      when 'takealot' then '^https://www\.takealot\.com/.*PLID[0-9]+'
      else '^$' end) then return null; end if;

  select product_id into v_primary
    from pricewatch_tracks
   where id = p_track and device_token_hash = _pricewatch_hash_token(p_token);
  if v_primary is null then return null; end if;

  insert into pricewatch_products (retailer, external_id, title, url)
  values (p_retailer, p_external_id, left(coalesce(nullif(p_title, ''), p_external_id), 300), p_url)
  on conflict (retailer, external_id) do update
    set url = coalesce(pricewatch_products.url, excluded.url)
  returning id into v_product;
  if v_product = v_primary then return null; end if;

  insert into pricewatch_links (track_id, product_id, status, reason, decided_at)
  values (p_track, v_product, 'confirmed', 'pasted', now())
  on conflict (track_id, product_id) do update
    set status = 'confirmed', decided_at = now()
  returning id into v_link;
  return v_link;
end $$;

grant execute on function pricewatch_list_links(text) to anon, authenticated;
grant execute on function pricewatch_decide_link(text, uuid, boolean) to anon, authenticated;
grant execute on function pricewatch_add_link(text, uuid, text, text, text, text) to anon, authenticated;
