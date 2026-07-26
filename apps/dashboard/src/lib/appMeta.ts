/** Per-app identity for the hub tiles. Each colour is lifted from the app's
 *  own theme, so the tile you tap matches the app you land in — that colour
 *  match is what makes the grid scannable instead of a wall of grey boxes.
 *
 *  `icon` is a key rather than a component so this module stays free of JSX
 *  and can be unit-tested; App.tsx maps the key to a lucide icon. */
export type IconKey =
  | 'baby' | 'film' | 'chef' | 'trophy' | 'dumbbell'
  | 'wallet' | 'gift' | 'car' | 'app';

export interface AppMeta {
  color: string;
  icon: IconKey;
  note: string;
}

const META: Record<string, AppMeta> = {
  'baby-logger':  { color: '#E07A7A', icon: 'baby',     note: 'feeds, sleep & nappies' },
  'marvel-watch': { color: '#E23636', icon: 'film',     note: 'what lands when' },
  'meal-prep':    { color: '#C4572E', icon: 'chef',     note: 'plan & shopping list' },
  'sport-watch':  { color: '#3AA864', icon: 'trophy',   note: 'fixtures & reminders' },
  'workout-plan': { color: '#C6F135', icon: 'dumbbell', note: 'training & progress' },
  'fintrack-pro': { color: '#2DD4BF', icon: 'wallet',   note: 'household finance' },
  'baby-registry':{ color: '#D9A441', icon: 'gift',     note: 'gifts & claims' },
  'glovebox':     { color: '#5B8DEF', icon: 'car',      note: 'licence, disc & services' },
};

export interface PlannedApp {
  slug: string;
  name: string;
}

/** Apps on the roadmap, shown as non-interactive tiles so the plan is visible
 *  without pretending the app exists. Adding one is a single entry here plus
 *  its META row — the tile picks up colour and icon like any other, and the
 *  test below fails if the META row is forgotten. */
export const COMING_SOON: PlannedApp[] = [
  { slug: 'glovebox', name: 'Glovebox' },
];

/** Unknown slugs still get a usable tile: a newly deployed app should look
 *  deliberate rather than broken while its entry is being added. */
export const FALLBACK_META: AppMeta = {
  color: '#8B93A5',
  icon: 'app',
  note: 'open app',
};

export function metaFor(slug: string): AppMeta {
  // hasOwn, not `??`: slugs come from build-injected JSON, and a plain object
  // literal inherits from Object.prototype — so META['constructor'] would
  // otherwise hand back the Object function instead of the fallback.
  return Object.hasOwn(META, slug) ? META[slug] : FALLBACK_META;
}

/** "Good morning" / "Good afternoon" / "Good evening" for the hero line.
 *  Hour is injectable so the boundaries can be tested without faking clocks. */
export function greeting(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
