import { describe, expect, it } from 'vitest';
import { COMING_SOON, FALLBACK_META, greeting, metaFor } from '../appMeta';

describe('metaFor', () => {
  it('gives each known app its own colour and icon', () => {
    expect(metaFor('sport-watch').color).toBe('#3AA864');
    expect(metaFor('marvel-watch').icon).toBe('film');
    expect(metaFor('fintrack-pro').note).toBe('household finance');
  });

  it('falls back for an unknown slug instead of returning undefined', () => {
    // A newly deployed app must still render a usable tile.
    expect(metaFor('brand-new-app')).toEqual(FALLBACK_META);
    expect(metaFor('')).toEqual(FALLBACK_META);
  });

  it('never returns a blank colour, icon or note', () => {
    for (const slug of ['baby-logger', 'meal-prep', 'workout-plan', 'baby-registry', 'nope']) {
      const m = metaFor(slug);
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.icon).toBeTruthy();
      expect(m.note).toBeTruthy();
    }
  });

  it('is not fooled by inherited Object properties', () => {
    // A slug like "constructor" must not resolve to something off the prototype.
    expect(metaFor('constructor')).toEqual(FALLBACK_META);
    expect(metaFor('toString')).toEqual(FALLBACK_META);
  });
});

describe('greeting', () => {
  it('changes at midday and 18:00', () => {
    expect(greeting(0)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good afternoon');
    expect(greeting(18)).toBe('Good evening');
    expect(greeting(23)).toBe('Good evening');
  });

  it('degrades to a neutral greeting for an impossible hour', () => {
    expect(greeting(-1)).toBe('Hello');
    expect(greeting(24)).toBe('Hello');
    expect(greeting(NaN)).toBe('Hello');
  });
});

describe('COMING_SOON', () => {
  it('gives every planned app its own colour and icon, not the grey fallback', () => {
    // Forgetting the META row would ship a roadmap tile that looks broken.
    for (const app of COMING_SOON) {
      expect(metaFor(app.slug), `${app.slug} needs a META entry`).not.toEqual(FALLBACK_META);
      expect(metaFor(app.slug).color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has a name and slug for every entry, with no duplicate slugs', () => {
    for (const app of COMING_SOON) {
      expect(app.slug).toBeTruthy();
      expect(app.name).toBeTruthy();
    }
    const slugs = COMING_SOON.map(a => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
