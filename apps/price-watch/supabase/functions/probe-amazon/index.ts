// Amazon probe (copy of record — deployed as probe-amazon). TEMPORARY: a
// three-day test, 8–11 November 2026, of whether Amazon.co.za can be read as
// reliably as the shops Price Watch already compares, before any adapter is
// built for it. Three runs a day from pg_cron (`pricewatch-probe-amazon`);
// results land in pricewatch_probe.
//
// Each run re-reads the same five product pages and one search, so three days
// show whether the read is stable, not just whether it worked once. On a
// product page the price is read three ways and must agree:
//
//   - the price in the buy box (corePrice), as screen readers get it
//   - the same price as drawn on screen (whole + fraction)
//   - priceAmount in the page's own data
//
// It also records stock, who sells and ships it (Amazon itself, or a
// marketplace seller), and what delivery costs, because a comparison against
// a marketplace seller's price plus shipping would not be like for like.
// Amazon pages carry no barcode, so none is looked for.
//
// Nothing here writes anything except its own log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// The desktop page: the phone layout leaves the buy box empty until a script
// fills it in.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const ORIGIN = "https://www.amazon.co.za";

/** Fixed for the whole test. Two the household tracks at Takealot, two baby
 *  consumables, and one accessory likely sold by a marketplace seller. */
const PRODUCTS = [
  { asin: "B08G4PCG8F", note: "LEGO Bonsai Tree 10281 (tracked at Takealot)" },
  { asin: "B0CDMB5ZQW", note: "HUAWEI FreeBuds SE 2 (tracked at Takealot)" },
  { asin: "B09RB7VC5D", note: "Pampers Complete Clean wipes" },
  { asin: "B0F2957F3F", note: "Huggies Comfort nappies" },
  { asin: "B0DHLLKBMK", note: "Forerunner screen protector (marketplace?)" },
];
const SEARCH = "lego bonsai 10281";

interface Row {
  stage: "product" | "search";
  url: string;
  status: number | null;
  ms: number;
  blocked: string | null;
  price?: number | null;
  price_sources?: Record<string, number | null>;
  visible_match?: boolean | null;
  availability?: string | null;
  name?: string | null;
  note?: string | null;
  seller?: string | null;
  ships_from?: string | null;
  merchant_id?: string | null;
  delivery?: string | null;
  results?: number | null;
}

async function fromCron(req: Request, sb: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data, error } = await sb.rpc("cron_secret_ok", { p_secret: secret });
  return !error && data === true;
}

async function get(url: string): Promise<{ status: number | null; body: string; ms: number; error?: string }> {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-ZA,en;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text(), ms: Date.now() - t };
  } catch (e) {
    return { status: null, body: "", ms: Date.now() - t, error: String(e).slice(0, 200) };
  }
}

/** Amazon's ways of saying no: the robot check, its 503 page, an empty
 *  answer. Recorded rather than retried — the point is to see how often. */
function blockedBy(status: number | null, body: string, error?: string): string | null {
  if (error) return `fetch: ${error}`;
  if (status === 503) return "503";
  if (/validateCaptcha|Robot Check|api-services-support@amazon/i.test(body)) return "captcha";
  if (status !== null && status >= 400) return String(status);
  if (body.length < 5000) return `short page (${body.length} bytes)`;
  return null;
}

const text = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** The HTML of one feature block, from its id to (at most) n characters on. */
function block(html: string, id: string, n = 6000): string {
  const i = html.indexOf(`id="${id}"`);
  return i < 0 ? "" : html.slice(i, i + n);
}

