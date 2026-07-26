import { describe, expect, it } from 'vitest';
import { parseApps } from '../apps';

describe('parseApps', () => {
  it('parses the tile list injected by the build', () => {
    const raw = '[{"slug":"sport-watch","name":"Ultimate Sport Watch"},{"slug":"meal-prep","name":"Meal Prep"}]';
    expect(parseApps(raw)).toEqual([
      { slug: 'sport-watch', name: 'Ultimate Sport Watch' },
      { slug: 'meal-prep', name: 'Meal Prep' },
    ]);
  });

  it('degrades to an empty list instead of throwing on malformed JSON', () => {
    // The hub links to every other app; a broken injection must not white-screen it.
    expect(parseApps('{not json')).toEqual([]);
    expect(parseApps('[{"slug":')).toEqual([]);
  });

  it('returns an empty list when the variable is missing or blank', () => {
    expect(parseApps(undefined)).toEqual([]);
    expect(parseApps('')).toEqual([]);
  });

  it('returns an empty list when the JSON is not an array', () => {
    expect(parseApps('{"slug":"x","name":"y"}')).toEqual([]);
    expect(parseApps('"a string"')).toEqual([]);
    expect(parseApps('null')).toEqual([]);
  });

  it('drops malformed entries but keeps the good ones', () => {
    const raw = JSON.stringify([
      { slug: 'ok', name: 'Fine' },
      { slug: 'no-name' },
      { name: 'no-slug' },
      null,
      'nonsense',
      { slug: '', name: 'blank slug' },
      { slug: 'n', name: 42 },
    ]);
    expect(parseApps(raw)).toEqual([{ slug: 'ok', name: 'Fine' }]);
  });

  it('keeps only slug and name, ignoring extra fields', () => {
    const raw = '[{"slug":"a","name":"A","extra":"ignored"}]';
    expect(parseApps(raw)).toEqual([{ slug: 'a', name: 'A' }]);
  });
});
