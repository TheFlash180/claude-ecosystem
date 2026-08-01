// Workout Plan: types + athletic visual identity. Charcoal + volt green,
// Anton condensed display — a gym-poster feel, distinct from the other apps.

export type RoutineKind = 'home' | 'gym' | 'run' | 'mobility';
export type Setting = 'home' | 'gym' | 'both';
export type Goal = 'recomp' | 'cut' | 'build';

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  setting: Setting;
  imageUrl: string;
  instructions: string;
}

export interface RoutineExercise {
  exerciseId: string;
  sets: number;
  reps: string;
  note: string;
}

/** A workout *type* you can browse and follow — not a day of the week. */
export interface Routine {
  id: string;
  title: string;
  kind: RoutineKind;
  subtitle: string;
  summary: string;
  estMinutes: number | null;
  exercises: RoutineExercise[];
}

export interface Profile {
  dob: string | null;
  heightCm: number | null;
  sex: 'male' | 'female';
  goal: Goal;
  targetWeightKg: number | null;
  activityFactor: number;
}

export interface BodyweightEntry { date: string; weightKg: number; }
export interface RunEntry { date: string; seconds: number; location: string; note: string; }

export const GOAL_LABEL: Record<Goal, string> = {
  recomp: 'Recomp (lose fat + build)',
  cut: 'Lean out (fat loss)',
  build: 'Build muscle',
};

// Athletic palette — charcoal with a volt-green accent; each workout kind
// gets its own hue so the library reads at a glance.
export const W = {
  bg:      '#0E1013',
  surface: '#171A1F',
  raised:  '#1E222A',
  border:  '#2A2F38',
  text:    '#F2F4F7',
  sub:     '#AEB4BE',
  muted:   '#7C828C',
  volt:    '#C6F135',
  voltDim: '#8FAF1F',
  ink:     '#0E1013',   // text on a volt fill
  display: "'Anton', 'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};

export const KIND_META: Record<RoutineKind, { label: string; color: string }> = {
  home:     { label: 'Home',     color: '#C6F135' },
  gym:      { label: 'Gym',      color: '#4EA1FF' },
  run:      { label: 'Run',      color: '#FF6B35' },
  mobility: { label: 'Mobility', color: '#8C93A0' },
};

/** Library filter chips, in display order. */
export const KIND_ORDER: RoutineKind[] = ['home', 'gym', 'run', 'mobility'];
