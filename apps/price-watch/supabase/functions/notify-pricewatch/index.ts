// Price Watch notifier (copy of record — deployed as notify-pricewatch).
// Daily at 04:35 UTC (06:35 SAST), after the sync.
//
// The alert rules here mirror alertFor() in the app's src/lib/price.ts, and
// the reasoning for each threshold lives there with its tests. Keep the two in
// step: a rule that fires on the server but not in the UI makes the app look
// like it is lying. A test reads this file and checks the two agree.
//
// pricewatch_notified is keyed on (track, price row), so re-running is
// idempotent while a genuine second drop still alerts.
//
// A track is judged on the best in-stock price across its shops: its own
// product plus every confirmed link (pricewatch_links). The alert names the
// shop the price is at. With no links this is exactly the old per-product
// rule: the newest point against the one it replaced.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = "BF_60p2HomjlU_xRcc8PvJv2_OetD7RRwNGUotulZ3iHQDKOTSIerxPr1viFH50s715Jco3mb6v-VXrzqNJntIw";

/** Mirrors MIN_DROP_PCT / MIN_DROP_RAND in src/lib/price.ts. */
const MIN_DROP_PCT = 3;
const MIN_DROP_RAND = 20;
/** A cap per device per run, so a bulk repricing cannot flood a phone. */
const MAX_PER_DEVICE = 6;

let vapidReady = false;

