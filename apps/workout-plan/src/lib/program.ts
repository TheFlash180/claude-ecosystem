// Programme logic. Pure — no React, no network — so every rule here is
// directly testable.
//
// The design point: the current week is DERIVED from the start date, never
// stored. Nothing has to be advanced, ticked off or kept up to date, which is
// the upkeep that killed the old per-set logging (built, used for a week,
// deleted). Start it once and it tells you where you are from then on.
import type { Program, ProgramDay, ProgramPhase, Routine, Setting } from './config';
import { sastDay } from './fitness';

/** Whole days from `from` to `to`, both yyyy-mm-dd. Both parse as UTC
 *  midnight, so this is exact — no DST or rounding slips. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

export interface ProgramProgress {
  /** 1-based, clamped to the programme length. */
  week: number;
  weeks: number;
  /** 1-7, which day of the current week today is. */
  dayOfWeek: number;
  /** True once today is past the final week — the plan is done, not broken. */
  complete: boolean;
}

/** Where today falls in a programme that started on `startedOn`.
 *
 *  null when nothing is running, or when the start date is in the future —
 *  a programme you have scheduled but not begun should not read as "week 1".
 *  Past the end it clamps to the last week and flags `complete`, so a finished
 *  plan says so rather than counting into week 47. */
export function programProgress(
  startedOn: string | null,
  weeks: number,
  today = sastDay(),
): ProgramProgress | null {
  if (!startedOn || weeks <= 0) return null;
  const elapsed = daysBetween(startedOn, today);
  if (elapsed < 0) return null;
  const rawWeek = Math.floor(elapsed / 7) + 1;
  return {
    week: Math.min(rawWeek, weeks),
    weeks,
    dayOfWeek: (elapsed % 7) + 1,
    complete: rawWeek > weeks,
  };
}

/** The phase covering a given week, or null if the blocks do not cover it.
 *  First match wins, so overlapping blocks resolve to the earliest. */
export function phaseForWeek(phases: ProgramPhase[], week: number): ProgramPhase | null {
  return phases.find(p => week >= p.fromWeek && week <= p.toWeek) ?? null;
}

/** The routine a session resolves to for the chosen setting.
 *
 *  Falls back to the other build rather than showing nothing: the
 *  conditioning day is stored once and is the same wherever you do it, and a
 *  day with no routine at all would just be a dead row in the list. */
export function routineForDay(
  day: ProgramDay,
  setting: Exclude<Setting, 'both'>,
): string | null {
  const first = setting === 'gym' ? day.gymRoutineId : day.homeRoutineId;
  const other = setting === 'gym' ? day.homeRoutineId : day.gymRoutineId;
  return first ?? other;
}

/** True when a session genuinely differs between home and gym, i.e. both
 *  builds exist. Drives whether the toggle is worth showing on that row. */
export function hasBothSettings(day: ProgramDay): boolean {
  return day.homeRoutineId !== null && day.gymRoutineId !== null;
}

/** The browsable library: routines that are not part of any programme.
 *
 *  Adding a programme must not change what the Workouts tab has always
 *  shown, so its sessions are filtered out here rather than mixed in. */
export function libraryRoutines(routines: Routine[]): Routine[] {
  return routines.filter(r => r.programId === null);
}

/** The routines belonging to one programme, keyed by id for quick lookup. */
export function programRoutines(routines: Routine[], programId: string): Map<string, Routine> {
  const map = new Map<string, Routine>();
  for (const r of routines) if (r.programId === programId) map.set(r.id, r);
  return map;
}

export function findProgram(programs: Program[], id: string | null): Program | null {
  if (!id) return null;
  return programs.find(p => p.id === id) ?? null;
}

/** "Week 3 of 12" / "Week 12 of 12 · done" / "Not started". */
export function progressLabel(progress: ProgramProgress | null): string {
  if (!progress) return 'Not started';
  const base = `Week ${progress.week} of ${progress.weeks}`;
  return progress.complete ? `${base} · done` : base;
}

/** How far through, 0-1, for a progress bar. 0 when nothing is running. */
export function progressFraction(progress: ProgramProgress | null): number {
  if (!progress) return 0;
  if (progress.complete) return 1;
  // Count the days actually elapsed rather than whole weeks, so the bar moves
  // during a week instead of jumping every seventh day.
  const days = (progress.week - 1) * 7 + progress.dayOfWeek;
  return Math.min(1, days / (progress.weeks * 7));
}
