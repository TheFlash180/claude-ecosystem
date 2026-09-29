// What the 07:00 morning summary says. Pure: no Deno, no Supabase, no
// imports — the edge function and the dashboard's vitest both load this file
// directly, so the rules are tested where they run.
//
// A line appears only when there is something to act on today, and a day with
// no lines sends no push at all: a notification that arrives every morning
// saying nothing trains you to swipe it away, and then the one that matters is
// swiped away with it.
//
// Only world data plus the subscribing device's own Glovebox rows ever reach
// a line. Anyone who opens the public hub can subscribe, so nothing here may
// be personal beyond what that device already owns — in particular, never
// anything from baby-logger.

export interface DigestEvent {
  sport: string;
  home: string;
  away: string | null;
  homeFlag: string | null;
  awayFlag: string | null;
  /** ISO instant. */
  date: string;
}

export interface DigestTitle {
  title: string;
  mediaType: string;
}

export interface DigestSource {
  /** Which app the feed belongs to, as a person would say it. */
  app: string;
  label: string;
  enabled: boolean;
  lastOkAt: string | null;
  lastError: string | null;
}

export interface DigestRenewal {
  kind: 'disc' | 'service' | 'licence';
  /** The car or the person. */
  subject: string;
  /** yyyy-mm-dd */
  date: string;
}

export interface DigestInput {
  /** SAST calendar day, yyyy-mm-dd. */
  today: string;
  /** Epoch ms; events already under way are left out. */
  now: number;
  events: DigestEvent[];
  releases: DigestTitle[];
  sources: DigestSource[];
  renewals: DigestRenewal[];
}

export interface Digest {
  title: string;
  body: string;
  lines: string[];
}

const TZ = 'Africa/Johannesburg';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Same threshold as packages/shared/src/sources.ts (a parity test holds
 *  them together): one missed daily run is a blip, two is a problem. */
export const STALE_HOURS = 50;
/** How far ahead a renewal starts being mentioned every morning. */
export const RENEWAL_DAYS = 14;
const MAX_EVENTS = 3;

/** The SAST calendar day of an instant. */
export function sastDay(instant: number | Date): string {
  return new Date(instant).toLocaleDateString('en-CA', { timeZone: TZ });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

/** "17:10". Taken from formatToParts rather than a locale string, which
 *  differs between Deno, Node and browsers — see CLAUDE.md. */
export function sastTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** "Tue 29 Sep", from the day itself — hand-rolled names, same reason. */
export function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function sportEmoji(sport: string): string {
  if (sport === 'rugby') return '🏉';
  if (sport === 'f1') return '🏎️';
  if (sport === 'cricket') return '🏏';
  if (sport === 'football' || sport === 'soccer') return '⚽';
  if (sport === 'mma' || sport === 'boxing') return '🥊';
  return '🏆';
}

function fixture(e: DigestEvent): string {
  const home = [e.homeFlag, e.home].filter(Boolean).join(' ');
  if (!e.away) return home;
  return `${home} vs ${[e.awayFlag, e.away].filter(Boolean).join(' ')}`;
}

/** Today's fixtures still to come, earliest first. */
export function eventLines(events: DigestEvent[], today: string, now: number): string[] {
  return events
    .filter(e => sastDay(Date.parse(e.date)) === today && Date.parse(e.date) > now)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, MAX_EVENTS)
    .map(e => `${sportEmoji(e.sport)} ${fixture(e)} · ${sastTime(e.date)}`);
}

export function releaseLines(releases: DigestTitle[]): string[] {
  return releases.map(r => `🎬 ${r.title} ${r.mediaType === 'show' ? 'starts' : 'is out'} today`);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "tomorrow", "in 11 days". Overdue is phrased per kind below: an expired
 *  disc and a late service are said differently. */
function ahead(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Due within RENEWAL_DAYS, or already overdue — the soonest first. */
export function renewalLines(renewals: DigestRenewal[], today: string): string[] {
  return renewals
    .map(r => ({ ...r, days: daysBetween(today, r.date) }))
    .filter(r => r.days <= RENEWAL_DAYS)
    .sort((a, b) => a.days - b.days)
    .map(r => {
      const late = r.days < 0 ? plural(-r.days, 'day') : null;
      switch (r.kind) {
        case 'disc':
          return late
            ? `🚗 ${r.subject}: licence disc expired ${late} ago`
            : `🚗 ${r.subject}: licence disc expires ${ahead(r.days)}`;
        case 'service':
          return late
            ? `🔧 ${r.subject}: service overdue by ${late}`
            : `🔧 ${r.subject}: service due ${ahead(r.days)}`;
        case 'licence':
          return late
            ? `🪪 ${r.subject}: driver's licence expired ${late} ago`
            : `🪪 ${r.subject}: driver's licence expires ${ahead(r.days)}`;
      }
    });
}

/** The shared staleness rule (packages/shared/src/sources.ts `staleSources`):
 *  switched on, and erroring, never run, or no clean run for STALE_HOURS. */
export function isStale(s: DigestSource, now: number): boolean {
  if (!s.enabled) return false;
  if (s.lastError) return true;
  if (!s.lastOkAt) return true;
  const ok = Date.parse(s.lastOkAt);
  if (Number.isNaN(ok)) return true;
  return ok < now - STALE_HOURS * 3600000;
}

/** A feed that stopped updating looks exactly like a quiet week in the app
 *  itself, so the morning summary is where it gets said out loud. */
export function staleLines(sources: DigestSource[], now: number): string[] {
  return sources
    .filter(s => isStale(s, now))
    .map(s => {
      if (s.lastError) return `⚠️ ${s.app}: ${s.label} sync is failing`;
      if (!s.lastOkAt) return `⚠️ ${s.app}: ${s.label} has never synced`;
      const days = Math.floor((now - Date.parse(s.lastOkAt)) / 86400000);
      if (Number.isNaN(days)) return `⚠️ ${s.app}: ${s.label} has no readable sync time`;
      return `⚠️ ${s.app}: ${s.label} hasn't updated in ${days} days`;
    });
}

/** The push, or null on a day with nothing to say. */
export function buildDigest(input: DigestInput): Digest | null {
  const lines = [
    ...eventLines(input.events, input.today, input.now),
    ...releaseLines(input.releases),
    ...renewalLines(input.renewals, input.today),
    ...staleLines(input.sources, input.now),
  ];
  if (lines.length === 0) return null;
  return { title: `Today · ${dayLabel(input.today)}`, body: lines.join('\n'), lines };
}
