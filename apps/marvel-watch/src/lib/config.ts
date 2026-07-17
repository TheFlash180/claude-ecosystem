// Marvel Watch: types + visual identity. Deliberately NOT the Sport Watch
// look — cinematic crimson/gold on a deep violet-black, Bebas Neue display.

export type MediaType = 'movie' | 'show';
export type Universe = 'mcu' | 'sony' | 'other';

export interface Title {
  id: string;
  mediaType: MediaType;
  title: string;
  releaseDate: string | null; // yyyy-mm-dd, null = TBA
  dateTbc: boolean;
  universe: Universe;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  watchOn?: string;
  isSpecial: boolean;
  manual: boolean;
}

export const UNIVERSE_LABEL: Record<Universe, string> = {
  mcu: 'MCU',
  sony: 'Sony',
  other: 'Marvel',
};

export const M = {
  bg:      '#0A0910',
  surface: '#15121D',
  raised:  '#1C1826',
  border:  '#2A2438',
  text:    '#F4F1EA',
  sub:     '#B4ADC4',
  muted:   '#867F98',
  crimson: '#E23636',
  crimsonDark: '#8E1A1A',
  gold:    '#F0B429',
  blue:    '#5B8DEF',
  display: "'Bebas Neue', 'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};

/** Stackable reminder leads, in days before release. */
export const LEAD_DAYS = [
  { days: 7, label: '1 week before' },
  { days: 3, label: '3 days before' },
  { days: 1, label: '1 day before' },
];