function rand(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readProduct(html: string): Omit<Row, "stage" | "url" | "status" | "ms" | "blocked"> {
  const core = block(html, "corePrice_feature_div");
  const offscreen = rand(core.match(/a-offscreen">\s*(R\s?[\d\s,]+(?:\.\d{2})?)\s*</)?.[1]);
  const whole = core.match(/a-price-whole">([\d\s,]+)/)?.[1];
  const fraction = core.match(/a-price-fraction">(\d{2})/)?.[1];
  const drawn = whole ? rand(`${whole}.${fraction ?? "00"}`) : null;
  const data = rand(html.match(/"priceAmount":([\d.]+)/)?.[1]);
  const sources = { core: offscreen, drawn, data };
  const found = Object.values(sources).filter((v): v is number => v !== null);
  const agree = found.length > 0 && found.every(v => Math.abs(v - found[0]) < 0.005);

  // "In stock", "Only 1 left in stock.", "Currently unavailable."
  const avail = block(html, "availability", 2000);
  const availability = text(avail.match(/primary-availability-message[^>]*>([\s\S]{0,300}?)<\/span>/)?.[1] ?? "")
    || text(avail.match(/<span[^>]*>([\s\S]{0,300}?)<\/span>/)?.[1] ?? "") || null;

  // The buy box's "Ships from" (fulfiller) and "Sold by" (merchant). Amazon's
  // own stock shows only the merchant line; a marketplace seller's name is a
  // link, quoted with single quotes.
  const offerLine = (feature: string) => {
    const i = html.indexOf(`offer-display-feature-name="${feature}"`);
    if (i < 0) return null;
    const m = html.slice(i, i + 2500).match(/offer-display-feature-text-message['"]>([\s\S]{0,300}?)<\/(?:span|a)>/);
    return m ? text(m[1]) || null : null;
  };
  const merchant = html.match(/"merchantId":"([A-Z0-9]+)"/)?.[1] ?? null;
  const delivery = block(html, "mir-layout-DELIVERY_BLOCK", 1500).match(/data-csa-c-delivery-price="([^"]*)"/)?.[1] ?? null;
  const name = text(html.match(/id="productTitle"[^>]*>([\s\S]{0,400}?)<\/span>/)?.[1] ?? "") || null;

  return {
    // A price counts only when every statement of it on the page agrees and
    // at least two of the three are there.
    price: agree && found.length >= 2 ? found[0] : null,
    price_sources: sources,
    visible_match: found.length ? agree : null,
    availability,
    name,
    ships_from: offerLine("desktop-fulfiller-info"),
    seller: offerLine("desktop-merchant-info"),
    merchant_id: merchant,
    delivery,
  };
}

Deno.serve(async (req) => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  if (!(await fromCron(req, sb))) {
    return new Response(JSON.stringify({ error: "cron only" }), { status: 403 });
  }

  const rows: Row[] = [];
  // One at a time, a moment apart: this measures whether a normal day's
  // reading is let through, not how fast Amazon starts refusing.
  for (const p of PRODUCTS) {
    const url = `${ORIGIN}/dp/${p.asin}`;
    const r = await get(url);
    const blocked = blockedBy(r.status, r.body, r.error);
    rows.push({
      stage: "product", url, status: r.status, ms: r.ms, blocked, note: p.note,
      ...(blocked ? {} : readProduct(r.body)),
    });
    await new Promise(res => setTimeout(res, 1500));
  }

  const surl = `${ORIGIN}/s?k=${encodeURIComponent(SEARCH)}`;
  const s = await get(surl);
  const sBlocked = blockedBy(s.status, s.body, s.error);
  rows.push({
    stage: "search", url: surl, status: s.status, ms: s.ms, blocked: sBlocked, note: SEARCH,
    results: sBlocked ? null : new Set([...s.body.matchAll(/\/dp\/([A-Z0-9]{10})\/ref=sr_1_\d/g)].map(m => m[1])).size,
  });

  const { error } = await sb.from("pricewatch_probe").insert(rows.map(r => ({ retailer: "amazon", ...r })));
  return new Response(JSON.stringify({ ok: !error, error: error?.message, rows }), {
    headers: { "Content-Type": "application/json" },
  });
});
