import { describe, expect, it } from 'vitest';
import { pruneToExisting } from '../reminders';

describe('pruneToExisting', () => {
  it('keeps only ids that still exist in the calendar', () => {
    const pruned = pruneToExisting(new Set([1, 2, 20, 21]), new Set([1, 2, 3]));
    expect([...pruned].sort()).toEqual([1, 2]);
  });

  it('is a no-op when everything still exists', () => {
    const pruned = pruneToExisting(new Set([1, 2]), new Set([1, 2, 3]));
    expect(pruned.size).toBe(2);
  });

  it('handles an empty reminder set', () => {
    expect(pruneToExisting(new Set(), new Set([1])).size).toBe(0);
  });
});
