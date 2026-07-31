// Front Row notifier (copy of record — deployed as notify-frontrow). Daily at
// 04:45 UTC (06:45 SAST), after the sync.
//
// Pushes newly LISTED events that match a watch. The trigger is the listing,
// not the event date: by the time you know a show exists it may already be
// sold out, which is the failure this app was built for.
//
// frontrow_notified holds one row per (watch, event) already sent, so re-runs
// are idempotent and adding a watch never replays the back catalogue.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BAKv5aayQMtgayP-0nCazKMnXi7Om7exuvojU6VbwmEBVT8dZCBzzKhz1xFNhpAs-KcBCTjmRVaTyTV3V8mR2ds";
/** Only alert on things listed recently — an established listing is not news. */
const FRESH_DAYS = 14;
/** Never fire more than this per device per run; a source doing a bulk
 *  re-import should not empty a phone's battery into the notification tray. */
const MAX_PER_DEVICE = 6;

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  let key = Deno.env.get("FRONTROW_VAPID_PRIVATE_KEY");
  if (!key) {
    const { data, error } = await sb.rpc("get_frontrow_vapid_private_key");
    if (error || !data) return false;
    key = data as string;
  }
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const x = Math.sin(aLat * rad) * Math.sin(bLat * rad)
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLng - aLng) * rad);
  return 6371 * Math.acos(Math.min(1, Math.max(-1, x)));
}

/** Mirrors the client's matchesWatch. An event with no coordinates is unknown,
 *  not nearby, so it fails a geo watch rather than matching everything. */
function matches(ev: Record<string, any>, w: Record<string, any>): boolean {
  if (!w.enabled) return false;
  if (w.kind === "geo") {
    if (w.lat == null || w.lng == null || w.radius_km == null) return false;
    if (ev.lat == null || ev.lng == null) return false;
    return distanceKm(Number(w.lat), Number(w.lng), Number(ev.lat), Number(ev.lng)) <= Number(w.radius_km);
  }
  const term = String(w.term ?? "").trim().toLowerCase();
  if (term === "") return false;
  const hay = [ev.name, ev.venue_name, ev.summary, ...(ev.categories ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(term);
}

function whenText(ev: Record<string, any>): string {
  if (!ev.starts_at) return ev.date_text ? String(ev.date_text) : "date to be announced";
  const d = new Date(Date.parse(ev.starts_at) + 2 * 3600000); // SAST
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await ensureVapid(sb))) {
    return new Response(JSON.stringify({ error: "VAPID key unavailable" }), { status: 500 });
  }

  const freshSince = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString();
  const [watchRes, evRes, subRes, doneRes] = await Promise.all([
    sb.from("frontrow_watches").select("*").eq("enabled", true),
    sb.from("frontrow_events").select("*").gte("listed_at", freshSince),
    sb.from("frontrow_push_subs").select("id, endpoint, p256dh, auth, device_token_hash"),
    sb.from("frontrow_notified").select("watch_id, event_id"),
  ]);

  const err = watchRes.error ?? evRes.error ?? subRes.error ?? doneRes.error;
  if (err) return new Response(JSON.stringify({ error: err.message }), { status: 500 });

  const watches = watchRes.data ?? [];
  const events = evRes.data ?? [];
  const already = new Set((doneRes.data ?? []).map((r: any) => `${r.watch_id}|${r.event_id}`));

  const subsByDevice = new Map<string, any[]>();
  for (const s of subRes.data ?? []) {
    const list = subsByDevice.get(s.device_token_hash) ?? [];
    list.push(s);
    subsByDevice.set(s.device_token_hash, list);
  }

  // One push per event per device even when several watches match it — being
  // told twice about the same show is the bug, not a feature.
  const perDevice = new Map<string, Map<string, { ev: any; watchIds: string[] }>>();
  for (const w of watches) {
    for (const ev of events) {
      if (already.has(`${w.id}|${ev.id}`)) continue;
      if (!matches(ev, w)) continue;
      const byEvent = perDevice.get(w.device_token_hash) ?? new Map();
      const entry = byEvent.get(ev.id) ?? { ev, watchIds: [] };
      entry.watchIds.push(w.id);
      byEvent.set(ev.id, entry);
      perDevice.set(w.device_token_hash, byEvent);
    }
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  const deadSubs = new Set<string>();
  const marks: { watch_id: string; event_id: string }[] = [];

  for (const [device, byEvent] of perDevice) {
    const subs = subsByDevice.get(device) ?? [];
    const entries = [...byEvent.values()]
      .sort((a, b) => String(a.ev.starts_at ?? "9").localeCompare(String(b.ev.starts_at ?? "9")));

    for (const [i, { ev, watchIds }] of entries.entries()) {
      // Over the cap: record it as seen so tomorrow's run does not re-send a
      // growing backlog, but do not push.
      if (i >= MAX_PER_DEVICE) {
        suppressed++;
        for (const wid of watchIds) marks.push({ watch_id: wid, event_id: ev.id });
        continue;
      }
      if (subs.length === 0) {
        for (const wid of watchIds) marks.push({ watch_id: wid, event_id: ev.id });
        continue;
      }

      const body = [ev.venue_name, whenText(ev)].filter(Boolean).join(" · ");
      let delivered = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: `\u{1F3AB} ${ev.name}`, body }),
            { TTL: 86400 },
          );
          sent++;
          delivered = true;
        } catch (e) {
          failed++;
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) deadSubs.add(sub.id);
        }
      }
      // Only record once it actually went somewhere, so a total delivery
      // failure retries tomorrow rather than being silently marked as sent.
      if (delivered) for (const wid of watchIds) marks.push({ watch_id: wid, event_id: ev.id });
    }
  }

  if (marks.length > 0) {
    await sb.from("frontrow_notified").upsert(marks, { onConflict: "watch_id,event_id" });
  }
  for (const id of deadSubs) {
    await sb.from("frontrow_push_subs").delete().eq("id", id);
  }

  return new Response(
    JSON.stringify({ candidates: events.length, sent, failed, suppressed, pruned: deadSubs.size }),
    { headers: { "Content-Type": "application/json" } },
  );
});
