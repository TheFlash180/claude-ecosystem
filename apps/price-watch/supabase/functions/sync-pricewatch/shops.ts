// The other shops: how to read a price off each, how to find a product there,
// and when two listings are the same thing. Pure — no Deno, no Supabase, no
// fetch — so sync-pricewatch and the app's vitest both load this file and the
// rules are tested where they run.
//
// Which shops are here was decided by a three-day probe (18–21 Oct 2026):
// Baby City, Checkers and PnP read correctly on all 11 runs. Dis-Chem answers
// every request with a Cloudflare 403 and Woolworths has no readable product
// page, so they are not here at all rather than here and failing.

export type Shop = "takealot" | "babycity" | "checkers" | "pnp";

export const SHOP_LABEL: Record<Shop, string> = {
  takealot: "Takealot",
  babycity: "Baby City",
  checkers: "Checkers",
  pnp: "PnP",
};

/** Every shop, in the order a card lists them when prices tie. */
export const SHOPS: Shop[] = ["takealot", "babycity", "checkers", "pnp"];

export const ORIGIN: Record<Exclude<Shop, "takealot">, string> = {
  babycity: "https://www.babycity.co.za",
  checkers: "https://www.checkers.co.za",
  pnp: "https://www.pnp.co.za",
};

/** PnP prices online by store and refuses a request without one. Its public
 *  store finder returns nothing for any location, so there is no way to pick
 *  a branch: this is the default store behind its own website, and the app
 *  labels the result "PnP online". */
export const PNP_STORE = "WC21";

export const pnpProductApi = (code: string) =>
  `https://www.pnp.co.za/pnphybris/v2/pnp-spa/products/${encodeURIComponent(code)}?fields=FULL&storeCode=${PNP_STORE}`;
export const pnpSearchApi = (q: string) =>
  `https://www.pnp.co.za/pnphybris/v2/pnp-spa/products/search?fields=FULL&query=${encodeURIComponent(q)}&pageSize=8&storeCode=${PNP_STORE}`;
export const babyCitySearch = (q: string) =>
  `https://www.babycity.co.za/catalogsearch/result/?q=${encodeURIComponent(q)}`;
export const checkersSearch = (q: string) =>
  `https://www.checkers.co.za/search?q=${encodeURIComponent(q)}`;

// ---------------------------------------------------------------- links

export interface ShopLink {
  retailer: Exclude<Shop, "takealot">;
  /** Stable per shop: the URL path for Baby City and Checkers, the product
   *  code for PnP. Together with the retailer it is the catalogue key. */
  externalId: string;
  url: string;
}

/** A product link pasted from one of the other shops, or found by search.
 *  Null for anything else — including a shop page that is not a product,
 *  so a category or search URL cannot be tracked as if it had a price. */
export function shopLink(input: string): ShopLink | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname.replace(/\/+$/, "");

  if (host === "babycity.co.za") {
    // Magento product URLs are one slug at the root; anything deeper, or the
    // search and checkout pages, is not a product.
    const slug = path.slice(1);
    if (!/^[a-z0-9][a-z0-9-]{2,}$/i.test(slug)) return null;
    if (/^(catalogsearch|checkout|customer|cart|stores?|brands?)$/i.test(slug)) return null;
    return { retailer: "babycity", externalId: slug.toLowerCase(), url: `${ORIGIN.babycity}/${slug}` };
  }
  if (host === "checkers.co.za") {
    const m = path.match(/^\/product\/([a-z0-9-]+)$/i);
    if (!m) return null;
    return { retailer: "checkers", externalId: m[1].toLowerCase(), url: `${ORIGIN.checkers}/product/${m[1]}` };
  }
  if (host === "pnp.co.za") {
    const m = path.match(/\/p\/([A-Za-z0-9_]+)$/);
    if (!m) return null;
    return { retailer: "pnp", externalId: m[1], url: `${ORIGIN.pnp}${path}` };
  }
  return null;
}

// ---------------------------------------------------------------- barcodes

