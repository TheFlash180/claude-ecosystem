// SA Sport Watch push sender (copy of record — deployed as the
// send-sport-reminders edge function). Called by pg_cron every 15 minutes;
// sends a Web Push for every un-notified reminder due within the next hour.
//
// Deploy: supabase functions deploy send-sport-reminders --no-verify-jwt
// Secret: supabase secrets set VAPID_PRIVATE_KEY=<key>  (NEVER commit it)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BGYmKYowZiS3ohHCksH6TKHimd-EaDcLX5ehZMAuURlVrBixtIxEpoStOqzsXGU0ExxM_EDB_NoP22yxMWPf0Ho";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
if (!VAPID_PRIVATE) throw new Error("VAPID_PRIVATE_KEY secret is not set");

webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: reminders, error } = await sb
    .from("sport_push_reminders")
    .select("id, event_id, event_date, event_label, sub_id, sport_push_subs(endpoint, p256dh, auth)")
    .eq("notified", false)
    .gte("event_date", now.toISOString())
    .lte("event_date", oneHourFromNow.toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No reminders due" }));
  }

  let sent = 0;
  let failed = 0;
  const notifiedIds: string[] = [];

  for (const r of reminders) {
    const sub = (r as any).sport_push_subs;
    if (!sub?.endpoint) continue;

    const eventDate = new Date(r.event_date);
    const mins = Math.max(1, Math.round((eventDate.getTime() - now.getTime()) / 60000));

    const payload = JSON.stringify({
      title: `\u{1F1FF}\u{1F1E6} ${r.event_label}`,
      body: `Starts in ${mins} min`,
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600 }
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
    await sb
      .from("sport_push_reminders")
      .update({ notified: true })
      .in("id", notifiedIds);
  }

  return new Response(
    JSON.stringify({ sent, failed, total: reminders.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
