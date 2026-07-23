// Pure training + nutrition math (unit-tested). No React, no network.
import type { Goal, LoggedSet, Profile } from './config';

// ---- dates (SAST calendar days) ----

export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(ymd: string): number {
  const d = new Date(ymd + 'T12:00:00Z');
  return (d.getUTCDay() + 6) % 7;
}

export function weekStart(ymd: string): string {
  return addDays(ymd, -dayIndex(ymd));
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

// ---- strength ----

/** Epley estimated 1-rep-max. Bodyweight sets (null weight) → 0. */
export function est1RM(weightKg: number | null, reps: number): number {
  if (!weightKg || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

/** Best est-1RM across a set of logged sets — the exercise "PB". */
export function bestSet(sets: LoggedSet[]): number {
  return sets.reduce((best, s) => Math.max(best, est1RM(s.weightKg, s.reps)), 0);
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

// ---- streaks ----

/** Count of distinct session dates within the ISO week containing `today`. */
export function sessionsThisWeek(sessionDates: string[], today = sastDay()): number {
  const start = weekStart(today);
  const end = addDays(start, 6);
  return new Set(sessionDates.filter(d => d >= start && d <= end)).size;
}
