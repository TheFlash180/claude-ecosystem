// What is actually happening, assembled from the apps' own data.
//
// The hub used to be a launcher: eight tiles you had to remember to tap. Every
// fact below already existed in the database — this turns the front door into
// the one screen worth opening, and every card is a link into the app it came
// from rather than a second place to do the work.
//
// Pure: no React, no Supabase. `todayData.ts` does the fetching and hands the
// rows in already shaped.

/** SAST calendar day. Between midnight and 02:00 a UTC date is yesterday here,
 *  and every one of these cards is about "today". */
export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

/** Whole days between two yyyy-mm-dd days. Midday anchor, so no DST slip. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000,
  );
}

/** "Today" / "Tomorrow" / "Saturday" / "in 12 days". Named weekdays inside the
 *  week read better than a count — "Saturday" is when you would actually watch
 *  it, "in 4 days" makes you work it out. */
export function relativeDay(day: string, today = sastDay()): string {
  const diff = daysBetween(today, day);
  if (diff < 0) return 'past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-ZA', {
      weekday: 'long', timeZone: 'UTC',
    });
  }
  return `in ${diff} days`;
}

/** The SAST calendar day and clock time of an instant. */
export function sastParts(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }),
    time: d.toLocaleTimeString('en-ZA', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
    }),
  };
}

/** South African convention: space for thousands, and a non-breaking one so a
 *  price never wraps between "R4" and "499". Matches price-watch's
 *  `formatRand`, which is hand-rolled because toLocaleString disagrees with
 *  itself across Node, browsers and Deno — and these cards render alongside
 *  prices that app formatted. Cents are dropped: a card wants the round
 *  number. */
