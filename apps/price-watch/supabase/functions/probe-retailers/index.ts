// Retailer probe (copy of record — deployed as probe-retailers). TEMPORARY:
// a three-day test, 18–21 October 2026, of whether five retailers can be read
// as reliably as Takealot before any adapter is built for them. Three runs a
// day from pg_cron (`pricewatch-probe`); results land in pricewatch_probe.
//
// For each retailer it finds one real product page — through robots.txt and
// the sitemap, the way a search engine does — and then keeps re-reading that
// same page, so three days show whether the read is stable, not just whether
// it worked once. On a product page it reads the price three ways:
//
//   - the schema.org Product block (JSON-LD) shops publish for Google Shopping
//   - the product:price / itemprop price meta tags
//   - the price as written in the page a person sees
//
// A retailer passes only if a structured price is there every run and agrees
// with the visible one. Nothing here writes anything except its own log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";
const TIMEOUT_MS = 15_000;

interface Retailer {
  key: string;
  origin: string;
  search: string;
  /** A JSON endpoint the shop's own app reads, for pages that are an empty
   *  app shell until a script fills them in. */
  api?: (productUrl: string, storeCode: string | null) => string | null;
  /** Where the shop's app finds the store whose prices it shows. */
  storeCode?: (shell: string) => string | null;
  /** A listing to take product links from when the sitemap has none. */
  fallback?: string;
}

