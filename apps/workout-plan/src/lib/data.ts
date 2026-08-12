// Reads via public-read selects; writes via definer RPCs.
import { sb } from './supabase';
import type { Benchmark, BodyweightEntry, Exercise, Profile, Program, Routine, RunEntry } from './config';

export async function fetchProfile(): Promise<Profile | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client
    .from('workout_profile')
    .select('dob, height_cm, sex, goal, target_weight_kg, activity_factor, program_id, program_started_on')
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
    programId: data.program_id ?? null,
    programStartedOn: data.program_started_on ?? null,
  };
}

export async function fetchPrograms(): Promise<Program[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_programs')
    .select(
      'id, title, subtitle, summary, weeks, sort_order,' +
      'workout_program_days(day_index, label, home_routine_id, gym_routine_id, note),' +
      'workout_program_phases(from_week, to_week, title, guidance)',
    )
    .order('sort_order');
  return (data ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle ?? '',
    summary: p.summary ?? '',
    weeks: p.weeks,
    days: (p.workout_program_days ?? [])
      .slice()
      .sort((a: any, b: any) => a.day_index - b.day_index)
      .map((d: any) => ({
        dayIndex: d.day_index,
        label: d.label,
        homeRoutineId: d.home_routine_id ?? null,
        gymRoutineId: d.gym_routine_id ?? null,
        note: d.note ?? '',
      })),
    phases: (p.workout_program_phases ?? [])
      .slice()
      .sort((a: any, b: any) => a.from_week - b.from_week)
      .map((f: any) => ({
        fromWeek: f.from_week, toWeek: f.to_week, title: f.title, guidance: f.guidance ?? '',
      })),
  }));
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
    .select('id, title, kind, subtitle, summary, est_minutes, sort_order, program_id, scored, workout_routine_exercises(exercise_id, sort_order, target_sets, target_reps, note)')
    .order('sort_order');
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, kind: r.kind, subtitle: r.subtitle,
    summary: r.summary ?? '', estMinutes: r.est_minutes,
    programId: r.program_id ?? null,
    scored: r.scored === true,
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

export async function fetchBenchmarks(): Promise<Benchmark[]> {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('workout_benchmarks')
    .select('routine_id, log_date, rounds, extra_reps, note')
    .order('log_date', { ascending: false });
  return (data ?? []).map(r => ({
    routineId: r.routine_id, date: r.log_date,
    rounds: r.rounds, extraReps: r.extra_reps, note: r.note ?? '',
  }));
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

export const logBenchmark = (
  routineId: string, date: string, rounds: number, reps: number, note: string,
) => rpc('workout_log_benchmark', {
  p_routine_id: routineId, p_date: date, p_rounds: rounds, p_reps: reps, p_note: note,
});

export const deleteBenchmark = (routineId: string, date: string) =>
  rpc('workout_delete_benchmark', { p_routine_id: routineId, p_date: date });

/** Start a programme (null start = today in SAST, decided server-side), or
 *  pass a null id to stop the one running. */
export const setProgram = (programId: string | null, startedOn: string | null = null) =>
  rpc('workout_set_program', { p_program_id: programId, p_started_on: startedOn });
