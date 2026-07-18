// Web Push client. All writes go through token-checked security-definer
// RPCs — the anon key alone can no longer read or touch anyone's
// subscriptions (see supabase/push-schema.sql). Subscription/token
// primitives live in @ecosystem/shared (also used by marvel-watch).
import { deviceToken, ensurePushSubscription } from '@ecosystem/shared';
import { sb } from './supabase';
import type { SportEvent } from './config';

const VAPID_PUBLIC = "BGYmKYowZiS3ohHCksH6TKHimd-EaDcLX5ehZMAuURlVrBixtIxEpoStOqzsXGU0ExxM_EDB_NoP22yxMWPf0Ho";
const TOKEN_KEY = "sa-sport-watch:device-token";

export const DEFAULT_LEAD_MINUTES = 60;

export function getDeviceToken(): string {
  return deviceToken(TOKEN_KEY);
}

/** Subscribe this device to push and register it (endpoint + device token)
 *  with the server. Safe to call repeatedly. */
export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}

export async function setReminder(ev: SportEvent, leadMinutes: number): Promise<boolean> {
  const client = sb();
  if (!client || !ev.date) return false;
  const { data, error } = await client.rpc('push_set_reminder', {
    p_token: getDeviceToken(),
    p_event_id: ev.id,
    p_event_date: ev.date.toISOString(),
    p_event_label: ev.away ? `${ev.home} vs ${ev.away}` : ev.home,
    p_lead_minutes: leadMinutes,
  });
  return !error && data === true;
}

export async function removeReminder(eventId: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('push_remove_reminder', {
    p_token: getDeviceToken(),
    p_event_id: eventId,
  });
  return !error && data === true;
}

export async function listReminders(): Promise<Map<string, number> | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('push_list_reminders', {
    p_token: getDeviceToken(),
  });
  if (error || !data) return null;
  const map = new Map<string, number>();
  for (const row of data as { event_id: string; lead_minutes: number }[]) {
    map.set(row.event_id, row.lead_minutes);
  }
  return map;
}

/** Make the server match this device's belled set: add missing reminders
 *  for future events, remove ones no longer belled. */
export async function syncAllReminders(
  events: SportEvent[],
  notified: Set<string>,
  leadFor: (id: string) => number,
): Promise<void> {
  const server = await listReminders();
  if (server === null) return;
  const now = Date.now();
  for (const ev of events) {
    const wantsPush = notified.has(ev.id) && ev.date !== null && ev.date.getTime() > now;
    if (wantsPush && !server.has(ev.id)) {
      await setReminder(ev, leadFor(ev.id));
    }
  }
  for (const eventId of server.keys()) {
    if (!notified.has(eventId)) {
      await removeReminder(eventId);
    }
  }
}
