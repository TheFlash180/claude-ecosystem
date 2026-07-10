// Reminder-set hygiene, kept pure for unit testing.

/** Drop reminder IDs whose event no longer exists in the calendar data.
 *  Events get removed or renumbered between releases (e.g. the World Cup
 *  fixtures after the tournament ended); without pruning, their bells live
 *  on invisibly in localStorage and inflate the header count. */
export function pruneToExisting(ids: Set<number>, validIds: Set<number>): Set<number> {
  return new Set([...ids].filter((id) => validIds.has(id)));
}
