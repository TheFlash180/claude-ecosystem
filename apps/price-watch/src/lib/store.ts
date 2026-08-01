// Data access. The catalogue and price history are public reads; everything
// device-scoped goes through the token-checked RPCs.
import { deviceToken, ensurePushSubscription, getSupabase } from '@ecosystem/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PricePoint, Product, SourceHealth, Track, TrackedProduct } from './config';

const VAPID_PUBLIC = 'BF_60p2HomjlU_xRcc8PvJv2_OetD7RRwNGUotulZ3iHQDKOTSIerxPr1viFH50s715Jco3mb6v-VXrzqNJntIw';
const TOKEN_KEY = 'price-watch:device-token';

/** Search runs through an edge function because Takealot sends no CORS headers
 *  — the browser cannot call it directly however much we would prefer to. */
const SEARCH_FN = 'search-pricewatch';

export function sb(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

export function getDeviceToken(): string {
  return deviceToken(TOKEN_KEY);
}

export interface SearchHit {
  retailer: string;
  externalId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  url: string | null;
  price: number | null;
  listingPrice: number | null;
  inStock: boolean;
  stockStatus: string | null;
  hasVariants: boolean;
}

export interface SearchOutcome {
  results: SearchHit[];
  /** Set when the lookup itself failed. An empty list and a broken adapter
   *  must not look the same to the user. */
  error: string | null;
}

export async function searchProducts(query: string): Promise<SearchOutcome> {
  const client = sb();
  if (!client) return { results: [], error: 'Not connected' };

  // A pasted product link or bare id is looked up directly rather than being
  // fed to the search index, which frequently will not surface it.
  const body = /PLID\d+/i.test(query) || /^\d{4,12}$/.test(query.trim())
    ? { id: query.trim() }
    : { q: query.trim() };

  try {
    const { data, error } = await client.functions.invoke(SEARCH_FN, { body });
    if (error) return { results: [], error: 'Search is unavailable right now' };
    const results = (data?.results ?? []) as SearchHit[];
    return { results, error: data?.error ? 'Takealot did not respond' : null };
  } catch {
    return { results: [], error: 'Search is unavailable right now' };
  }
}

interface TrackRow {
  id: string; product_id: string; target_price: number | string | null;
  enabled: boolean; created_at: string;
  retailer: string; external_id: string; title: string; brand: string | null;
  image_url: string | null; url: string | null;
  last_checked_at: string | null; delisted_at: string | null;
  has_variants: boolean;
}

function toTrack(r: TrackRow): Track {
  return {
    id: r.id,
    productId: r.product_id,
    // numeric comes back as a string from PostgREST.
    targetPrice: r.target_price === null ? null : Number(r.target_price),
    enabled: r.enabled,
    createdAt: r.created_at,
  };
}

function toProduct(r: TrackRow): Product {
  return {
    id: r.product_id,
    retailer: r.retailer,
    externalId: r.external_id,
    title: r.title,
    brand: r.brand,
    imageUrl: r.image_url,
    url: r.url,
    lastCheckedAt: r.last_checked_at,
    delistedAt: r.delisted_at,
    hasVariants: r.has_variants,
  };
}

interface PriceRow {
  product_id: string; captured_at: string;
  price: number | string; listing_price: number | string | null;
  in_stock: boolean; stock_status: string | null;
}

function toPoint(r: PriceRow): PricePoint {
  return {
    at: r.captured_at,
    price: Number(r.price),
    listingPrice: r.listing_price === null ? null : Number(r.listing_price),
    inStock: r.in_stock,
    stockStatus: r.stock_status,
  };
}

/** One round trip for the tracks, one for all their history. Fetching history
 *  per card would be a request per product on every open. */
export async function fetchTracked(): Promise<TrackedProduct[]> {
  const client = sb();
  if (!client) return [];

  const { data, error } = await client.rpc('pricewatch_list_tracks', { p_token: getDeviceToken() });
  if (error || !data) return [];
  const rows = data as TrackRow[];
  if (rows.length === 0) return [];

  const productIds = rows.map(r => r.product_id);
  const { data: priceData } = await client
    .from('pricewatch_prices')
    .select('product_id, captured_at, price, listing_price, in_stock, stock_status')
    .in('product_id', productIds)
    .order('captured_at', { ascending: true })
    .limit(10000);

  const byProduct = new Map<string, PricePoint[]>();
  for (const r of (priceData ?? []) as PriceRow[]) {
    const list = byProduct.get(r.product_id) ?? [];
    list.push(toPoint(r));
    byProduct.set(r.product_id, list);
  }

  return rows.map(r => ({
    track: toTrack(r),
    product: toProduct(r),
    history: byProduct.get(r.product_id) ?? [],
  }));
}

export async function fetchSources(): Promise<SourceHealth[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.from('pricewatch_sources').select('*').order('key');
  if (error || !data) return [];
  return (data as Record<string, any>[]).map(r => ({
    key: r.key, label: r.label, enabled: r.enabled,
    lastOkAt: r.last_ok_at, lastError: r.last_error, lastCount: r.last_count,
  }));
}

export async function trackProduct(hit: SearchHit, targetPrice: number | null): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('pricewatch_track_product', {
    p_token: getDeviceToken(),
    p_retailer: hit.retailer,
    p_external_id: hit.externalId,
    p_title: hit.title,
    p_brand: hit.brand,
    p_image_url: hit.imageUrl,
    p_url: hit.url,
    p_price: hit.price,
    p_listing_price: hit.listingPrice,
    p_in_stock: hit.inStock,
    p_stock_status: hit.stockStatus,
    p_target_price: targetPrice,
    p_has_variants: hit.hasVariants,
  });
  return !error && data !== null;
}

export async function setTarget(trackId: string, target: number | null): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('pricewatch_set_target', {
    p_token: getDeviceToken(), p_id: trackId, p_target: target,
  });
  return !error && data === true;
}

export async function untrack(trackId: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('pricewatch_untrack', {
    p_token: getDeviceToken(), p_id: trackId,
  });
  return !error && data === true;
}

export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('pricewatch_push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}
