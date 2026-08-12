import { describe, expect, it } from 'vitest';
import {
  findProgram, hasBothSettings, libraryRoutines, phaseForWeek, programProgress,
  programRoutines, progressFraction, progressLabel, routineForDay,
} from '../program';
import type { Program, ProgramDay, ProgramPhase, Routine } from '../config';

const PHASES: ProgramPhase[] = [
  { fromWeek: 1, toWeek: 4, title: 'Groundwork', guidance: 'g' },
  { fromWeek: 5, toWeek: 8, title: 'Build', guidance: 'b' },
  { fromWeek: 9, toWeek: 12, title: 'Sharpen', guidance: 's' },
];

const day = (over: Partial<ProgramDay> = {}): ProgramDay => ({
  dayIndex: 1, label: 'Upper A', homeRoutineId: 'h', gymRoutineId: 'g', note: '', ...over,
});

const routine = (id: string, programId: string | null): Routine => ({
  id, title: id, kind: 'home', subtitle: '', summary: '', estMinutes: null,
  exercises: [], programId,
});

describe('programProgress', () => {
  it('is week 1 on the day it starts', () => {
    const p = programProgress('2026-08-04', 12, '2026-08-04')!;
    expect(p.week).toBe(1);
    expect(p.dayOfWeek).toBe(1);
    expect(p.complete).toBe(false);
  });

  it('rolls to week 2 on the eighth day, not the seventh', () => {
    expect(programProgress('2026-08-04', 12, '2026-08-10')!.week).toBe(1);
    expect(programProgress('2026-08-04', 12, '2026-08-10')!.dayOfWeek).toBe(7);
    expect(programProgress('2026-08-04', 12, '2026-08-11')!.week).toBe(2);
    expect(programProgress('2026-08-04', 12, '2026-08-11')!.dayOfWeek).toBe(1);
  });

  it('clamps past the end and says it is done rather than counting on', () => {
    // 12 weeks = 84 days; day 85 is past the end.
    const p = programProgress('2026-08-04', 12, '2026-11-30')!;
    expect(p.week).toBe(12);
    expect(p.complete).toBe(true);
  });

  it('is null before it starts — a scheduled plan is not week 1', () => {
    expect(programProgress('2026-09-01', 12, '2026-08-04')).toBeNull();
  });

  it('is null with nothing running', () => {
    expect(programProgress(null, 12, '2026-08-04')).toBeNull();
  });

  it('crosses a month and a year boundary without slipping', () => {
    expect(programProgress('2026-12-28', 12, '2027-01-04')!.week).toBe(2);
  });
});

describe('phaseForWeek', () => {
  it('finds the block covering the week, at both edges', () => {
    expect(phaseForWeek(PHASES, 1)!.title).toBe('Groundwork');
    expect(phaseForWeek(PHASES, 4)!.title).toBe('Groundwork');
    expect(phaseForWeek(PHASES, 5)!.title).toBe('Build');
    expect(phaseForWeek(PHASES, 12)!.title).toBe('Sharpen');
  });

  it('returns null for a week no block covers', () => {
    expect(phaseForWeek(PHASES, 13)).toBeNull();
    expect(phaseForWeek([], 1)).toBeNull();
  });
});

describe('routineForDay', () => {
  it('picks the build for the chosen setting', () => {
    expect(routineForDay(day(), 'home')).toBe('h');
    expect(routineForDay(day(), 'gym')).toBe('g');
  });

  it('falls back rather than showing a dead row', () => {
    // The conditioning day is stored once and is the same either way.
    expect(routineForDay(day({ gymRoutineId: null }), 'gym')).toBe('h');
    expect(routineForDay(day({ homeRoutineId: null }), 'home')).toBe('g');
  });

  it('is null only when the day has no routine at all', () => {
    expect(routineForDay(day({ homeRoutineId: null, gymRoutineId: null }), 'home')).toBeNull();
  });

  it('flags which days actually differ between settings', () => {
    expect(hasBothSettings(day())).toBe(true);
    expect(hasBothSettings(day({ gymRoutineId: null }))).toBe(false);
  });
});

describe('library vs programme routines', () => {
  const all = [routine('push', null), routine('pull', null), routine('hero-upper', 'hero-cut')];

  it('keeps programme sessions out of the browsable library', () => {
    expect(libraryRoutines(all).map(r => r.id)).toEqual(['push', 'pull']);
  });

  it('collects a programme\'s own sessions by id', () => {
    const m = programRoutines(all, 'hero-cut');
    expect([...m.keys()]).toEqual(['hero-upper']);
  });
});

describe('labels', () => {
  const prog: Program = {
    id: 'hero-cut', title: 'Hero Cut', subtitle: '', summary: '', weeks: 12,
    days: [], phases: PHASES,
  };

  it('reads as a week count, and says when it is finished', () => {
    expect(progressLabel(programProgress('2026-08-04', 12, '2026-08-18'))).toBe('Week 3 of 12');
    expect(progressLabel(programProgress('2026-08-04', 12, '2026-11-30'))).toBe('Week 12 of 12 · done');
    expect(progressLabel(null)).toBe('Not started');
  });

  it('advances the bar daily, not in weekly jumps', () => {
    const d1 = progressFraction(programProgress('2026-08-04', 12, '2026-08-04'));
    const d2 = progressFraction(programProgress('2026-08-04', 12, '2026-08-05'));
    expect(d2).toBeGreaterThan(d1);
    expect(progressFraction(programProgress('2026-08-04', 12, '2026-11-30'))).toBe(1);
    expect(progressFraction(null)).toBe(0);
  });

  it('finds a programme by id', () => {
    expect(findProgram([prog], 'hero-cut')!.title).toBe('Hero Cut');
    expect(findProgram([prog], 'nope')).toBeNull();
    expect(findProgram([prog], null)).toBeNull();
  });
});
