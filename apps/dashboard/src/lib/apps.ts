export interface AppEntry {
  slug: string;
  name: string;
}

/** The hub's tile list is injected at build time by tooling/build-all.mjs as a
 *  JSON string in VITE_APPS. A malformed or unexpected value must degrade to an
 *  empty list rather than throw: a broken injection should cost the hub its
 *  tiles, not white-screen the page that links to every other app.
 *
 *  Entries are validated individually, so one bad record can't discard the
 *  good ones. */
export function parseApps(raw: string | undefined): AppEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isAppEntry).map((a) => ({ slug: a.slug, name: a.name }));
}

function isAppEntry(value: unknown): value is AppEntry {
  if (typeof value !== 'object' || value === null) return false;
  const { slug, name } = value as Record<string, unknown>;
  return typeof slug === 'string' && slug !== '' && typeof name === 'string' && name !== '';
}
