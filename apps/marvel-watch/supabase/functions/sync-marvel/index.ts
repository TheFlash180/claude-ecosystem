// Marvel Watch: TMDB auto-sync (copy of record — deployed as sync-marvel).
// Called daily by pg_cron. Pulls Marvel Studios movies + Disney+ shows (and
// Sony's Marvel films) from TMDB and upserts marvel_titles. Rows the admin
// created/edited (manual=true) are never overwritten. Brand-new future
// titles land with announced_pushed=false, which makes
// send-marvel-reminders push a "newly announced" notification to every
// subscribed device.
//
// It also RECONCILES: a title TMDB has retracted is stamped with
// missing_since and removed once it has been absent for MISSING_GRACE_DAYS.
// Without that, a bogus entry that TMDB deletes upstream lives in the app
// forever — marvel-prune-titles only clears rows 130+ days *past* release, so
// a retracted future title is never caught. That is how a duplicate
// "VisionQuest" movie sat next to the real show, and how a device kept a
// reminder for a film that no longer existed.
//
// The TMDB key comes from the TMDB_API_KEY secret or Vault
// (get_tmdb_api_key, service-role only); without it the sync just skips.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const MARVEL_STUDIOS = 420;        // MCU proper (movies + Disney+ shows)
const MARVEL_ENTERTAINMENT = 7505; // Sony-era Marvel films
const SOURCE_KEY = "tmdb";

/** How long a title may be absent from TMDB before it is deleted. One bad day
 *  at TMDB must not empty the app, and a title genuinely pulled upstream is
 *  not urgent — three daily runs of agreement is a cheap way to be sure. */
const MISSING_GRACE_DAYS = 3;

/** How far back discover is asked to look. Anything released before this is
 *  outside what the sync can see, so it is also outside what it may delete. */
const WINDOW_DAYS = 120;

/** Paging cap per discover query. Reconcile needs to know it saw everything,
 *  so pages are walked until TMDB says there are no more; hitting this cap
 *  means the list was truncated and the reconcile pass stands down. */
