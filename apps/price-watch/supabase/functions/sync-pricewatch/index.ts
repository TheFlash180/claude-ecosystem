// Price Watch sync (copy of record — deployed as sync-pricewatch).
//
// Two jobs, both cron-only:
//   - default, daily at 04:05 UTC (06:05 SAST): re-read every product some
//     device tracks or has linked from another shop, and append a price point
//     ONLY when something changed. The series is deliberately sparse: a daily
//     row for an unchanged price would bury the handful of moments that
//     matter, and the reader treats it as a step function anyway.
//   - {"mode":"match"}, every 30 minutes: first give anything tracked or
//     linked that has no price yet its first one, then, for tracks not yet
//     compared, search the other shops for the same product. A match on an
//     identical retail barcode is linked outright; anything else is only
//     *suggested*, and counts for nothing until a person confirms it.
//
// {"mode":"dry", …} reads one page or one search and returns what it saw
// without writing anything, for checking a shop by hand.
//
// What each shop's page looks like, and the rules for barcodes, matching and
// holding back implausible moves, are in ./shops.ts — pure, and tested by the
// app's vitest.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type Candidate, type Reading, type Shop, SHOPS, SUGGEST_AT,
  babyCitySearch, checkersSearch, needsConfirming, parseBabyCitySearch,
  parseCheckersSearch, parsePnpSearch, parseTakealotSearch, pnpProductApi,
  pnpSearchApi, readPnp, readProductPage, searchQuery, shopLink,
  takealotGtin, titleScore,
} from "./shops.ts";

const DETAIL = "https://api.takealot.com/rest/v-1-13-0/product-details";
const TAKEALOT_SEARCH = "https://api.takealot.com/rest/v-1-11-0/searches/products,filters,facets,sort_options,breadcrumbs,slots_audience,context,seo";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

/** Concurrency per shop. Each is fine with a handful at a time; going wider
 *  risks being rate-limited, which would look like every product failing. */
const BATCH = 4;
/** Leave room to write results before the platform's wall clock runs out. */
const BUDGET_MS = 100_000;
/** A move held by needsConfirming() is written once a later run, at least
 *  this long after, reads the same price. */
const CONFIRM_AFTER_MS = 6 * 3600_000;
/** Tracks compared per match run, and how often a track is compared again
 *  (new listings appear; a shop's search improves). */
const MATCH_PER_RUN = 4;
const REMATCH_DAYS = 14;
/** Suggestions kept per shop per track. */
const SUGGEST_PER_SHOP = 2;

class Missing extends Error {}

