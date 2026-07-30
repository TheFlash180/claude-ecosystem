// Front Row sync (copy of record — deployed as sync-frontrow). Daily at
// 04:15 UTC (06:15 SAST), ahead of the notifier.
//
// Each ticket seller is an adapter: fetch, normalise, return. Adding a source
// is one more entry in SOURCES — nothing else changes.
//
// Quicket notes, established by probing the live API:
//   - /api/events returns results ordered by startDate ASCENDING, so upcoming
//     events sit at the END. We read the last page first and walk backwards,
//     stopping once a page is entirely in the past. That turns ~90 requests
//     into ~10 and keeps the run well inside the function time limit.
//   - There is no working search parameter (q= and search= are silently
//     ignored), so filtering happens in our own database against watches.
//   - `description` is multi-kilobyte HTML; it is stripped to a short plain
//     text summary rather than stored.
//   - `dateCreated` is when the event was listed — the on-sale signal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const PAGE_SIZE = 50;
const MAX_PAGES = 25;      // safety rail; ~1250 upcoming events is plenty
const BATCH = 5;           // pages fetched concurrently — polite for a daily job
const BUDGET_MS = 60000;   // stop fetching and keep what we have
const SUMMARY_CHARS = 280;

export interface NormalisedEvent {
  source: string;
  external_id: string;
  name: string;
  url: string | null;
  image_url: string | null;
  summary: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  categories: string[];
  organiser: string | null;
  price_from: number | null;
  listed_at: string | null;
  dedupe_key: string;
}

/** Strip HTML to a short plain-text blurb. Quicket descriptions are pages of
 *  marked-up terms; the card only ever shows a couple of lines. */
export function toSummary(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > SUMMARY_CHARS ? text.slice(0, SUMMARY_CHARS - 1) + "…" : text;
}

/** Identity across sources: the same show listed by two sellers must collapse
 *  to one alert. Name + venue + calendar day, aggressively normalised. */
export function dedupeKey(name: string, venue: string | null, startsAt: string | null): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const day = startsAt ? startsAt.slice(0, 10) : "nodate";
  return `${norm(name)}|${norm(venue ?? "")}|${day}`;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Quicket sends naive local timestamps ("2026-10-11T19:30:00") with no zone.
 *  They are SAST, so pin the offset rather than letting Postgres assume UTC —
 *  otherwise every event shifts two hours and evening shows land on the wrong
 *  day for anything comparing dates. */
export function sastTimestamp(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const s = v.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;      // already zoned
  return `${s.replace(/\.\d+$/, "")}+02:00`;
}

