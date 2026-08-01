// Price Watch sync (copy of record — deployed as sync-pricewatch). Daily at
// 04:05 UTC (06:05 SAST).
//
// Re-reads every product some device is tracking and appends a price point
// ONLY when something changed. The series is deliberately sparse: a daily row
// for an unchanged price would bury the handful of moments that matter, and
// the reader treats it as a step function anyway.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DETAIL = "https://api.takealot.com/rest/v-1-13-0/product-details";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

/** Concurrency. Takealot is fine with a handful at a time; going wider risks
 *  being rate-limited, which would look like every product delisting at once. */
const BATCH = 4;
/** Leave room to write results before the platform's wall clock runs out. */
const BUDGET_MS = 100_000;

interface Reading {
  price: number | null;
  listingPrice: number | null;
  /** "Can I buy it", not "is it in a warehouse" — see the note in
   *  search-pricewatch. A leadtime item and a variant parent are both
   *  purchasable and must not be recorded as out of stock. */
  inStock: boolean;
  stockStatus: string | null;
  title: string | null;
  imageUrl: string | null;
  hasVariants: boolean;
  missing: boolean;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function image(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  return raw.replace("{size}", "pdpxl");
}

async function read(externalId: string): Promise<Reading> {
  const plid = externalId.replace(/^PLID/i, "");
  const res = await fetch(`${DETAIL}/PLID${plid}?platform=desktop`, {
    headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "en-ZA,en;q=0.9" },
  });

  // 404 means the product is genuinely gone. Any other failure is our problem,
  // not the product's, and must not be recorded as a delisting.
  if (res.status === 404) {
    return { price: null, listingPrice: null, inStock: false, stockStatus: null,
             title: null, imageUrl: null, hasVariants: false, missing: true };
  }
  if (!res.ok) throw new Error(`takealot ${res.status}`);

  const d = await res.json();
  const item = d?.buybox?.items?.find((i: any) => i?.is_selected) ?? d?.buybox?.items?.[0];
  // "summary" is a variant parent carrying only a "From" price.
  const hasVariants = d?.buybox?.buybox_items_type === "summary";
  return {
    price: num(item?.price),
    listingPrice: num(item?.listing_price),
    inStock: item?.is_add_to_cart_available === true || hasVariants,
    stockStatus: item?.stock_availability?.status
      ? String(item.stock_availability.status)
      : hasVariants ? String(d?.buybox?.variants_call_to_action ?? "Select an option")
      : null,
    title: d?.core?.title ? String(d.core.title) : null,
    imageUrl: image(d?.gallery?.images?.[0]),
    hasVariants,
    missing: false,
  };
}

