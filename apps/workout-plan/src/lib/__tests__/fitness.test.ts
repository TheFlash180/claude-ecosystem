import { describe, expect, it } from 'vitest';
import {
  addDays, ageFromDob, bestSet, bmr, dayIndex, est1RM, formatRunTime,
  nutritionTargets, parseRunTime, sessionsThisWeek, weekStart,
} from '../fitness';
import type { Profile } from '../config';

describe('dates', () => {
  it('dayIndex has Monday = 0', () => {
    expect(dayIndex('2026-07-20')).toBe(0); // Monday
    expect(dayIndex('2026-07-25')).toBe(5); // Saturday
    expect(dayIndex('2026-07-26')).toBe(6); // Sunday
  });
  it('weekStart snaps back to Monday', () => {
    expect(weekStart('2026-07-23')).toBe('2026-07-20');
    expect(weekStart('2026-07-20')).toBe('2026-07-20');
  });
  it('addDays crosses months', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  });
});

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

describe('strength', () => {
  it('Epley 1RM: 10 reps at 60kg ≈ 80kg', () => {
    expect(Math.round(est1RM(60, 10))).toBe(80);
    expect(est1RM(null, 12)).toBe(0); // bodyweight move
  });
  it('bestSet takes the top estimated 1RM', () => {
    const best = bestSet([
      { exerciseId: 'x', setNo: 1, weightKg: 20, reps: 12 },
      { exerciseId: 'x', setNo: 2, weightKg: 24, reps: 8 },
    ]);
    expect(Math.round(best)).toBe(30); // 24 * (1 + 8/30)
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

describe('sessionsThisWeek', () => {
  it('counts distinct dates inside the current ISO week only', () => {
    const dates = ['2026-07-20', '2026-07-20', '2026-07-22', '2026-07-19' /* prev week */];
    expect(sessionsThisWeek(dates, '2026-07-23')).toBe(2);
  });
});
