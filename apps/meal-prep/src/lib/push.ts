// Sunday prep-day reminder — one toggle per device, own VAPID keypair
// (private key in Vault as mealprep_vapid_private_key).
import { deviceToken, ensurePushSubscription } from '@ecosystem/shared';
import { sb } from './supabase';

const VAPID_PUBLIC = 'BHdzWYvsMOEoDZnYw0nTMzrC7l6F__C_uzfsdhaQKi-GDv4x3yNI_LY7MdTHhTWWQkiFadUCiSNEeV55CXmmH9A';
const TOKEN_KEY = 'meal-prep:device-token';

export function getDeviceToken(): string {
  return deviceToken(TOKEN_KEY);
}

/** Subscribe this device and enable the Sunday reminder. */
export async function enablePrepReminder(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('mealprep_push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}

export async function disablePrepReminder(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_push_set_enabled', {
    p_token: getDeviceToken(), p_enabled: false,
  });
  return !error && data === true;
}

export async function prepReminderStatus(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_push_status', {
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}