interface TakealotReading extends Reading {
  listingPrice: number | null;
  stockStatus: string | null;
  hasVariants: boolean;
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

async function get(url: string, accept: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, "Accept": accept, "Accept-Language": "en-ZA,en;q=0.9", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

async function readTakealot(externalId: string): Promise<TakealotReading> {
  const plid = externalId.replace(/^PLID/i, "");
  const res = await get(`${DETAIL}/PLID${plid}?platform=desktop`, "application/json");
  // 404 means the product is genuinely gone. Any other failure is our problem,
  // not the product's, and must not be recorded as a delisting.
  if (res.status === 404) throw new Missing();
  if (!res.ok) throw new Error(`takealot ${res.status}`);

  const d = await res.json();
  const item = d?.buybox?.items?.find((i: any) => i?.is_selected) ?? d?.buybox?.items?.[0];
  // "summary" is a variant parent carrying only a "From" price.
  const hasVariants = d?.buybox?.buybox_items_type === "summary";
  const price = num(item?.price);
  return {
    price: price !== null && price > 0 ? price : null,
    listingPrice: num(item?.listing_price),
    // "Can I buy it", not "is it in a warehouse" — see search-pricewatch. A
    // leadtime item and a variant parent are both purchasable.
    inStock: item?.is_add_to_cart_available === true || hasVariants,
    stockStatus: item?.stock_availability?.status
      ? String(item.stock_availability.status)
      : hasVariants ? String(d?.buybox?.variants_call_to_action ?? "Select an option")
      : null,
    title: d?.core?.title ? String(d.core.title) : null,
    imageUrl: image(d?.gallery?.images?.[0]),
    gtin: takealotGtin(d),
    hasVariants,
    problem: price === null || price <= 0 ? "no usable price" : null,
  };
}

/** Baby City, Checkers or PnP. A 404 is "gone"; a block or an outage throws,
 *  so it is a failed read and never a delisting. */
async function readOther(retailer: Shop, externalId: string, url: string | null): Promise<Reading> {
  if (retailer === "pnp") {
    const res = await get(pnpProductApi(externalId), "application/json");
    const body = await res.text();
    // PnP answers an unknown product code with a 400 naming it.
    if (res.status === 400 && /UnknownIdentifier|not found/i.test(body)) throw new Missing();
    if (!res.ok) throw new Error(`pnp ${res.status}`);
    return readPnp(JSON.parse(body));
  }
  const link = url ? shopLink(url) : null;
  if (!link) throw new Error(`no product URL for ${retailer}:${externalId}`);
  const res = await get(link.url, "text/html,application/xhtml+xml");
  if (res.status === 404 || res.status === 410) throw new Missing();
  if (!res.ok) throw new Error(`${retailer} ${res.status}`);
  return readProductPage(await res.text());
}

async function search(shop: Shop, q: string): Promise<Candidate[]> {
  switch (shop) {
    case "takealot": {
      const res = await get(`${TAKEALOT_SEARCH}?qsearch=${encodeURIComponent(q)}&rows=8`, "application/json");
      if (!res.ok) throw new Error(`takealot search ${res.status}`);
      return parseTakealotSearch(await res.json());
    }
    case "pnp": {
      // A GET here is read as a product called "search"; the search is a POST.
      const res = await get(pnpSearchApi(q), "application/json", {
        method: "POST", body: "{}", headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`pnp search ${res.status}`);
      return parsePnpSearch(await res.json());
    }
    case "babycity": {
      const res = await get(babyCitySearch(q), "text/html");
      if (!res.ok) throw new Error(`babycity search ${res.status}`);
      return parseBabyCitySearch(await res.text());
    }
    case "checkers": {
      const res = await get(checkersSearch(q), "text/html");
      if (!res.ok) throw new Error(`checkers search ${res.status}`);
      return parseCheckersSearch(await res.text());
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---------------------------------------------------------------- sync

interface ProductRow {
  id: string; retailer: Shop; external_id: string; url: string | null;
  title: string; image_url: string | null; gtin: string | null;
  pending_price: number | null; pending_seen_at: string | null;
}

async function sync(sb: SupabaseClient, started: number) {
  // Products someone tracks, plus every other-shop listing linked to a track
  // that has not been rejected: a suggestion is read too, so the card can
  // show its price while asking whether it is the same thing.
  const [trackRes, linkRes] = await Promise.all([
    sb.from("pricewatch_tracks").select("product_id").eq("enabled", true),
    sb.from("pricewatch_links").select("product_id, status").neq("status", "rejected"),
  ]);
  const err = trackRes.error ?? linkRes.error;
  if (err) return json({ error: err.message }, 500);

  const watched = new Set<string>([
    ...(trackRes.data ?? []).map((t: any) => t.product_id as string),
    ...(linkRes.data ?? []).filter((l: any) => l.status === "confirmed").map((l: any) => l.product_id as string),
  ]);
  const ids = [...new Set([...watched, ...(linkRes.data ?? []).map((l: any) => l.product_id as string)])];

  // `watched` is what the hub's Today card reads, so an unconfirmed
  // suggestion never shows there as if someone tracked it.
  await sb.from("pricewatch_products").update({ watched: false })
    .eq("watched", true).not("id", "in", `(${[...watched].join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (watched.size) await sb.from("pricewatch_products").update({ watched: true }).in("id", [...watched]);

  const counts: Record<string, { checked: number; ok: number; errors: string[] }> = {};
  for (const s of SHOPS) counts[s] = { checked: 0, ok: 0, errors: [] };
  let changed = 0;
  let held = 0;

  if (ids.length > 0) {
    const { data: products, error: prodErr } = await sb
      .from("pricewatch_products")
      .select("id, retailer, external_id, url, title, image_url, gtin, pending_price, pending_seen_at")
      .in("id", ids);
    if (prodErr) return json({ error: prodErr.message }, 500);

    // The newest point per product, to decide whether anything moved. An RPC
    // (distinct on) rather than one big read, which the API would silently
    // cut at 1000 rows and leave old prices looking current.
    const { data: lastRows, error: lastErr } = await sb.rpc("pricewatch_recent_prices", { p_ids: ids, p_n: 1 });
    if (lastErr) return json({ error: lastErr.message }, 500);
    const last = new Map<string, { price: number; in_stock: boolean }>();
    for (const r of lastRows ?? []) last.set(r.product_id, { price: Number(r.price), in_stock: r.in_stock });

    const byShop = new Map<Shop, ProductRow[]>();
    for (const p of (products ?? []) as ProductRow[]) {
      if (!SHOPS.includes(p.retailer)) continue;
      byShop.set(p.retailer, [...(byShop.get(p.retailer) ?? []), p]);
    }

    const newPoints: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    await Promise.all([...byShop.entries()].map(async ([shop, list]) => {
      const c = counts[shop];
      for (let i = 0; i < list.length; i += BATCH) {
        if (Date.now() - started > BUDGET_MS) { c.errors.push(`time budget reached after ${c.checked}`); break; }
        await Promise.all(list.slice(i, i + BATCH).map(async (p) => {
          c.checked++;
          let r: Reading | TakealotReading;
          try {
            r = shop === "takealot"
              ? await readTakealot(p.external_id)
              : await readOther(shop, p.external_id, p.url);
          } catch (e) {
            if (e instanceof Missing) {
              c.ok++;
              await sb.from("pricewatch_products").update({ delisted_at: now, last_checked_at: now }).eq("id", p.id);
              return;
            }
            if (c.errors.length < 5) c.errors.push(`${p.external_id}: ${String(e).slice(0, 120)}`);
            return;
          }

          // A null price is missing data, not a free product: recording it
          // would read as a spectacular drop and fire a push. The product's
          // last_checked_at is left alone, so the app drops it from the
          // comparison as unreadable rather than trusting yesterday's price.
          if (r.price === null) {
            if (c.errors.length < 5) c.errors.push(`${p.external_id}: ${r.problem ?? "no price"}`);
            return;
          }
          c.ok++;

          const meta: Record<string, unknown> = { last_checked_at: now, delisted_at: null };
          if (r.title && r.title !== p.title) meta.title = r.title.slice(0, 300);
          if (r.imageUrl && !p.image_url) meta.image_url = r.imageUrl;
          if (r.gtin && r.gtin !== p.gtin) meta.gtin = r.gtin;
          if ("hasVariants" in r) meta.has_variants = r.hasVariants;

          const prev = last.get(p.id);
          const moved = !prev || prev.price !== r.price || prev.in_stock !== r.inStock;
          if (moved) {
            // Takealot's API is structured end to end; the other shops are
            // read off pages, so a big jump waits for a second reading.
            const hold = shop !== "takealot" && needsConfirming(prev?.price ?? null, r.price);
            const confirmed = hold && p.pending_price !== null && Number(p.pending_price) === r.price &&
              p.pending_seen_at !== null && Date.now() - Date.parse(p.pending_seen_at) >= CONFIRM_AFTER_MS;
            if (hold && !confirmed) {
              held++;
              if (p.pending_price === null || Number(p.pending_price) !== r.price) {
                meta.pending_price = r.price;
                meta.pending_seen_at = now;
              }
            } else {
              changed++;
              meta.pending_price = null;
              meta.pending_seen_at = null;
              newPoints.push({
                product_id: p.id,
                price: r.price,
                listing_price: "listingPrice" in r ? r.listingPrice : null,
                in_stock: r.inStock,
                stock_status: "stockStatus" in r ? r.stockStatus : null,
              });
            }
          } else if (p.pending_price !== null) {
            // Back to the price it already had: whatever was held was a blip.
            meta.pending_price = null;
            meta.pending_seen_at = null;
          }
          await sb.from("pricewatch_products").update(meta).eq("id", p.id);
        }));
      }
    }));

    if (newPoints.length > 0) {
      const { error } = await sb.from("pricewatch_prices").insert(newPoints);
      if (error) counts.takealot.errors.push(`insert: ${error.message}`);
    }
  }

  // Health per shop. last_ok_at moves only when something read cleanly (or
  // there was nothing to read), so a shop that failed every read keeps its old
  // timestamp and the app's staleness banner names it. Takealot keeps its
  // original rule of reporting any error; for the other shops one unreadable
  // product is that product's problem, shown on its own card, and only a shop
  // where every read failed is reported as not updating.
  const at = new Date().toISOString();
  for (const s of SHOPS) {
    const c = counts[s];
    const allFailed = c.checked > 0 && c.ok === 0;
    const health: Record<string, unknown> = {
      last_count: c.checked,
      last_error: s === "takealot"
        ? (c.errors.length ? c.errors.join(" | ").slice(0, 500) : null)
        : (allFailed ? c.errors.join(" | ").slice(0, 500) : null),
    };
    if (c.ok > 0 || c.checked === 0) health.last_ok_at = at;
    await sb.from("pricewatch_sources").update(health).eq("key", s);
  }

  return json({ products: ids.length, changed, held, shops: counts });
}

// ---------------------------------------------------------------- match

async function match(sb: SupabaseClient, started: number) {
  const cutoff = new Date(Date.now() - REMATCH_DAYS * 86400_000).toISOString();
  const { data: tracks, error } = await sb
    .from("pricewatch_tracks")
    .select("id, product_id, matched_at")
    .eq("enabled", true)
    .or(`matched_at.is.null,matched_at.lt.${cutoff}`)
    .order("matched_at", { ascending: true, nullsFirst: true })
    .limit(MATCH_PER_RUN);
  if (error) return json({ error: error.message }, 500);

  // First, anything tracked or linked that has no price yet — a link pasted
  // in the app, a product added from another shop — so it shows a price
  // within half an hour instead of waiting for tomorrow's sync.
  const [allTracks, allLinks] = await Promise.all([
    sb.from("pricewatch_tracks").select("product_id").eq("enabled", true),
    sb.from("pricewatch_links").select("product_id").eq("status", "confirmed"),
  ]);
  const wanted = [...new Set([
    ...(allTracks.data ?? []).map((r: any) => r.product_id as string),
    ...(allLinks.data ?? []).map((r: any) => r.product_id as string),
  ])];
  let firstPrices = 0;
  if (wanted.length) {
    const { data: priced } = await sb.rpc("pricewatch_recent_prices", { p_ids: wanted, p_n: 1 });
    const has = new Set((priced ?? []).map((r: any) => r.product_id as string));
    const missing = wanted.filter(id => !has.has(id)).slice(0, 10);
    if (missing.length) {
      const { data: rows } = await sb.from("pricewatch_products")
        .select("id, retailer, external_id, url").in("id", missing);
      for (const p of rows ?? []) {
        try {
          const r = p.retailer === "takealot" ? await readTakealot(p.external_id) : await readOther(p.retailer, p.external_id, p.url);
          if (r.price === null) continue;
          const now = new Date().toISOString();
          const meta: Record<string, unknown> = { last_checked_at: now };
          if (r.title) meta.title = r.title.slice(0, 300);
          if (r.imageUrl) meta.image_url = r.imageUrl;
          if (r.gtin) meta.gtin = r.gtin;
          await sb.from("pricewatch_products").update(meta).eq("id", p.id);
          await sb.from("pricewatch_prices").insert({ product_id: p.id, price: r.price, in_stock: r.inStock });
          firstPrices++;
        } catch { /* left for the daily sync */ }
      }
    }
  }

  const report: Record<string, unknown>[] = [];
  for (const t of tracks ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    const { data: primary } = await sb.from("pricewatch_products")
      .select("id, retailer, title, brand, gtin").eq("id", t.product_id).single();
    if (!primary) continue;

    const q = searchQuery(primary.title, primary.brand);
    const found: Record<string, unknown> = { track: t.id, q };
    for (const shop of SHOPS.filter(s => s !== primary.retailer)) {
      let cands: Candidate[];
      try {
        cands = await search(shop, q);
      } catch (e) {
        found[shop] = `search failed: ${String(e).slice(0, 80)}`;
        continue;
      }
      const ranked = cands
        .map(c => ({ c, score: titleScore(primary.title, c.title, primary.brand) }))
        .filter(x => x.score >= SUGGEST_AT)
        .sort((a, b) => b.score - a.score)
        .slice(0, SUGGEST_PER_SHOP);

      const kept: string[] = [];
      for (const { c, score } of ranked) {
        // Found or added, never overwritten: the product may already be in
        // the catalogue — someone else's tracked item — with a better title
        // than a search page gives.
        let { data: prod } = await sb.from("pricewatch_products")
          .select("id, gtin").eq("retailer", c.retailer).eq("external_id", c.externalId).maybeSingle();
        if (!prod) {
          ({ data: prod } = await sb.from("pricewatch_products")
            .insert({
              retailer: c.retailer, external_id: c.externalId, title: c.title.slice(0, 300),
              url: c.url, image_url: c.imageUrl,
            })
            .select("id, gtin").single());
        }
        if (!prod) continue;

        // Read it now, so the suggestion arrives with a price and, where the
        // shop publishes one, a barcode to match on.
        let reading: Reading | null = null;
        try {
          reading = c.retailer === "takealot" ? await readTakealot(c.externalId) : await readOther(c.retailer, c.externalId, c.url);
        } catch { /* left for the daily sync; the suggestion still stands */ }

        const now = new Date().toISOString();
        if (reading) {
          const meta: Record<string, unknown> = {};
          if (reading.title) meta.title = reading.title.slice(0, 300);
          if (reading.imageUrl) meta.image_url = reading.imageUrl;
          if (reading.gtin) meta.gtin = reading.gtin;
          if (reading.price !== null) meta.last_checked_at = now;
          if (Object.keys(meta).length) await sb.from("pricewatch_products").update(meta).eq("id", prod.id);
          if (reading.price !== null) {
            const { data: has } = await sb.rpc("pricewatch_recent_prices", { p_ids: [prod.id], p_n: 1 });
            if (!has || has.length === 0) {
              await sb.from("pricewatch_prices").insert({
                product_id: prod.id, price: reading.price, in_stock: reading.inStock,
              });
            }
          }
        }

        // Linked outright only on the same retail barcode at both shops.
        // Everything else waits for a person: a similar title is a reason to
        // ask, never a reason to compare prices.
        const g = reading?.gtin ?? prod.gtin;
        const sameBarcode = !!primary.gtin && !!g && primary.gtin === g;
        await sb.from("pricewatch_links").upsert({
          track_id: t.id,
          product_id: prod.id,
          status: sameBarcode ? "confirmed" : "suggested",
          reason: sameBarcode ? "barcode" : "search",
          decided_at: sameBarcode ? now : null,
        }, { onConflict: "track_id,product_id", ignoreDuplicates: true });
        kept.push(`${c.externalId} (${score.toFixed(2)}${sameBarcode ? ", barcode" : ""})`);
      }
      found[shop] = kept;
    }
    await sb.from("pricewatch_tracks").update({ matched_at: new Date().toISOString() }).eq("id", t.id);
    report.push(found);
  }
  return json({ firstPrices, matched: report.length, report });
}

// ---------------------------------------------------------------- dry

async function dry(body: any) {
  try {
    if (typeof body.url === "string") {
      const link = shopLink(body.url);
      if (!link) return json({ error: "not a product link at a supported shop" }, 400);
      return json({ link, reading: await readOther(link.retailer, link.externalId, link.url) });
    }
    if (typeof body.shop === "string" && typeof body.q === "string" && SHOPS.includes(body.shop)) {
      return json({ candidates: (await search(body.shop as Shop, body.q)).slice(0, 8) });
    }
    if (typeof body.takealot === "string") return json({ reading: await readTakealot(body.takealot) });
    return json({ error: "send {url}, {shop, q} or {takealot}" }, 400);
  } catch (e) {
    return json({ error: e instanceof Missing ? "missing" : String(e) }, 502);
  }
}

Deno.serve(async (req) => {
  const started = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!(await fromCron(req, sb))) {
    return new Response(JSON.stringify({ error: "cron only" }), { status: 403 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* the daily job sends {} */ }

  if (body?.mode === "match") return await match(sb, started);
  if (body?.mode === "dry") return await dry(body);
  return await sync(sb, started);
});
