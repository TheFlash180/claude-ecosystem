// Ultimate Sport Watch: Springbok fixture auto-sync (copy of record —
// deployed as sync-rugby). Called daily by pg_cron.
//
// Source is World Rugby's own match feed, the one springboks.rugby and
// world.rugby are built on. `teams=39` filters server-side to the senior
// men's South Africa side, so the U20s, the Springbok Women and sevens never
// come back at all — that filter is why this needs no name-matching guesswork.
//
// Times arrive as a true epoch (`time.millis`), never as a local wall-clock
// string, which is the whole point: kick-offs stop being hand-typed and the
// app's existing SAST formatting renders them correctly wherever the match is.
//
// Ownership: a sport_events row is fixture-fed only once it carries a
// wr_match_id. The sync claims a hand-entered row the first time it recognises
// the fixture (same two teams, within 48h of the fed kick-off) rather than
// inserting a duplicate beside it, and never touches a rugby row it has not
// claimed — which is what leaves the Nations Championship finals placeholder
// alone, since no fixture for it exists until the pool standings settle.
//
// Manual fields (channel, note, watch_url, is_special, a non-empty result,
// and the competition label once written) are never overwritten, same rule as
// sync-f1. Reminders need no handling here: sport_reminders_follow_event
// repoints and re-arms them when a kick-off moves.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.wr-rims-prod.pulselive.com/rugby/v3/match";
const UA = { "User-Agent": "sa-sport-watch/1.0 (personal PWA; daily sync)" };
const SOURCE_KEY = "rugby-worldrugby";

/** World Rugby's team id for the senior men's Springboks. */
const SA_TEAM_ID = "39";
/** Men's Rugby Union. Guards against the feed ever widening the team filter. */
const MENS_XV = "MRU";

const DEFAULT_CHANNEL = "SuperSport Rugby (DStv 211)";

/** How far either side of today to sync. Back far enough to fill in results
 *  for a tour that just finished, forward far enough to catch next year's
 *  fixtures the day they are published. */
const PAST_DAYS = 45;
const FUTURE_DAYS = 400;

/** A hand-entered row is recognised as a fed fixture if the teams match and
 *  the kick-off is within this window — wide enough to absorb a wrong time or
 *  a date that slipped a day, narrow enough not to collide two tests a week
 *  apart in the same series. */
const ADOPT_WINDOW_MS = 48 * 3600000;

/** The household's names for the teams, so the feed's "South Africa v New
 *  Zealand" renders as the "Springboks vs All Blacks" the app has always
 *  shown. Anything unlisted falls through to the feed's own name. */
