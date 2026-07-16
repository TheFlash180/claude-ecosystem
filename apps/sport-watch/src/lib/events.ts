// Event + category data: the database is the source of truth (editable in
// /admin, F1 auto-synced daily). The bundled events.json and built-in
// category list are only an offline/failure fallback.
import { sb } from './supabase';
import { DEFAULT_CATEGORIES, toCatMap, type Category, type CatMap, type SportEvent, type SportKey } from './config';
import eventsData from '../data/events.json';

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

interface RawJsonEvent {
  id: number;
  sport: string;
  competition: string;
  home: string;
  away: string | null;
  homeFlag: string;
  awayFlag: string | null;
  date: string | null;
  venue?: string;
  result?: string;
  note?: string;
  isConditional?: boolean;
  isSpecial?: boolean;
  dateTBC?: boolean;
}

export function fallbackEvents(): SportEvent[] {
  const known = new Set(DEFAULT_CATEGORIES.map((c) => c.key));
  return (eventsData.events as RawJsonEvent[])
    .filter((e) => known.has(e.sport))
    .map((e) => ({
      ...e,
      id: String(e.id),
      sport: e.sport as SportKey,
      date: e.date ? new Date(e.date) : null,
    }));
}

export interface RegistryData {
  events: SportEvent[];
  categories: Category[];
  cats: CatMap;
  fromDb: boolean;
}

export async function fetchEvents(): Promise<RegistryData> {
  const client = sb();
  if (client) {
    const [evRes, catRes] = await Promise.all([
      client.from('sport_events').select('*').order('event_date', { ascending: true, nullsFirst: false }),
      client.from('sport_categories').select('*').order('sort_order'),
    ]);
    if (!evRes.error && evRes.data && evRes.data.length > 0) {
      const categories = (!catRes.error && catRes.data && catRes.data.length > 0)
        ? (catRes.data as DbCategoryRow[]).map(catFromDb)
        : DEFAULT_CATEGORIES;
      return {
        events: (evRes.data as DbEventRow[]).map(fromDb),
        categories,
        cats: toCatMap(categories),
        fromDb: true,
      };
    }
  }
  return {
    events: fallbackEvents(),
    categories: DEFAULT_CATEGORIES,
    cats: toCatMap(DEFAULT_CATEGORIES),
    fromDb: false,
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