Deno.serve(async () => {
  const started = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Only products someone actually tracks. An untracked product in the
  // catalogue is history worth keeping but not worth spending requests on.
  const { data: tracked, error: trackErr } = await sb
    .from("pricewatch_tracks")
    .select("product_id")
    .eq("enabled", true);
  if (trackErr) return new Response(JSON.stringify({ error: trackErr.message }), { status: 500 });

  const ids = [...new Set((tracked ?? []).map((t: any) => t.product_id))];
  if (ids.length === 0) {
    await sb.from("pricewatch_sources")
      .update({ last_ok_at: new Date().toISOString(), last_error: null, last_count: 0 })
      .eq("key", "takealot");
    return new Response(JSON.stringify({ checked: 0, changed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: products, error: prodErr } = await sb
    .from("pricewatch_products")
    .select("id, retailer, external_id, title, image_url")
    .in("id", ids)
    .eq("retailer", "takealot");
  if (prodErr) return new Response(JSON.stringify({ error: prodErr.message }), { status: 500 });

  // The last recorded point per product, to decide whether anything moved.
  // Explicit limit: PostgREST defaults to 1000 rows, and quietly losing the
  // tail would make an old price look like the current one — which is exactly
  // how a phantom "price drop" push gets sent.
  const { data: lastRows } = await sb
    .from("pricewatch_prices")
    .select("product_id, price, in_stock, captured_at")
    .in("product_id", ids)
    .order("captured_at", { ascending: false })
    .limit(10000);

  const lastByProduct = new Map<string, { price: number; in_stock: boolean }>();
  for (const r of lastRows ?? []) {
    if (!lastByProduct.has(r.product_id)) {
      lastByProduct.set(r.product_id, { price: Number(r.price), in_stock: r.in_stock });
    }
  }

  let checked = 0;
  let changed = 0;
  let failed = 0;
  let delisted = 0;
  const errors: string[] = [];
  const newPoints: Record<string, unknown>[] = [];
  const touched: string[] = [];
  const goneIds: string[] = [];
  // A product can gain or lose variants over time, which changes whether its
  // price means "the price" or "the cheapest option".
  const variantFlag = new Map<string, boolean>();

  const list = products ?? [];
  for (let i = 0; i < list.length; i += BATCH) {
    if (Date.now() - started > BUDGET_MS) {
      errors.push(`time budget reached after ${checked} products`);
      break;
    }

    const slice = list.slice(i, i + BATCH);
    const readings = await Promise.all(slice.map(async (p: any) => {
      try {
        return { p, r: await read(p.external_id), err: null as string | null };
      } catch (e) {
        return { p, r: null, err: String(e) };
      }
    }));

    for (const { p, r, err } of readings) {
      checked++;
      if (err || !r) {
        failed++;
        if (errors.length < 5) errors.push(`${p.external_id}: ${err}`);
        continue;
      }

      touched.push(p.id);
      variantFlag.set(p.id, r.hasVariants);

      if (r.missing) {
        delisted++;
        goneIds.push(p.id);
        continue;
      }

      // A null or zero price is missing data, not a free product. Recording it
      // would show up as a spectacular "drop" and fire a push.
      if (r.price === null || r.price <= 0) {
        failed++;
        if (errors.length < 5) errors.push(`${p.external_id}: no usable price`);
        continue;
      }

      const prev = lastByProduct.get(p.id);
      if (!prev || prev.price !== r.price || prev.in_stock !== r.inStock) {
        changed++;
        newPoints.push({
          product_id: p.id,
          price: r.price,
          listing_price: r.listingPrice,
          in_stock: r.inStock,
          stock_status: r.stockStatus,
        });
      }
    }
  }

  if (newPoints.length > 0) {
    const { error } = await sb.from("pricewatch_prices").insert(newPoints);
    if (error) errors.push(`insert: ${error.message}`);
  }

  // last_checked_at records that we looked, regardless of whether the price
  // moved — otherwise a stable price is indistinguishable from a dead sync.
  if (touched.length > 0) {
    const now = new Date().toISOString();
    // Grouped into two updates rather than one per product: the flag rarely
    // differs, so this is almost always a single statement.
    for (const flag of [true, false]) {
      const flagged = touched.filter(id => (variantFlag.get(id) ?? false) === flag);
      if (flagged.length === 0) continue;
      await sb.from("pricewatch_products")
        .update({ last_checked_at: now, delisted_at: null, has_variants: flag })
        .in("id", flagged);
    }
  }
  if (goneIds.length > 0) {
    await sb.from("pricewatch_products")
      .update({ delisted_at: new Date().toISOString() })
      .in("id", goneIds);
  }

  // last_ok_at is only advanced when at least one product actually read
  // cleanly. A run where every request failed must leave the old timestamp
  // alone so the app's staleness banner fires instead of being reassured by a
  // sync that did nothing.
  const health: Record<string, unknown> = {
    last_error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    last_count: checked,
  };
  if (checked > failed) health.last_ok_at = new Date().toISOString();
  await sb.from("pricewatch_sources").update(health).eq("key", "takealot");

  return new Response(
    JSON.stringify({ checked, changed, failed, delisted, errors: errors.slice(0, 5) }),
    { headers: { "Content-Type": "application/json" } },
  );
});