const TEAMS: Record<string, { name: string; flag: string }> = {
  "South Africa": { name: "Springboks", flag: "\u{1F1FF}\u{1F1E6}" },
  "New Zealand": { name: "All Blacks", flag: "\u{1F1F3}\u{1F1FF}" },
  England: { name: "England", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}" },
  Scotland: { name: "Scotland", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}" },
  Wales: { name: "Wales", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}" },
  Ireland: { name: "Ireland", flag: "\u{1F1EE}\u{1F1EA}" },
  France: { name: "France", flag: "\u{1F1EB}\u{1F1F7}" },
  Italy: { name: "Italy", flag: "\u{1F1EE}\u{1F1F9}" },
  Argentina: { name: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  Australia: { name: "Australia", flag: "\u{1F1E6}\u{1F1FA}" },
  Japan: { name: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
  Fiji: { name: "Fiji", flag: "\u{1F1EB}\u{1F1EF}" },
  Georgia: { name: "Georgia", flag: "\u{1F1EC}\u{1F1EA}" },
  Samoa: { name: "Samoa", flag: "\u{1F1FC}\u{1F1F8}" },
  Tonga: { name: "Tonga", flag: "\u{1F1F9}\u{1F1F4}" },
  USA: { name: "USA", flag: "\u{1F1FA}\u{1F1F8}" },
  Uruguay: { name: "Uruguay", flag: "\u{1F1FA}\u{1F1FE}" },
  Portugal: { name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}" },
  Spain: { name: "Spain", flag: "\u{1F1EA}\u{1F1F8}" },
  Romania: { name: "Romania", flag: "\u{1F1F7}\u{1F1F4}" },
  Chile: { name: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  Namibia: { name: "Namibia", flag: "\u{1F1F3}\u{1F1E6}" },
  Zimbabwe: { name: "Zimbabwe", flag: "\u{1F1FF}\u{1F1FC}" },
  Canada: { name: "Canada", flag: "\u{1F1E8}\u{1F1E6}" },
};

function team(name: string) {
  return TEAMS[name] ?? { name, flag: "\u{1F3C9}" };
}

/** "Nations Championship 2026" -> "Nations Championship". The year is already
 *  on the card as the date, and dropping it keeps the label stable when the
 *  competition rolls over. Curly apostrophes are straightened to match the
 *  labels already in the table. */
function competitionLabel(raw: string): string {
  return raw.replace(/’/g, "'").replace(/\s+(19|20)\d{2}\s*$/, "").trim();
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Perth Stadium" + "Perth | Boorloo" -> "Perth Stadium, Perth". The feed
 *  pipe-separates dual place names; the card has one line for the venue. */
function venueLabel(name?: string, city?: string): string {
  const town = String(city ?? "").split("|")[0].trim();
  return [String(name ?? "").trim(), town].filter(Boolean).join(", ");
}

/** One retry after a pause on 429/5xx, same as the F1 sync. */
async function fetchWithRetry(url: string): Promise<Response> {
  const first = await fetch(url, { headers: UA });
  if (first.ok || (first.status !== 429 && first.status < 500)) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return fetch(url, { headers: UA });
}

interface Fixture {
  matchId: string;
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  homeFlag: string;
  awayFlag: string;
  venue: string;
  complete: boolean;
  score: [number, number];
  /** Grouping key for numbering a multi-test series. Keeps the feed's year in
   *  it so next season's rematch starts counting again at Test 1. */
  seriesKey: string;
}

function toFixture(m: any): Fixture | null {
  const millis = Number(m?.time?.millis);
  const teams: any[] = m?.teams ?? [];
  if (!Number.isFinite(millis) || teams.length !== 2) return null;
  if (String(m?.sport ?? "").toUpperCase() !== MENS_XV) return null;
  if (!teams.some((t) => String(t?.id) === SA_TEAM_ID)) return null;
  if (!m?.matchId) return null;

  const h = team(String(teams[0]?.name ?? ""));
  const a = team(String(teams[1]?.name ?? ""));
  const rawComp = String(m?.competition ?? "Rugby");
  const scores: any[] = m?.scores ?? [];

  return {
    matchId: String(m.matchId),
    kickoff: new Date(millis).toISOString(),
    competition: competitionLabel(rawComp),
    home: h.name,
    away: a.name,
    homeFlag: h.flag,
    awayFlag: a.flag,
    venue: venueLabel(m?.venue?.name, m?.venue?.city),
    complete: String(m?.status ?? "") === "C",
    score: [Number(scores[0] ?? 0), Number(scores[1] ?? 0)],
    seriesKey: `${rawComp}|${[h.name, a.name].sort().join("|")}`,
  };
}

/** A series where the same two sides meet more than once gets its tests
 *  numbered, which is how "Rugby's Greatest Rivalry · Test 1" reads. A one-off
 *  fixture keeps the bare competition name. */
function labelFixtures(fixtures: Fixture[]): Map<string, string> {
  const bySeries = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const list = bySeries.get(f.seriesKey) ?? [];
    list.push(f);
    bySeries.set(f.seriesKey, list);
  }
  const labels = new Map<string, string>();
  for (const list of bySeries.values()) {
    list.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
    list.forEach((f, i) => {
      labels.set(f.matchId, list.length > 1 ? `${f.competition} · Test ${i + 1}` : f.competition);
    });
  }
  return labels;
}

interface Row {
  id: string;
  wr_match_id: string | null;
  home: string;
  away: string | null;
  event_date: string | null;
  result: string | null;
}

/** Same fixture, entered by hand before the sync existed? Teams in either
 *  order, kick-off close enough that it is plainly the same match. */
function adoptable(rows: Row[], f: Fixture): Row | undefined {
  const want = [f.home, f.away].sort().join("|");
  const target = Date.parse(f.kickoff);
  return rows.find((r) => {
    if (r.wr_match_id || !r.away || !r.event_date) return false;
    if ([r.home, r.away].sort().join("|") !== want) return false;
    return Math.abs(Date.parse(r.event_date) - target) <= ADOPT_WINDOW_MS;
  });
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = new Date().toISOString();
  const fail = async (message: string, status: number) => {
    await sb.from("sport_sources").update({
      last_run_at: startedAt, last_error: message,
    }).eq("key", SOURCE_KEY);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { "Content-Type": "application/json" },
    });
  };

  const now = Date.now();
  const from = ymd(new Date(now - PAST_DAYS * 86400000));
  const to = ymd(new Date(now + FUTURE_DAYS * 86400000));

  // The team filter usually makes this a single page; the loop is there so a
  // busy season cannot silently truncate the fixture list.
  const raw: any[] = [];
  for (let page = 0; page < 5; page++) {
    const url = `${API}?startDate=${from}&endDate=${to}&teams=${SA_TEAM_ID}`
      + `&sort=asc&pageSize=100&page=${page}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return await fail(`World Rugby fetch failed: HTTP ${res.status}`, 502);
    const json = await res.json();
    raw.push(...(json?.content ?? []));
    if (page + 1 >= Number(json?.pageInfo?.numPages ?? 1)) break;
  }

  const fixtures = raw.map(toFixture).filter((f): f is Fixture => f !== null);
  // An empty list means the feed answered but told us nothing, which is not a
  // success — treat it like a failure so the stale banner fires rather than
  // quietly leaving whatever was last written.
  if (fixtures.length === 0) return await fail("World Rugby returned no Springbok fixtures", 502);

  const labels = labelFixtures(fixtures);

  const { data: existing, error: exErr } = await sb
    .from("sport_events")
    .select("id, wr_match_id, home, away, event_date, result")
    .eq("sport", "rugby");
  if (exErr) return await fail(exErr.message, 500);

  const rows = (existing ?? []) as Row[];
  const byMatch = new Map(rows.filter((r) => r.wr_match_id).map((r) => [r.wr_match_id!, r]));

  let inserted = 0;
  let updated = 0;
  let adopted = 0;
  let resultsFilled = 0;
  const moved: string[] = [];
  const errors: string[] = [];

  for (const f of fixtures) {
    const label = `${f.home} vs ${f.away}`;
    const patch: Record<string, unknown> = {
      event_date: f.kickoff,
      venue: f.venue,
      home: f.home,
      away: f.away,
      home_flag: f.homeFlag,
      away_flag: f.awayFlag,
      updated_at: new Date().toISOString(),
    };

    let row = byMatch.get(f.matchId);
    if (!row) {
      const claim = adoptable(rows, f);
      if (claim) {
        claim.wr_match_id = f.matchId;
        patch.wr_match_id = f.matchId;
        row = claim;
        adopted++;
      }
    }

    // A kick-off that moved is worth reporting: it is the failure this sync
    // exists to catch, and pending reminders have just been re-armed for it.
    if (row?.event_date && row.event_date !== f.kickoff
        && Math.abs(Date.parse(row.event_date) - Date.parse(f.kickoff)) >= 60000) {
      moved.push(`${label}: ${row.event_date} -> ${f.kickoff}`);
    }

    // Scoreline only once, and only if the row is not already carrying a
    // hand-written result.
    if (f.complete && !row?.result) {
      patch.result = `${f.home} ${f.score[0]} - ${f.score[1]} ${f.away}`;
    }

    if (row) {
      const { error } = await sb.from("sport_events").update(patch).eq("id", row.id);
      if (error) { errors.push(`${label}: ${error.message}`); continue; }
      updated++;
      if (patch.result) { row.result = patch.result as string; resultsFilled++; }
    } else {
      const { error } = await sb.from("sport_events").insert({
        id: `wr-${f.matchId}`,
        sport: "rugby",
        competition: labels.get(f.matchId) ?? f.competition,
        channel: DEFAULT_CHANNEL,
        is_special: false,
        is_conditional: false,
        date_tbc: false,
        wr_match_id: f.matchId,
        ...patch,
      });
      if (error) { errors.push(`${label}: ${error.message}`); continue; }
      inserted++;
      if (patch.result) resultsFilled++;
    }
  }

  // A fixture-fed row the feed has stopped listing was pulled or rescheduled
  // out of the window. Report it rather than deleting — a cancelled test is a
  // decision for a human, not for a sync run.
  const seen = new Set(fixtures.map((f) => f.matchId));
  const vanished = rows
    .filter((r) => r.wr_match_id && !seen.has(r.wr_match_id))
    .map((r) => `${r.home} vs ${r.away ?? "?"}`);

  const summary = {
    fixtures: fixtures.length,
    inserted, updated, adopted, resultsFilled, moved, vanished, errors,
  };

  // last_ok_at only advances on a clean run, so the banner keeps showing how
  // long it has actually been since the fixtures were known-good.
  const health: Record<string, unknown> = {
    last_run_at: startedAt,
    last_error: errors.length === 0 ? null : errors.join("; "),
    last_count: fixtures.length,
  };
  if (errors.length === 0) health.last_ok_at = startedAt;
  await sb.from("sport_sources").update(health).eq("key", SOURCE_KEY);

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
