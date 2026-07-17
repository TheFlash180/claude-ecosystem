// Title data + the pure date/grouping logic (unit-tested).
import { sb } from './supabase';
import type { MediaType, Title, Universe } from './config';

interface DbTitleRow {
  id: string;
  media_type: string;
  title: string;
  release_date: string | null;
  date_tbc: boolean;
  universe: string;
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  watch_on: string | null;
  is_special: boolean;
  manual: boolean;
}

function fromDb(r: DbTitleRow): Title {
  return {
    id: r.id,
    mediaType: r.media_type as MediaType,
    title: r.title,
    releaseDate: r.release_date,
    dateTbc: r.date_tbc || r.release_date === null,
    universe: r.universe as Universe,
    overview: r.overview ?? undefined,
    posterUrl: r.poster_url ?? undefined,
    backdropUrl: r.backdrop_url ?? undefined,
    watchOn: r.watch_on ?? undefined,
    isSpecial: r.is_special,
    manual: r.manual,
  };
}

export async function fetchTitles(): Promise<Title[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('marvel_titles')
    .select('*')
    .order('release_date', { ascending: true, nullsFirst: false });
  if (error || !data) return [];
  return (data as DbTitleRow[]).map(fromDb);
}

// ---- pure date helpers (SAST calendar days; releases are dates) ----

export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

/** Whole days from today (SAST) to a release date. Negative = already out. */
export function daysUntil(releaseDate: string, today = sastDay()): number {
  return Math.round((Date.parse(releaseDate) - Date.parse(today)) / 86400000);
}

/** "TODAY 🍿" / "Tomorrow" / "in 12 days" / "in 3 months" / "Out now" */
export function releaseLabel(releaseDate: string | null, today = sastDay()): string {
  if (!releaseDate) return 'Date TBA';
  const d = daysUntil(releaseDate, today);
  if (d < 0) return 'Out now';
  if (d === 0) return 'TODAY 🍿';
  if (d === 1) return 'Tomorrow';
  if (d <= 31) return `in ${d} days`;
  const months = Math.round(d / 30.4);
  if (months <= 24) return `in ${months} month${months > 1 ? 's' : ''}`;
  const years = Math.round(d / 365);
  return `in ${years} year${years > 1 ? 's' : ''}`;
}

export function fmtRelease(releaseDate: string): string {
  return new Date(releaseDate + 'T12:00:00Z').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export interface Grouped {
  /** Next dated future release — the hero. */
  nextUp: Title | null;
  /** Dated future releases (incl. the hero), soonest first. */
  upcoming: Title[];
  /** Announced, no date yet. */
  horizon: Title[];
  /** Released within the last `recentDays`, newest first. */
  outNow: Title[];
}

export function groupTitles(titles: Title[], today = sastDay(), recentDays = 60): Grouped {
  const dated = titles.filter(t => t.releaseDate !== null);
  const upcoming = dated
    .filter(t => daysUntil(t.releaseDate!, today) >= 0)
    .sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
  const outNow = dated
    .filter(t => {
      const d = daysUntil(t.releaseDate!, today);
      return d < 0 && d >= -recentDays;
    })
    .sort((a, b) => b.releaseDate!.localeCompare(a.releaseDate!));
  const horizon = titles.filter(t => t.releaseDate === null);
  return { nextUp: upcoming[0] ?? null, upcoming, horizon, outNow };
}