/** A barcode two shops can be matched on: 8, 12, 13 or 14 digits with a
 *  correct check digit, and not an in-store code. EAN-13s starting with 2
 *  are assigned by the shop itself (PnP's weighed meat carries one), so the
 *  same number at two shops means nothing. Takealot's "barcode" for
 *  marketplace sellers is an internal code like MPTALX22907210-0 and fails
 *  here too. Returns the barcode as a 14-digit GTIN, or null. */
export function gtin(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!/^\d{8}$|^\d{12,14}$/.test(s)) return null;
  const g = s.padStart(14, "0");
  if (/^0+$/.test(g)) return null;
  if (g.length === 14 && g[1] === "2" && s.length === 13) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(g[13]) ? g : null;
}

// ---------------------------------------------------------------- reading

export interface Reading {
  price: number | null;
  inStock: boolean;
  title: string | null;
  imageUrl: string | null;
  gtin: string | null;
  /** Why a page gave no usable price, for the source's health row. */
  problem: string | null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'")
  .replace(/&#x20;|&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

interface LdProduct {
  name: string | null; price: number | null; availability: string | null;
  gtin: string | null; image: string | null;
}

/** Every schema.org Product in a page's JSON-LD, wherever it is nested. */
export function jsonLdProducts(html: string): LdProduct[] {
  const out: LdProduct[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const type = o["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      const offers = Array.isArray(o.offers) ? o.offers : o.offers ? [o.offers] : [];
      const first = (offers[0] ?? {}) as Record<string, unknown>;
      const img = Array.isArray(o.image) ? o.image[0] : o.image;
      out.push({
        name: typeof o.name === "string" ? decode(o.name).trim() : null,
        price: num(first.price) ?? num(first.lowPrice),
        availability: typeof first.availability === "string"
          ? first.availability.replace(/^https?:\/\/schema\.org\//, "") : null,
        gtin: [o.gtin13, o.gtin, o.gtin14, o.gtin12, o.gtin8]
          .map(g => gtin(g)).find(g => g !== null) ?? null,
        image: typeof img === "string" ? img : null,
      });
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block counts as no block */ }
  }
  return out;
}

function metaPrice(html: string): number | null {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i);
  return m ? num(m[1]) : null;
}

/** Is this price written somewhere a person would see it? R1 299, R1,299.00,
 *  R 1 299,00 and R1299 all count. */
export function visiblyShows(html: string, price: number): boolean {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ");
  const whole = String(Math.floor(price));
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s,.\\u00a0]?");
  return new RegExp(`R\\s*${grouped}(?!\\d)`).test(text);
}

/** A Baby City or Checkers product page. The price counts only when the
 *  page's structured data states it, any second statement of it (the meta
 *  tag) agrees, and the same number is written on the page a person sees —
 *  three ways the shop says the price, which is what the probe tested. Any
 *  disagreement is a failed read, never a guess at which one is right. */
export function readProductPage(html: string): Reading {
  const products = jsonLdProducts(html);
  const ld = products.find(p => p.price !== null) ?? products[0] ?? null;
  const base = {
    title: ld?.name ?? null,
    imageUrl: ld?.image ?? null,
    gtin: ld?.gtin ?? null,
    inStock: ld?.availability ? /InStock|LimitedAvailability|PreOrder/i.test(ld.availability) : true,
  };
  if (!ld || ld.price === null) return { ...base, price: null, problem: "no structured price" };
  if (ld.price <= 0) return { ...base, price: null, problem: "zero price" };
  const meta = metaPrice(html);
  if (meta !== null && Math.abs(meta - ld.price) > 0.005) {
    return { ...base, price: null, problem: `structured ${ld.price} vs meta ${meta}` };
  }
  if (!visiblyShows(html, ld.price)) {
    return { ...base, price: null, problem: `${ld.price} not shown on the page` };
  }
  return { ...base, price: ld.price, problem: null };
}

/** PnP's product API, which is what its own app reads: the product pages are
 *  an empty shell until a script fills them in. */
export function readPnp(json: any): Reading {
  const price = num(json?.price?.value);
  const stock = typeof json?.stock?.stockLevelStatus === "string" ? json.stock.stockLevelStatus : null;
  let barcode: string | null = null;
  for (const c of json?.classifications ?? []) {
    for (const f of c?.features ?? []) {
      if (/barcode/i.test(String(f?.name ?? ""))) barcode = gtin(f?.featureValues?.[0]?.value) ?? barcode;
    }
  }
  const img = (json?.images ?? []).find((i: any) => i?.format === "product" || i?.format === "zoom") ?? json?.images?.[0];
  return {
    price: price !== null && price > 0 ? price : null,
    inStock: stock === null ? true : stock !== "outOfStock",
    title: typeof json?.name === "string" ? json.name : null,
    imageUrl: typeof img?.url === "string" ? (img.url.startsWith("http") ? img.url : `${ORIGIN.pnp}${img.url}`) : null,
    gtin: barcode,
    problem: price === null ? "no price in the product API" : price <= 0 ? "zero price" : null,
  };
}

/** Takealot's barcode, from the product-details response's attribute list.
 *  Only a real retail barcode survives gtin(); marketplace sellers' internal
 *  codes do not. */
export function takealotGtin(detail: any): string | null {
  const seen: string[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.item_type === "barcode" && typeof o.displayable_text === "string") seen.push(o.displayable_text);
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  walk(detail);
  for (const s of seen) {
    for (const part of s.replace(/\\/g, "").split(/[,\s]+/)) {
      const g = gtin(part);
      if (g) return g;
    }
  }
  return null;
}

// ---------------------------------------------------------------- searching

export interface Candidate {
  retailer: Shop;
  externalId: string;
  url: string;
  title: string;
  imageUrl: string | null;
}

/** "padkos-roasted-and-salted-peanuts-150g-10426686EA" → a readable title,
 *  for when a search page links a product without naming it. */
export function titleFromSlug(slug: string): string {
  return slug
    .replace(/-\d{5,}[a-z]*$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export function parseBabyCitySearch(html: string): Candidate[] {
  const out = new Map<string, Candidate>();
  // Each result's photo link carries the product URL; its image's alt is the
  // product name.
  const re = /<a\s+href="(https:\/\/www\.babycity\.co\.za\/[^"]+)"\s+class="product photo product-item-photo"[\s\S]{0,1500}?<img[^>]*?\salt="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    const link = shopLink(m[1]);
    if (!link || out.has(link.externalId)) continue;
    const src = m[0].match(/\ssrc="([^"]+)"/)?.[1] ?? null;
    out.set(link.externalId, {
      ...link,
      title: decode(m[2]).trim() || titleFromSlug(link.externalId),
      imageUrl: src ? decode(src) : null,
    });
  }
  return [...out.values()];
}

