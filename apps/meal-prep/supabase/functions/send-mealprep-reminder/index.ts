// Meal Prep: Sunday prep-day push (copy of record in the monorepo under
// apps/meal-prep/supabase/functions/). Called by pg_cron Sundays 06:25 UTC
// (08:25 SAST). Tells every enabled device what is on the cook list and how
// much of the shopping is still outstanding.
//
// This used to read the weekly planner (mealprep_plan / mealprep_shopping).
// Those went when the app became a recipe book, so it now reads the cook list
// instead — there is no week any more, just "what are we making next".
// VAPID key from env or Vault (get_mealprep_vapid_private_key).
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

/** Same key the app uses to merge ingredients across recipes. */
function itemKeyOf(name: string, unit: string): string {
  const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${norm}|${(unit ?? "").trim().toLowerCase()}`;
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await ensureVapid(sb))) {
    return new Response(JSON.stringify({ error: "VAPID key unavailable" }), { status: 500 });
  }

  const { data: list, error: listErr } = await sb
    .from("mealprep_cook_list")
    .select("recipe_id, added_at, mealprep_recipes(name, emoji, ingredients)")
    .order("added_at");
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
  }

  // The same recipe chosen twice is two cooks but one set of ingredients.
  const counts = new Map<string, { emoji: string; cooks: number }>();
  const itemKeys = new Set<string>();
  for (const row of list ?? []) {
    const r = (row as any).mealprep_recipes;
    if (!r) continue;
    const entry = counts.get(r.name) ?? { emoji: r.emoji ?? "", cooks: 0 };
    entry.cooks++;
    counts.set(r.name, entry);
    for (const ing of (r.ingredients ?? []) as { n?: string; u?: string }[]) {
      if (ing?.n) itemKeys.add(itemKeyOf(ing.n, ing.u ?? ""));
    }
  }

  const { data: ticks } = await sb
    .from("mealprep_ticks")
    .select("item_key, checked, custom");

  // Outstanding = recipe ingredients not yet ticked, plus unticked extras.
  let outstanding = 0;
  const checked = new Set(
    (ticks ?? []).filter((t: any) => t.checked).map((t: any) => t.item_key as string),
  );
  for (const key of itemKeys) if (!checked.has(key)) outstanding++;
  for (const t of (ticks ?? []) as any[]) if (t.custom && !t.checked) outstanding++;

  const names = [...counts.entries()];
  let body: string;
  if (names.length === 0) {
    body = "Nothing on the cook list — pick a few for the week \u{1F37D}\u{FE0F}";
  } else {
    const shown = names.slice(0, 4)
      .map(([n, v]) => `${v.emoji} ${n}${v.cooks > 1 ? ` ×${v.cooks}` : ""}`.trim())
      .join(", ");
    const more = names.length > 4 ? ` +${names.length - 4} more` : "";
    const shopping = outstanding > 0
      ? ` · ${outstanding} thing${outstanding === 1 ? "" : "s"} still to buy`
      : " · shopping all ticked off";
    body = `On the list: ${shown}${more}${shopping}`;
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

  return new Response(
    JSON.stringify({ onList: names.length, outstanding, sent, failed, body }),
    { headers: { "Content-Type": "application/json" } },
  );
});