const RETAILERS: Retailer[] = [
  { key: "babycity", origin: "https://www.babycity.co.za", search: "/catalogsearch/result/?q=chelino" },
  { key: "dischem", origin: "https://www.dischem.co.za", search: "/catalogsearch/result/?q=chelino" },
  { key: "checkers", origin: "https://www.checkers.co.za", search: "/search?q=chelino" },
  {
    key: "pnp", origin: "https://www.pnp.co.za", search: "/search/chelino",
    // SAP Commerce (Spartacus) storefront: the product code is the /p/ segment.
    // Prices are per store, so the API refuses a request without one. The
    // app shell names its default; WC44 is a guess to test if it does not.
    api: (u, store) => {
      const code = u.match(/\/p\/([^/?#]+)/)?.[1];
      return code ? `https://www.pnp.co.za/pnphybris/v2/pnp-spa/products/${code}?fields=FULL&storeCode=${store ?? "WC44"}` : null;
    },
    storeCode: shell => shell.match(/storeCode["'\s:=]+["']?([A-Z]{2}\d{2,3})/)?.[1] ?? null,
  },
  // Woolworths' sitemaps list departments and promotions, never a product,
  // and it does not stock Chelino: a nappies search stands in.
  { key: "woolworths", origin: "https://www.woolworths.co.za", search: "/cat?Ntt=chelino", fallback: "/cat?Ntt=nappies" },
];

interface Row {
  retailer: string;
  stage: "robots" | "sitemap" | "product" | "search" | "api";
  url: string;
  status: number | null;
  ms: number;
  blocked: string | null;
  platform: string | null;
  price?: number | null;
  price_sources?: Record<string, number | null>;
  visible_match?: boolean | null;
  availability?: string | null;
  gtin?: string | null;
  name?: string | null;
  note?: string | null;
}

async function fromCron(req: Request, sb: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data, error } = await sb.rpc("cron_secret_ok", { p_secret: secret });
  return !error && data === true;
}

async function get(url: string, accept = "text/html,application/xml;q=0.9,*/*;q=0.8"): Promise<{ status: number | null; body: string; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": accept, "Accept-Language": "en-ZA,en;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    let body: string;
    if (url.endsWith(".gz") && res.ok) {
      body = await new Response(res.body!.pipeThrough(new DecompressionStream("gzip"))).text();
    } else {
      body = await res.text();
    }
    return { status: res.status, body: body.slice(0, 3_000_000), ms: Date.now() - t0 };
  } catch (e) {
    return { status: null, body: "", ms: Date.now() - t0, error: String(e).slice(0, 200) };
  }
}

/** What kind of wall, if any, answered instead of the shop. */
function blockedBy(status: number | null, body: string): string | null {
  const b = body.slice(0, 200_000);
  if (/cf-chl|cf_chl|Just a moment\.\.\./i.test(b)) return "cloudflare";
  if (/px-captcha|perimeterx|_pxAppId/i.test(b)) return "perimeterx";
  if (/_Incapsula_Resource|incapsula/i.test(b)) return "imperva";
  if (/bm-verify|_abck|ak_bmsc/i.test(b) && b.length < 20_000) return "akamai";
  if (/Access Denied|Request unsuccessful|Pardon Our Interruption/i.test(b) && b.length < 20_000) return "denied";
  if (status === 403 || status === 429 || status === 503) return `http ${status}`;
  return null;
}

function platformOf(body: string): string | null {
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(body)) return "shopify";
  if (/data-mage-init|Magento_|\/static\/version\d+\//.test(body)) return "magento";
  if (/demandware|dwvar_|\/on\/demandware/i.test(body)) return "salesforce";
  if (/hybris|\/_ui\/responsive|ACC\.config|<app-root|cx-storefront/i.test(body)) return "hybris";
  if (/__NEXT_DATA__/.test(body)) return "nextjs";
  return null;
}

/** What a product page's URL looks like on these sites: Woolworths /prod/,
 *  PnP /p/, Checkers /product/, Magento's .html. */
const PRODUCT_URL = /\/prod\/|\/p\/|\/product\/|\.html(\?|$)/i;

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, "&"));

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

interface Product { name: string | null; price: number | null; availability: string | null; gtin: string | null }

/** Every schema.org Product in the page's JSON-LD, wherever it is nested. */
function jsonLdProducts(html: string): Product[] {
  const out: Product[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const type = o["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (isProduct) {
      const offers = Array.isArray(o.offers) ? o.offers : o.offers ? [o.offers] : [];
      const first = (offers[0] ?? {}) as Record<string, unknown>;
      out.push({
        name: typeof o.name === "string" ? o.name : null,
        price: num(first.price) ?? num(first.lowPrice),
        availability: typeof first.availability === "string" ? first.availability.replace(/^https?:\/\/schema\.org\//, "") : null,
        gtin: [o.gtin13, o.gtin, o.gtin14, o.gtin12, o.gtin8].find(g => typeof g === "string" && g !== "") as string ?? null,
      });
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block is recorded as no block */ }
  }
  return out;
}

function metaPrice(html: string): number | null {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i)
    ?? html.match(/itemprop=["']price["'][^>]+content=["']([^"']+)["']/i);
  return m ? num(m[1]) : null;
}

/** Is this price written somewhere a person would see it? Rands with any of
 *  the separators SA sites use: R1 299, R1,299.00, R 1 299,00, R1299. */
function visiblyShows(html: string, price: number): boolean {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ");
  const whole = String(Math.floor(price));
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s,.\\u00a0]?");
  return new RegExp(`R\\s*${grouped}(?!\\d)`).test(text);
}

async function probeProduct(r: Retailer, url: string): Promise<Row & { shell: string }> {
  const res = await get(url);
  const products = jsonLdProducts(res.body);
  const ld = products.find(p => p.price !== null) ?? products[0] ?? null;
  const meta = metaPrice(res.body);
  const price = ld?.price ?? meta;
  return {
    retailer: r.key, stage: "product", url, status: res.status, ms: res.ms,
    blocked: blockedBy(res.status, res.body), platform: platformOf(res.body),
    price,
    price_sources: { jsonld: ld?.price ?? null, meta },
    visible_match: price === null ? null : visiblyShows(res.body, price),
    availability: ld?.availability ?? null,
    gtin: ld?.gtin ?? null,
    name: ld?.name ?? null,
    note: res.error ?? (products.length === 0 ? "no JSON-LD Product" : null),
    shell: res.body.slice(0, 400_000),
  };
}

/** Read the price from the shop's own JSON API instead of the page. */
async function probeApi(r: Retailer, productUrl: string, shell: string): Promise<Row> {
  const store = r.storeCode?.(shell) ?? null;
  const url = r.api!(productUrl, store);
  if (!url) return { retailer: r.key, stage: "api", url: productUrl, status: null, ms: 0, blocked: null, platform: null, note: "no product code in URL" };
  // SAP Commerce answers in XML unless JSON is asked for by name.
  const res = await get(url, "application/json");
  let price: number | null = null, name: string | null = null, availability: string | null = null, note: string | null = res.error ?? null;
  try {
    const j = JSON.parse(res.body);
    price = num(j?.price?.value);
    name = typeof j?.name === "string" ? j.name : null;
    availability = j?.stock?.stockLevelStatus ?? null;
    note = price === null ? `JSON without price.value: ${res.body.slice(0, 200)}` : `via ${url}`;
    if (price !== null && j?.price?.formattedValue) note += ` (shows ${j.price.formattedValue})`;
  } catch {
    note = note ?? `not JSON: ${res.body.slice(0, 200)}`;
  }
  note = `store ${store ?? "none in shell, tried WC44"} · ${note}`;
  return {
    // The product page's URL, not the API's, so the next run re-reads the
    // same product.
    retailer: r.key, stage: "api", url: productUrl, status: res.status, ms: res.ms,
    blocked: blockedBy(res.status, res.body), platform: null,
    price, price_sources: { api: price }, visible_match: null, availability, gtin: null, name, note,
  };
}

/** Find one product URL the way a crawler would: robots.txt → sitemap → a
 *  product sitemap → its first page. */
async function discover(r: Retailer, rows: Row[]): Promise<string[]> {
  const robots = await get(`${r.origin}/robots.txt`);
  const maps = [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]);
  rows.push({
    retailer: r.key, stage: "robots", url: `${r.origin}/robots.txt`, status: robots.status, ms: robots.ms,
    blocked: blockedBy(robots.status, robots.body), platform: null,
    note: robots.error ?? `${maps.length} sitemap(s): ${maps.slice(0, 4).join(" ")}`.slice(0, 500),
  });

  const start = maps[0] ?? `${r.origin}/sitemap.xml`;
  const idx = await get(start);
  let urls = locs(idx.body);
  let note = `${urls.length} loc(s)`;
  // A sitemap index lists sitemaps, not pages: step into the product one.
  if (/<sitemapindex/i.test(idx.body)) {
    // Woolworths files products under department sitemaps (baby.xml,
    // home.xml), not one called "product", so read them all at once and take
    // the first that lists product pages, preferring the ones named for them.
    const children = [...urls.filter(u => /prod|baby/i.test(u)), ...urls.filter(u => !/prod|baby/i.test(u))].slice(0, 30);
    note = `index of ${urls.length} |`;
    const read = await Promise.all(children.map(async child => {
      const c = await get(child);
      return { child, status: c.status, error: c.error, found: locs(c.body).filter(u => PRODUCT_URL.test(u)) };
    }));
    urls = read.find(x => x.found.length)?.found ?? [];
    note += read.map(x => ` ${x.child.split("/").pop()}:${x.status ?? x.error}/${x.found.length}`).join("");
  }
  rows.push({
    retailer: r.key, stage: "sitemap", url: start, status: idx.status, ms: idx.ms,
    blocked: blockedBy(idx.status, idx.body), platform: null,
    note: (idx.error ?? note).slice(0, 1500),
  });
  return urls.filter(u => PRODUCT_URL.test(u)).slice(0, 3);
}

async function probe(r: Retailer, sb: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];

  // Keep re-reading the page an earlier run found a price on: the point of
  // three days is to see the same read hold.
  const { data: prior } = await sb.from("pricewatch_probe")
    .select("url").eq("retailer", r.key).in("stage", ["product", "api"]).not("price", "is", null)
    .order("ran_at", { ascending: true }).limit(1);
  // Search first: if the shop sells the Chelino the household is tracking,
  // that is the page worth testing.
  const s = await get(r.origin + r.search);
  // A link counts if its URL or its text names the Chelino: Magento product
  // URLs are often a bare slug that leaves the brand out.
  const chelino = [...new Set([...s.body.matchAll(/href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/g)]
    .filter(m => /chelino/i.test(m[1]) || /chelino/i.test(m[2]))
    .map(m => { try { return new URL(m[1].replace(/&amp;/g, "&"), r.origin).href; } catch { return ""; } })
    .filter(u => u.startsWith(r.origin) && !/[?&]q=|\/search/i.test(u)))];
  rows.push({
    retailer: r.key, stage: "search", url: r.origin + r.search, status: s.status, ms: s.ms,
    blocked: blockedBy(s.status, s.body), platform: platformOf(s.body),
    note: s.error ?? `${chelino.length} Chelino product link(s)${chelino[0] ? ": " + chelino[0] : ""}`.slice(0, 500),
  });

  let candidates = prior?.[0]?.url ? [prior[0].url as string] : chelino.slice(0, 2);
  if (candidates.length === 0) candidates = await discover(r, rows);
  if (candidates.length === 0 && r.fallback) {
    const f = await get(r.origin + r.fallback);
    candidates = [...new Set([...f.body.matchAll(/href=["']([^"'#]+)["']/g)]
      .map(m => { try { return new URL(m[1].replace(/&amp;/g, "&"), r.origin).href; } catch { return ""; } })
      .filter(u => u.startsWith(r.origin) && PRODUCT_URL.test(u)))].slice(0, 3);
    rows.push({
      retailer: r.key, stage: "search", url: r.origin + r.fallback, status: f.status, ms: f.ms,
      blocked: blockedBy(f.status, f.body), platform: platformOf(f.body),
      note: f.error ?? `fallback: ${candidates.length} product link(s), ${f.body.length} bytes`,
    });
  }

  for (const url of candidates) {
    const { shell, ...row } = await probeProduct(r, url);
    rows.push(row);
    if (row.price !== null) break;
    if (r.api) {
      const api = await probeApi(r, url, shell);
      rows.push(api);
      if (api.price !== null) break;
    }
  }
  return rows;
}

Deno.serve(async (req) => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  if (!(await fromCron(req, sb))) {
    return new Response(JSON.stringify({ error: "cron only" }), { status: 403 });
  }

  const results = await Promise.all(RETAILERS.map(r => probe(r, sb).catch(e => [{
    retailer: r.key, stage: "product" as const, url: r.origin, status: null, ms: 0,
    blocked: null, platform: null, note: `probe crashed: ${String(e).slice(0, 200)}`,
  }])));
  const rows = results.flat();
  const { error } = await sb.from("pricewatch_probe").insert(rows);

  return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null, rows: rows.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
