// Opting a device in to the 07:00 morning summary (sent by the
// send-morning-digest edge function; what it says is in
// supabase/functions/send-morning-digest/digest.ts).
//
// The hub's own VAPID keypair and device token — never another app's (see
// CLAUDE.md). The one thing borrowed is Glovebox's device token, read from the
// shared origin's localStorage so the summary can mention this device's own
// renewals; the server keeps only its hash.
import { deviceToken, ensurePushSubscription, getSupabase } from '@ecosystem/shared';

export const MORNING_VAPID_PUBLIC =
  'BO702Z-eGk6j4wmvsBxXxTK7fpuYoMvcOgA3qzlleNujyheKl7ldmC5245e38QiICKlzcigpyd7BU3OHJoh6Rm4';

const TOKEN_KEY = 'dashboard:device-token';
const GLOVEBOX_TOKEN_KEY = 'glovebox:device-token';

export type MorningState = 'unsupported' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Glovebox's token if this browser has used Glovebox, else null. Never
 *  creates one: minting a Glovebox identity from the hub would link nothing. */
function gloveboxToken(): string | null {
  try {
    return localStorage.getItem(GLOVEBOX_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Where this device stands. A failed read reports "off" rather than
 *  throwing — the worst case is offering a switch that is already on. */
export async function morningStatus(): Promise<MorningState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const { data, error } = await getSupabase()
    .rpc('dashboard_push_status', { p_token: deviceToken(TOKEN_KEY) });
  return !error && data === true ? 'on' : 'off';
}

/** Ask for permission, subscribe, and register. Returns the resulting state. */
export async function enableMorning(): Promise<MorningState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';

  const sub = await ensurePushSubscription(MORNING_VAPID_PUBLIC);
  const json = sub?.toJSON();
  if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'off';

  const { data, error } = await getSupabase().rpc('dashboard_push_register', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_token: deviceToken(TOKEN_KEY),
    p_glovebox_token: gloveboxToken(),
  });
  return !error && data === true ? 'on' : 'off';
}

/** Stop the summary for this device. The browser subscription is left in
 *  place: it belongs to the hub's worker and costs nothing unused. */
export async function disableMorning(): Promise<MorningState> {
  const { error } = await getSupabase()
    .rpc('dashboard_push_unregister', { p_token: deviceToken(TOKEN_KEY) });
  return error ? 'on' : 'off';
}