async function ensureVapid(sb: SupabaseClient): Promise<boolean> {
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

  // At or under target: the first crossing alerts, and so does every further
  // drop while it stays under — the noise thresholds below deliberately do not
  // apply to a price you explicitly asked about. `current < previous` is what
  // stops a price that has not moved from alerting again.
  if (i.targetPrice !== null && i.current <= i.targetPrice) {
    if (i.previous === null || i.current < i.previous) return "target";
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

/** The shop the price is at, when it is not the obvious one. */
const SHOP_LABEL: Record<string, string> = {
  takealot: "Takealot", babycity: "Baby City", checkers: "Checkers", pnp: "PnP online",
};
/** A shop not read in this long is left out of the comparison. */
const FRESH_HOURS = 48;

function message(kind: Exclude<AlertKind, null>, title: string, cur: number, prev: number | null, shop = "") {
  const at = shop ? ` at ${shop}` : "";
  switch (kind) {
    case "target": {
      // Under target and cheaper than last time says more than "hit your
      // target" alone, which reads like a repeat of an alert already sent.
      const off = prev && prev > cur ? ` — down from ${rand(prev)}` : "";
      return { title: `\u{1F3AF} ${rand(cur)}${at} — under your target`, body: `${title}${off}` };
    }
    case "restock":
      return { title: `\u{1F4E6} Back in stock${at} — ${rand(cur)}`, body: title };
    case "drop": {
      const pct = prev && prev > 0 ? Math.round(((prev - cur) / prev) * 100) : 0;
      return {
        title: `\u{1F4C9} ${rand(cur)}${at}${pct > 0 ? ` (${pct}% off)` : ""}`,
        body: prev ? `${title} — was ${rand(prev)}` : title,
      };
    }
  }
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
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await fromCron(req, sb))) {
    return new Response(JSON.stringify({ error: "cron only" }), { status: 403 });
  }

  if (!(await ensureVapid(sb))) {
    return new Response(JSON.stringify({ error: "VAPID key unavailable" }), { status: 500 });
  }

  const [trackRes, linkRes, subRes] = await Promise.all([
    sb.from("pricewatch_tracks").select("*").eq("enabled", true),
    sb.from("pricewatch_links").select("track_id, product_id, decided_at").eq("status", "confirmed"),
    sb.from("pricewatch_push_subs").select("id, endpoint, p256dh, auth, device_token_hash"),
  ]);

  const err = trackRes.error ?? linkRes.error ?? subRes.error;
  if (err) return new Response(JSON.stringify({ error: err.message }), { status: 500 });

  const tracks = trackRes.data ?? [];
  if (tracks.length === 0) {
    return new Response(JSON.stringify({ sent: 0, candidates: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // A track's offers: its own product, plus every product a barcode or a
  // person confirmed is the same thing at another shop. Suggestions nobody
  // has confirmed are not here, so they can never cause an alert.
  const linksByTrack = new Map<string, any[]>();
  for (const l of linkRes.data ?? []) {
    linksByTrack.set(l.track_id, [...(linksByTrack.get(l.track_id) ?? []), l]);
  }
  const productIds = [...new Set([
    ...tracks.map((t: any) => t.product_id as string),
    ...(linkRes.data ?? []).map((l: any) => l.product_id as string),
  ])];

  const [prodRes, priceRes] = await Promise.all([
    sb.from("pricewatch_products")
      .select("id, title, retailer, last_checked_at, delisted_at").in("id", productIds),
    // The newest two points per product, by RPC: one big read would be cut
    // at 1000 rows without an error, and a product whose newest point fell
    // past the cut would simply never alert.
    sb.rpc("pricewatch_recent_prices", { p_ids: productIds, p_n: 2 }),
  ]);
  if (prodRes.error ?? priceRes.error) {
    return new Response(JSON.stringify({ error: (prodRes.error ?? priceRes.error)!.message }), { status: 500 });
  }

  const products = new Map<string, any>((prodRes.data ?? []).map((p: any) => [p.id, p]));
  const recent = new Map<string, any[]>();
  for (const r of priceRes.data ?? []) {
    recent.set(r.product_id, [...(recent.get(r.product_id) ?? []), r]);
  }
  for (const list of recent.values()) {
    list.sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || b.id - a.id);
  }

  // Every alert is keyed on some product's newest point, so only those rows
  // need looking up — not the whole table, which one read would cut at 1000
  // rows without an error, after which old alerts would be sent again.
  const latestIds = [...recent.values()].map(list => list[0].id);
  const doneRes = latestIds.length
    ? await sb.from("pricewatch_notified").select("track_id, price_id").in("price_id", latestIds)
    : { data: [], error: null };
  if (doneRes.error) return new Response(JSON.stringify({ error: doneRes.error.message }), { status: 500 });
  const already = new Set((doneRes.data ?? []).map((r: any) => `${r.track_id}|${r.price_id}`));
  const subsByDevice = new Map<string, any[]>();
  for (const s of subRes.data ?? []) {
    const list = subsByDevice.get(s.device_token_hash) ?? [];
    list.push(s);
    subsByDevice.set(s.device_token_hash, list);
  }

  interface Pending {
    track: any; kind: Exclude<AlertKind, null>;
    /** The row that triggered it: what pricewatch_notified is keyed on. */
    point: any;
    /** The best price now, and the best before this change. */
    price: number; prev: number | null;
    shop: string; title: string;
  }
  const perDevice = new Map<string, Pending[]>();
  const now = Date.now();

  for (const t of tracks) {
    // Only shops read in the last two days take part. A shop that has gone
    // unreadable drops out rather than lending yesterday's price to today.
    const offers = [
      { productId: t.product_id as string, since: Date.parse(t.created_at) },
      ...(linksByTrack.get(t.id) ?? []).map((l: any) => ({
        productId: l.product_id as string,
        since: Math.max(Date.parse(t.created_at), Date.parse(l.decided_at ?? t.created_at)),
      })),
    ].filter(o => {
      const p = products.get(o.productId);
      return p && !p.delisted_at && p.last_checked_at &&
        now - Date.parse(p.last_checked_at) <= FRESH_HOURS * 3600_000 &&
        (recent.get(o.productId) ?? []).length > 0;
    });
    if (offers.length === 0) continue;

    // The newest change across the offers is the event being judged.
    let event: any = null;
    let eventOffer: typeof offers[number] | null = null;
    for (const o of offers) {
      const cur = recent.get(o.productId)![0];
      if (!event || Date.parse(cur.captured_at) > Date.parse(event.captured_at)) { event = cur; eventOffer = o; }
    }
    if (already.has(`${t.id}|${event.id}`)) continue;

    // A track only reports movement that happened after it existed, and a
    // linked shop only after it was linked. Without this, adding a product,
    // or confirming a cheaper shop for it, would push about a price that was
    // already there — which the card already shows.
    if (Date.parse(event.captured_at) < eventOffer!.since) continue;

    // The best in-stock price now, and the best just before this event: the
    // event's own product contributes the point it replaced, every other
    // offer its newest point (which is older than the event by definition).
    const before = (o: typeof offers[number]) => {
      const list = recent.get(o.productId)!;
      return o === eventOffer ? list[1] ?? null : list[0];
    };
    let best: { price: number; productId: string; point: any } | null = null;
    let prevBest: number | null = null;
    let wasInStock = false;
    let hadPrev = false;
    for (const o of offers) {
      const cur = recent.get(o.productId)![0];
      if (cur.in_stock && (!best || Number(cur.price) < best.price)) {
        best = { price: Number(cur.price), productId: o.productId, point: cur };
      }
      const b = before(o);
      if (b) {
        hadPrev = true;
        if (b.in_stock) {
          wasInStock = true;
          if (prevBest === null || Number(b.price) < prevBest) prevBest = Number(b.price);
        }
      }
    }
    if (!best) continue;

    const kind = alertFor({
      previous: prevBest,
      current: best.price,
      targetPrice: t.target_price === null ? null : Number(t.target_price),
      wasInStock: hadPrev ? wasInStock : true,
      inStock: true,
    });
    if (!kind) continue;

    const bestProduct = products.get(best.productId);
    const list = perDevice.get(t.device_token_hash) ?? [];
    // The alert is about the best price, but it is keyed on the event row,
    // so re-running is idempotent and the next change alerts afresh.
    list.push({
      track: t, kind, point: event, price: best.price, prev: prevBest,
      shop: SHOP_LABEL[bestProduct?.retailer] ?? "",
      title: products.get(t.product_id)?.title ?? "Tracked product",
    });
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
    const saving = (a: Pending) => (a.prev ?? 0) - a.price;
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

      const msg = message(a.kind, a.title, a.price, a.prev, a.shop);

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
