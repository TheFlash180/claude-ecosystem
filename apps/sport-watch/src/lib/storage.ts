// localStorage helpers. Ids were historically numbers (events.json); they are
// strings now that events live in the database — legacy values are coerced.

export function loadIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set((JSON.parse(raw) as (string | number)[]).map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveIdSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch { /* storage full/blocked — reminders just won't persist */ }
}

const LEADS_KEY = "sa-sport-watch:leads";

/** Per-event reminder lead times in minutes (mirror of the server value so
 *  the popup can render without a round-trip). */
export function loadLeads(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LEADS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveLead(eventId: string, minutes: number) {
  const all = loadLeads();
  all[eventId] = minutes;
  try {
    localStorage.setItem(LEADS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
