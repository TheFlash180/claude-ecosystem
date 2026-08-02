// Price Watch notifier (copy of record — deployed as notify-pricewatch).
// Daily at 04:35 UTC (06:35 SAST), after the sync.
//
// The alert rules here mirror alertFor() in the app's src/lib/price.ts, and
// the reasoning for each threshold lives there with its tests. Keep the two in
// step: a rule that fires on the server but not in the UI makes the app look
// like it is lying.
//
// pricewatch_notified is keyed on (track, price row), so re-running is
// idempotent while a genuine second drop still alerts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BF_60p2HomjlU_xRcc8PvJv2_OetD7RRwNGUotulZ3iHQDKOTSIerxPr1viFH50s715Jco3mb6v-VXrzqNJntIw";

/** Mirrors MIN_DROP_PCT / MIN_DROP_RAND in src/lib/price.ts. */
const MIN_DROP_PCT = 3;
const MIN_DROP_RAND = 20;
/** A cap per device per run, so a bulk repricing cannot flood a phone. */
const MAX_PER_DEVICE = 6;

let vapidReady = false;

async function ensureVapid(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (vapidReady) return true;
  let key = Deno.env.get("PRICEWATCH_VAPID_PRIVATE_KEY");
  if (!key) {
    const { data, error } = await sb.rpc("get_pricewatch_vapid_private_key");
    if (error || !data) return false;
    key = data as string;
  }
  webpush.setVapidDetails("mailto:rickust18@gmail.com", VAPID_PUBLIC, key);
  vapidReady = true;
  return true;
}

type AlertKind = "target" | "drop" | "restock" | null;

interface AlertInput {
  previous: number | null;
  current: number;
  targetPrice: number | null;
  wasInStock: boolean;
  inStock: boolean;
}

function alertFor(i: AlertInput): AlertKind {
  // Out of stock is not a price event, and a retailer zeroing a price on
  // delist must never read as the bargain of the century.
  if (!i.inStock || i.current <= 0) return null;

  if (i.targetPrice !== null && i.current <= i.targetPrice) {
    // Only when it has just crossed, or a product sitting below target
    // re-alerts every single day.
    if (i.previous === null || i.previous > i.targetPrice) return "target";
  }

  if (!i.wasInStock && i.inStock) return "restock";

  if (i.previous !== null && i.current < i.previous) {
    const pct = i.previous === 0 ? 0 : ((i.current - i.previous) / i.previous) * 100;
    const delta = i.current - i.previous;
    if (Math.abs(pct) >= MIN_DROP_PCT && Math.abs(delta) >= MIN_DROP_RAND) return "drop";
  }
  return null;
}

function rand(v: number): string {
  // Mirrors formatRand() in src/lib/price.ts, and for the same reason:
  // toLocaleString("en-ZA") groups differently on Deno, Node and in the
  // browser, and a push that disagrees with the card it refers to looks like
  // a bug. Keep the two in step.
  //
  // Exactly ONE deliberate difference: a plain space for grouping rather than
  // U+00A0, because some Android notification shades render the non-breaking
  // one as a box. Everything else — including showing cents only when they
  // exist — has to match, or the push says "R1 750" about a card reading
  // "R1 749,99" and the app looks like it is rounding your money away.
  const negative = v < 0;
  const abs = Math.abs(v);
  const cents = Math.round(abs * 100) % 100;
  const whole = cents === 0 ? Math.round(abs) : Math.floor(abs);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const tail = cents === 0 ? "" : "," + String(cents).padStart(2, "0");
  return `${negative ? "-" : ""}R${grouped}${tail}`;
}