export function parseCheckersSearch(html: string): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const m of html.matchAll(/href="((?:https:\/\/www\.checkers\.co\.za)?\/product\/[a-z0-9-]+)"/gi)) {
    const link = shopLink(m[1].startsWith("http") ? m[1] : ORIGIN.checkers + m[1]);
    if (!link || out.has(link.externalId)) continue;
    out.set(link.externalId, { ...link, title: titleFromSlug(link.externalId), imageUrl: null });
  }
  return [...out.values()];
}

/** Takealot's search API, the same one search-pricewatch proxies. */
export function parseTakealotSearch(json: any): Candidate[] {
  const out: Candidate[] = [];
  for (const r of json?.sections?.products?.results ?? []) {
    const core = r?.product_views?.core;
    if (!core?.id) continue;
    const img = r?.product_views?.gallery?.images?.[0];
    out.push({
      retailer: "takealot",
      externalId: `PLID${core.id}`,
      url: core.slug ? `https://www.takealot.com/${core.slug}/PLID${core.id}` : `https://www.takealot.com/x/PLID${core.id}`,
      title: String(core.title ?? "").trim() || `PLID${core.id}`,
      imageUrl: typeof img === "string" ? img.replace("{size}", "pdpxl") : null,
    });
  }
  return out;
}

