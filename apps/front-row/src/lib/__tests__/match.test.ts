import { describe, expect, it } from 'vitest';
import {
  distanceKm, isNewlyListed, matchesWatch, matchingEvents, priceLabel, whenLabel,
} from '../match';
import { MONTECASINO, type FrontRowEvent, type Watch } from '../config';

const ev = (over: Partial<FrontRowEvent> = {}): FrontRowEvent => ({
  id: 'e1', source: 'quicket', name: 'A Show', url: null, imageUrl: null,
  summary: null, startsAt: '2026-09-04T19:00:00+02:00', endsAt: null, dateText: null,
  venueName: 'Teatro at Montecasino',
  lat: MONTECASINO.lat, lng: MONTECASINO.lng,
  locality: 'Gauteng · Fourways', categories: [], priceFrom: null, listedAt: null,
  ...over,
});

const geoWatch = (over: Partial<Watch> = {}): Watch => ({
  id: 'w1', label: 'Montecasino', kind: 'geo',
  lat: MONTECASINO.lat, lng: MONTECASINO.lng, radiusKm: 15,
  term: null, enabled: true, ...over,
});

const kwWatch = (term: string, over: Partial<Watch> = {}): Watch => ({
  id: 'w2', label: term, kind: 'keyword',
  lat: null, lng: null, radiusKm: null, term, enabled: true, ...over,
});

describe('distanceKm', () => {
  it('is zero for the same point, without NaN from rounding', () => {
    const d = distanceKm(MONTECASINO.lat, MONTECASINO.lng, MONTECASINO.lat, MONTECASINO.lng);
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeLessThan(0.001);
  });

  it('matches a known separation', () => {
    // Montecasino to Sandton City is roughly 13 km.
    const d = distanceKm(MONTECASINO.lat, MONTECASINO.lng, -26.1076, 28.0567);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(18);
  });
});

describe('matchesWatch — geo', () => {
  it('includes an event at the venue', () => {
    expect(matchesWatch(ev(), geoWatch())).toBe(true);
  });

  it('excludes one beyond the radius', () => {
    // Cape Town.
    expect(matchesWatch(ev({ lat: -33.9249, lng: 18.4241 }), geoWatch())).toBe(false);
  });

  it('excludes an event with no coordinates rather than assuming nearby', () => {
    expect(matchesWatch(ev({ lat: null, lng: null }), geoWatch())).toBe(false);
  });

  it('ignores a disabled watch', () => {
    expect(matchesWatch(ev(), geoWatch({ enabled: false }))).toBe(false);
  });

  it('fails safe when the watch is missing a radius', () => {
    expect(matchesWatch(ev(), geoWatch({ radiusKm: null }))).toBe(false);
  });
});

describe('matchesWatch — keyword', () => {
  it('matches name, venue, summary or category, case-insensitively', () => {
    expect(matchesWatch(ev({ name: 'Semi-Soete' }), kwWatch('semi'))).toBe(true);
    expect(matchesWatch(ev({ venueName: 'Teatro' }), kwWatch('TEATRO'))).toBe(true);
    expect(matchesWatch(ev({ summary: 'A Marvel screening' }), kwWatch('marvel'))).toBe(true);
    expect(matchesWatch(ev({ categories: ['theatre'] }), kwWatch('theatre'))).toBe(true);
  });

  it('does not match an empty term, which would otherwise match everything', () => {
    expect(matchesWatch(ev(), kwWatch('   '))).toBe(false);
  });
});

describe('matchingEvents', () => {
  it('returns nothing when no watch is enabled', () => {
    expect(matchingEvents([ev()], [geoWatch({ enabled: false })])).toEqual([]);
  });

  it('includes an event matching any one watch, without duplicating it', () => {
    const e = ev({ name: 'Semi-Soete' });
    const out = matchingEvents([e], [geoWatch(), kwWatch('semi')]);
    expect(out).toHaveLength(1);
  });

  it('sorts soonest first and keeps undated events last', () => {
    const out = matchingEvents([
      ev({ id: 'late', startsAt: '2026-12-01T19:00:00+02:00' }),
      ev({ id: 'undated', startsAt: null, dateText: 'Coming soon' }),
      ev({ id: 'soon', startsAt: '2026-09-04T19:00:00+02:00' }),
    ], [geoWatch()]);
    expect(out.map(e => e.id)).toEqual(['soon', 'late', 'undated']);
  });
});

describe('isNewlyListed', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  it('flags a listing from the last week', () => {
    expect(isNewlyListed(ev({ listedAt: '2026-07-28T09:00:00+02:00' }), 7, now)).toBe(true);
  });
  it('does not flag an old listing, or one with no date', () => {
    expect(isNewlyListed(ev({ listedAt: '2026-05-01T09:00:00+02:00' }), 7, now)).toBe(false);
    expect(isNewlyListed(ev({ listedAt: null }), 7, now)).toBe(false);
  });
});

describe('whenLabel', () => {
  it('shows a weekday and date for a single evening', () => {
    expect(whenLabel(ev({ startsAt: '2026-09-04T19:00:00+02:00' }))).toBe('Fri 4 Sep');
  });

  it('shows a range for a run', () => {
    expect(whenLabel(ev({
      startsAt: '2026-09-04T19:00:00+02:00', endsAt: '2026-09-20T22:00:00+02:00',
    }))).toBe('4 Sep – 20 Sep');
  });

  it('falls back to the original prose when there is no parsed date', () => {
    expect(whenLabel(ev({ startsAt: null, dateText: 'from 4 to 20 September' })))
      .toBe('from 4 to 20 September');
    expect(whenLabel(ev({ startsAt: null, dateText: null }))).toBe('Date to be announced');
  });
});

describe('priceLabel', () => {
  it('reads naturally', () => {
    expect(priceLabel(null)).toBeNull();
    expect(priceLabel(0)).toBe('Free');
    expect(priceLabel(599)).toBe('from R599');
  });
});
