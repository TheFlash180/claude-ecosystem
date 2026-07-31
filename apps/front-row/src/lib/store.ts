// Data access. Events and source health are public reads; everything
// device-scoped goes through the token-checked RPCs.
import { deviceToken, ensurePushSubscription, getSupabase } from '@ecosystem/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MONTECASINO, type FrontRowEvent, type SourceHealth, type Watch, type WatchKind,
} from './config';

const VAPID_PUBLIC = 'BAKv5aayQMtgayP-0nCazKMnXi7Om7exuvojU6VbwmEBVT8dZCBzzKhz1xFNhpAs-KcBCTjmRVaTyTV3V8mR2ds';
const TOKEN_KEY = 'front-row:device-token';

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

interface EventRow {
  id: string; source: string; name: string; url: string | null;
  image_url: string | null; summary: string | null;
  starts_at: string | null; ends_at: string | null; date_text: string | null;
  venue_name: string | null; lat: number | null; lng: number | null;
  locality: string | null; categories: string[] | null;
  price_from: number | string | null; listed_at: string | null;
}

function toEvent(r: EventRow): FrontRowEvent {
  return {
    id: r.id, source: r.source, name: r.name, url: r.url,
    imageUrl: r.image_url, summary: r.summary,
    startsAt: r.starts_at, endsAt: r.ends_at, dateText: r.date_text,
    venueName: r.venue_name, lat: r.lat, lng: r.lng,
    locality: r.locality, categories: r.categories ?? [],
    // numeric comes back as a string from PostgREST.
    priceFrom: r.price_from === null ? null : Number(r.price_from),
    listedAt: r.listed_at,
  };
}

interface WatchRow {
  id: string; label: string; kind: WatchKind;
  lat: number | null; lng: number | null; radius_km: number | string | null;
  term: string | null; enabled: boolean;
}

function toWatch(r: WatchRow): Watch {
  return {
    id: r.id, label: r.label, kind: r.kind,
    lat: r.lat, lng: r.lng,
    radiusKm: r.radius_km === null ? null : Number(r.radius_km),
    term: r.term, enabled: r.enabled,
  };
}

/** Upcoming events only, plus anything undated — a run whose prose could not be
 *  parsed is still real, and dropping it would recreate the original problem. */
export async function fetchEvents(): Promise<FrontRowEvent[]> {
  const client = sb();
  if (!client) return [];
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data, error } = await client
    .from('frontrow_events')
    .select('*')
    .or(`starts_at.gte.${since},starts_at.is.null`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (error || !data) return [];
  return (data as EventRow[]).map(toEvent);
}

export async function fetchSources(): Promise<SourceHealth[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.from('frontrow_sources').select('*').order('key');
  if (error || !data) return [];
  return (data as Record<string, any>[]).map(r => ({
    key: r.key, label: r.label, enabled: r.enabled,
    lastOkAt: r.last_ok_at, lastError: r.last_error, lastCount: r.last_count,
  }));
}

export async function fetchWatches(): Promise<Watch[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.rpc('frontrow_list_watches', { p_token: getDeviceToken() });
  if (error || !data) return [];
  return (data as WatchRow[]).map(toWatch);
}

/** Give a fresh install something to look at rather than an empty screen. */
export async function seedDefaultWatch(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { error } = await client.rpc('frontrow_seed_default_watch', { p_token: getDeviceToken() });
  return !error;
}

export async function saveWatch(w: Omit<Watch, 'id'> & { id: string | null }): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { error } = await client.rpc('frontrow_save_watch', {
    p_token: getDeviceToken(),
    p_id: w.id,
    p_label: w.label,
    p_kind: w.kind,
    p_lat: w.kind === 'geo' ? w.lat ?? MONTECASINO.lat : null,
    p_lng: w.kind === 'geo' ? w.lng ?? MONTECASINO.lng : null,
    p_radius_km: w.kind === 'geo' ? w.radiusKm ?? 15 : null,
    p_term: w.kind === 'keyword' ? w.term : null,
    p_enabled: w.enabled,
  });
  return !error;
}

export async function deleteWatch(id: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('frontrow_delete_watch', {
    p_token: getDeviceToken(), p_id: id,
  });
  return !error && data === true;
}

export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('frontrow_push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}
