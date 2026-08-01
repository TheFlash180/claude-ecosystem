import { describe, expect, it } from 'vitest';
import {
  ageFromDob, bmr, formatRunTime, nutritionTargets, parseRunTime, runStats, weightTrend,
} from '../fitness';
import type { BodyweightEntry, Profile, RunEntry } from '../config';

describe('ageFromDob', () => {
  it('accounts for whether the birthday has passed', () => {
    expect(ageFromDob('1999-06-18', '2026-07-23')).toBe(27); // after birthday
    expect(ageFromDob('1999-06-18', '2026-06-17')).toBe(26); // day before
    expect(ageFromDob('1999-06-18', '2026-06-18')).toBe(27); // on birthday
  });
});

describe('nutrition', () => {
  const profile: Profile = {
    dob: '1999-06-18', heightCm: 163, sex: 'male',
    goal: 'recomp', targetWeightKg: 58, activityFactor: 1.5,
  };

  it('Mifflin-St Jeor BMR for Rickus ≈ 1506', () => {
    const age = ageFromDob(profile.dob!, '2026-07-23');
    expect(Math.round(bmr('male', 61.7, 163, age))).toBe(1506);
  });

  it('recomp targets: gentle deficit, ~2g/kg protein', () => {
    const t = nutritionTargets(profile, 61.7, '2026-07-23')!;
    expect(t.maintenance).toBe(2259);   // 1506 * 1.5
    expect(t.calories).toBe(1910);      // (2259 - 350) rounded to 10
    expect(t.protein).toBe(123);        // 2.0 * 61.7
    expect(t.fat).toBe(49);
    expect(t.carbs).toBeGreaterThan(150);
  });

  it('cut goal cuts harder than recomp', () => {
    const cut = nutritionTargets({ ...profile, goal: 'cut' }, 61.7, '2026-07-23')!;
    const recomp = nutritionTargets(profile, 61.7, '2026-07-23')!;
    expect(cut.calories).toBeLessThan(recomp.calories);
  });

  it('returns null without the stats it needs', () => {
    expect(nutritionTargets({ ...profile, heightCm: null }, 61.7)).toBeNull();
  });
});

describe('weightTrend', () => {
  const entries: BodyweightEntry[] = [
    { date: '2026-07-01', weightKg: 63.4 },
    { date: '2026-07-15', weightKg: 62.1 },
    { date: '2026-08-01', weightKg: 61.7 },
  ];

  it('reads the latest weigh-in and the change since the first', () => {
    const t = weightTrend(entries, 58);
    expect(t.current).toBe(61.7);
    expect(t.delta).toBe(-1.7);
    expect(t.toTarget).toBe(3.7);
  });

  it('shows no change from a single weigh-in', () => {
    // One reading is a starting point, not a trend — "0.0 kg" would read as
    // "you have made no progress".
    const t = weightTrend([entries[0]], null);
    expect(t.current).toBe(63.4);
    expect(t.delta).toBeNull();
  });

  it('goes negative once the target is passed', () => {
    expect(weightTrend(entries, 63)!.toTarget).toBe(-1.3);
  });

  it('handles no weigh-ins at all', () => {
    expect(weightTrend([], 58)).toEqual({ current: null, delta: null, toTarget: null });
  });
});

describe('run times', () => {
  it('formats seconds as m:ss', () => {
    expect(formatRunTime(1493)).toBe('24:53');
    expect(formatRunTime(65)).toBe('1:05');
  });
  it('parses m:ss, m.ss and raw seconds', () => {
    expect(parseRunTime('24:53')).toBe(1493);
    expect(parseRunTime('24.53')).toBe(1493);
    expect(parseRunTime('1493')).toBe(1493);
    expect(parseRunTime('24:99')).toBeNull(); // invalid seconds
    expect(parseRunTime('abc')).toBeNull();
  });
});

describe('runStats', () => {
  const run = (date: string, seconds: number): RunEntry => ({ date, seconds, location: 'parkrun', note: '' });
  // Newest first, the order the query returns.
  const runs = [run('2026-08-01', 1450), run('2026-07-25', 1493), run('2026-07-18', 1520)];

  it('takes the fastest time as the PB', () => {
    expect(runStats(runs).pbSeconds).toBe(1450);
    expect(runStats(runs).latestSeconds).toBe(1450);
    expect(runStats(runs).latestIsPb).toBe(true);
  });

  it('does not call a slower latest run a PB', () => {
    expect(runStats([run('2026-08-08', 1600), ...runs]).latestIsPb).toBe(false);
  });

  it('does not celebrate the very first run as a PB', () => {
    // There was nothing to beat — congratulating it cheapens the real one.
    expect(runStats([run('2026-07-18', 1520)]).latestIsPb).toBe(false);
  });

  it('handles no runs', () => {
    expect(runStats([])).toEqual({ pbSeconds: null, latestSeconds: null, latestIsPb: false });
  });
});
