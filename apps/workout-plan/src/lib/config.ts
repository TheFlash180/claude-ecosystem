// Workout Plan: types + athletic visual identity. Charcoal + volt green,
// Anton condensed display — a gym-poster feel, distinct from the other apps.

export type RoutineKind = 'home' | 'gym' | 'sport' | 'run' | 'rest';
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

export interface Routine {
  id: string;
  day: number | null;   // 0 = Monday
  title: string;
  kind: RoutineKind;
  subtitle: string;
  variant: 'main' | 'fallback';
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

export interface LoggedSet {
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number;
}

export interface BodyweightEntry { date: string; weightKg: number; }
export interface RunEntry { date: string; seconds: number; location: string; note: string; }

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const GOAL_LABEL: Record<Goal, string> = {
  recomp: 'Recomp (lose fat + build)',
  cut: 'Lean out (fat loss)',
  build: 'Build muscle',
};

// Athletic palette — charcoal with a volt-green accent; each day-kind
// gets its own hue so the week reads at a glance.
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
  home:  { label: 'Home',   color: '#C6F135' },
  gym:   { label: 'Gym',    color: '#4EA1FF' },
  sport: { label: 'Sport',  color: '#FFB020' },
  run:   { label: 'Run',    color: '#FF6B35' },
  rest:  { label: 'Rest',   color: '#8C93A0' },
};
