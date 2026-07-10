import { describe, expect, it } from 'vitest';
import { buildEventIcs, icsDate, icsEscape } from '../ics';
import type { SportEvent } from '../config';

const bokTest: SportEvent = {
  id: '5',
  sport: 'rugby',
  competition: "Rugby's Greatest Rivalry · Test 1",
  home: 'Springboks',
  away: 'All Blacks',
  homeFlag: '🇿🇦',
  awayFlag: '🇳🇿',
  date: new Date('2026-08-22T15:40:00Z'),
  venue: 'Ellis Park, Johannesburg',
  channel: 'SuperSport Rugby (DStv 211)',
};

describe('icsDate', () => {
  it('renders RFC 5545 UTC timestamps', () => {
    expect(icsDate(new Date('2026-08-22T15:40:00Z'))).toBe('20260822T154000Z');
  });
});

describe('icsEscape', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('buildEventIcs', () => {
  it('is null for date-TBC events', () => {
    expect(buildEventIcs({ ...bokTest, date: null })).toBeNull();
  });

  it('builds a valid single-event calendar', () => {
    const ics = buildEventIcs(bokTest)!;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:5@sa-sport-watch');
    expect(ics).toContain('DTSTART:20260822T154000Z');
    // rugby runs 2h
    expect(ics).toContain('DTEND:20260822T174000Z');
    expect(ics).toContain('SUMMARY:🏉 Springboks vs All Blacks');
    expect(ics).toContain('LOCATION:Ellis Park\\, Johannesburg');
    expect(ics).toContain('DStv 211');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses the 5h MMA window', () => {
    const ics = buildEventIcs({
      ...bokTest,
      sport: 'mma',
      date: new Date('2026-07-19T00:00:00Z'),
    })!;
    expect(ics).toContain('DTEND:20260719T050000Z');
  });
});
