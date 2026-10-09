import { describe, expect, it } from 'vitest';
import { staleSources } from '@ecosystem/shared';
import {
  buildDigest, dayLabel, eventLines, isStale, releaseLines, renewalLines, sastTime,
  staleLines, STALE_HOURS, type DigestInput, type DigestSource,
} from '../../../supabase/functions/send-morning-digest/digest';

// 07:00 SAST on Tue 29 Sep 2026, when the cron fires.
const NOW = Date.parse('2026-09-29T05:00:00Z');
const TODAY = '2026-09-29';
const H = 3600000;

const quiet: DigestInput = { today: TODAY, now: NOW, events: [], releases: [], sources: [], renewals: [] };

const boks = {
  sport: 'rugby', home: 'Springboks', away: 'Wales', homeFlag: '🇿🇦', awayFlag: '🏴',
  date: '2026-09-29T15:10:00Z', // 17:10 SAST
};

describe('buildDigest', () => {
  it('sends nothing on a quiet day', () => {
    expect(buildDigest(quiet)).toBeNull();
  });

  it('titles the push with the day and puts one thing per line', () => {
    const d = buildDigest({ ...quiet, events: [boks], releases: [{ title: 'Blade', mediaType: 'movie' }] });
    expect(d?.title).toBe('Today · Tue 29 Sep');
    expect(d?.body).toBe('🏉 🇿🇦 Springboks vs 🏴 Wales · 17:10\n🎬 Blade is out today');
  });
});

describe('eventLines', () => {
  it('keeps only what is still to come today, in SAST', () => {
    const lines = eventLines([
      boks,
      { ...boks, home: 'Earlier', date: '2026-09-29T04:00:00Z' }, // 06:00, already gone
      { ...boks, home: 'Tomorrow', date: '2026-09-29T22:30:00Z' }, // 00:30 SAST on the 30th
      { ...boks, home: 'Late', date: '2026-09-29T21:30:00Z' }, // 23:30 SAST, still today
    ], TODAY, NOW);
    expect(lines).toEqual([
      '🏉 🇿🇦 Springboks vs 🏴 Wales · 17:10',
      '🏉 🇿🇦 Late vs 🏴 Wales · 23:30',
    ]);
  });

  it('names a race without an opponent and caps a busy day at three', () => {
    const race = { sport: 'f1', home: 'Singapore Grand Prix', away: null, homeFlag: null, awayFlag: null };
    const hours = ['06', '07', '08', '09'];
    const lines = eventLines(hours.map(h => ({ ...race, date: `2026-09-29T${h}:00:00Z` })), TODAY, NOW);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('🏎️ Singapore Grand Prix · 08:00');
  });
});

describe('releaseLines', () => {
  it('reads a series as starting', () => {
    expect(releaseLines([{ title: 'VisionQuest', mediaType: 'show' }])).toEqual(['🎬 VisionQuest starts today']);
  });
});

describe('renewalLines', () => {
  it('mentions only what is within two weeks or overdue, soonest first', () => {
    expect(renewalLines([
      { kind: 'disc', subject: 'Polo', date: '2026-10-10' }, // 11 days
      { kind: 'licence', subject: 'Rickus', date: '2027-07-17' }, // far off
      { kind: 'service', subject: 'Polo', date: '2026-09-26' }, // 3 days overdue
      { kind: 'disc', subject: 'Hilux', date: '2026-09-30' },
    ], TODAY)).toEqual([
      '🔧 Polo: service overdue by 3 days',
      '🚗 Hilux: licence disc expires tomorrow',
      '🚗 Polo: licence disc expires in 11 days',
    ]);
  });

  it('says today, and a single overdue day, naturally', () => {
    expect(renewalLines([
      { kind: 'licence', subject: 'Anjoné', date: TODAY },
      { kind: 'disc', subject: 'Polo', date: '2026-09-28' },
    ], TODAY)).toEqual([
      '🚗 Polo: licence disc expired 1 day ago',
      "🪪 Anjoné: driver's licence expires today",
    ]);
  });
});

describe('staleLines', () => {
  const src = (over: Partial<DigestSource>): DigestSource => ({
    app: 'Price Watch', label: 'Takealot', enabled: true,
    lastOkAt: new Date(NOW - 2 * H).toISOString(), lastError: null, ...over,
  });

  it('says nothing about a healthy feed', () => {
    expect(staleLines([src({})], NOW)).toEqual([]);
  });

  it('names a feed that has gone quiet, a failing one, and one never run', () => {
    expect(staleLines([
      src({ lastOkAt: new Date(NOW - 75 * H).toISOString() }),
      src({ app: 'Sport Watch', label: 'F1 calendar', lastError: 'HTTP 503' }),
      src({ app: 'Marvel Watch', label: 'TMDB', lastOkAt: null }),
      src({ app: 'Price Watch', label: 'Makro', enabled: false, lastError: 'off' }),
    ], NOW)).toEqual([
      "⚠️ Price Watch: Takealot hasn't updated in 3 days",
      '⚠️ Sport Watch: F1 calendar sync is failing',
      '⚠️ Marvel Watch: TMDB has never synced',
    ]);
  });

  it('never prints NaN for an unreadable sync time', () => {
    expect(staleLines([src({ lastOkAt: 'not a date' })], NOW))
      .toEqual(['⚠️ Price Watch: Takealot has no readable sync time']);
  });

  it('agrees with the shared staleness rule the apps draw their banners from', () => {
    const cases: DigestSource[] = [
      src({}),
      src({ lastOkAt: new Date(NOW - (STALE_HOURS - 1) * H).toISOString() }),
      src({ lastOkAt: new Date(NOW - (STALE_HOURS + 1) * H).toISOString() }),
      src({ lastError: 'x' }),
      src({ lastOkAt: null }),
      src({ lastOkAt: 'not a date' }),
      src({ enabled: false, lastError: 'x' }),
    ];
    for (const c of cases) {
      const shared = staleSources([{
        key: 'k', label: c.label, enabled: c.enabled, lastRunAt: null,
        lastOkAt: c.lastOkAt, lastError: c.lastError, lastCount: null,
      }], NOW).length === 1;
      expect(isStale(c, NOW)).toBe(shared);
    }
  });
});

describe('formatting', () => {
  it('uses the SAST clock and hand-rolled names', () => {
    expect(sastTime('2026-09-29T15:10:00Z')).toBe('17:10');
    expect(sastTime('2026-09-29T22:05:00Z')).toBe('00:05');
    expect(dayLabel('2026-12-17')).toBe('Thu 17 Dec');
  });
});
