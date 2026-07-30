import { describe, expect, it } from 'vitest';
import { parseShowRun } from '../showDates';

// Fixed "today" so year inference is deterministic.
const TODAY = new Date(Date.UTC(2026, 6, 30, 12)); // 30 July 2026

describe('parseShowRun', () => {
  it('reads the real Semi-Soete blurb', () => {
    const blurb = 'Semi-Soet – Die Musiek Blyspel returns bigger than ever to the '
      + 'Teatro stage from 4 to 20 September. Expect romance, chaos, and laughs.';
    expect(parseShowRun(blurb, TODAY)).toEqual({
      start: '2026-09-04', end: '2026-09-20', text: '4 to 20 September',
    });
  });

  it('handles a range inside one month, with dashes or words', () => {
    expect(parseShowRun('12 - 18 October', TODAY).start).toBe('2026-10-12');
    expect(parseShowRun('12 – 18 October', TODAY).end).toBe('2026-10-18');
    expect(parseShowRun('12 until 18 October', TODAY).start).toBe('2026-10-12');
  });

  it('handles a range spanning two months', () => {
    expect(parseShowRun('28 November to 3 December', TODAY)).toEqual({
      start: '2026-11-28', end: '2026-12-03', text: '28 November to 3 December',
    });
  });

  it('rolls the end into the next year when the range crosses December', () => {
    const r = parseShowRun('20 December to 5 January', TODAY);
    expect(r.start).toBe('2026-12-20');
    expect(r.end).toBe('2027-01-05');
  });

  it('reads a single date', () => {
    expect(parseShowRun('One night only on 12 October', TODAY)).toEqual({
      start: '2026-10-12', end: null, text: '12 October',
    });
  });

  it('uses an explicit year when the text gives one', () => {
    expect(parseShowRun('4 to 20 September 2027', TODAY).start).toBe('2027-09-04');
    expect(parseShowRun('15 March 2028', TODAY).start).toBe('2028-03-15');
  });

  it('assumes next year for a month that has already passed', () => {
    // March 2026 is long gone by 30 July, so this is March 2027.
    expect(parseShowRun('15 March', TODAY).start).toBe('2027-03-15');
  });

  it('keeps a run that started recently in the current year', () => {
    // Inside the grace window: a show that opened last week is not next year's.
    expect(parseShowRun('24 July', TODAY).start).toBe('2026-07-24');
  });

  it('accepts abbreviated months', () => {
    expect(parseShowRun('3 Sept', TODAY).start).toBe('2026-09-03');
    expect(parseShowRun('3 Dec', TODAY).start).toBe('2026-12-03');
  });

  it('returns null rather than guessing when there is no date', () => {
    const none = { start: null, end: null, text: null };
    expect(parseShowRun('Booking opens soon', TODAY)).toEqual(none);
    expect(parseShowRun('', TODAY)).toEqual(none);
    expect(parseShowRun(null, TODAY)).toEqual(none);
    expect(parseShowRun('Tickets from R250', TODAY)).toEqual(none);
  });

  it('rejects impossible dates instead of rolling them over', () => {
    // 31 February would silently become 3 March if constructed naively.
    expect(parseShowRun('31 February', TODAY).start).toBeNull();
  });
});
