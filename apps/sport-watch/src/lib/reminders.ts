// Reminder-set hygiene, kept pure for unit testing.

/** Drop reminder IDs whose event no longer exists in the calendar data.
 *  Events get removed or renumbered between releases; without pruning, their
 *  bells live on invisibly and inflate the header count. */
export function pruneToExisting(ids: Set<string>, validIds: Set<string>): Set<string> {
  return new Set([...ids].filter((id) => validIds.has(id)));
}
