// Meal Prep: Sunday prep-day push (copy of record in the monorepo under
// apps/meal-prep/supabase/functions/). Called by pg_cron Sundays 06:25 UTC
// (08:25 SAST). Tells every enabled device what the week starting Monday
// looks like and how big the shopping list is, then prunes weeks older
// than 10 weeks. VAPID key from env or Vault (get_mealprep_vapid_private_key).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BHdzWYvsMOEoDZnYw0nTMzrC7l6F__C_uzfsdhaQKi-GDv4x3yNI_LY7MdTHhTWWQkiFadUCiSNEeV55CXmmH9A";

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  let key = Deno.env.get("MEALPREP_VAPID_PRIVATE_KEY");
  if (!key) {
    const { data, error } = await sb.rpc("get_mealprep_vapid_private_key");
    if (error || !data) return false;
    key = data as string;
  }
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

function sastToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

/** Monday of the week containing ymd. */
function weekStart(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
  // Fired on Sunday -> the week starting tomorrow. Fired mid-week (manual
  // test) -> the current week.
  const week = weekStart(addDays(today, 1));

  const { data: slots, error: planErr } = await sb
    .from("mealprep_plan")
    .select("day, slot, is_leftover, mealprep_recipes(name, emoji, ingredients)")
    .eq("week_start", week);
  if (planErr) {
    return new Response(JSON.stringify({ error: planErr.message }), { status: 500 });
  }

  // Headline: distinct cooked recipes (leftover slots ride along free).
  const counts = new Map<string, { emoji: string; cooks: number }>();
  const itemKeys = new Set<string>();
  for (const s of slots ?? []) {
    const r = (s as any).mealprep_recipes;
    if (!r) continue;
    const e = counts.get(r.name) ?? { emoji: r.emoji ?? "", cooks: 0 };
    if (!s.is_leftover) e.cooks++;
    counts.set(r.name, e);
    for (const ing of (r.ingredients ?? []) as { n?: string; u?: string }[]) {
      if (ing?.n) itemKeys.add(`${ing.n}`.trim().toLowerCase() + "|" + (ing.u ?? ""));
    }
  }
  const { count: extras } = await sb
    .from("mealprep_shopping")
    .select("id", { count: "exact", head: true })
    .eq("week_start", week)
    .eq("custom", true);

  const names = [...counts.entries()];
  let body: string;
  if (names.length === 0) {
    body = "Nothing planned yet for the week — take two minutes to fill the board \u{1F37D}\u{FE0F}";
  } else {
    const shown = names.slice(0, 4)
      .map(([n, v]) => `${v.emoji} ${n}${v.cooks > 1 ? ` ×${v.cooks}` : ""}`.trim())
      .join(", ");
    const more = names.length > 4 ? ` +${names.length - 4} more` : "";
    const items = itemKeys.size + (extras ?? 0);
    body = `This week: ${shown}${more} · ±${items} shopping items`;
  }

  const { data: subs } = await sb
    .from("mealprep_push_subs")
    .select("id, endpoint, p256dh, auth")
    .eq("enabled", true);

  let sent = 0;
  let failed = 0;
  const deadSubs = new Set<string>();
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: "\u{1F373} Prep day!", body }),
        { TTL: 43200 },
      );
      sent++;
    } catch (e: any) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) deadSubs.add(sub.id);
    }
  }
  for (const id of deadSubs) {
    await sb.from("mealprep_push_subs").delete().eq("id", id);
  }

  // Prune stale weeks so the tables never grow unbounded.
  const cutoff = addDays(week, -70);
  await sb.from("mealprep_plan").delete().lt("week_start", cutoff);
  await sb.from("mealprep_shopping").delete().lt("week_start", cutoff);

  return new Response(
    JSON.stringify({ week, planned: names.length, sent, failed, body }),
    { headers: { "Content-Type": "application/json" } },
  );
});
