import { describe, expect, it } from 'vitest';
import {
  babyCard, buildToday, cookCard, daysBetween, formatRand, marvelCard, priceCard,
  registryCard, relativeDay, sportCard, trainingCard, type TodayInput,
} from '../today';

const TODAY = '2026-09-09'; // a Wednesday

const fixture = (over: Partial<Parameters<typeof sportCard>[0][number]> = {}) => ({
  sport: 'rugby', competition: "Rugby's Greatest Rivalry · Test 4",
  home: 'Springboks', away: 'All Blacks',
  homeFlag: '🇿🇦', awayFlag: '🇳🇿',
  date: '2026-09-12T20:00:00+00:00', venue: 'M&T Bank Stadium',
  ...over,
});

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-09-09', '2026-09-12')).toBe(3);
    expect(daysBetween('2026-09-12', '2026-09-09')).toBe(-3);
    expect(daysBetween('2026-09-09', '2026-09-09')).toBe(0);
  });
});

describe('relativeDay', () => {
  it('names the near days', () => {
    expect(relativeDay('2026-09-09', TODAY)).toBe('Today');
    expect(relativeDay('2026-09-10', TODAY)).toBe('Tomorrow');
  });

  it('uses the weekday name inside the week', () => {
    expect(relativeDay('2026-09-12', TODAY)).toBe('Saturday');
  });

  it('counts days once the weekday would be ambiguous', () => {
    expect(relativeDay('2026-09-21', TODAY)).toBe('in 12 days');
  });
});

describe('formatRand', () => {
  it('groups thousands with a non-breaking space, matching price-watch', () => {
    // U+00A0 spelled out rather than typed, so a plain space can never sneak
    // in and make the assertion look right while comparing different strings.
    expect(formatRand(4499)).toBe('R4\u00a0499');
    expect(formatRand(17972)).toBe('R17\u00a0972');
    expect(formatRand(269)).toBe('R269');
  });
});

describe('sportCard', () => {
  it('reads as the fixture, in SAST, with when it is', () => {
    const card = sportCard([fixture()], TODAY);
    expect(card?.headline).toBe('🇿🇦 Springboks vs 🇳🇿 All Blacks');
    expect(card?.detail).toContain('Saturday');
    expect(card?.detail).toContain('22:00 SAST'); // 20:00 UTC in Johannesburg
  });

  it('drops the "vs" half for a one-sided event like a grand prix', () => {
    const card = sportCard([fixture({ home: 'Spanish Grand Prix', away: null, awayFlag: null })], TODAY);
    expect(card?.headline).toBe('🇿🇦 Spanish Grand Prix');
  });

  it('marks something happening today as urgent', () => {
    expect(sportCard([fixture({ date: '2026-09-09T15:00:00+00:00' })], TODAY)?.urgent).toBe(true);
    expect(sportCard([fixture()], TODAY)?.urgent).toBe(false);
  });

  it('says nothing when the calendar is empty', () => {
    expect(sportCard([], TODAY)).toBeNull();
  });
});

describe('trainingCard', () => {
  const twenty = { title: 'Twenty', weeks: 12, startedOn: '2026-08-17', dayLabels: ['Cindy', 'Legs & Glutes'] };

  it('derives the week from the start date', () => {
    // 2026-08-17 + 23 days = week 4.
    expect(trainingCard(twenty, TODAY)?.headline).toBe('Twenty · week 4 of 12');
  });

  it('lists the week’s sessions rather than naming one for today', () => {
    // The programme says how many sessions a week, not which weekday, so
    // picking "today's session" would be inventing a schedule.
    expect(trainingCard(twenty, TODAY)?.detail).toBe('Cindy · Legs & Glutes');
  });

  it('clamps past the end and says the programme is done', () => {
    const card = trainingCard({ ...twenty, startedOn: '2026-01-01' }, TODAY);
    expect(card?.headline).toBe('Twenty · finished');
  });

  it('stays quiet for a programme that has not started', () => {
    expect(trainingCard({ ...twenty, startedOn: '2026-10-01' }, TODAY)).toBeNull();
    expect(trainingCard({ ...twenty, startedOn: null }, TODAY)).toBeNull();
    expect(trainingCard(null, TODAY)).toBeNull();
  });
});