function message(kind: Exclude<AlertKind, null>, title: string, cur: number, prev: number | null) {
  switch (kind) {
    case "target":
      return { title: `\u{1F3AF} ${rand(cur)} — hit your target`, body: title };
    case "restock":
      return { title: `\u{1F4E6} Back in stock — ${rand(cur)}`, body: title };
    case "drop": {
      const pct = prev && prev > 0 ? Math.round(((prev - cur) / prev) * 100) : 0;
      return {
        title: `\u{1F4C9} ${rand(cur)}${pct > 0 ? ` (${pct}% off)` : ""}`,
        body: prev ? `${title} — was ${rand(prev)}` : title,
      };
    }
  }
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await ensureVapid(sb))) {
    return new Response(JSON.stringify({ error: "VAPID key unavailable" }), { status: 500 });
  }

  const [trackRes, subRes, doneRes] = await Promise.all([
    sb.from("pricewatch_tracks").select("*").eq("enabled", true),
    sb.from("pricewatch_push_subs").select("id, endpoint, p256dh, auth, device_token_hash"),
    sb.from("pricewatch_notified").select("track_id, price_id"),
  ]);

  const err = trackRes.error ?? subRes.error ?? doneRes.error;
  if (err) return new Response(JSON.stringify({ error: err.message }), { status: 500 });

  const tracks = trackRes.data ?? [];
  if (tracks.length === 0) {
    return new Response(JSON.stringify({ sent: 0, candidates: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const productIds = [...new Set(tracks.map((t: any) => t.product_id))];
  const [prodRes, priceRes] = await Promise.all([
    sb.from("pricewatch_products").select("id, title").in("id", productIds),
    // Explicit limit: PostgREST caps at 1000 rows by default, and silently
    // losing the tail here would mean a product's newest point never being
    // seen — an alert that simply never fires, with nothing in the logs.
    sb.from("pricewatch_prices")
      .select("id, product_id, price, in_stock, captured_at")
      .in("product_id", productIds)
      .order("captured_at", { ascending: false })
      .limit(10000),
  ]);

  const titles = new Map<string, string>(
    (prodRes.data ?? []).map((p: any) => [p.id, p.title as string]),
  );

  // Newest two points per product: the current reading and what it replaced.
  const recent = new Map<string, any[]>();
  for (const r of priceRes.data ?? []) {
    const list = recent.get(r.product_id) ?? [];
    if (list.length < 2) { list.push(r); recent.set(r.product_id, list); }
  }

  const already = new Set((doneRes.data ?? []).map((r: any) => `${r.track_id}|${r.price_id}`));
  const subsByDevice = new Map<string, any[]>();
  for (const s of subRes.data ?? []) {
    const list = subsByDevice.get(s.device_token_hash) ?? [];
    list.push(s);
    subsByDevice.set(s.device_token_hash, list);
  }

  interface Pending { track: any; kind: Exclude<AlertKind, null>; point: any; prev: number | null }
  const perDevice = new Map<string, Pending[]>();

  for (const t of tracks) {
    const points = recent.get(t.product_id) ?? [];
    if (points.length === 0) continue;
    const [cur, prev] = points;

    if (already.has(`${t.id}|${cur.id}`)) continue;

    // A track only reports movement that happened after it existed. Without
    // this, adding a product would immediately push about a drop from before
    // you were watching — which the app already shows you on the card.
    if (Date.parse(cur.captured_at) < Date.parse(t.created_at)) continue;

    const kind = alertFor({
      previous: prev ? Number(prev.price) : null,
      current: Number(cur.price),
      targetPrice: t.target_price === null ? null : Number(t.target_price),
      wasInStock: prev ? prev.in_stock : true,
      inStock: cur.in_stock,
    });
    if (!kind) continue;

    const list = perDevice.get(t.device_token_hash) ?? [];
    list.push({ track: t, kind, point: cur, prev: prev ? Number(prev.price) : null });
    perDevice.set(t.device_token_hash, list);
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  const deadSubs = new Set<string>();
  const marks: { track_id: string; price_id: number; kind: string }[] = [];

  for (const [device, alerts] of perDevice) {
    const subs = subsByDevice.get(device) ?? [];
    // Biggest saving first, so whatever gets through the cap is the alert
    // worth reading.
    const saving = (a: Pending) => (a.prev ?? 0) - Number(a.point.price);
    alerts.sort((a, b) => saving(b) - saving(a));

    for (const [i, a] of alerts.entries()) {
      if (i >= MAX_PER_DEVICE) {
        suppressed++;
        marks.push({ track_id: a.track.id, price_id: a.point.id, kind: a.kind });
        continue;
      }
      if (subs.length === 0) {
        marks.push({ track_id: a.track.id, price_id: a.point.id, kind: a.kind });
        continue;
      }

      const title = titles.get(a.track.product_id) ?? "Tracked product";
      const msg = message(a.kind, title, Number(a.point.price), a.prev);

      let delivered = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(msg),
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
      // Only record a send that actually reached somewhere, so a total
      // delivery failure retries tomorrow rather than being lost.
      if (delivered) marks.push({ track_id: a.track.id, price_id: a.point.id, kind: a.kind });
    }
  }

  if (marks.length > 0) {
    await sb.from("pricewatch_notified").upsert(marks, { onConflict: "track_id,price_id" });
  }
  for (const id of deadSubs) {
    await sb.from("pricewatch_push_subs").delete().eq("id", id);
  }

  return new Response(
    JSON.stringify({ tracks: tracks.length, sent, failed, suppressed, pruned: deadSubs.size }),
    { headers: { "Content-Type": "application/json" } },
  );
});
