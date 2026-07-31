// Matching events against watches, plus the date/distance helpers the cards
// use. Pure and unit-tested: this decides what you get told about, so a quiet
// bug here is a missed show.
import type { FrontRowEvent, Watch } from './config';

/** Great-circle distance in km. Clamped before acos because floating point can
 *  nudge the dot product just past 1 for two identical points, which would
 *  otherwise yield NaN and silently drop an event from every radius. */
export function distanceKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const rad = Math.PI / 180;
  const x = Math.sin(aLat * rad) * Math.sin(bLat * rad)
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLng - aLng) * rad);
  return 6371 * Math.acos(Math.min(1, Math.max(-1, x)));
}

/** Does this event satisfy the watch? A geo watch needs coordinates on both
 *  sides; an event with none is not "everywhere", it is unknown, so it fails. */
export function matchesWatch(event: FrontRowEvent, watch: Watch): boolean {
  if (!watch.enabled) return false;

  if (watch.kind === 'geo') {
    if (watch.lat === null || watch.lng === null || watch.radiusKm === null) return false;
    if (event.lat === null || event.lng === null) return false;
    return distanceKm(watch.lat, watch.lng, event.lat, event.lng) <= watch.radiusKm;
  }

  const term = (watch.term ?? '').trim().toLowerCase();
  if (term === '') return false;
  const haystack = [event.name, event.venueName, event.summary, ...event.categories]
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(term);
}

/** Events matching any enabled watch, soonest first. Undated events sort last
 *  rather than being dropped: a Montecasino run whose prose could not be parsed
 *  is still a real show, and hiding it would recreate the original problem. */
export function matchingEvents(events: FrontRowEvent[], watches: Watch[]): FrontRowEvent[] {
  const active = watches.filter(w => w.enabled);
  if (active.length === 0) return [];
  return events
    .filter(e => active.some(w => matchesWatch(e, w)))
    .sort(byStartThenName);
}

export function byStartThenName(a: FrontRowEvent, b: FrontRowEvent): number {
  if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
  if (a.startsAt) return -1;
  if (b.startsAt) return 1;
  return a.name.localeCompare(b.name);
}

/** Which of the given watches this event satisfies — used to label a card when
 *  more than one watch is active, so it is clear why something showed up. */
export function watchesMatching(event: FrontRowEvent, watches: Watch[]): Watch[] {
  return watches.filter(w => matchesWatch(event, w));
}

/** Anything listed within the last `days` is "just announced" — the moment
 *  tickets appear is the thing worth acting on. */
export function isNewlyListed(event: FrontRowEvent, days = 7, now = new Date()): boolean {
  if (!event.listedAt) return false;
  const t = Date.parse(event.listedAt);
  if (!Number.isFinite(t)) return false;
  return t >= now.getTime() - days * 86400000 && t <= now.getTime() + 86400000;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 4 Sep" / "4 Sep – 20 Sep" / the raw prose when there is no date. */
export function whenLabel(event: FrontRowEvent): string {
  if (!event.startsAt) return event.dateText ?? 'Date to be announced';
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return event.dateText ?? 'Date to be announced';

  const fmt = (d: Date) => `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
  // Read in SAST so an 19:00 show does not display as the previous day.
  const sast = (iso: string) => new Date(Date.parse(iso) + 2 * 3600000);
  const s = sast(event.startsAt);

  if (event.endsAt) {
    const e = sast(event.endsAt);
    if (e.getUTCFullYear() !== s.getUTCFullYear() || e.getUTCMonth() !== s.getUTCMonth()
        || e.getUTCDate() !== s.getUTCDate()) {
      return `${fmt(s)} – ${fmt(e)}`;
    }
  }
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.getUTCDay()];
  return `${weekday} ${fmt(s)}`;
}

export function priceLabel(priceFrom: number | null): string | null {
  if (priceFrom === null) return null;
  if (priceFrom <= 0) return 'Free';
  return `from R${Math.round(priceFrom)}`;
}
