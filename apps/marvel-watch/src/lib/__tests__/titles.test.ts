import { describe, expect, it } from 'vitest';
import { daysUntil, groupTitles, releaseLabel } from '../titles';
import type { Title } from '../config';

const TODAY = '2026-07-17';

const t = (id: string, releaseDate: string | null, over: Partial<Title> = {}): Title => ({
  id,
  mediaType: 'movie',
  title: id,
  releaseDate,
  dateTbc: releaseDate === null,
  universe: 'mcu',
  isSpecial: false,
  manual: false,
  ...over,
});

describe('daysUntil', () => {
  it('counts calendar days', () => {
    expect(daysUntil('2026-07-31', TODAY)).toBe(14);
    expect(daysUntil('2026-07-17', TODAY)).toBe(0);
    expect(daysUntil('2026-07-10', TODAY)).toBe(-7);
  });
});

describe('releaseLabel', () => {
  it('handles TBA, today, tomorrow, days, months, years', () => {
    expect(releaseLabel(null, TODAY)).toBe('Date TBA');
    expect(releaseLabel('2026-07-17', TODAY)).toBe('TODAY 🍿');
    expect(releaseLabel('2026-07-18', TODAY)).toBe('Tomorrow');
    expect(releaseLabel('2026-07-31', TODAY)).toBe('in 14 days');
    expect(releaseLabel('2026-12-18', TODAY)).toBe('in 5 months');
    expect(releaseLabel('2027-12-17', TODAY)).toBe('in 17 months');
    expect(releaseLabel('2029-07-17', TODAY)).toBe('in 3 years');
    expect(releaseLabel('2026-07-01', TODAY)).toBe('Out now');
  });
});

describe('groupTitles', () => {
  const titles = [
    t('secret-wars', '2027-12-17'),
    t('doomsday', '2026-12-18'),
    t('brand-new-day', '2026-07-31'),
    t('born-again-2', '2026-03-04'),   // 4+ months ago -> not "out now"
    t('recent-show', '2026-06-25'),    // 22 days ago -> out now
    t('vision-quest', null),
  ];

  it('picks the soonest dated future title as the hero', () => {
    const g = groupTitles(titles, TODAY);
    expect(g.nextUp?.id).toBe('brand-new-day');
  });

  it('sorts upcoming soonest first and includes the hero', () => {
    const g = groupTitles(titles, TODAY);
    expect(g.upcoming.map(x => x.id)).toEqual(['brand-new-day', 'doomsday', 'secret-wars']);
  });

  it('keeps undated titles on the horizon', () => {
    const g = groupTitles(titles, TODAY);
    expect(g.horizon.map(x => x.id)).toEqual(['vision-quest']);
  });

  it('shows recent releases in out-now, newest first, and drops old ones', () => {
    const g = groupTitles(titles, TODAY);
    expect(g.outNow.map(x => x.id)).toEqual(['recent-show']);
  });

  it('releases today count as upcoming (hero), not out-now', () => {
    const g = groupTitles([t('today', '2026-07-17')], TODAY);
    expect(g.nextUp?.id).toBe('today');
    expect(g.outNow).toHaveLength(0);
  });
});
