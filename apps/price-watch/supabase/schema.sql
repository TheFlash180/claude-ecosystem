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
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);

select cron.schedule('pricewatch-notify', '35 4 * * *', $$
  SELECT net.http_post(
    url := 'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/notify-pricewatch',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) AS request_id;
$$);
