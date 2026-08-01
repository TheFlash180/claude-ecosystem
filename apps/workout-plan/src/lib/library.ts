// Pure helpers for browsing the workout library. No React, no network.
import type { Exercise, Routine, RoutineExercise, RoutineKind } from './config';

export interface Step {
  plan: RoutineExercise;
  exercise: Exercise;
}

/** Resolve a routine's exercise ids against the catalogue, in routine order.
 *  An id with no matching exercise is dropped rather than rendered blank —
 *  the catalogue and the routines are separate tables and can drift. */
export function stepsOf(routine: Routine, exercises: Map<string, Exercise>): Step[] {
  const out: Step[] = [];
  for (const plan of routine.exercises) {
    const exercise = exercises.get(plan.exerciseId);
    if (exercise) out.push({ plan, exercise });
  }
  return out;
}

/** "3 × 10", or just the reps when there is a single set — a 30-second
 *  stretch reads as "30 sec", not "1 × 30 sec". */
export function prescription(plan: RoutineExercise): string {
  const reps = plan.reps.trim();
  if (plan.sets <= 1) return reps;
  return reps ? `${plan.sets} × ${reps}` : `${plan.sets} sets`;
}

/** Distinct muscles a routine hits, in the order they first come up. */
export function musclesOf(routine: Routine, exercises: Map<string, Exercise>): string[] {
  const seen: string[] = [];
  for (const { exercise } of stepsOf(routine, exercises)) {
    const m = exercise.muscle.trim();
    if (m && !seen.includes(m)) seen.push(m);
  }
  return seen;
}

/** Up to `n` demo photos from a routine — the strip on its library tile. */
export function thumbnails(routine: Routine, exercises: Map<string, Exercise>, n = 4): string[] {
  return stepsOf(routine, exercises)
    .map(s => s.exercise.imageUrl)
    .filter(url => url !== '')
    .slice(0, n);
}

export function filterRoutines(routines: Routine[], kind: RoutineKind | 'all'): Routine[] {
  return kind === 'all' ? routines : routines.filter(r => r.kind === kind);
}

export interface ExerciseFilter {
  search: string;
  muscle: string | 'all';
}

export const EMPTY_EXERCISE_FILTER: ExerciseFilter = { search: '', muscle: 'all' };

/** Search the catalogue by name, muscle or equipment — "what can I do with
 *  dumbbells" is as common a question as looking up a movement by name. */
export function searchExercises(exercises: Exercise[], f: ExerciseFilter): Exercise[] {
  const q = f.search.trim().toLowerCase();
  return exercises.filter(e => {
    if (f.muscle !== 'all' && e.muscle !== f.muscle) return false;
    if (!q) return true;
    return `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(q);
  });
}

/** Every muscle in the catalogue, alphabetical — the filter dropdown. */
export function muscleOptions(exercises: Exercise[]): string[] {
  const set = new Set<string>();
  for (const e of exercises) if (e.muscle.trim()) set.add(e.muscle.trim());
  return [...set].sort();
}

export function minutesLabel(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
