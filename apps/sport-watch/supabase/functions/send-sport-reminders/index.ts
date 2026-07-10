// SA Sport Watch push sender (copy of record — deployed as
// send-sport-reminders). Called by pg_cron every 15 minutes; sends a Web
// Push for every un-notified reminder whose per-reminder lead window
// (lead_minutes before kick-off) has opened. The VAPID private key comes
// from the VAPID_PRIVATE_KEY secret if set, else Supabase Vault via
// get_vapid_private_key() (service-role only — see ../schema.sql).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BGYmKYowZiS3ohHCksH6TKHimd-EaDcLX5ehZMAuURlVrBixtIxEpoStOqzsXGU0ExxM_EDB_NoP22yxMWPf0Ho";

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  let key = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!key) {
    const { data, error } = await sb.rpc("get_vapid_private_key");
    if (error || !data) return false;
    key = data as string;
  }
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

function leadText(mins: number): string {
  if (mins >= 1440) return `in ${Math.round(mins / 1440)} day${mins >= 2880 ? "s" : ""}`;
  if (mins > 120) return `in ~${Math.round(mins / 60)}h`;
  return `in ${mins} min`;
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await ensureVapid(sb))) {
    return new Response(
      JSON.stringify({ error: "VAPID private key unavailable (env secret and vault both missing)" }),
      { status: 500 },
    );
  }

  const now = new Date();
  // Widest supported lead is 2 days; filter the exact window in JS per row.
  const horizon = new Date(now.getTime() + 2 * 86400000);

  const { data: reminders, error } = await sb
    .from("sport_push_reminders")
    .select("id, event_id, event_date, event_label, lead_minutes, sub_id, sport_push_subs(endpoint, p256dh, auth)")
    .eq("notified", false)
    .gte("event_date", now.toISOString())
    .lte("event_date", horizon.toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const due = (reminders ?? []).filter((r) => {
    const start = new Date(r.event_date).getTime();
    const lead = (r.lead_minutes ?? 60) * 60000;
    return start - lead <= now.getTime();
  });

  if (due.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No reminders due" }));
  }

  let sent = 0;
  let failed = 0;
  const notifiedIds: string[] = [];

  for (const r of due) {
    const sub = (r as any).sport_push_subs;
    if (!sub?.endpoint) continue;

    const eventDate = new Date(r.event_date);
    const mins = Math.max(1, Math.round((eventDate.getTime() - now.getTime()) / 60000));

    const payload = JSON.stringify({
      title: `\u{1F1FF}\u{1F1E6} ${r.event_label}`,
      body: `Starts ${leadText(mins)}`,
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600 },
      );
      sent++;
      notifiedIds.push(r.id);
    } catch (e: any) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb.from("sport_push_subs").delete().eq("id", r.sub_id);
      }
    }
  }

  if (notifiedIds.length > 0) {
    await sb.from("sport_push_reminders").update({ notified: true }).in("id", notifiedIds);
  }

  return new Response(
    JSON.stringify({ sent, failed, total: due.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
