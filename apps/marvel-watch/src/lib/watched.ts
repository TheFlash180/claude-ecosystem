// "I have seen this" — per device, via token-checked definer RPCs, exactly
// like reminders. Nothing here is shared between devices on purpose: one
// person ticking off a film must not clear it from the other's phone.
import { sb } from './supabase';
import { getDeviceToken } from './push';

/** Mark or un-mark a title. Both directions are idempotent server-side, which
 *  is what lets the undo path re-send without special-casing. */
export async function setWatched(titleId: string, watched: boolean): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('marvel_set_watched', {
    p_token: getDeviceToken(),
    p_title_id: titleId,
    p_watched: watched,
  });
  return !error && data === true;
}

/** Every title this device has ticked off.
 *
 *  Returns null on failure rather than an empty set: "nothing watched" and
 *  "could not ask" must not look the same, or a failed read would silently
 *  un-hide everything the moment the network hiccuped. */
export async function listWatched(): Promise<Set<string> | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('marvel_list_watched', {
    p_token: getDeviceToken(),
  });
  if (error || !data) return null;
  return new Set((data as { title_id: string }[]).map(r => r.title_id));
}
