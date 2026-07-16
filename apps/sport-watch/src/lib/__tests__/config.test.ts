import { describe, expect, it } from 'vitest';
import { catOf, DEFAULT_CATEGORIES, flagName, matchTitle, toCatMap } from '../config';

describe('flagName / matchTitle', () => {
  it('joins flag and name', () => {
    expect(flagName('🇿🇦', 'Springboks')).toBe('🇿🇦 Springboks');
  });

  it('never renders "null" or dangling spaces when a flag was left out', () => {
    expect(flagName(null, 'Ryan Garcia')).toBe('Ryan Garcia');
    expect(flagName('', 'Ryan Garcia')).toBe('Ryan Garcia');
    const title = matchTitle({ home: 'Ryan Garcia', away: 'Conor Benn', homeFlag: '', awayFlag: null });
    expect(title).toBe('Ryan Garcia vs Conor Benn');
    expect(title).not.toContain('null');
  });

  it('mixes flagged and unflagged sides cleanly', () => {
    expect(matchTitle({ home: 'Springboks', away: 'Barbarians', homeFlag: '🇿🇦', awayFlag: null }))
      .toBe('🇿🇦 Springboks vs Barbarians');
  });
});

describe('catOf', () => {
  const cats = toCatMap(DEFAULT_CATEGORIES);

  it('returns known categories', () => {
    expect(catOf(cats, 'boxing').icon).toBe('🥊');
    expect(catOf(cats, 'mma').icon).toBe('🥋');
    expect(catOf(cats, 'football').label).toBe('Football');
  });

  it('falls back safely for unknown keys', () => {
    const c = catOf(cats, 'darts');
    expect(c.icon).toBe('🏅');
    expect(c.liveMinutes).toBe(120);
  });
});
