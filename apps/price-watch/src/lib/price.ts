// The reasoning layer. Kept free of React and Supabase so every rule here is
// directly testable — these functions decide what the user is told about a
// price, and getting them wrong means telling someone a bad deal is a good one.
import type { PricePoint } from './config';

/** Formatted by hand rather than with toLocaleString('en-ZA'), because that
 *  is not portable: Node's ICU groups with a non-breaking space (R1 749)
 *  while browsers group with a comma (R1,749), and the notifier runs on Deno
 *  — a third answer. Prices appear in the app, in push text and in tests, and
 *  all three have to agree. This is the South African convention: space for
 *  thousands, comma for cents. */
export function formatRand(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';

  const negative = v < 0;
  const abs = Math.abs(v);
  // Whole rands read better on a card; cents only appear when they exist.
  const cents = Math.round(abs * 100) % 100;
  const whole = cents === 0 ? Math.round(abs) : Math.floor(abs);

  // U+00A0 so a price never wraps between "R1" and "749" at a line end.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const tail = cents === 0 ? '' : ',' + String(cents).padStart(2, '0');
  return `${negative ? '-' : ''}R${grouped}${tail}`;
}

/** Oldest → newest. Everything below assumes this order, so it is enforced
 *  here rather than trusted from the caller. */
export function sortPoints(points: PricePoint[]): PricePoint[] {
  return [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function latest(points: PricePoint[]): PricePoint | null {
  const s = sortPoints(points);
  return s.length ? s[s.length - 1] : null;
}

/** The series is sparse — a row is written only when something changed — so
 *  the price on any given day is the last observation at or before it, not an
 *  interpolation between neighbours. */
export function priceOn(points: PricePoint[], when: Date | string): number | null {
  const t = typeof when === 'string' ? Date.parse(when) : when.getTime();
  if (!Number.isFinite(t)) return null;
  let found: number | null = null;
  for (const p of sortPoints(points)) {
    if (Date.parse(p.at) <= t) found = p.price;
    else break;
  }
  return found;
}

export interface PriceStats {
  current: number | null;
  lowest: number | null;
  highest: number | null;
  /** Time-weighted: a price held for 300 days should dominate one held for a
   *  day, which a plain median over a sparse series gets badly wrong. */
  typical: number | null;
  observations: number;
  /** Days between the first observation and now. */
  spanDays: number;
  /** How long the current price has been in effect. */
  daysAtCurrent: number;
}

const DAY = 86400000;

export function stats(points: PricePoint[], now: Date = new Date()): PriceStats {
  const s = sortPoints(points);
  const empty: PriceStats = {
    current: null, lowest: null, highest: null, typical: null,
    observations: 0, spanDays: 0, daysAtCurrent: 0,
  };
  if (s.length === 0) return empty;

  const nowMs = now.getTime();
  const prices = s.map(p => p.price);
  const current = prices[prices.length - 1];

  // Weight each price by how long it was in force, so "typical" describes what
  // you would actually have paid on a random day rather than what the retailer
  // happened to flick through during a one-day sale.
  const weighted: { price: number; days: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const from = Date.parse(s[i].at);
    const to = i + 1 < s.length ? Date.parse(s[i + 1].at) : nowMs;
    weighted.push({ price: s[i].price, days: Math.max(0, (to - from) / DAY) });
  }

  const totalDays = weighted.reduce((a, w) => a + w.days, 0);
  let typical: number;
  if (totalDays <= 0) {
    typical = current;
  } else {
    // Weighted median: the price in force at the midpoint of observed time.
    const byPrice = [...weighted].sort((a, b) => a.price - b.price);
    let acc = 0;
    typical = byPrice[byPrice.length - 1].price;
    for (const w of byPrice) {
      acc += w.days;
      if (acc >= totalDays / 2) { typical = w.price; break; }
    }
  }

  return {
    current,
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    typical,
    observations: s.length,
    spanDays: (nowMs - Date.parse(s[0].at)) / DAY,
    daysAtCurrent: Math.max(0, (nowMs - Date.parse(s[s.length - 1].at)) / DAY),
  };
}

export type Verdict = 'lowest' | 'good' | 'typical' | 'high' | 'unknown';

export interface Assessment {
  verdict: Verdict;
  label: string;
  /** Plain-language reason, shown under the badge. */
  detail: string;
  /** True when the retailer advertises a saving that our own history says has
   *  effectively always been there. */
  fakeDiscount: boolean;
}

/** Below this much history, we say we don't know rather than guessing. A
 *  verdict from three days of data is worse than no verdict, because it gets
 *  believed. */
const MIN_DAYS = 14;
const MIN_OBSERVATIONS = 2;

export function assess(points: PricePoint[], now: Date = new Date()): Assessment {
  const st = stats(points, now);

  if (st.current === null || st.observations < MIN_OBSERVATIONS || st.spanDays < MIN_DAYS) {
    const need = Math.max(0, Math.ceil(MIN_DAYS - st.spanDays));
    return {
      verdict: 'unknown',
      label: 'Learning',
      detail: st.current === null
        ? 'No price recorded yet.'
        : `Still building history — about ${need} more day${need === 1 ? '' : 's'} before this price can be judged.`,
      fakeDiscount: false,
    };
  }

  const { current, lowest, highest, typical } = st;
  const claimed = latest(points)?.listingPrice ?? null;

  // A "saving" is fake when the price has sat at or above today's level for
  // essentially the whole record — the discount is the permanent state.
  const fakeDiscount =
    claimed !== null && claimed > current! &&
    typical !== null && current! >= typical &&
    st.spanDays >= 30;

  const range = (highest ?? 0) - (lowest ?? 0);
  // A flat record is not a narrow-range record — it means the price never
  // moved, and calling that "the lowest ever" would be misleading.
  if (range <= 0) {
    return {
      verdict: 'typical',
      label: 'Unchanged',
      detail: `Has stayed at ${formatRand(current)} for ${Math.round(st.spanDays)} days.`,
      fakeDiscount,
    };
  }

  const position = (current! - lowest!) / range; // 0 = cheapest seen, 1 = dearest

  if (current! <= lowest!) {
    return {
      verdict: 'lowest',
      label: 'Lowest yet',
      detail: `Cheapest in the ${Math.round(st.spanDays)} days tracked.`,
      fakeDiscount,
    };
  }
  if (position <= 0.25) {
    return {
      verdict: 'good',
      label: 'Good price',
      detail: `${formatRand(current! - lowest!)} above the lowest seen (${formatRand(lowest)}).`,
      fakeDiscount,
    };
  }
  if (position >= 0.75) {
    return {
      verdict: 'high',
      label: 'Pricey',
      detail: `Near its highest — usually around ${formatRand(typical)}.`,
      fakeDiscount,
    };
  }
  return {
    verdict: 'typical',
    label: 'Typical',
    detail: `Usually around ${formatRand(typical)}.`,
    fakeDiscount,
  };
}

export interface Change {
  from: number;
  to: number;
  delta: number;
  /** Negative for a drop. */
  pct: number;
  direction: 'down' | 'up' | 'flat';
}

/** The most recent movement, or null if the price has only ever been observed
 *  at one level. */
export function lastChange(points: PricePoint[]): Change | null {
  const s = sortPoints(points);
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i].price !== s[i - 1].price) return change(s[i - 1].price, s[i].price);
  }
  return null;
}