const MAX_PAGES = 5;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = new Date().toISOString();

  /** Record what happened, whatever happened. last_ok_at only advances on a
   *  run that read every page cleanly — a sync that failed and left the old
   *  data in place must look stale to the app, not reassuring. */
  async function health(count: number, errs: string[], complete: boolean) {
    const clean = errs.length === 0 && complete;
    const patch: Record<string, unknown> = {
      last_run_at: startedAt,
      last_error: errs.length ? errs.join(" | ").slice(0, 500) : null,
      last_count: count,
    };
    if (clean) patch.last_ok_at = new Date().toISOString();
    await sb.from("marvel_sources").update(patch).eq("key", SOURCE_KEY);
  }

  let key = Deno.env.get("TMDB_API_KEY");
  if (!key) {
    const { data } = await sb.rpc("get_tmdb_api_key");
    key = (data as string) ?? undefined;
  }
  if (!key) {
    const msg = "no TMDB key configured (Vault secret tmdb_api_key)";
    await health(0, [msg], false);
    return new Response(JSON.stringify({ skipped: msg }));
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
  const from = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const { data: existingRows, error: exErr } = await sb
    .from("marvel_titles")
    .select("id, media_type, title, tmdb_id, manual, universe, release_date, missing_since");
  if (exErr) {
    await health(0, [`read: ${exErr.message}`], false);
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
  /** False as soon as any query is cut short — see MAX_PAGES. */
  let complete = true;

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

  /** Walk every page of a discover query. `onRow` collects; `complete` and
   *  `errors` record whether the whole result set was actually seen. */
  async function discover(
    path: string,
    params: (page: number) => string,
    label: string,
    onRow: (row: any) => void,
  ): Promise<void> {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const j = await tmdb(path, params(page));
      if (!j) { errors.push(`${label} p${page}`); return; }
      for (const row of j.results ?? []) onRow(row);
      const total = j.total_pages ?? 1;
      if (total <= page) return;
      if (page === MAX_PAGES) {
        // More results exist than we fetched, so "absent from incoming" no
        // longer means "gone from TMDB".
        complete = false;
        errors.push(`${label} truncated at p${MAX_PAGES} of ${total}`);
      }
    }
  }

  // Movies: MCU + Sony Marvel, recent past through the future.
  for (const [company, universe] of [[MARVEL_STUDIOS, "mcu"], [MARVEL_ENTERTAINMENT, "sony"]] as const) {
    await discover(
      "/discover/movie",
      (page) => `with_companies=${company}&sort_by=primary_release_date.asc&primary_release_date.gte=${from}&page=${page}&include_adult=false`,
      `movies c${company}`,
      (m) => incoming.push({
        mediaType: "movie", tmdbId: m.id, title: m.title,
        date: m.release_date || null, overview: m.overview || null,
        poster: m.poster_path ? `${IMG}/w500${m.poster_path}` : null,
        backdrop: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
        universe,
      }),
    );
  }

  // Shows: Marvel Studios (covers live-action + animated Disney+ series).
  await discover(
    "/discover/tv",
    (page) => `with_companies=${MARVEL_STUDIOS}&sort_by=first_air_date.asc&first_air_date.gte=${from}&page=${page}&include_adult=false`,
    "tv",
    (t) => incoming.push({
      mediaType: "show", tmdbId: t.id, title: t.name,
      date: t.first_air_date || null, overview: t.overview || null,
      poster: t.poster_path ? `${IMG}/w500${t.poster_path}` : null,
      backdrop: t.backdrop_path ? `${IMG}/w780${t.backdrop_path}` : null,
      universe: "mcu",
    }),
  );

  /** Rows TMDB confirmed this run, by marvel_titles.id. Keyed on the row that
   *  actually matched rather than on the incoming tmdb_id, because a title
   *  match can attach an incoming record to a row that held a different id. */
  const seen = new Set<string>();

  for (const t of incoming) {
    const existing = byTmdb.get(`${t.mediaType}|${t.tmdbId}`)
      ?? byTitle.get(`${t.mediaType}|${norm(t.title)}`);

    if (existing) seen.add(existing.id);
    if (existing?.manual) continue; // admin owns it

    const patch = {
      title: t.title,
      release_date: t.date,
      date_tbc: t.date === null,
      overview: t.overview,
      poster_url: t.poster,
      backdrop_url: t.backdrop,
      tmdb_id: t.tmdbId,
      // Back from the dead: a title that reappears starts its grace period
      // over rather than being deleted on the strength of an old absence.
      missing_since: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await sb.from("marvel_titles").update(patch).eq("id", existing.id);
      if (!error) upserted++;
      else errors.push(`upd ${t.title}`);
    } else {
      const isFuture = t.date === null || t.date >= today;
      const id = `tmdb-${t.mediaType === "movie" ? "m" : "s"}-${t.tmdbId}`;
      const { error } = await sb.from("marvel_titles").insert({
        id,
        media_type: t.mediaType,
        universe: t.universe,
        watch_on: t.mediaType === "movie" ? "Cinemas" : "Disney+",
        is_special: false,
        manual: false,
        // Only future titles count as "newly announced" worth a push.
        announced_pushed: !isFuture,
        ...patch,
      });
      if (!error) { upserted++; added++; seen.add(id); }
      else errors.push(`ins ${t.title}`);
    }
  }

  // ---- reconcile ------------------------------------------------------
  // Only on a run that read every page of every query. Otherwise one bad
  // afternoon at TMDB reads as "Marvel cancelled everything" and the sync
  // deletes the catalogue it is supposed to maintain.
  let flagged = 0;
  let removed = 0;
  const deletedTitles: string[] = [];

  if (errors.length === 0 && complete) {
    /** Would this run have returned the row if TMDB still carried it? Only
     *  rows inside the queries actually made are eligible — a Sony *show* or
     *  an 'other' title is never asked for, so its absence proves nothing,
     *  and neither does that of a film released before the discover window. */
    const covered = (r: any) =>
      !r.manual &&
      r.tmdb_id !== null &&
      r.release_date !== null &&
      r.release_date >= from &&
      (r.media_type === "movie"
        ? r.universe === "mcu" || r.universe === "sony"
        : r.universe === "mcu");

    const missing = (existingRows ?? []).filter(r => covered(r) && !seen.has(r.id));
    const cutoff = Date.now() - MISSING_GRACE_DAYS * 86400000;

    const toFlag = missing.filter(r => !r.missing_since).map(r => r.id);
    const toDelete = missing.filter(
      r => r.missing_since && Date.parse(r.missing_since) < cutoff,
    );

    if (toFlag.length > 0) {
      const { error } = await sb.from("marvel_titles")
        .update({ missing_since: new Date().toISOString() })
        .in("id", toFlag);
      if (error) errors.push(`flag: ${error.message}`);
      else flagged = toFlag.length;
    }
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id);
      const { error } = await sb.from("marvel_titles").delete().in("id", ids);
      // marvel_push_reminders cascades, so a device's pending reminder for a
      // retracted title goes with it instead of firing about nothing.
      if (error) errors.push(`del: ${error.message}`);
      else {
        removed = ids.length;
        for (const r of toDelete) deletedTitles.push(r.title);
      }
    }
  }

  await health(incoming.length, errors, complete);

  return new Response(
    JSON.stringify({
      scanned: incoming.length, upserted, newTitles: added,
      flagged, removed, deleted: deletedTitles, complete, errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
