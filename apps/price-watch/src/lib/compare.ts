// Comparing one product across shops. Pure — no React, no Supabase — so the
// rules that decide which price a card shows are tested directly.
//
// The rules, in one place:
//   - Only offers that count are compared: the tracked product itself, and
//     links that are *confirmed* (same retail barcode, or a person said yes).
//     A suggestion is shown with its own question, never as a price.
//   - An offer the sync has not read in FRESH_HOURS drops out. A shop whose
//     page stopped reading must not lend yesterday's price to today's
//     comparison; the card says it cannot be read instead.
//   - The best price is the lowest *in-stock* one. If nothing is in stock the
//     lowest of all is shown, marked out of stock, rather than nothing.
import { priceOn, sortPoints } from './price';
import type { Offer, PricePoint } from './config';

export const FRESH_HOURS = 48;

/** Read recently enough to be compared. A product nobody has read yet (a link
 *  pasted a minute ago) is not fresh: it has no price to compare. */
export function isFresh(o: Offer, now: Date = new Date()): boolean {
  if (o.product.delistedAt) return false;
  if (!o.product.lastCheckedAt || o.history.length === 0) return false;
  return now.getTime() - Date.parse(o.product.lastCheckedAt) <= FRESH_HOURS * 3600_000;
}

/** The offers whose prices count: the tracked product and confirmed links,
 *  read recently. */
export function comparable(offers: Offer[], now: Date = new Date()): Offer[] {
  return offers.filter(o => o.status !== 'suggested' && isFresh(o, now));
}

export interface Best {
  offer: Offer;
  price: number;
  inStock: boolean;
}

/** The cheapest offer right now, in stock first. Ties go to the shop listed
 *  first (the tracked product), so the card does not flicker between equals. */
export function currentBest(offers: Offer[], now: Date = new Date()): Best | null {
  let best: Best | null = null;
  for (const o of comparable(offers, now)) {
    const last = sortPoints(o.history).at(-1);
    if (!last) continue;
    const cand = { offer: o, price: last.price, inStock: last.inStock };
    if (!best
      || (cand.inStock && !best.inStock)
      || (cand.inStock === best.inStock && cand.price < best.price)) {
      best = cand;
    }
  }
  return best;
}

/** One history for the card's chart and verdicts: at every moment any
 *  counted shop changed, the best price across them then. Each point says
 *  which shop it was at. Points from a link count only from when it was
 *  confirmed — before that it was not part of this product's story — so
 *  confirming a cheaper shop does not rewrite the past as a sudden drop. */
export function bestSeries(offers: Offer[], now: Date = new Date()): PricePoint[] {
  const counted = comparable(offers, now);
  if (counted.length === 0) return [];
  const since = (o: Offer) => (o.status === 'tracked' ? 0 : Date.parse(o.decidedAt ?? '') || 0);

  const times = [...new Set(counted.flatMap(o =>
    o.history.map(p => Math.max(Date.parse(p.at), since(o))),
  ))].sort((a, b) => a - b);

  const out: PricePoint[] = [];
  for (const t of times) {
    let pick: { p: PricePoint; o: Offer } | null = null;
    for (const o of counted) {
      if (t < since(o)) continue;
      const at = new Date(t);
      const price = priceOn(o.history, at);
      if (price === null) continue;
      const p = sortPoints(o.history).filter(x => Date.parse(x.at) <= t).at(-1)!;
      if (!pick
        || (p.inStock && !pick.p.inStock)
        || (p.inStock === pick.p.inStock && p.price < pick.p.price)) {
        pick = { p, o };
      }
    }
    if (!pick) continue;
    const prev = out.at(-1);
    // Only a change in what you would pay, or where, is a new point.
    if (prev && prev.price === pick.p.price && prev.inStock === pick.p.inStock && prev.retailer === pick.o.product.retailer) continue;
    out.push({ ...pick.p, at: new Date(t).toISOString(), retailer: pick.o.product.retailer });
  }
  return out;
}

/** The other counted shops, cheapest first, for the "also at" line. */
export function others(offers: Offer[], best: Best | null, now: Date = new Date()): Best[] {
  return comparable(offers, now)
    .filter(o => o !== best?.offer)
    .map(o => {
      const last = sortPoints(o.history).at(-1)!;
      return { offer: o, price: last.price, inStock: last.inStock };
    })
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.price - b.price);
}

/** Confirmed shops the sync could not read lately: said out loud on the card,
 *  because a missing shop and "this shop is dearer" must not look the same. */
export function unreadable(offers: Offer[], now: Date = new Date()): Offer[] {
  return offers.filter(o => o.status !== 'suggested' && !isFresh(o, now) && !o.product.delistedAt && o.history.length > 0);
}

/** The series a card is judged on: the best price across its shops, or — when
 *  none of them has been read lately — the tracked product's own history, so
 *  a card never goes blank because a sync was late. */
export function seriesFor(item: { history: PricePoint[]; offers: Offer[] }, now: Date = new Date()): PricePoint[] {
  const best = bestSeries(item.offers, now);
  return best.length > 0 ? best : item.history;
}