export function change(from: number, to: number): Change {
  const delta = to - from;
  return {
    from, to, delta,
    // A change from zero has no meaningful percentage; report the rand move
    // instead of dividing by zero and rendering "Infinity% off".
    pct: from === 0 ? 0 : (delta / from) * 100,
    direction: delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat',
  };
}

/** Points for a sparkline, in step form, normalised to a 0..1 box.
 *  Returns [] rather than a degenerate path when there is nothing to draw. */
export function sparkline(
  points: PricePoint[],
  now: Date = new Date(),
): { x: number; y: number }[] {
  const s = sortPoints(points);
  if (s.length < 2) return [];

  const t0 = Date.parse(s[0].at);
  const t1 = now.getTime();
  const span = t1 - t0;
  if (span <= 0) return [];

  const prices = s.map(p => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const range = hi - lo;

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const x = (Date.parse(s[i].at) - t0) / span;
    // y is inverted for SVG: 0 is the top, so the highest price sits highest.
    // A flat series pins to the middle rather than dividing by a zero range.
    const y = range === 0 ? 0.5 : 1 - (s[i].price - lo) / range;
    // Step, not slope: the price held until the next observation.
    if (i > 0) out.push({ x, y: out[out.length - 1].y });
    out.push({ x, y });
  }
  // Carry the final price across to "now" so the line reaches the right edge.
  out.push({ x: 1, y: out[out.length - 1].y });
  return out;
}

/** What the notifier decides on. Kept here so the app and the edge function
 *  can be reasoned about together, and so it is covered by these tests. */
export interface AlertInput {
  previous: number | null;
  current: number;
  targetPrice: number | null;
  wasInStock: boolean;
  inStock: boolean;
}

export type AlertKind = 'target' | 'drop' | 'restock' | null;

/** Ignore trivial moves. A R3 wobble on a R7 000 laptop is noise, and an app
 *  that pushes noise gets its notifications turned off. */
const MIN_DROP_PCT = 3;
const MIN_DROP_RAND = 20;

export function alertFor(i: AlertInput): AlertKind {
  // Out of stock is not a price event, and a retailer zeroing a price on
  // delist must never read as the bargain of the century.
  if (!i.inStock || i.current <= 0) return null;

  if (i.targetPrice !== null && i.current <= i.targetPrice) {
    // Only fire when it has just crossed, otherwise a product sitting below
    // target re-alerts every single day.
    if (i.previous === null || i.previous > i.targetPrice) return 'target';
  }

  if (!i.wasInStock && i.inStock) return 'restock';

  if (i.previous !== null && i.current < i.previous) {
    const c = change(i.previous, i.current);
    if (Math.abs(c.pct) >= MIN_DROP_PCT && Math.abs(c.delta) >= MIN_DROP_RAND) return 'drop';
  }
  return null;
}

/** Takealot product URLs carry the id in the last path segment, e.g.
 *  .../some-slug/PLID100228371. Accepts a bare PLID or id too, so pasting
 *  from anywhere in the app works. */
export function parseTakealotId(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;

  const fromUrl = text.match(/PLID(\d+)/i);
  if (fromUrl) return `PLID${fromUrl[1]}`;

  if (/^\d{4,12}$/.test(text)) return `PLID${text}`;
  return null;
}
