// Shared types + visual config for SA Sport Watch.

/** Sport categories live in the sport_categories table (manageable from the
 *  admin page); these built-ins are the offline/dev fallback. */
export type SportKey = string;

export interface Category {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  liveMinutes: number;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'rugby',    label: 'Rugby',    icon: '🏉',  color: '#3AA864', bg: '#061B0E', liveMinutes: 120, sortOrder: 1 },
  { key: 'mma',      label: 'MMA',      icon: '🥋',  color: '#D44040', bg: '#1C0606', liveMinutes: 300, sortOrder: 2 },
  { key: 'f1',       label: 'F1',       icon: '🏎️', color: '#E0762F', bg: '#1C0F06', liveMinutes: 120, sortOrder: 3 },
  { key: 'boxing',   label: 'Boxing',   icon: '🥊',  color: '#C9A227', bg: '#1B1504', liveMinutes: 300, sortOrder: 4 },
  { key: 'football', label: 'Football', icon: '⚽',  color: '#4A9ED4', bg: '#06131C', liveMinutes: 120, sortOrder: 5 },
];

export type CatMap = Record<string, Category>;

export function toCatMap(list: Category[]): CatMap {
  return Object.fromEntries(list.map((c) => [c.key, c]));
}

/** Never let an unknown sport key crash the render — fall back to a
 *  neutral badge so a mid-edit category still displays. */
export function catOf(cats: CatMap, key: string): Category {
  return cats[key] ?? { key, label: key, icon: '🏅', color: '#8A948A', bg: '#0C120C', liveMinutes: 120, sortOrder: 99 };
}

export interface SportEvent {
  id: string;
  sport: SportKey;
  competition: string;
  home: string;
  away: string | null;
  homeFlag: string;
  awayFlag: string | null;
  date: Date | null;
  venue?: string;
  result?: string;
  note?: string;
  channel?: string;
  watchUrl?: string;
  isConditional?: boolean;
  isSpecial?: boolean;
  dateTBC?: boolean;
}

/** "🇿🇦 Springboks" — but never the string "null" when a flag was left out. */
export function flagName(flag: string | null | undefined, name: string): string {
  return [flag, name].filter(Boolean).join(' ');
}

/** "🇿🇦 Springboks vs 🇳🇿 All Blacks" (flags optional). */
export function matchTitle(ev: Pick<SportEvent, 'home' | 'away' | 'homeFlag' | 'awayFlag'>): string {
  const home = flagName(ev.homeFlag, ev.home);
  return ev.away ? `${home} vs ${flagName(ev.awayFlag, ev.away)}` : home;
}

// Palette. `sub` and `muted` were lifted substantially — dates/times were
// nearly invisible on OLED phones at the old #4A524A.
export const S = {
  bg:      "#080C09",
  surface: "#121913",
  border:  "#242E24",
  text:    "#F2F0E9",
  sub:     "#A7B2A4",   // secondary: dates, times — must be readable at a glance
  muted:   "#7E8A7C",   // tertiary: venues, labels
  dim:     "#4A544A",   // disabled / decorative
  display: "'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};