export function normaliseQuicket(e: Record<string, any>): NormalisedEvent | null {
  if (!e?.id || !e?.name) return null;
  const venue = e.venue ?? null;
  const loc = e.locality ?? null;
  const localityText = loc
    ? [loc.levelTwo, loc.levelThree].filter(Boolean).join(" · ") || null
    : null;

  const prices = Array.isArray(e.tickets)
    ? e.tickets.map((t: any) => num(t?.price)).filter((p): p is number => p !== null && p >= 0)
    : [];

  const startsAt = sastTimestamp(e.startDate);

  return {
    source: "quicket",
    external_id: String(e.id),
    name: String(e.name).trim(),
    url: e.url ? String(e.url) : null,
    image_url: e.imageUrl ? String(e.imageUrl).replace(/^\/\//, "https://") : null,
    summary: toSummary(e.description),
    starts_at: startsAt,
    ends_at: sastTimestamp(e.endDate),
    venue_name: venue?.name ? String(venue.name).trim() : null,
    // Quicket uses 0,0 for "unknown", which would otherwise place every
    // unlocated event in the Gulf of Guinea and inside no radius at all.
    lat: num(venue?.latitude) || null,
    lng: num(venue?.longitude) || null,
    locality: localityText,
    categories: Array.isArray(e.categories)
      ? e.categories.map((c: any) => String(c?.name ?? c)).filter(Boolean)
      : [],
    organiser: e.organiser?.name ? String(e.organiser.name) : null,
    price_from: prices.length ? Math.min(...prices) : null,
    listed_at: sastTimestamp(e.dateCreated),
    dedupe_key: dedupeKey(String(e.name), venue?.name ?? null, startsAt),
  };
}

async function fetchQuicket(sb: SupabaseClient): Promise<NormalisedEvent[]> {
  const { data: key, error } = await sb.rpc("get_quicket_api_key");
  if (error || !key) throw new Error("Quicket API key unavailable from Vault");

  const base = `https://api.quicket.co.za/api/events?api_key=${key}&pageSize=${PAGE_SIZE}`;
  const first = await fetch(`${base}&page=1`, { headers: { Accept: "application/json" } });
  if (!first.ok) throw new Error(`Quicket page 1: HTTP ${first.status}`);
  const head = await first.json();
  const totalPages = Math.max(1, Number(head?.pages) || 1);

  const cutoff = Date.now() - 86400000; // keep yesterday onward
  const out: NormalisedEvent[] = [];
  const deadline = Date.now() + BUDGET_MS;

  // Walk backwards from the newest page, a batch at a time. Quicket answers in
  // 1-5s, so fetching these one after another blows the function's wall clock
  // long before the pages run out; in batches it finishes in seconds.
  for (let i = 0; i < MAX_PAGES; i += BATCH) {
    if (Date.now() > deadline) break;

    const pages: number[] = [];
    for (let j = 0; j < BATCH; j++) {
      const p = totalPages - (i + j);
      if (p >= 1) pages.push(p);
    }
    if (pages.length === 0) break;

    const batches = await Promise.all(pages.map(async (page) => {
      const res = await fetch(`${base}&page=${page}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Quicket page ${page}: HTTP ${res.status}`);
      const json = await res.json();
      return (json?.results ?? []) as Record<string, any>[];
    }));

    let anyFuture = false;
    let anyRows = false;
    for (const results of batches) {
      if (results.length > 0) anyRows = true;
      for (const raw of results) {
        const ev = normaliseQuicket(raw);
        if (!ev) continue;
        const t = ev.starts_at ? Date.parse(ev.starts_at) : NaN;
        if (Number.isFinite(t) && t >= cutoff) {
          anyFuture = true;
          out.push(ev);
        }
      }
    }
    // Ordered by startDate ascending, so once a whole batch is in the past,
    // everything before it is older still.
    if (!anyRows || !anyFuture) break;
  }

  return out;
}

const SOURCES: Record<string, (sb: SupabaseClient) => Promise<NormalisedEvent[]>> = {
  quicket: fetchQuicket,
};

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: sources } = await sb.from("frontrow_sources").select("key, enabled");
  const report: Record<string, unknown> = {};

  for (const [key, adapter] of Object.entries(SOURCES)) {
    const row = (sources ?? []).find((s: any) => s.key === key);
    if (row && row.enabled === false) {
      report[key] = "disabled";
      continue;
    }

    const startedAt = new Date().toISOString();
    try {
      const fetched = await adapter(sb);

      // The same event can appear on more than one page (the list shifts under
      // paging, and recurring events repeat), and Postgres rejects an upsert
      // whose batch touches one row twice. Collapse on the conflict key first.
      const unique = new Map<string, NormalisedEvent>();
      for (const e of fetched) unique.set(`${e.source}|${e.external_id}`, e);
      const events = [...unique.values()];

      // Upsert in chunks: one oversized request can fail the whole sync.
      for (let i = 0; i < events.length; i += 200) {
        const chunk = events.slice(i, i + 200).map((e) => ({ ...e, last_seen: startedAt }));
        const { error } = await sb.from("frontrow_events")
          .upsert(chunk, { onConflict: "source,external_id" });
        if (error) throw new Error(error.message);
      }

      await sb.from("frontrow_sources").update({
        last_run_at: startedAt, last_ok_at: new Date().toISOString(),
        last_error: null, last_count: events.length,
      }).eq("key", key);
      report[key] = { ok: true, events: events.length };
    } catch (e) {
      // Record the failure rather than swallowing it: a discovery tool that
      // goes quiet is worse than one that says it is broken.
      await sb.from("frontrow_sources").update({
        last_run_at: startedAt, last_error: String(e).slice(0, 500),
      }).eq("key", key);
      report[key] = { ok: false, error: String(e).slice(0, 200) };
    }
  }

  // Drop events that have finished; the notifier and UI only look forward.
  const { count } = await sb.from("frontrow_events")
    .delete({ count: "exact" })
    .lt("starts_at", new Date(Date.now() - 7 * 86400000).toISOString());

  return new Response(JSON.stringify({ report, pruned: count ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
