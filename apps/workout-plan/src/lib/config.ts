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
  /** Non-null when the routine belongs to a programme, which keeps it out of
   *  the browsable library — the Workouts tab shows only programId === null. */
  programId: string | null;
  /** True for an AMRAP, where the round count is the point and beating it is
   *  the progression. Drives whether Log a score appears at all. */
  scored: boolean;
}

/** One attempt at a scored workout — "11 rounds + 7 reps" on a given day. */
export interface Benchmark {
  routineId: string;
  date: string;
  rounds: number;
  extraReps: number;
  note: string;
}

/** One session of a programme's weekly split. `gymRoutineId` is null for a
 *  session that is the same either way, and the UI then shows no toggle. */
export interface ProgramDay {
  dayIndex: number;
  label: string;
  homeRoutineId: string | null;
  gymRoutineId: string | null;
  note: string;
}

/** A block of weeks that share the same instruction — what changes between
 *  week 1 and week 12. */
export interface ProgramPhase {
  fromWeek: number;
  toWeek: number;
  title: string;
  guidance: string;
}

export interface Program {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  weeks: number;
  days: ProgramDay[];
  phases: ProgramPhase[];
}

export interface Profile {
  dob: string | null;
  heightCm: number | null;
  sex: 'male' | 'female';
  goal: Goal;
  targetWeightKg: number | null;
  activityFactor: number;
  /** The running programme, if any, and the day it started. The current week
   *  is derived from the start date — never stored — so there is nothing to
   *  advance by hand. */
  programId: string | null;
  programStartedOn: string | null;
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