export function formatRand(v: number): string {
  const whole = Math.round(v);
  return `R${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

export interface TodayCard {
  key: string;
  /** App slug, so the card picks up that app's colour and icon. */
  slug: string;
  label: string;
  headline: string;
  detail: string;
  href: string;
  /** Happening today or tomorrow — worth pulling the eye. */
  urgent?: boolean;
}

// ---- inputs ----

export interface SportRow {
  sport: string; competition: string;
  home: string; away: string | null;
  homeFlag: string; awayFlag: string | null;
  date: string; venue: string | null;
}

export interface TrainingInput {
  title: string;
  weeks: number;
  startedOn: string | null;
  dayLabels: string[];
}

export interface CookRow { name: string; emoji: string | null }
export interface MarvelRow { title: string; releaseDate: string; mediaType: string }
export interface PriceRow { title: string; latest: number; lowest: number; points: number }
export interface BabyRow { name: string | null; dueDate: string; weekAnchor: string | null }
export interface RegistryCounts { items: number; claims: number }

export interface TodayInput {
  sport: SportRow[];
  training: TrainingInput | null;
  cook: CookRow[];
  marvel: MarvelRow[];
  prices: PriceRow[];
  baby: BabyRow | null;
  registry: RegistryCounts | null;
}

// ---- cards ----

const APP = {
  sport: './sport-watch/',
  workout: './workout-plan/',
  meal: './meal-prep/',
  marvel: './marvel-watch/',
  price: './price-watch/',
  baby: './baby-logger/',
  registry: 'https://theflash180.github.io/baby-registry-pwa/',
};

function fixtureName(e: SportRow): string {
  const home = [e.homeFlag, e.home].filter(Boolean).join(' ');
  if (!e.away) return home;
  return `${home} vs ${[e.awayFlag, e.away].filter(Boolean).join(' ')}`;
}

/** The next thing on, whatever the sport. Anything already started is the
 *  caller's problem — it filters to future events. */
export function sportCard(events: SportRow[], today = sastDay()): TodayCard | null {
  const next = events[0];
  if (!next) return null;
  const { day, time } = sastParts(next.date);
  const when = relativeDay(day, today);
  return {
    key: 'sport',
    slug: 'sport-watch',
    label: 'Next up',
    headline: fixtureName(next),
    detail: `${when} · ${time} SAST · ${next.competition}`,
    href: APP.sport,
    urgent: when === 'Today' || when === 'Tomorrow',
  };
}

/** Where the running programme has got to.
 *
 *  Week is derived from the start date, never stored — the same rule the
 *  Plan tab uses (workout-plan's `programProgress` is the canonical copy).
 *  Sessions are listed rather than picked: the programme says how many times
 *  a week, not which weekday, so naming "today's session" would be a fiction.
 */
export function trainingCard(t: TrainingInput | null, today = sastDay()): TodayCard | null {
  if (!t || !t.startedOn || t.weeks <= 0) return null;
  const elapsed = daysBetween(t.startedOn, today);
  if (elapsed < 0) return null; // scheduled, not started

  const rawWeek = Math.floor(elapsed / 7) + 1;
  const week = Math.min(rawWeek, t.weeks);
  const done = rawWeek > t.weeks;

  return {
    key: 'training',
    slug: 'workout-plan',
    label: 'Training',
    headline: done ? `${t.title} · finished` : `${t.title} · week ${week} of ${t.weeks}`,
    detail: done
      ? 'Programme complete — pick the next one'
      : t.dayLabels.length > 0 ? t.dayLabels.join(' · ') : 'This week’s sessions',
    href: APP.workout,
  };
}

/** Only when something is queued. An empty cook list is not news. */
export function cookCard(cook: CookRow[]): TodayCard | null {
  if (cook.length === 0) return null;
  const names = cook.map(c => [c.emoji, c.name].filter(Boolean).join(' '));
  return {
    key: 'cook',
    slug: 'meal-prep',
    label: 'On the cook list',
    headline: names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : ''),
    detail: `${cook.length} recipe${cook.length === 1 ? '' : 's'} queued · shopping list ready`,
    href: APP.meal,
  };
}

export function marvelCard(titles: MarvelRow[], today = sastDay()): TodayCard | null {
  const next = titles[0];
  if (!next) return null;
  const when = relativeDay(next.releaseDate, today);
  return {
    key: 'marvel',
    slug: 'marvel-watch',
    label: 'Landing next',
    headline: next.title,
    detail: `${when} · ${next.mediaType === 'show' ? 'series' : 'film'}`,
    href: APP.marvel,
    urgent: when === 'Today' || when === 'Tomorrow',
  };
}

/** A tracked product sitting at the lowest price ever seen for it.
 *
 *  A single price point is not a low — it is the only reading there is, which
 *  would make every newly tracked product look like a bargain. */
export function priceCard(prices: PriceRow[]): TodayCard | null {
  const atLow = prices.filter(p => p.points > 1 && p.latest <= p.lowest);
  if (atLow.length === 0) return null;
  const first = atLow[0];
  return {
    key: 'price',
    slug: 'price-watch',
    label: 'At its lowest',
    headline: first.title,
    detail: atLow.length > 1
      ? `${formatRand(first.latest)} · and ${atLow.length - 1} more at a low`
      : `${formatRand(first.latest)} · lowest seen`,
    href: APP.price,
  };
}

/** Weeks and the countdown.
 *
 *  Mirrors baby-logger's `getPregnancyInfo`: the clinic-set `week_anchor`
 *  wins for the week count because a scan dates a pregnancy a few days off
 *  naive 280-days-before-due arithmetic, while the countdown stays on the due
 *  date. Keep the two in step if either changes. */
export function babyCard(baby: BabyRow | null, today = sastDay()): TodayCard | null {
  if (!baby?.dueDate) return null;
  const daysUntilDue = daysBetween(today, baby.dueDate);
  const daysPregnant = baby.weekAnchor
    ? daysBetween(baby.weekAnchor, today)
    : 280 - daysUntilDue;
  const weeks = Math.floor(daysPregnant / 7);
  const into = daysPregnant % 7;

  return {
    key: 'baby',
    slug: 'baby-logger',
    label: baby.name ? baby.name : 'Baby',
    headline: `Week ${weeks}${into > 0 ? ` + ${into}d` : ''}`,
    detail: daysUntilDue > 0
      ? `${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} to go`
      : daysUntilDue === 0 ? 'Due today' : `${-daysUntilDue} days past the due date`,
    href: APP.baby,
    urgent: daysUntilDue <= 14,
  };
}

export function registryCard(r: RegistryCounts | null): TodayCard | null {
  if (!r || r.items === 0) return null;
  const left = r.items - r.claims;
  return {
    key: 'registry',
    slug: 'baby-registry',
    label: 'Registry',
    headline: `${r.claims} of ${r.items} claimed`,
    detail: left > 0 ? `${left} still unclaimed` : 'Everything claimed',
    href: APP.registry,
  };
}

/** The whole surface, in the order it reads. Cards with nothing to say return
 *  null and simply do not appear — a quiet day should be a short screen, not a
 *  wall of "nothing yet". */
export function buildToday(input: TodayInput, today = sastDay()): TodayCard[] {
  return [
    sportCard(input.sport, today),
    trainingCard(input.training, today),
    babyCard(input.baby, today),
    cookCard(input.cook),
    priceCard(input.prices),
    marvelCard(input.marvel, today),
    registryCard(input.registry),
  ].filter((c): c is TodayCard => c !== null);
}
