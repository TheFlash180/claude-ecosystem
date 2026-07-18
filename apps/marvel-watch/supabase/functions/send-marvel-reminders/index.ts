// Marvel Watch push sender (copy of record — deployed as
// send-marvel-reminders). Called daily by pg_cron at 07:10 UTC (09:10 SAST
// — releases are dates, so pushes land at a friendly hour).
// Two jobs:
//   1. Release reminders: stackable 1w / 3d / 1d leads per device.
//   2. Announcements: any title the TMDB sync inserted with
//      announced_pushed=false goes to EVERY subscribed device once.
// VAPID key from Vault (get_marvel_vapid_private_key) — Marvel has its OWN
// keypair since 2026-07-18; it no longer shares sport-watch's.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BLmIByq8Kf76APBsfcRI-vliFFaZbQyBZtJbkD3rqb8LsUv925pXbgj1DIjGejwbIew-LBJuZc8NNdJXo_7dQJI";

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  const { data, error } = await sb.rpc("get_marvel_vapid_private_key");
  if (error || !data) return false;
  const key = data as string;
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

// SAST calendar day (releases are dates, and the household lives in SAST).
function sastToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / 86400000);
}

function fmtNice(ymd: string): string {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long",
  });
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await ensureVapid(sb))) {
    return new Response(JSON.stringify({ error: "VAPID key unavailable" }), { status: 500 });
  }

  const today = sastToday();
  let sent = 0;
  let failed = 0;
  const deadSubs = new Set<string>();

  async function push(sub: { id: string; endpoint: string; p256dh: string; auth: string }, title: string, body: string): Promise<boolean> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body }),
        { TTL: 43200 },
      );
      sent++;
      return true;
    } catch (e: any) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) deadSubs.add(sub.id);
      return false;
    }
  }

  // ---- 1. due release reminders ----
  const { data: reminders, error: remErr } = await sb
    .from("marvel_push_reminders")
    .select("id, title_label, release_date, lead_days, marvel_push_subs(id, endpoint, p256dh, auth)")
    .eq("notified", false)
    .gte("release_date", today);
  if (remErr) {
    return new Response(JSON.stringify({ error: remErr.message }), { status: 500 });
  }

  const doneIds: string[] = [];
  for (const r of reminders ?? []) {
    const daysOut = daysBetween(today, r.release_date);
    if (daysOut > r.lead_days) continue; // window not open yet
    const sub = (r as any).marvel_push_subs;
    if (!sub?.endpoint) continue;
    const when = daysOut === 0 ? "releases TODAY \u{1F37F}"
      : daysOut === 1 ? "releases tomorrow"
      : `releases in ${daysOut} days`;
    const ok = await push(sub, `\u{1F577}\u{FE0F} ${r.title_label}`, `${when} · ${fmtNice(r.release_date)}`);
    if (ok) doneIds.push(r.id);
  }
  if (doneIds.length > 0) {
    await sb.from("marvel_push_reminders").update({ notified: true }).in("id", doneIds);
  }

  // ---- 2. newly announced titles -> everyone ----
  const { data: news } = await sb
    .from("marvel_titles")
    .select("id, title, release_date, date_tbc, media_type")
    .eq("announced_pushed", false)
    .limit(5);

  let announced = 0;
  if (news && news.length > 0) {
    const { data: subs } = await sb
      .from("marvel_push_subs")
      .select("id, endpoint, p256dh, auth");
    for (const n of news) {
      const kind = n.media_type === "movie" ? "movie" : "series";
      const when = n.release_date ? fmtNice(n.release_date) : "date TBA";
      for (const sub of subs ?? []) {
        await push(sub, `\u{1F195} New Marvel ${kind} announced`, `${n.title} · ${when}`);
      }
      await sb.from("marvel_titles").update({ announced_pushed: true }).eq("id", n.id);
      announced++;
    }
  }

  // ---- cleanup dead subscriptions ----
  for (const id of deadSubs) {
    await sb.from("marvel_push_subs").delete().eq("id", id);
  }

  return new Response(
    JSON.stringify({ sent, failed, announced, today }),
    { headers: { "Content-Type": "application/json" } },
  );
});
