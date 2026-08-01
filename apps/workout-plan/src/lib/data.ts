// Reads via public-read selects; writes via definer RPCs.
import { sb } from './supabase';
import type { BodyweightEntry, Exercise, Profile, Routine, RunEntry } from './config';

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
    .select('id, title, kind, subtitle, summary, est_minutes, sort_order, workout_routine_exercises(exercise_id, sort_order, target_sets, target_reps, note)')
    .order('sort_order');
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, kind: r.kind, subtitle: r.subtitle,
    summary: r.summary ?? '', estMinutes: r.est_minutes,
    exercises: (r.workout_routine_exercises ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((x: any) => ({ exerciseId: x.exercise_id, sets: x.target_sets, reps: x.target_reps, note: x.note })),
  }));
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

export const logBodyweight = (date: string, weight: number) =>
  rpc('workout_log_bodyweight', { p_date: date, p_weight: weight });

export const logRun = (date: string, seconds: number, location: string, note: string) =>
  rpc('workout_log_run', { p_date: date, p_seconds: seconds, p_location: location, p_note: note });

export const deleteRun = (date: string) =>
  rpc('workout_delete_run', { p_date: date });