describe('cookCard', () => {
  it('names what is queued and counts the rest', () => {
    const card = cookCard([
      { name: 'Beef stroganoff', emoji: '🥩' },
      { name: 'Chana masala', emoji: '🍛' },
      { name: 'Malva pudding', emoji: '🍮' },
    ]);
    expect(card?.headline).toBe('🥩 Beef stroganoff, 🍛 Chana masala +1');
    expect(card?.detail).toContain('3 recipes');
  });

  it('is absent when nothing is queued — an empty list is not news', () => {
    expect(cookCard([])).toBeNull();
  });
});

describe('priceCard', () => {
  it('only counts a low once there is more than one reading', () => {
    // A newly tracked product's first price is not a low, it is the only
    // number there is — every new track would otherwise look like a bargain.
    expect(priceCard([{ title: 'Garmin', latest: 4499, lowest: 4499, points: 1 }])).toBeNull();
  });

  it('reports a product sitting at its lowest', () => {
    const card = priceCard([{ title: 'Dell monitor', latest: 2223, lowest: 2223, points: 6 }]);
    expect(card?.headline).toBe('Dell monitor');
    expect(card?.detail).toBe('R2\u00a0223 · lowest seen');
  });

  it('mentions how many others are also low', () => {
    const card = priceCard([
      { title: 'Dell monitor', latest: 2223, lowest: 2223, points: 6 },
      { title: 'FreeBuds', latest: 399, lowest: 399, points: 4 },
    ]);
    expect(card?.detail).toBe('R2\u00a0223 · and 1 more at a low');
  });

  it('ignores anything above its lowest', () => {
    expect(priceCard([{ title: 'Samsung', latest: 17972, lowest: 17548, points: 15 }])).toBeNull();
  });
});

describe('marvelCard', () => {
  it('calls a series a series', () => {
    const card = marvelCard([{ title: 'VisionQuest', releaseDate: '2026-10-14', mediaType: 'show' }], TODAY);
    expect(card?.headline).toBe('VisionQuest');
    expect(card?.detail).toBe('in 35 days · series');
  });
});

describe('babyCard', () => {
  const baby = { name: null, dueDate: '2026-12-17', weekAnchor: null };

  it('counts the weeks and the days to go', () => {
    const card = babyCard(baby, TODAY);
    // 99 days to the due date, so 181 days pregnant = 25 weeks + 6.
    expect(card?.headline).toBe('Week 25 + 6d');
    expect(card?.detail).toBe('99 days to go');
  });

  it('prefers the clinic anchor for the week count', () => {
    // A scan dates a pregnancy a few days off naive 280-day arithmetic, and
    // the anchor is what the clinic actually said.
    const card = babyCard({ ...baby, weekAnchor: '2026-03-11' }, TODAY);
    expect(card?.headline).toBe('Week 26');
    expect(card?.detail).toBe('99 days to go'); // countdown stays on the due date
  });

  it('handles the due date arriving and passing', () => {
    expect(babyCard(baby, '2026-12-17')?.detail).toBe('Due today');
    expect(babyCard(baby, '2026-12-20')?.detail).toBe('3 days past the due date');
  });

  it('is absent with no baby row at all', () => {
    expect(babyCard(null, TODAY)).toBeNull();
  });
});

describe('registryCard', () => {
  it('reports claimed against the total', () => {
    const card = registryCard({ items: 86, claims: 45 });
    expect(card?.headline).toBe('45 of 86 claimed');
    expect(card?.detail).toBe('41 still unclaimed');
  });

  it('is absent when there is no registry', () => {
    expect(registryCard({ items: 0, claims: 0 })).toBeNull();
    expect(registryCard(null)).toBeNull();
  });
});

describe('buildToday', () => {
  const empty: TodayInput = {
    sport: [], training: null, cook: [], marvel: [], prices: [], baby: null, registry: null,
  };

  it('is empty when nothing is on, so the hub stays short', () => {
    expect(buildToday(empty, TODAY)).toEqual([]);
  });

  it('leads with the fixture and keeps a stable order', () => {
    const cards = buildToday({
      ...empty,
      sport: [fixture()],
      training: { title: 'Twenty', weeks: 12, startedOn: '2026-08-17', dayLabels: ['Cindy'] },
      registry: { items: 86, claims: 45 },
    }, TODAY);
    expect(cards.map(c => c.key)).toEqual(['sport', 'training', 'registry']);
  });
});
