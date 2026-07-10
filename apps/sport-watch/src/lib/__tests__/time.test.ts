import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIVE_DURATION, fmtDate, fmtTime, getCountdown, isLive, isPast } from '../time';

const NOW = new Date('2026-07-10T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60000);

describe('isPast', () => {
  it('is false for null dates (TBC events)', () => expect(isPast(null)).toBe(false));
  it('is true only once the start time has passed', () => {
    expect(isPast(minutesFromNow(-1))).toBe(true);
    expect(isPast(minutesFromNow(1))).toBe(false);
  });
});

describe('isLive', () => {
  it('is false before kick-off and true from kick-off', () => {
    expect(isLive(minutesFromNow(1))).toBe(false);
    expect(isLive(minutesFromNow(0))).toBe(true);
  });

  it('ends after the default 2h window', () => {
    expect(isLive(new Date(NOW.getTime() - DEFAULT_LIVE_DURATION + 1000))).toBe(true);
    expect(isLive(new Date(NOW.getTime() - DEFAULT_LIVE_DURATION))).toBe(false);
  });

  it('respects a longer sport-specific duration (MMA cards run ~5h)', () => {
    const fiveHours = 18000000;
    const startedThreeHoursAgo = new Date(NOW.getTime() - 3 * 3600000);
    expect(isLive(startedThreeHoursAgo)).toBe(false);
    expect(isLive(startedThreeHoursAgo, fiveHours)).toBe(true);
  });

  it('is false for null dates', () => expect(isLive(null)).toBe(false));
});

describe('getCountdown', () => {
  it('is null for null or past dates', () => {
    expect(getCountdown(null)).toBeNull();
    expect(getCountdown(minutesFromNow(-1))).toBeNull();
  });

  it('splits the remaining time into d/h/m/s', () => {
    const target = new Date(NOW.getTime() + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);
    expect(getCountdown(target)).toEqual({ d: 2, h: 3, m: 4, s: 5 });
  });
});

describe('SAST formatting', () => {
  // 22:30 UTC = 00:30 SAST the NEXT day — the reason both helpers pin the zone.
  const lateKickoff = new Date('2026-07-10T22:30:00Z');

  it('fmtTime renders in SAST', () => {
    expect(fmtTime(lateKickoff)).toBe('00:30 SAST');
  });

  it('fmtDate shows the SAST calendar day, not the UTC one', () => {
    expect(fmtDate(lateKickoff)).toContain('11');
  });
});
