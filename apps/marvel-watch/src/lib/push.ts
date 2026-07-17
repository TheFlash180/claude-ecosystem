// Web Push client — token-checked RPCs, stackable leads (1w/3d/1d).
import { sb } from './supabase';
import type { Title } from './config';

const VAPID_PUBLIC = "BGYmKYowZiS3ohHCksH6TKHimd-EaDcLX5ehZMAuURlVrBixtIxEpoStOqzsXGU0ExxM_EDB_NoP22yxMWPf0Ho";
const TOKEN_KEY = "marvel-watch:device-token";

export function getDeviceToken(): string {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.pushManager) return null;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
      });
    }
    return sub;
  } catch {
    return null;
  }
}

export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await getPushSubscription();
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
