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

/** Longest minutes value the two-box entry accepts. A 5 km parkrun does not
 *  take 100 minutes, and capping at two digits is what lets the minutes box
 *  hand focus to the seconds box on its own. */
export const MAX_RUN_MINUTES = 99;

/** Split free text into the two boxes: "24:53", "24.53", "24 53" or a bare
 *  "2453" all become { minutes: '24', seconds: '53' }.
 *
 *  A bare run of digits is read as mmss and never as raw seconds. A phone
 *  keypad has no colon, so "2453" is what you get when someone types their
 *  time — reading it as 2453 seconds silently stored 40:53 instead of 24:53.
 *  Returns null rather than guessing when the trailing pair is not a valid
 *  seconds value. */
export function splitTimeText(raw: string): { minutes: string; seconds: string } | null {
  const t = raw.trim();
  if (!t) return null;

  const sep = t.match(/^(\d{1,2})[:.\s](\d{1,2})$/);
  if (sep) {
    // "24:5" is 24:05, the literal reading. It used to be padded on the right
    // into 24:50, which quietly turned a half-typed time into a wrong one.
    const seconds = sep[2].padStart(2, '0');
    if (Number(seconds) > 59) return null;
    return { minutes: sep[1], seconds };
  }

  if (/^\d{3,4}$/.test(t)) {
    const seconds = t.slice(-2);
    if (Number(seconds) > 59) return null;
    return { minutes: String(Number(t.slice(0, -2))), seconds };
  }

  return null;
}

/** "24:53", "24.53" or a bare "2453" → seconds. null if unparseable. */
export function parseRunTime(raw: string): number | null {
  const parts = splitTimeText(raw);
  if (!parts) return null;
  return Number(parts.minutes) * 60 + Number(parts.seconds);
}

/** The two entry boxes → total seconds. Null while either is empty or out of
 *  range, which is what keeps the save button honest. */
export function runSeconds(minutes: string, seconds: string): number | null {
  if (!/^\d{1,2}$/.test(minutes) || !/^\d{1,2}$/.test(seconds)) return null;
  const m = Number(minutes);
  const s = Number(seconds);
  if (m > MAX_RUN_MINUTES || s > 59) return null;
  return m * 60 + s;
}

/** Pace as m:ss per kilometre. parkrun is always 5 km. */
export function pacePerKm(seconds: number, km = 5): string {
  const per = Math.round(seconds / km);
  return `${Math.floor(per / 60)}:${String(per % 60).padStart(2, '0')}`;
}

/** A gap between two run times. Seconds on their own past a minute stop being
 *  readable — "89s off" is a worse sentence than "1:29 off". */
export function formatGap(seconds: number): string {
  const abs = Math.abs(seconds);
  return abs < 60 ? `${abs}s` : formatRunTime(abs);
}

export interface PbComparison {
  pbSeconds: number | null;
  /** Seconds faster than the PB. Negative means slower. Null on a first run. */
  deltaSeconds: number | null;
  isFirst: boolean;
  isPb: boolean;
}

/** How a time being entered compares to what is already logged.
 *
 *  `excludeDate` drops the run already stored for the date being entered:
 *  logging a correction to today's time should be compared against the other
 *  runs, not against the row it is about to replace. */
export function comparePb(seconds: number, runs: RunEntry[], excludeDate?: string): PbComparison {
  const others = excludeDate ? runs.filter(r => r.date !== excludeDate) : runs;
  if (others.length === 0) {
    return { pbSeconds: null, deltaSeconds: null, isFirst: true, isPb: false };
  }
  const pbSeconds = Math.min(...others.map(r => r.seconds));
  return { pbSeconds, deltaSeconds: pbSeconds - seconds, isFirst: false, isPb: seconds < pbSeconds };
}

/** The most recent Saturday on or before `today` — parkrun day. Returns today
 *  when today is a Saturday. Midday anchor so no DST or rounding slip. */
export function lastSaturday(today = sastDay()): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
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
