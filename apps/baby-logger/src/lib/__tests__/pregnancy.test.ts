import { describe, expect, it } from 'vitest';
import { getPregnancyInfo, getWeekInfo, WEEK_DATA } from '../pregnancy';
import { localIsoToday } from '../dates';

describe('WEEK_DATA', () => {
  it('covers every week from 4 to 40 with no gaps or placeholders', () => {
    for (let w = 4; w <= 40; w++) {
      const info = WEEK_DATA[w];
      expect(info, `week ${w}`).toBeDefined();
      expect(info.size.length).toBeGreaterThan(0);
      expect(info.milestone.length).toBeGreaterThan(0);
    }
    expect(Object.keys(WEEK_DATA)).toHaveLength(37);
  });
});

describe('getWeekInfo', () => {
  it('clamps out-of-range weeks to the 4–40 band', () => {
    expect(getWeekInfo(1)).toBe(WEEK_DATA[4]);
    expect(getWeekInfo(0)).toBe(WEEK_DATA[4]);
    expect(getWeekInfo(45)).toBe(WEEK_DATA[40]);
    expect(getWeekInfo(20)).toBe(WEEK_DATA[20]);
  });
});

describe('getPregnancyInfo — due-date arithmetic (no anchor)', () => {
  it('gives exactly 40w + 0d on the due date', () => {
    const info = getPregnancyInfo('2026-12-17', null, new Date('2026-12-17T00:00:00'));
    expect(info.daysUntilDue).toBe(0);
    expect(info.weeksPregnant).toBe(40);
    expect(info.daysIntoWeek).toBe(0);
    expect(info.trimester).toBe(3);
  });

  it('counts down whole days with partial days rounded up', () => {
    // 29 days and 14 hours before the due date is still "30 days to go".
    const info = getPregnancyInfo('2026-08-17', null, new Date('2026-07-18T10:00:00'));
    expect(info.daysUntilDue).toBe(30);
    expect(info.daysPregnant).toBe(250);
    expect(info.weeksPregnant).toBe(35);
    expect(info.daysIntoWeek).toBe(5);
  });
});

describe('getPregnancyInfo — clinic week anchor', () => {
  it('derives weeks+days from the anchor, not the due date', () => {
    // Anchor 73 days ago = 10 weeks + 3 days, regardless of the due date.
    const info = getPregnancyInfo('2026-12-17', '2026-05-06', new Date('2026-07-18T12:00:00'));
    expect(info.daysPregnant).toBe(73);
    expect(info.weeksPregnant).toBe(10);
    expect(info.daysIntoWeek).toBe(3);
    // The countdown must STAY due-date based while the anchor drives weeks.
    expect(info.daysUntilDue).toBe(152);
  });

  it('places trimester boundaries at weeks 13 and 27', () => {
    const at = (days: number) => {
      // Same local-midnight base the anchor parses to, so the offset works
      // in any timezone (SAST locally, UTC on CI).
      const anchorLocal = new Date('2026-01-01T00:00:00');
      const now = new Date(anchorLocal.getTime() + days * 86400000);
      return getPregnancyInfo('2026-12-17', '2026-01-01', now);
    };
    expect(at(12 * 7).trimester).toBe(1);
    expect(at(13 * 7).trimester).toBe(2);
    expect(at(26 * 7).trimester).toBe(2);
    expect(at(27 * 7).trimester).toBe(3);
  });

  it('clamps progress to the 0–1 range even past the due date', () => {
    const overdue = getPregnancyInfo('2026-07-01', null, new Date('2026-07-18T09:00:00'));
    expect(overdue.progress).toBe(1);
    const early = getPregnancyInfo('2027-06-01', null, new Date('2026-07-18T09:00:00'));
    expect(early.progress).toBe(0);
  });
});

describe('localIsoToday', () => {
  it('formats the LOCAL date, not the UTC date', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(localIsoToday()).toBe(expected);
    expect(localIsoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
