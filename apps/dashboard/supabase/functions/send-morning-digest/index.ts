// Hub morning summary (copy of record — deployed as send-morning-digest).
// Called by pg_cron at 05:00 UTC (07:00 SAST). What goes in the push, and why
// a quiet day sends nothing, is in ./digest.ts; this file only gathers the
// rows and delivers.
//
// Per subscription: today's fixtures and releases, that device's own Glovebox
// renewals (linked by token hash, see ../../schema.sql), and any feed that has
// stopped syncing. `last_sent_on` makes a retried or doubled run harmless.
//
// POST ?dry=1 returns the shared lines — everything except Glovebox — without
// sending. It needs the cron secret like any other call (see fromCron), but a
// dry run still never shows one device's renewals: whoever holds the secret
// is no more entitled to a stranger's licence dates than anyone else.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildDigest, sastDay, type DigestRenewal, type DigestSource } from "./digest.ts";

const VAPID_PUBLIC = "BO702Z-eGk6j4wmvsBxXxTK7fpuYoMvcOgA3qzlleNujyheKl7ldmC5245e38QiICKlzcigpyd7BU3OHJoh6Rm4";

/** Adapter-health tables, and the app name a person would use for each. */
const SOURCE_TABLES: [string, string][] = [
  ["sport_sources", "Sport Watch"],
  ["marvel_sources", "Marvel Watch"],
  ["pricewatch_sources", "Price Watch"],
];

let vapidReady = false;

async function ensureVapid(sb: SupabaseClient): Promise<boolean> {
  if (vapidReady) return true;
  const { data, error } = await sb.rpc("get_dashboard_vapid_private_key");
  if (error || !data) return false;
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, data as string);
  vapidReady = true;
  return true;
}

function fail(message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status: 500 });
}

/** Only pg_cron may run this. The job sends x-cron-secret, read from Vault
 *  (cron_secret) as it fires, and cron_secret_ok() checks it against Vault
 *  again, service-role only, so the secret never leaves the database. Without
 *  it, anyone who found the URL could run this as often as they liked: pushes
 *  re-checked, upstream APIs hammered, the free tier's invocations spent.
 *  See CLAUDE.md, "Edge functions". */
async function fromCron(req: Request, sb: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data, error } = await sb.rpc("cron_secret_ok", { p_secret: secret });
  return !error && data === true;
}

Deno.serve(async (req) => {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await fromCron(req, sb))) {
    return new Response(JSON.stringify({ error: "cron only" }), { status: 403 });
  }

  const now = Date.now();
  const today = sastDay(now);

  // ---- world data, the same for everyone ----
  const [evRes, mvRes] = await Promise.all([
    sb.from("sport_events")
      .select("sport, home, away, home_flag, away_flag, event_date")
      .gt("event_date", new Date(now).toISOString())
      .lt("event_date", new Date(now + 26 * 3600000).toISOString()),
    sb.from("marvel_titles")
      .select("title, media_type")
      .eq("release_date", today)
      .eq("date_tbc", false),
  ]);
  // A failed read must not become a confident "nothing on today".
  if (evRes.error) return fail(`events: ${evRes.error.message}`);
  if (mvRes.error) return fail(`marvel: ${mvRes.error.message}`);

  const events = (evRes.data ?? []).map((e) => ({
    sport: e.sport, home: e.home, away: e.away,
    homeFlag: e.home_flag, awayFlag: e.away_flag, date: e.event_date,
  }));
  const releases = (mvRes.data ?? []).map((t) => ({ title: t.title, mediaType: t.media_type }));

  const sources: DigestSource[] = [];
  for (const [table, app] of SOURCE_TABLES) {
    const { data, error } = await sb.from(table).select("label, enabled, last_ok_at, last_error");
    if (error) {
      // Its own health table unreadable is itself worth saying.
      sources.push({ app, label: "health check", enabled: true, lastOkAt: null, lastError: error.message });
      continue;
    }
    for (const s of data ?? []) {
      sources.push({ app, label: s.label, enabled: s.enabled, lastOkAt: s.last_ok_at, lastError: s.last_error });
    }
  }

  const shared = { today, now, events, releases, sources };

  if (dry) {
    return new Response(
      JSON.stringify({ today, digest: buildDigest({ ...shared, renewals: [] }) }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // ---- per device ----
  const { data: subs, error: subErr } = await sb
    .from("dashboard_push_subs")
    .select("id, endpoint, p256dh, auth, glovebox_token_hash, last_sent_on");
  if (subErr) return fail(`subs: ${subErr.message}`);

  const pending = (subs ?? []).filter((s) => s.last_sent_on !== today);
  if (pending.length === 0) {
    return new Response(JSON.stringify({ today, subscribers: subs?.length ?? 0, sent: 0 }));
  }
  if (!(await ensureVapid(sb))) return fail("VAPID private key unavailable");

  const hashes = [...new Set(pending.map((s) => s.glovebox_token_hash).filter(Boolean))] as string[];
  const renewalsByHash = new Map<string, DigestRenewal[]>();
  if (hashes.length > 0) {
    const [vehRes, pplRes] = await Promise.all([
      sb.from("glovebox_vehicles").select("device_token_hash, name, disc_expiry, service_due").in("device_token_hash", hashes),
      sb.from("glovebox_people").select("device_token_hash, name, licence_expiry").in("device_token_hash", hashes),
    ]);
    if (vehRes.error) return fail(`glovebox vehicles: ${vehRes.error.message}`);
    if (pplRes.error) return fail(`glovebox people: ${pplRes.error.message}`);
    const add = (hash: string, r: DigestRenewal) =>
      renewalsByHash.set(hash, [...(renewalsByHash.get(hash) ?? []), r]);
    for (const v of vehRes.data ?? []) {
      if (v.disc_expiry) add(v.device_token_hash, { kind: "disc", subject: v.name, date: v.disc_expiry });
      if (v.service_due) add(v.device_token_hash, { kind: "service", subject: v.name, date: v.service_due });
    }
    for (const p of pplRes.data ?? []) {
      if (p.licence_expiry) add(p.device_token_hash, { kind: "licence", subject: p.name, date: p.licence_expiry });
    }
  }

  let sent = 0, failed = 0, quiet = 0;
  const sentIds: string[] = [];
  const deadIds: string[] = [];

  for (const sub of pending) {
    const digest = buildDigest({
      ...shared,
      renewals: sub.glovebox_token_hash ? renewalsByHash.get(sub.glovebox_token_hash) ?? [] : [],
    });
    if (!digest) { quiet++; continue; }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: digest.title, body: digest.body }),
        // Stale by lunchtime: a morning summary that arrives at 2pm is wrong.
        { TTL: 6 * 3600 },
      );
      sent++;
      sentIds.push(sub.id);
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) deadIds.push(sub.id);
    }
  }

  // Marked only after delivery, so a failed send retries on a re-run today.
  if (sentIds.length > 0) {
    await sb.from("dashboard_push_subs").update({ last_sent_on: today }).in("id", sentIds);
  }
  if (deadIds.length > 0) {
    await sb.from("dashboard_push_subs").delete().in("id", deadIds);
  }

  return new Response(
    JSON.stringify({ today, subscribers: subs?.length ?? 0, sent, quiet, failed, pruned: deadIds.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
