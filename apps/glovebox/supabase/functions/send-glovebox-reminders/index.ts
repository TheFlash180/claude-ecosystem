// Glovebox reminder sender (copy of record — deployed as
// send-glovebox-reminders). Called daily by pg_cron at 05:30 UTC (07:30 SAST).
//
// Renewals are dates, not instants, so this walks every tracked item once a day
// and pushes when a lead window has opened. Sent reminders are recorded on the
// row as "<kind>:<due date>:<lead>", which self-invalidates: renewing changes
// the date, which changes the keys, which re-arms the reminders with no reset.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BH8emEzAussJXGdzlPQFCXiVd2AA1PKCQ3KWYJCI2cnvZwDoSweYJTzGc3QajK4M3nP0MOhGfTJpW75Ul9u4cpI";

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  let key = Deno.env.get("GLOVEBOX_VAPID_PRIVATE_KEY");
  if (!key) {
    const { data, error } = await sb.rpc("get_glovebox_vapid_private_key");
    if (error || !data) return false;
    key = data as string;
  }
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

/** SAST calendar day — the app works in local days, so the sender must too. */
function sastToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

function whenText(days: number): string {
  if (days < 0) return `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

interface Due {
  subject: string;
  label: string;
  date: string;
  lead: number;
  days: number;
  key: string;
  table: "glovebox_vehicles" | "glovebox_people";
  rowId: string;
  notified: string[];
}

/** Every lead that has opened and not yet been sent. Only the largest opened
 *  lead fires per run, so a freshly added item with three leads already past
 *  sends one push rather than three. */
function dueFor(
  kind: string, label: string, subject: string, date: string | null,
  leads: number[], notified: string[], today: string,
  table: Due["table"], rowId: string,
): Due | null {
  if (!date) return null;
  const days = daysUntil(date, today);
  const opened = leads
    .filter((l) => days <= l)
    .filter((l) => !notified.includes(`${kind}:${date}:${l}`))
    .sort((a, b) => b - a);
  // Overdue items keep nagging under a synthetic lead so an expired disc does
  // not go quiet once every configured lead has been used up.
  if (opened.length === 0) {
    if (days >= 0) return null;
    const overdueKey = `${kind}:${date}:overdue-${today}`;
    if (notified.includes(overdueKey)) return null;
    return { subject, label, date, lead: -1, days, key: overdueKey, table, rowId, notified };
  }
  const lead = opened[0];
  return { subject, label, date, lead, days, key: `${kind}:${date}:${lead}`, table, rowId, notified };
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

  const today = sastToday();
  const [vehRes, pplRes, subRes] = await Promise.all([
    sb.from("glovebox_vehicles").select("*"),
    sb.from("glovebox_people").select("*"),
    sb.from("glovebox_push_subs").select("id, endpoint, p256dh, auth, device_token_hash"),
  ]);

  if (vehRes.error || pplRes.error || subRes.error) {
    return new Response(
      JSON.stringify({ error: vehRes.error?.message ?? pplRes.error?.message ?? subRes.error?.message }),
      { status: 500 },
    );
  }

  // One device can hold several items; group subscriptions by device so each
  // item is pushed to exactly the devices that own it.
  const subsByDevice = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of subRes.data ?? []) {
    const list = subsByDevice.get(s.device_token_hash) ?? [];
    list.push(s);
    subsByDevice.set(s.device_token_hash, list);
  }

  const due: (Due & { device: string })[] = [];

  for (const v of vehRes.data ?? []) {
    const disc = dueFor("disc", "Licence disc", v.name, v.disc_expiry,
      v.disc_leads ?? [], v.notified ?? [], today, "glovebox_vehicles", v.id);
    if (disc) due.push({ ...disc, device: v.device_token_hash });

    const service = dueFor("service", "Service", v.name, v.service_due,
      v.service_leads ?? [], v.notified ?? [], today, "glovebox_vehicles", v.id);
    if (service) due.push({ ...service, device: v.device_token_hash });
  }

  for (const p of pplRes.data ?? []) {
    const lic = dueFor("licence", "Driver's licence", p.name, p.licence_expiry,
      p.licence_leads ?? [], p.notified ?? [], today, "glovebox_people", p.id);
    if (lic) due.push({ ...lic, device: p.device_token_hash });
  }

  let sent = 0;
  let failed = 0;
  const deadSubs = new Set<string>();
  // Several items can share a row (a vehicle has both a disc and a service), so
  // collect keys per row and write once at the end.
  const newKeys = new Map<string, { table: Due["table"]; notified: string[] }>();

  for (const d of due) {
    const subs = subsByDevice.get(d.device) ?? [];
    if (subs.length === 0) continue;

    const body = d.label === "Service"
      ? `${d.subject} — service due ${d.days < 0 ? whenText(d.days).replace("expires ", "") : `in ${d.days} days`}`
      : `${d.subject} — ${d.label.toLowerCase()} ${whenText(d.days)}`;

    let anyDelivered = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: `${d.label} · ${d.subject}`, body }),
          { TTL: 86400 },
        );
        sent++;
        anyDelivered = true;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) deadSubs.add(sub.id);
      }
    }

    // Only record the key once it actually went somewhere, so a total delivery
    // failure retries tomorrow instead of being silently marked as sent.
    if (anyDelivered) {
      const entry = newKeys.get(d.rowId) ?? { table: d.table, notified: [...d.notified] };
      entry.notified.push(d.key);
      newKeys.set(d.rowId, entry);
    }
  }

  for (const [rowId, { table, notified }] of newKeys) {
    await sb.from(table).update({ notified }).eq("id", rowId);
  }
  for (const id of deadSubs) {
    await sb.from("glovebox_push_subs").delete().eq("id", id);
  }

  return new Response(
    JSON.stringify({ today, due: due.length, sent, failed, pruned: deadSubs.size }),
    { headers: { "Content-Type": "application/json" } },
  );
});
