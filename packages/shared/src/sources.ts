// Adapter health, shared by every app that syncs from an outside feed.
//
// A source that stops answering looks exactly like "nothing changed" — the
// whole point of this file is that an app can tell the difference and say so.
// Each app keys its own `<app>_sources` table on the same seven columns and
// maps them with `sourceFromRow` below; the staleness rule itself has no
// reason to differ per app, so it lives here rather than being copied.

export interface Source {
  key: string;
  label: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastCount: number | null;
}

/** A daily sync gets a generous grace period: a single missed run is a blip,
 *  two in a row means something is actually wrong. */
export const STALE_HOURS = 50;

/** Sources worth warning about: switched on, and either erroring or too long
 *  since a clean run. A source that has never run yet is stale — it has never
 *  produced anything to trust. */
export function staleSources(
  sources: Source[],
  now = Date.now(),
  staleHours = STALE_HOURS,
): Source[] {
  return sources.filter((s) => {
    if (!s.enabled) return false;
    if (s.lastError) return true;
    if (!s.lastOkAt) return true;
    const okAt = Date.parse(s.lastOkAt);
    if (Number.isNaN(okAt)) return true;
    return okAt < now - staleHours * 3600000;
  });
}

/** "World Rugby fixtures is not updating." / "A and B are not updating." */
export function staleMessage(stale: Source[]): string {
  if (stale.length === 0) return "";
  const names = stale.map((s) => s.label);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "is" : "are"} not updating.`;
}

/** The `<app>_sources` row shape every app uses, straight off PostgREST. */
export interface SourceRow {
  key: string;
  label: string;
  enabled: boolean;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_count: number | null;
}

export function sourceFromRow(r: SourceRow): Source {
  return {
    key: r.key,
    label: r.label,
    enabled: r.enabled,
    lastRunAt: r.last_run_at,
    lastOkAt: r.last_ok_at,
    lastError: r.last_error,
    lastCount: r.last_count,
  };
}
