// The last fixture list this phone loaded from the database, kept for when the
// next load fails. It replaced a bundled events.json that nobody kept current:
// by October 2026 it still had August's round numbers, so a phone offline at
// the track was shown Singapore as Round 18 when the calendar had moved it to
// 17. The phone's own last load is never older than the last time it worked.
//
// Rows are stored as the database returned them, so reading the cache goes
// through exactly the same mapping as a live load.

export const EVENTS_CACHE_KEY = 'sa-sport-watch:events-cache';

export interface EventsCache<E, C> {
  savedAt: string; // ISO instant of the load
  events: E[];
  categories: C[];
}

export function encodeCache<E, C>(events: E[], categories: C[], now = new Date()): string {
  return JSON.stringify({ savedAt: now.toISOString(), events, categories });
}

/** null for anything that is not a usable cache: absent, unparseable, or
 *  without a single event — an empty list would read as "no fixtures". */
export function decodeCache<E, C>(raw: string | null): EventsCache<E, C> | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c || typeof c.savedAt !== 'string' || !Array.isArray(c.events) || c.events.length === 0) return null;
    return { savedAt: c.savedAt, events: c.events, categories: Array.isArray(c.categories) ? c.categories : [] };
  } catch {
    return null;
  }
}

/** "10 Oct, 14:05" in SAST, for the offline line. */
export function savedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
  const hm = d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${Number(ymd.slice(8))} ${months[Number(ymd.slice(5, 7)) - 1]}, ${hm}`;
}
