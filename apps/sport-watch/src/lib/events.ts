// Event data: the database is the source of truth (editable in /admin,
// F1 auto-synced daily from Jolpica). The bundled events.json is only an
// offline/failure fallback so the installed PWA still renders something.
import { sb } from './supabase';
import { SPORT, type SportEvent, type SportKey } from './config';
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
  return (eventsData.events as RawJsonEvent[])
    .filter((e) => e.sport in SPORT)
    .map((e) => ({
      ...e,
      id: String(e.id),
      sport: e.sport as SportKey,
      date: e.date ? new Date(e.date) : null,
    }));
}

export async function fetchEvents(): Promise<{ events: SportEvent[]; fromDb: boolean }> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from('sport_events')
      .select('*')
      .order('event_date', { ascending: true, nullsFirst: false });
    if (!error && data && data.length > 0) {
      return { events: (data as DbEventRow[]).map(fromDb), fromDb: true };
    }
  }
  return { events: fallbackEvents(), fromDb: false };
}

export function sortEvents(events: SportEvent[]): SportEvent[] {
  return [...events].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.getTime() - b.date.getTime();
  });
}
