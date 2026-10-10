import { describe, expect, it } from 'vitest';
import { decodeCache, encodeCache, savedAtLabel } from '../eventsCache';

describe('events cache', () => {
  it('round-trips rows exactly as stored', () => {
    const raw = encodeCache([{ id: 'a', event_date: '2026-10-11T12:00:00Z' }], [{ key: 'f1' }], new Date('2026-10-10T12:05:00Z'));
    expect(decodeCache(raw)).toEqual({
      savedAt: '2026-10-10T12:05:00.000Z',
      events: [{ id: 'a', event_date: '2026-10-11T12:00:00Z' }],
      categories: [{ key: 'f1' }],
    });
  });

  it('refuses anything that is not a usable list', () => {
    expect(decodeCache(null)).toBeNull();
    expect(decodeCache('not json')).toBeNull();
    expect(decodeCache('{"savedAt":"x","events":[]}')).toBeNull();
    expect(decodeCache('{"events":[{"id":"a"}]}')).toBeNull();
  });

  it('tolerates missing categories', () => {
    expect(decodeCache('{"savedAt":"2026-10-10T00:00:00Z","events":[{"id":"a"}]}')?.categories).toEqual([]);
  });

  it('labels the load time in SAST', () => {
    expect(savedAtLabel('2026-10-10T22:30:00Z')).toBe('11 Oct, 00:30');
    expect(savedAtLabel('nonsense')).toBe('');
  });
});
