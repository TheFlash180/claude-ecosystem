// Event + category data: the database is the source of truth (editable in
// /admin, F1 auto-synced daily). When a load fails, the phone's own last good
// load stands in (lib/eventsCache.ts), with the built-in category list.
import { sb } from './supabase';
import { DEFAULT_CATEGORIES, toCatMap, type Category, type CatMap, type SportEvent, type SportKey } from './config';
import { sourceFromRow, type Source, type SourceRow } from '@ecosystem/shared';
import { EVENTS_CACHE_KEY, decodeCache, encodeCache } from './eventsCache';

interface DbEventRow {
  id: string;
  sport: string;
  competition: string;
  home: string;
  away: string | null;
  home_flag: string;
  away_flag: string | null;
  event_date: string | null;
  venue: string | null;
  result: string | null;
  note: string | null;
  channel: string | null;
  watch_url: string | null;
  is_special: boolean;
  is_conditional: boolean;
  date_tbc: boolean;
}

interface DbCategoryRow {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  live_minutes: number;
  sort_order: number;
}

function fromDb(r: DbEventRow): SportEvent {
  return {
    id: r.id,
    sport: r.sport as SportKey,
    competition: r.competition,
    home: r.home,
    away: r.away,
    homeFlag: r.home_flag,
    awayFlag: r.away_flag,
    date: r.event_date ? new Date(r.event_date) : null,
    venue: r.venue ?? undefined,
    result: r.result ?? undefined,
    note: r.note ?? undefined,
    channel: r.channel ?? undefined,
    watchUrl: r.watch_url ?? undefined,
    isSpecial: r.is_special,
    isConditional: r.is_conditional,
    dateTBC: r.date_tbc,
  };
}

function catFromDb(r: DbCategoryRow): Category {
  return {
    key: r.key,
    label: r.label,
    icon: r.icon,
    color: r.color,
    bg: r.bg,
    liveMinutes: r.live_minutes,
    sortOrder: r.sort_order,
  };
}

export interface RegistryData {
  events: SportEvent[];
  categories: Category[];
  cats: CatMap;
  sources: Source[];
  /** True only for a fresh database load. Anything decided from absence —
   *  pruning bells, syncing them to the server — must wait for this. */
  fromDb: boolean;
  /** When the cached list was loaded, for a load that fell back to it. */
  cachedAt?: string;
}

function readCache() {
  try {
    return decodeCache<DbEventRow, DbCategoryRow>(localStorage.getItem(EVENTS_CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(events: DbEventRow[], categories: DbCategoryRow[]) {
  try {
    localStorage.setItem(EVENTS_CACHE_KEY, encodeCache(events, categories));
  } catch { /* storage full/blocked: the next failed load just shows nothing */ }
}

function withCategories(rows: DbCategoryRow[]) {
  const categories = rows.length > 0 ? rows.map(catFromDb) : DEFAULT_CATEGORIES;
  return { categories, cats: toCatMap(categories) };
}

export async function fetchEvents(): Promise<RegistryData> {
  const client = sb();
  if (client) {
    const [evRes, catRes, srcRes] = await Promise.all([
      client.from('sport_events').select('*').order('event_date', { ascending: true, nullsFirst: false }),
      client.from('sport_categories').select('*').order('sort_order'),
      client.from('sport_sources').select('*').order('key'),
    ]);
    if (!evRes.error && evRes.data && evRes.data.length > 0) {
      const catRows = (!catRes.error && catRes.data) ? catRes.data as DbCategoryRow[] : [];
      writeCache(evRes.data as DbEventRow[], catRows);
      return {
        events: (evRes.data as DbEventRow[]).map(fromDb),
        ...withCategories(catRows),
        // No sources row is not the same as a stale one: an older database
        // without the table should show no banner, not a false alarm.
        sources: (!srcRes.error && srcRes.data)
          ? (srcRes.data as SourceRow[]).map(sourceFromRow)
          : [],
        fromDb: true,
      };
    }
  }
  const cache = readCache();
  return {
    events: (cache?.events ?? []).map(fromDb),
    ...withCategories(cache?.categories ?? []),
    // Offline: the line saying when this list was loaded is the warning; a
    // source banner on top of it would add nothing.
    sources: [],
    fromDb: false,
    cachedAt: cache?.savedAt,
  };
}

export function sortEvents(events: SportEvent[]): SportEvent[] {
  return [...events].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.getTime() - b.date.getTime();
  });
}
