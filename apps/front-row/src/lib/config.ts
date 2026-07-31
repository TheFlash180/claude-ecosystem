// Front Row: types + visual identity. Its own look again — ink and magenta,
// distinct from Sport Watch's green, Marvel's crimson and Glovebox's blue.

export interface FrontRowEvent {
  id: string;
  source: string;
  name: string;
  url: string | null;
  imageUrl: string | null;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Human run text, shown when startsAt could not be parsed. */
  dateText: string | null;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  categories: string[];
  priceFrom: number | null;
  /** When the source first listed it — the "tickets are on sale" signal. */
  listedAt: string | null;
}

export type WatchKind = 'geo' | 'keyword';

export interface Watch {
  id: string;
  label: string;
  kind: WatchKind;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  term: string | null;
  enabled: boolean;
}

export interface SourceHealth {
  key: string;
  label: string;
  enabled: boolean;
  lastOkAt: string | null;
  lastError: string | null;
  lastCount: number | null;
}

export const F = {
  bg:      '#0B0A12',
  surface: '#16131F',
  raised:  '#1E1929',
  border:  '#2C2539',
  text:    '#F3EFF7',
  sub:     '#B3A9C2',
  muted:   '#7E7391',
  pink:    '#EC4899',
  gold:    '#E8B04B',
  green:   '#46B27E',
  red:     '#E2574C',
  display: "'Sora', 'Inter', sans-serif",
  body:    "'Inter', sans-serif",
};

/** Montecasino, Fourways — the default watch. */
export const MONTECASINO = { lat: -26.0256, lng: 27.9989 };

export const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];
