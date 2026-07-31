// Parsing run dates out of prose.
//
// Montecasino's WordPress API exposes titles and body copy but not its ACF
// date fields, so a show's run only exists as English text inside the blurb:
// "returns bigger than ever to the Teatro stage from 4 to 20 September".
//
// This is deliberately conservative. It returns null rather than guessing,
// because a wrong date here becomes a wrong push and a missed show — the exact
// failure the app exists to prevent. Anything it cannot read is kept as the
// original text and shown to the reader as-is.
//
// NOTE: sync-frontrow carries an identical copy (edge functions cannot import
// from the app). If you change one, change both.

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8,
  oct: 9, nov: 10, dec: 11,
};

const MONTH_RE = Object.keys(MONTHS).join("|");

export interface ShowRun {
  /** ISO date of the first performance, or null when unreadable. */
  start: string | null;
  /** ISO date of the last performance, when a range was given. */
  end: string | null;
  /** The phrase this came from, for display when start is null. */
  text: string | null;
}

function iso(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month, day, 12));
  // Rejects 31 February and friends: the Date would silently roll into March.
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** A month with no year means the next time that month comes round. Shows are
 *  advertised months ahead, never in the past, so an already-passed month is
 *  next year's. A small grace window keeps a run that started last week from
 *  jumping twelve months forward. */
function inferYear(month: number, day: number, today: Date): number {
  const year = today.getUTCFullYear();
  const candidate = Date.UTC(year, month, day, 12);
  const grace = today.getTime() - 21 * 86400000;
  return candidate >= grace ? year : year + 1;
}

/**
 * Pull a run out of a blurb. Handles the shapes Montecasino actually uses:
 *   "from 4 to 20 September"      "4 - 20 September 2026"
 *   "on 12 October"               "12 October 2026"
 *   "4 September to 20 October"   (range spanning two months)
 */
export function parseShowRun(text: string | null | undefined, today = new Date()): ShowRun {
  if (!text) return { start: null, end: null, text: null };
  const s = String(text).replace(/\s+/g, " ");

  // 4 September to 20 October [2026] — range across two months
  const across = new RegExp(
    `(\\d{1,2})\\s+(${MONTH_RE})\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})\\s+(${MONTH_RE})\\s*(\\d{4})?`,
    "i",
  ).exec(s);
  if (across) {
    const [, d1, m1, d2, m2, y] = across;
    const mo1 = MONTHS[m1.toLowerCase()];
    const mo2 = MONTHS[m2.toLowerCase()];
    const year = y ? Number(y) : inferYear(mo1, Number(d1), today);
    const start = iso(year, mo1, Number(d1));
    // A range ending in an earlier month has crossed into the next year.
    const end = iso(mo2 < mo1 ? year + 1 : year, mo2, Number(d2));
    if (start) return { start, end, text: across[0] };
  }

  // 4 to 20 September [2026] — range inside one month
  const within = new RegExp(
    `(\\d{1,2})\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})\\s+(${MONTH_RE})\\s*(\\d{4})?`,
    "i",
  ).exec(s);
  if (within) {
    const [, d1, d2, m, y] = within;
    const mo = MONTHS[m.toLowerCase()];
    const year = y ? Number(y) : inferYear(mo, Number(d1), today);
    const start = iso(year, mo, Number(d1));
    const end = iso(year, mo, Number(d2));
    if (start) return { start, end, text: within[0] };
  }

  // 12 October [2026] — a single date
  const single = new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})\\s*(\\d{4})?`, "i").exec(s);
  if (single) {
    const [, d, m, y] = single;
    const mo = MONTHS[m.toLowerCase()];
    const year = y ? Number(y) : inferYear(mo, Number(d), today);
    const start = iso(year, mo, Number(d));
    if (start) return { start, end: null, text: single[0] };
  }

  return { start: null, end: null, text: null };
}