export function parsePnpSearch(json: any): Candidate[] {
  const out: Candidate[] = [];
  for (const p of json?.products ?? []) {
    const code = typeof p?.code === "string" ? p.code : null;
    if (!code || !/^[A-Za-z0-9_]+$/.test(code)) continue;
    const path = typeof p?.url === "string" && p.url.startsWith("/") ? p.url : `/p/${code}`;
    const img = (p?.images ?? [])[0];
    out.push({
      retailer: "pnp",
      externalId: code,
      url: `${ORIGIN.pnp}${path}`,
      title: typeof p?.name === "string" ? p.name : code,
      imageUrl: typeof img?.url === "string" ? (img.url.startsWith("http") ? img.url : `${ORIGIN.pnp}${img.url}`) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- matching

const STOP = new Set([
  "and", "the", "for", "with", "of", "a", "an", "in", "to", "by", "set", "pack",
  "new", "black", "white", "grey", "gray", "blue", "pink", "red", "green",
]);

/** Lower-case words a title is made of. Units are glued to their numbers
 *  ("256 GB" → "256gb") so a size cannot match a different size. */
export function words(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/(\d)\s+(gb|tb|mb|ml|l|g|kg|mm|cm|m|w|mah|pcs|pc|pack|s)\b/g, "$1$2")
    .split(/[^a-z0-9]+/)
    // A lone digit is kept: "size 3" and "size 4" differ by exactly that.
    .filter(w => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));
}

/** The product's name, without what Takealot titles carry after a pipe or a
 *  spaced dash: "HUAWEI FreeBuds SE 2 | 40-Hour Battery Life" names the
 *  product in its first part only, and "40" there is not a model number. */
export function headOf(title: string): string {
  return title.split(/\s[|–—]\s|\s-\s|\(|,/)[0];
}

/** What to type into another shop's search box for this product: the brand
 *  and the start of the title, before the marketing that Takealot titles
 *  carry after a pipe or dash. */
export function searchQuery(title: string, brand: string | null): string {
  const ws = words(headOf(title)).slice(0, 6);
  const b = brand ? words(brand) : [];
  const all = [...b, ...ws.filter(w => !b.includes(w))];
  return all.slice(0, 6).join(" ");
}

/** How alike two titles are, 0..1, for deciding what is worth *suggesting*
 *  as the same product. A suggestion still needs a person to confirm it, but
 *  a wrong one is noise on the card, so three hard rules come before the
 *  word overlap: the brand must appear in both; every number in one — sizes,
 *  capacities, model numbers — must appear in the other, because "Huggies
 *  size 3" and "Huggies size 4" share every other word; and nearly all of the
 *  product's own name (its words other than the brand) must be in the other
 *  title. "Chelino Polo Travel System" and "Chelino Zippy Travel Stroller"
 *  share a brand and a word, and are different prams. */
export function titleScore(a: string, b: string, brand: string | null): number {
  const A = new Set(words(headOf(a)));
  const B = new Set(words(headOf(b)));
  if (A.size === 0 || B.size === 0) return 0;
  if (brand) {
    const bw = words(brand);
    if (bw.length && !bw.every(w => B.has(w) || [...B].some(x => x.startsWith(w)))) return 0;
  }
  const nums = (s: Set<string>) => [...s].filter(w => /\d/.test(w));
  const na = nums(A), nb = nums(B);
  if (na.some(n => !B.has(n)) || nb.some(n => !A.has(n))) return 0;
  const bw = new Set(brand ? words(brand) : []);
  const own = [...A].filter(w => !bw.has(w));
  if (own.length > 0 && own.filter(w => B.has(w)).length / own.length < NAME_COVERAGE) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/** A suggestion is shown only at or above this. */
export const SUGGEST_AT = 0.3;
/** The share of the product's own name that must appear in the other title. */
export const NAME_COVERAGE = 0.75;

// ---------------------------------------------------------------- plausibility

/** A move of more than this fraction in one step is held back until the next
 *  run reads the same price again. A shop's page that briefly shows a wrong
 *  number — a bundle price, a mis-keyed sale — must not reach the card or a
 *  push; a real price change is still there tomorrow. */
export const HOLD_OVER = 0.5;

export function needsConfirming(previous: number | null, next: number): boolean {
  if (previous === null || previous <= 0) return false;
  return Math.abs(next - previous) / previous > HOLD_OVER;
}
