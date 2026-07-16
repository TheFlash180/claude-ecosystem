// SA Sport Watch: F1 auto-sync (copy of record — deployed as sync-f1).
// Called daily by pg_cron. Pulls the season calendar (race + qualifying +
// sprint sessions) from the free Jolpica Ergast-compatible API and upserts
// sport_events rows; fills in race winners for finished rounds that don't
// have a result yet. Manual fields (channel, note, watch_url, is_special,
// non-empty result) are never overwritten. Result-fetch failures are
// reported in the response (they used to be silent, which hid days of
// rate-limited fetches at the old 04:15 cron slot).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.jolpi.ca/ergast/f1";
const UA = { "User-Agent": "sa-sport-watch/1.0 (personal PWA; daily sync)" };

const FLAGS: Record<string, string> = {
  UK: "\u{1F1EC}\u{1F1E7}", "Great Britain": "\u{1F1EC}\u{1F1E7}",
  Belgium: "\u{1F1E7}\u{1F1EA}", Hungary: "\u{1F1ED}\u{1F1FA}",
  Netherlands: "\u{1F1F3}\u{1F1F1}", Italy: "\u{1F1EE}\u{1F1F9}",
  Spain: "\u{1F1EA}\u{1F1F8}", Azerbaijan: "\u{1F1E6}\u{1F1FF}",
  Singapore: "\u{1F1F8}\u{1F1EC}", USA: "\u{1F1FA}\u{1F1F8}",
  "United States": "\u{1F1FA}\u{1F1F8}", Mexico: "\u{1F1F2}\u{1F1FD}",
  Brazil: "\u{1F1E7}\u{1F1F7}", Qatar: "\u{1F1F6}\u{1F1E6}",
  UAE: "\u{1F1E6}\u{1F1EA}", Australia: "\u{1F1E6}\u{1F1FA}",
  China: "\u{1F1E8}\u{1F1F3}", Japan: "\u{1F1EF}\u{1F1F5}",
  Bahrain: "\u{1F1E7}\u{1F1ED}", "Saudi Arabia": "\u{1F1F8}\u{1F1E6}",
  Monaco: "\u{1F1F2}\u{1F1E8}", Canada: "\u{1F1E8}\u{1F1E6}",
  Austria: "\u{1F1E6}\u{1F1F9}", France: "\u{1F1EB}\u{1F1F7}",
};

const DEFAULT_CHANNEL = "SuperSport Grand Prix (DStv 214)";

function isoDate(date?: string, time?: string): string | null {
  if (!date) return null;
  return `${date}T${time ?? "12:00:00Z"}`;
}

// One retry after a pause on 429/5xx — the free API has busy moments.
async function fetchWithRetry(url: string): Promise<Response> {
  const first = await fetch(url, { headers: UA });
  if (first.ok || (first.status !== 429 && first.status < 500)) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return fetch(url, { headers: UA });
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const season = new Date().getUTCFullYear();
  const schedRes = await fetchWithRetry(`${API}/${season}.json?limit=100`);
  if (!schedRes.ok) {
    return new Response(JSON.stringify({ error: `Jolpica schedule fetch failed: ${schedRes.status}` }), { status: 502 });
  }
  const sched = await schedRes.json();
  const races: any[] = sched?.MRData?.RaceTable?.Races ?? [];
  if (races.length === 0) {
    return new Response(JSON.stringify({ error: "empty schedule" }), { status: 502 });
  }

  const { data: existingRows, error: exErr } = await sb
    .from("sport_events")
    .select("id, f1_round, f1_session, result, channel")
    .eq("f1_season", season);
  if (exErr) {
    return new Response(JSON.stringify({ error: exErr.message }), { status: 500 });
  }
  const existing = new Map<string, { id: string; result: string | null; channel: string | null }>();
  for (const r of existingRows ?? []) {
    existing.set(`${r.f1_round}|${r.f1_session}`, { id: r.id, result: r.result, channel: r.channel });
  }

  let upserted = 0;
  let resultsFilled = 0;
  const resultErrors: string[] = [];
  const now = Date.now();

  for (const race of races) {
    const round = Number(race.round);
    const flag = FLAGS[race.Circuit?.Location?.country ?? ""] ?? "\u{1F3C1}";
    const venue = [race.Circuit?.circuitName, race.Circuit?.Location?.locality]
      .filter(Boolean).join(", ");

    const sessions: { key: string; date: string | null; label: string }[] = [
      { key: "race", date: isoDate(race.date, race.time), label: "" },
      { key: "qualifying", date: isoDate(race.Qualifying?.date, race.Qualifying?.time), label: " · Qualifying" },
      { key: "sprint", date: isoDate(race.Sprint?.date, race.Sprint?.time), label: " · Sprint" },
    ];

    for (const s of sessions) {
      if (s.key !== "race" && !s.date) continue; // no such session this weekend
      const found = existing.get(`${round}|${s.key}`);
      const home = s.key === "race" ? race.raceName : `${race.raceName}${s.label}`;
      const patch = {
        event_date: s.date,
        venue,
        home,
        home_flag: flag,
        updated_at: new Date().toISOString(),
      };
      if (found) {
        const { error } = await sb.from("sport_events").update(patch).eq("id", found.id);
        if (!error) upserted++;
      } else {
        const { error } = await sb.from("sport_events").insert({
          id: `f1-${season}-r${round}-${s.key}`,
          sport: "f1",
          competition: `Formula 1 ${season} · Round ${round}${s.label}`,
          away: null,
          away_flag: null,
          channel: DEFAULT_CHANNEL,
          f1_season: season,
          f1_round: round,
          f1_session: s.key,
          ...patch,
        });
        if (!error) upserted++;
      }
    }

    // Winner for finished races that don't have a result yet (capped per run
    // to stay polite to the API; the daily cron catches up).
    const raceEntry = existing.get(`${round}|race`);
    const raceTime = isoDate(race.date, race.time);
    const finished = raceTime !== null && new Date(raceTime).getTime() + 3 * 3600000 < now;
    if (finished && raceEntry && !raceEntry.result && resultsFilled < 6) {
      const resRes = await fetchWithRetry(`${API}/${season}/${round}/results.json?limit=1`);
      if (!resRes.ok) {
        resultErrors.push(`r${round}: HTTP ${resRes.status}`);
        continue;
      }
      const resJson = await resRes.json();
      const winner = resJson?.MRData?.RaceTable?.Races?.[0]?.Results?.[0];
      if (winner?.position === "1") {
        const label = `\u{1F3C6} ${winner.Driver?.givenName ?? ""} ${winner.Driver?.familyName ?? ""}`.trim()
          + (winner.Constructor?.name ? ` (${winner.Constructor.name})` : "");
        const { error } = await sb.from("sport_events")
          .update({ result: label, updated_at: new Date().toISOString() })
          .eq("id", raceEntry.id);
        if (!error) resultsFilled++;
      }
    }
  }

  return new Response(
    JSON.stringify({ season, races: races.length, upserted, resultsFilled, resultErrors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
