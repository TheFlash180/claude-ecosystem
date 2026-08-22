import { describe, it, expect } from 'vitest';
import { staleSources, staleMessage, STALE_HOURS, type Source } from '../sources';

const NOW = Date.parse('2026-08-22T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString();

const src = (over: Partial<Source> = {}): Source => ({
  key: 'rugby-worldrugby',
  label: 'World Rugby fixtures',
  enabled: true,
  lastRunAt: hoursAgo(1),
  lastOkAt: hoursAgo(1),
  lastError: null,
  lastCount: 11,
  ...over,
});

describe('staleSources', () => {
  it('is quiet when a source ran cleanly just now', () => {
    expect(staleSources([src()], NOW)).toEqual([]);
  });

  it('flags a source carrying an error even if it ran recently', () => {
    const s = src({ lastError: 'HTTP 502' });
    expect(staleSources([s], NOW)).toEqual([s]);
  });

  it('flags a source that has not had a clean run in too long', () => {
    const s = src({ lastOkAt: hoursAgo(STALE_HOURS + 1) });
    expect(staleSources([s], NOW)).toEqual([s]);
  });

  it('tolerates one missed daily run', () => {
    expect(staleSources([src({ lastOkAt: hoursAgo(26) })], NOW)).toEqual([]);
  });

  it('flags a source that has never completed a run', () => {
    const s = src({ lastOkAt: null, lastRunAt: null });
    expect(staleSources([s], NOW)).toEqual([s]);
  });

  it('flags an unparseable timestamp rather than treating it as fresh', () => {
    const s = src({ lastOkAt: 'not a date' });
    expect(staleSources([s], NOW)).toEqual([s]);
  });

  it('ignores a source that is switched off', () => {
    expect(staleSources([src({ enabled: false, lastError: 'boom' })], NOW)).toEqual([]);
  });
});

describe('staleMessage', () => {
  it('is empty when nothing is stale', () => {
    expect(staleMessage([])).toBe('');
  });

  it('reads as a singular sentence for one source', () => {
    expect(staleMessage([src()])).toBe('World Rugby fixtures is not updating.');
  });

  it('joins two sources with "and" and turns plural', () => {
    const two = [src(), src({ key: 'f1-jolpica', label: 'F1 calendar' })];
    expect(staleMessage(two)).toBe('World Rugby fixtures and F1 calendar are not updating.');
  });

  it('comma-separates three or more', () => {
    const three = [
      src({ label: 'A' }), src({ label: 'B' }), src({ label: 'C' }),
    ];
    expect(staleMessage(three)).toBe('A, B and C are not updating.');
  });
});
