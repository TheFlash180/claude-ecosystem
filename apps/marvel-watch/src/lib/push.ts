// Web Push client — token-checked RPCs, stackable leads (1w/3d/1d).
// Marvel has its OWN VAPID keypair (rotated 2026-07-18; previously shared
// with sport-watch). ensurePushSubscription transparently re-subscribes any
// device still holding a subscription under the old key.
import { deviceToken, ensurePushSubscription } from '@ecosystem/shared';
import { sb } from './supabase';
import type { Title } from './config';

const VAPID_PUBLIC = "BLmIByq8Kf76APBsfcRI-vliFFaZbQyBZtJbkD3rqb8LsUv925pXbgj1DIjGejwbIew-LBJuZc8NNdJXo_7dQJI";
const TOKEN_KEY = "marvel-watch:device-token";

export function getDeviceToken(): string {
  return deviceToken(TOKEN_KEY);
}

export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('marvel_push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}

/** Replace this device's reminder set for a title. Empty leads = remove all. */
export async function setReminders(title: Title, leads: number[]): Promise<boolean> {
  const client = sb();
  if (!client || !title.releaseDate) return false;
  const { data, error } = await client.rpc('marvel_set_reminders', {
    p_token: getDeviceToken(),
    p_title_id: title.id,
    p_label: title.title,
    p_date: title.releaseDate,
    p_leads: leads,
  });
  return !error && data === true;
}

/** All reminders on this device: titleId -> set of lead days. */
export async function listReminders(): Promise<Map<string, Set<number>> | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('marvel_list_reminders', {
    p_token: getDeviceToken(),
  });
  if (error || !data) return null;
  const map = new Map<string, Set<number>>();
  for (const row of data as { title_id: string; lead_days: number }[]) {
    const set = map.get(row.title_id) ?? new Set<number>();
    set.add(row.lead_days);
    map.set(row.title_id, set);
  }
  return map;
}
