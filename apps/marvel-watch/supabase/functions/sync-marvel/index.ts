// Marvel Watch: TMDB auto-sync (copy of record — deployed as sync-marvel).
// Called daily by pg_cron. Pulls Marvel Studios movies + Disney+ shows (and
// Sony's Marvel films) from TMDB and upserts marvel_titles. Rows the admin
// created/edited (manual=true) are never overwritten. Brand-new future
// titles land with announced_pushed=false, which makes
// send-marvel-reminders push a "newly announced" notification to every
// subscribed device.
// The TMDB key comes from the TMDB_API_KEY secret or Vault
// (get_tmdb_api_key, service-role only); without it the sync just skips.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const MARVEL_STUDIOS = 420;        // MCU proper (movies + Disney+ shows)
const MARVEL_ENTERTAINMENT = 7505; // Sony-era Marvel films

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let key = Deno.env.get("TMDB_API_KEY");
  if (!key) {
    const { data } = await sb.rpc("get_tmdb_api_key");
    key = (data as string) ?? undefined;
  }
  if (!key) {
    return new Response(JSON.stringify({ skipped: "no TMDB key configured (Vault secret tmdb_api_key)" }));
  }

  // v4 read tokens are long JWTs; v3 keys are 32-char hex. Support both.
  const isV4 = key.length > 60;
  const auth = isV4 ? { headers: { Authorization: `Bearer ${key}` } } : {};
  const keyParam = isV4 ? "" : `&api_key=${key}`;

  async function tmdb(path: string, params: string): Promise<any | null> {
    const res = await fetch(`${TMDB}${path}?${params}${keyParam}`, auth);
    if (!res.ok) return null;
    return res.json();
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);

  const { data: existingRows, error: exErr } = await sb
    .from("marvel_titles")
    .select("id, media_type, title, tmdb_id, manual, universe");
  if (exErr) {
    return new Response(JSON.stringify({ error: exErr.message }), { status: 500 });
  }
  const byTmdb = new Map<string, any>();
  const byTitle = new Map<string, any>();
  for (const r of existingRows ?? []) {
    if (r.tmdb_id) byTmdb.set(`${r.media_type}|${r.tmdb_id}`, r);
    byTitle.set(`${r.media_type}|${norm(r.title)}`, r);
  }

  let upserted = 0;
  let added = 0;
  const errors: string[] = [];

  interface Incoming {
    mediaType: "movie" | "show";
    tmdbId: number;
    title: string;
    date: string | null;
    overview: string | null;
    poster: string | null;
    backdrop: string | null;
    universe: string;
  }

  const incoming: Incoming[] = [];

  // Movies: MCU + Sony Marvel, recent past through the future.
  for (const [company, universe] of [[MARVEL_STUDIOS, "mcu"], [MARVEL_ENTERTAINMENT, "sony"]] as const) {
    for (const page of [1, 2]) {
      const j = await tmdb("/discover/movie",
        `with_companies=${company}&sort_by=primary_release_date.asc&primary_release_date.gte=${from}&page=${page}&include_adult=false`);
      if (!j) { errors.push(`movies c${company} p${page}`); continue; }
      for (const m of j.results ?? []) {
        incoming.push({
          mediaType: "movie", tmdbId: m.id, title: m.title,
          date: m.release_date || null, overview: m.overview || null,
          poster: m.poster_path ? `${IMG}/w500${m.poster_path}` : null,
          backdrop: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
          universe,
        });
      }
      if ((j.total_pages ?? 1) <= page) break;
    }
  }

  // Shows: Marvel Studios (covers live-action + animated Disney+ series).
  for (const page of [1, 2]) {
    const j = await tmdb("/discover/tv",
      `with_companies=${MARVEL_STUDIOS}&sort_by=first_air_date.asc&first_air_date.gte=${from}&page=${page}&include_adult=false`);
    if (!j) { errors.push(`tv p${page}`); continue; }
    for (const t of j.results ?? []) {
      incoming.push({
        mediaType: "show", tmdbId: t.id, title: t.name,
        date: t.first_air_date || null, overview: t.overview || null,
        poster: t.poster_path ? `${IMG}/w500${t.poster_path}` : null,
        backdrop: t.backdrop_path ? `${IMG}/w780${t.backdrop_path}` : null,
        universe: "mcu",
      });
    }
    if ((j.total_pages ?? 1) <= page) break;
  }

  for (const t of incoming) {
    const existing = byTmdb.get(`${t.mediaType}|${t.tmdbId}`)
      ?? byTitle.get(`${t.mediaType}|${norm(t.title)}`);

    if (existing?.manual) continue; // admin owns it

    const patch = {
      title: t.title,
      release_date: t.date,
      date_tbc: t.date === null,
      overview: t.overview,
      poster_url: t.poster,
      backdrop_url: t.backdrop,
      tmdb_id: t.tmdbId,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await sb.from("marvel_titles").update(patch).eq("id", existing.id);
      if (!error) upserted++;
      else errors.push(`upd ${t.title}`);
    } else {
      const isFuture = t.date === null || t.date >= today;
      const { error } = await sb.from("marvel_titles").insert({
        id: `tmdb-${t.mediaType === "movie" ? "m" : "s"}-${t.tmdbId}`,
        media_type: t.mediaType,
        universe: t.universe,
        watch_on: t.mediaType === "movie" ? "Cinemas" : "Disney+",
        is_special: false,
        manual: false,
        // Only future titles count as "newly announced" worth a push.
        announced_pushed: !isFuture,
        ...patch,
      });
      if (!error) { upserted++; added++; }
      else errors.push(`ins ${t.title}`);
    }
  }

  return new Response(
    JSON.stringify({ scanned: incoming.length, upserted, newTitles: added, errors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
