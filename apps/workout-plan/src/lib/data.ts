// Reads via public-read selects; writes via definer RPCs.
import { sb } from './supabase';
import type {
  BodyweightEntry, Exercise, LoggedSet, Profile, Routine, RunEntry,
} from './config';

export async function fetchProfile(): Promise<Profile | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client
    .from('workout_profile')
    .select('dob, height_cm, sex, goal, target_weight_kg, activity_factor')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    dob: data.dob,
    heightCm: data.height_cm,
    sex: data.sex,
    goal: data.goal,
    targetWeightKg: data.target_weight_kg,
    activityFactor: data.activity_factor,
  };
}

export async function fetchExercises(): Promise<Map<string, Exercise>> {
  const client = sb();
  const map = new Map<string, Exercise>();
  if (!client) return map;
  const { data } = await client
    .from('workout_exercises')
    .select('id, name, muscle, equipment, setting, image_url, instructions')
    .order('sort_order');
  for (const r of data ?? []) {
    map.set(r.id, {
      id: r.id, name: r.name, muscle: r.muscle, equipment: r.equipment,
      setting: r.setting, imageUrl: r.image_url, instructions: r.instructions,
    });
  }
  return map;
}

export async function fetchRoutines(): Promise<Routine[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_routines')
    .select('id, day, title, kind, subtitle, variant, sort_order, workout_routine_exercises(exercise_id, sort_order, target_sets, target_reps, note)')
    .order('sort_order');
  return (data ?? []).map((r: any) => ({
    id: r.id, day: r.day, title: r.title, kind: r.kind,
    subtitle: r.subtitle, variant: r.variant,
    exercises: (r.workout_routine_exercises ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((x: any) => ({ exerciseId: x.exercise_id, sets: x.target_sets, reps: x.target_reps, note: x.note })),
  }));
}

export async function fetchSets(date: string): Promise<LoggedSet[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_sets')
    .select('exercise_id, set_no, weight_kg, reps')
    .eq('set_date', date);
  return (data ?? []).map(r => ({
    exerciseId: r.exercise_id, setNo: r.set_no, weightKg: r.weight_kg, reps: r.reps,
  }));
}

/** Most recent prior-day sets for each exercise — the "last time" reference. */
export async function fetchLastSets(exerciseIds: string[], beforeDate: string): Promise<Map<string, LoggedSet[]>> {
  const client = sb();
  const out = new Map<string, LoggedSet[]>();
  if (!client || exerciseIds.length === 0) return out;
  const { data } = await client
    .from('workout_sets')
    .select('exercise_id, set_no, weight_kg, reps, set_date')
    .in('exercise_id', exerciseIds)
    .lt('set_date', beforeDate)
    .order('set_date', { ascending: false });
  const lastDateFor = new Map<string, string>();
  for (const r of data ?? []) {
    const seen = lastDateFor.get(r.exercise_id);
    if (seen && seen !== r.set_date) continue;   // only the single most recent date
    if (!seen) lastDateFor.set(r.exercise_id, r.set_date);
    const list = out.get(r.exercise_id) ?? [];
    list.push({ exerciseId: r.exercise_id, setNo: r.set_no, weightKg: r.weight_kg, reps: r.reps });
    out.set(r.exercise_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.setNo - b.setNo);
  return out;
}

/** All logged sets per exercise (for PBs on the Progress tab). */
export async function fetchAllSets(): Promise<Map<string, LoggedSet[]>> {
  const client = sb();
  const out = new Map<string, LoggedSet[]>();
  if (!client) return out;
  const { data } = await client
    .from('workout_sets')
    .select('exercise_id, set_no, weight_kg, reps');
  for (const r of data ?? []) {
    const list = out.get(r.exercise_id) ?? [];
    list.push({ exerciseId: r.exercise_id, setNo: r.set_no, weightKg: r.weight_kg, reps: r.reps });
    out.set(r.exercise_id, list);
  }
  return out;
}

export async function fetchBodyweights(): Promise<BodyweightEntry[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_bodyweight')
    .select('log_date, weight_kg')
    .order('log_date');
  return (data ?? []).map(r => ({ date: r.log_date, weightKg: r.weight_kg }));
}

export async function fetchRuns(): Promise<RunEntry[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_runs')
    .select('run_date, seconds, location, note')
    .order('run_date', { ascending: false });
  return (data ?? []).map(r => ({ date: r.run_date, seconds: r.seconds, location: r.location, note: r.note }));
}

export async function fetchSessionDates(): Promise<string[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client.from('workout_sessions').select('session_date');
  return (data ?? []).map(r => r.session_date as string);
}

export async function fetchCompletedRoutines(date: string): Promise<Set<string>> {
  const client = sb();
  const set = new Set<string>();
  if (!client) return set;
  const { data } = await client.from('workout_sessions').select('routine_id').eq('session_date', date);
  for (const r of data ?? []) if (r.routine_id) set.add(r.routine_id);
  return set;
}

// ---- writes ----

async function rpc(fn: string, args: Record<string, unknown>): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc(fn, args);
  return !error && data === true;
}

export const saveProfile = (p: Profile) =>
  rpc('workout_save_profile', {
    p_dob: p.dob, p_height: p.heightCm, p_sex: p.sex, p_goal: p.goal,
    p_target: p.targetWeightKg, p_activity: p.activityFactor,
  });

export const logSet = (date: string, exerciseId: string, setNo: number, weight: number | null, reps: number | null) =>
  rpc('workout_log_set', { p_date: date, p_exercise_id: exerciseId, p_set_no: setNo, p_weight: weight, p_reps: reps });

export const completeSession = (date: string, routineId: string, done: boolean) =>
  rpc('workout_complete_session', { p_date: date, p_routine_id: routineId, p_done: done });

export const logBodyweight = (date: string, weight: number) =>
  rpc('workout_log_bodyweight', { p_date: date, p_weight: weight });

export const logRun = (date: string, seconds: number, location: string, note: string) =>
  rpc('workout_log_run', { p_date: date, p_seconds: seconds, p_location: location, p_note: note });

export const deleteRun = (date: string) =>
  rpc('workout_delete_run', { p_date: date });
