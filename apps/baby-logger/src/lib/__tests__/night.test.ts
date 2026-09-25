import { describe, expect, it } from 'vitest';
import { isNightHour, nightActive, sastHour } from '../night';

// SAST is UTC+2 all year (no DST), so these instants are unambiguous.
const at = (utc: string) => new Date(utc);

describe('sastHour', () => {
  it('reads the Johannesburg clock, not UTC', () => {
    expect(sastHour(at('2026-12-20T01:30:00Z'))).toBe(3);
    expect(sastHour(at('2026-12-20T22:30:00Z'))).toBe(0);
  });
});

describe('isNightHour', () => {
  it('starts at 19:00 SAST', () => {
    expect(isNightHour(at('2026-12-20T16:59:00Z'))).toBe(false); // 18:59
    expect(isNightHour(at('2026-12-20T17:00:00Z'))).toBe(true); // 19:00
  });

  it('covers the small hours', () => {
    expect(isNightHour(at('2026-12-20T01:00:00Z'))).toBe(true); // 03:00
  });

  it('ends at 06:00 SAST', () => {
    expect(isNightHour(at('2026-12-20T03:59:00Z'))).toBe(true); // 05:59
    expect(isNightHour(at('2026-12-20T04:00:00Z'))).toBe(false); // 06:00
  });
});

describe('nightActive', () => {
  const noon = at('2026-12-20T10:00:00Z');
  const threeAm = at('2026-12-20T01:00:00Z');

  it('follows the clock on auto', () => {
    expect(nightActive('auto', noon)).toBe(false);
    expect(nightActive('auto', threeAm)).toBe(true);
  });

  it('lets always and off override the clock', () => {
    expect(nightActive('on', noon)).toBe(true);
    expect(nightActive('off', threeAm)).toBe(false);
  });
});
