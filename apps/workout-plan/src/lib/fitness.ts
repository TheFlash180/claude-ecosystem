// Pure nutrition + tracking math (unit-tested). No React, no network.
import type { BodyweightEntry, Goal, Profile, RunEntry } from './config';

// ---- dates (SAST calendar days) ----

export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

export function ageFromDob(dob: string, today = sastDay()): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

// ---- nutrition (Mifflin-St Jeor) ----

export function bmr(sex: 'male' | 'female', weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

export interface Targets {
  maintenance: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/** Daily targets from the profile + current bodyweight.
 *  recomp = gentle 350 deficit · cut = 500 · build = 200 surplus. */
export function nutritionTargets(
  profile: Profile,
  weightKg: number,
  today = sastDay(),
): Targets | null {
  if (!profile.dob || !profile.heightCm || !weightKg) return null;
  const age = ageFromDob(profile.dob, today);
  const maintenance = Math.round(bmr(profile.sex, weightKg, profile.heightCm, age) * profile.activityFactor);
  const adjust: Record<Goal, number> = { recomp: -350, cut: -500, build: 200 };
  const calories = Math.round((maintenance + adjust[profile.goal]) / 10) * 10;
  const protein = Math.round(2.0 * weightKg);
  const fat = Math.round(0.8 * weightKg);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { maintenance, calories, protein, fat, carbs };
}

// ---- bodyweight ----

export interface WeightTrend {
  current: number | null;
  /** Change from the first weigh-in — negative is down. */
  delta: number | null;
  /** Kilograms still to go, or null with no target. Negative once past it. */
  toTarget: number | null;
}

/** `entries` is expected oldest-first, the order the query returns. */
export function weightTrend(entries: BodyweightEntry[], targetKg: number | null): WeightTrend {
  if (entries.length === 0) return { current: null, delta: null, toTarget: null };
  const current = entries[entries.length - 1].weightKg;
  const first = entries[0].weightKg;
  return {
    current,
    delta: entries.length > 1 ? round1(current - first) : null,
    toTarget: targetKg != null ? round1(current - targetKg) : null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- run times ----

export function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "24:53" or "1493" (seconds) or "24.53" → seconds. null if unparseable. */
export function parseRunTime(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if (m) {
    const secs = Number(m[2].padEnd(2, '0'));
    if (secs >= 60) return null;
    return Number(m[1]) * 60 + secs;
  }
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

export interface RunStats {
  pbSeconds: number | null;
  latestSeconds: number | null;
  /** True only when the most recent run *is* the PB and there is a run to
   *  beat — a single logged run is not yet an achievement. */
  latestIsPb: boolean;
}

/** `runs` is expected newest-first, the order the query returns. */
export function runStats(runs: RunEntry[]): RunStats {
  if (runs.length === 0) return { pbSeconds: null, latestSeconds: null, latestIsPb: false };
  const pbSeconds = Math.min(...runs.map(r => r.seconds));
  const latestSeconds = runs[0].seconds;
  return { pbSeconds, latestSeconds, latestIsPb: runs.length > 1 && latestSeconds === pbSeconds };
}
