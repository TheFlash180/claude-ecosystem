// Product lookup for the Price Watch add sheet (copy of record — deployed as
// search-pricewatch). Called live by the app, not on a schedule.
//
// This exists because the browser cannot call Takealot directly: no CORS
// headers, and the app is served from a different origin. The function is a
// narrow proxy — it takes a search term or a product id, never a URL, so it
// cannot be pointed at anything except Takealot.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SEARCH = "https://api.takealot.com/rest/v-1-11-0/searches/products,filters,facets,sort_options,breadcrumbs,slots_audience,context,seo";
const DETAIL = "https://api.takealot.com/rest/v-1-13-0/product-details";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface Hit {
  retailer: string;
  externalId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  url: string | null;
  price: number | null;
  listingPrice: number | null;
  /** "Can I buy this right now", not "is it in a warehouse". A leadtime item
   *  that ships in 14 days is buyable; a variant parent is buyable once you
   *  pick a size. Both would read as out of stock if this tracked
   *  is_add_to_cart_available alone. */
  inStock: boolean;
  stockStatus: string | null;
  /** True for a variant parent, where `price` is the cheapest option rather
   *  than the price of one specific thing. */
  hasVariants: boolean;
}

/** Gallery URLs are templated with a {size} placeholder that must be filled in
 *  or the image 404s. */
function image(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  return raw.replace("{size}", "pdpxl");
}

/** Takealot returns prices as numbers already, but a string has been seen on
 *  some rows; parse defensively rather than storing NaN. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fromSearchResult(r: Record<string, any>): Hit | null {
  const v = r?.product_views;
  const core = v?.core;
  const box = v?.buybox_summary;
  if (!core?.id) return null;

  // prices[] is a range for a variant parent; the first entry is the cheapest,
  // which is what "From R 343" refers to.
  const hasVariants = box?.is_shop_all_options_available === true;
  const price = num(box?.prices?.[0]) ?? num(box?.listing_price);

  return {
    retailer: "takealot",
    externalId: `PLID${core.id}`,
    title: String(core.title ?? "").trim() || `PLID${core.id}`,
    brand: core.brand ? String(core.brand) : null,
    imageUrl: image(v?.gallery?.images?.[0]),
    url: core.slug ? `https://www.takealot.com/${core.slug}/PLID${core.id}` : null,
    price,
    listingPrice: num(box?.listing_price),
    inStock: box?.is_add_to_cart_available === true || hasVariants,
    stockStatus: v?.stock_availability_summary?.status
      ? String(v.stock_availability_summary.status) : null,
    hasVariants,
  };
}

export function fromDetail(d: Record<string, any>): Hit | null {
  const core = d?.core;
  if (!core?.id) return null;
  const item = d?.buybox?.items?.find((i: any) => i?.is_selected) ?? d?.buybox?.items?.[0];
  // "summary" means the buybox is standing in for several variants and carries
  // only a "From" price; "single" is one real product with a stock block.
  const hasVariants = d?.buybox?.buybox_items_type === "summary";

  return {
    retailer: "takealot",
    externalId: `PLID${core.id}`,
    title: String(core.title ?? "").trim() || `PLID${core.id}`,
    brand: core.brand ? String(core.brand) : null,
    imageUrl: image(d?.gallery?.images?.[0]),
    url: typeof d?.desktop_href === "string" ? d.desktop_href
      : core.slug ? `https://www.takealot.com/${core.slug}/PLID${core.id}` : null,
    price: num(item?.price),
    listingPrice: num(item?.listing_price),
    inStock: item?.is_add_to_cart_available === true || hasVariants,
    stockStatus: item?.stock_availability?.status
      ? String(item.stock_availability.status)
      : hasVariants ? String(d?.buybox?.variants_call_to_action ?? "Select an option")
      : null,
    hasVariants,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "en-ZA,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`takealot ${res.status}`);
  return await res.json();
}

export async function lookupById(id: string): Promise<Hit | null> {
  const plid = id.replace(/^PLID/i, "");
  if (!/^\d{1,12}$/.test(plid)) return null;
  const d = await getJson(`${DETAIL}/PLID${plid}?platform=desktop`);
  return fromDetail(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  let q = "";
  let id = "";
  try {
    const body = await req.json();
    q = String(body.q ?? "").trim();
    id = String(body.id ?? "").trim();
  } catch {
    return json({ error: "send {q} or {id}" }, 400);
  }

  try {
    if (id !== "") {
      const hit = await lookupById(id);
      return hit ? json({ results: [hit] }) : json({ results: [] });
    }

    if (q.length < 2) return json({ results: [] });

    const url = `${SEARCH}?qsearch=${encodeURIComponent(q)}&rows=20`;
    const data = await getJson(url);
    const rows: any[] = data?.sections?.products?.results ?? [];
    const results = rows.map(fromSearchResult).filter((h): h is Hit => h !== null);
    return json({ results });
  } catch (e) {
    // Surfaced to the user as "search is down" rather than an empty list, so a
    // broken adapter is not mistaken for "no such product".
    return json({ error: String(e) }, 502);
  }
});
