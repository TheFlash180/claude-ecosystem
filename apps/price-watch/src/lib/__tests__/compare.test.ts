import { describe, it, expect } from 'vitest';
import { bestSeries, currentBest, isFresh, others, seriesFor, unreadable } from '../compare';
import type { Offer, PricePoint, Product } from '../config';

const NOW = new Date('2026-10-22T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const pt = (days: number, price: number, inStock = true): PricePoint => ({
  at: daysAgo(days), price, listingPrice: null, inStock, stockStatus: null,
});

function offer(retailer: string, history: PricePoint[], o: Partial<Offer> & { checked?: number } = {}): Offer {
  const product: Product = {
    id: `${retailer}-id`, retailer, externalId: retailer, title: retailer, brand: null,
    imageUrl: null, url: `https://${retailer}.example/p`,
    lastCheckedAt: daysAgo(o.checked ?? 0.2), delistedAt: null, hasVariants: false,
  };
  return {
    linkId: o.status === 'tracked' || o.status === undefined ? null : `${retailer}-link`,
    status: o.status ?? 'tracked', reason: o.reason ?? null,
    decidedAt: o.decidedAt ?? null, product, history,
  };
}

describe('currentBest', () => {
  it('picks the cheapest shop', () => {
    const offers = [
      offer('takealot', [pt(20, 3799)]),
      offer('babycity', [pt(10, 3499)], { status: 'confirmed', decidedAt: daysAgo(15) }),
    ];
    expect(currentBest(offers, NOW)).toMatchObject({ price: 3499, inStock: true });
    expect(currentBest(offers, NOW)!.offer.product.retailer).toBe('babycity');
  });

  it('switches when another shop undercuts on a later day', () => {
    // Day 1 shop A is cheapest, day 6 shop B goes under it.
    const offers = [
      offer('takealot', [pt(10, 1000)]),
      offer('pnp', [pt(10, 1100), pt(4, 950)], { status: 'confirmed', decidedAt: daysAgo(11) }),
    ];
    expect(currentBest(offers, NOW)!.offer.product.retailer).toBe('pnp');
  });

  it('never counts a suggestion nobody has confirmed', () => {
    const offers = [
      offer('takealot', [pt(20, 3799)]),
      offer('babycity', [pt(10, 99)], { status: 'suggested' }),
    ];
    expect(currentBest(offers, NOW)!.price).toBe(3799);
  });

  it('drops a shop that has not been read in two days', () => {
    const offers = [
      offer('takealot', [pt(20, 3799)]),
      offer('babycity', [pt(10, 2999)], { status: 'confirmed', decidedAt: daysAgo(11), checked: 3 }),
    ];
    expect(currentBest(offers, NOW)!.price).toBe(3799);
    expect(unreadable(offers, NOW).map(o => o.product.retailer)).toEqual(['babycity']);
  });

  it('prefers a dearer shop that has it in stock over a cheaper one that does not', () => {
    const offers = [
      offer('takealot', [pt(5, 800, false)]),
      offer('checkers', [pt(5, 900)], { status: 'confirmed', decidedAt: daysAgo(6) }),
    ];
    expect(currentBest(offers, NOW)).toMatchObject({ price: 900, inStock: true });
  });

  it('lists the other shops, in stock and cheapest first', () => {
    const offers = [
      offer('takealot', [pt(5, 1000)]),
      offer('babycity', [pt(5, 1200)], { status: 'confirmed', decidedAt: daysAgo(6) }),
      offer('pnp', [pt(5, 1100, false)], { status: 'confirmed', decidedAt: daysAgo(6) }),
      offer('checkers', [pt(5, 1150)], { status: 'confirmed', decidedAt: daysAgo(6) }),
    ];
    const best = currentBest(offers, NOW);
    expect(others(offers, best, NOW).map(o => o.offer.product.retailer)).toEqual(['checkers', 'babycity', 'pnp']);
  });
});

describe('isFresh', () => {
  it('is false for a link pasted a moment ago, with no price yet', () => {
    expect(isFresh(offer('babycity', [], { status: 'confirmed' }), NOW)).toBe(false);
  });

  it('is false for a delisted product', () => {
    const o = offer('pnp', [pt(5, 10)], { status: 'confirmed' });
    o.product.delistedAt = daysAgo(1);
    expect(isFresh(o, NOW)).toBe(false);
  });
});

describe('bestSeries', () => {
  it('is the cheapest shop at every moment, with the shop on each point', () => {
    const offers = [
      offer('takealot', [pt(20, 1000)]),
      offer('pnp', [pt(20, 1100), pt(6, 950), pt(2, 1050)], { status: 'confirmed', decidedAt: daysAgo(30) }),
    ];
    const s = bestSeries(offers, NOW);
    expect(s.map(p => [p.price, p.retailer])).toEqual([
      [1000, 'takealot'], [950, 'pnp'], [1000, 'takealot'],
    ]);
  });

  it('counts a confirmed shop only from when it was confirmed', () => {
    // Confirming a cheaper shop today must not rewrite last month as a drop.
    const offers = [
      offer('takealot', [pt(30, 1000)]),
      offer('babycity', [pt(30, 800)], { status: 'confirmed', decidedAt: daysAgo(1) }),
    ];
    const s = bestSeries(offers, NOW);
    expect(s[0]).toMatchObject({ price: 1000, retailer: 'takealot' });
    expect(s[s.length - 1]).toMatchObject({ price: 800, retailer: 'babycity' });
    expect(Date.parse(s[s.length - 1].at)).toBe(Date.parse(daysAgo(1)));
  });

  it('is the product alone when there is only one shop', () => {
    const h = [pt(20, 1000), pt(10, 900)];
    expect(bestSeries([offer('takealot', h)], NOW).map(p => p.price)).toEqual([1000, 900]);
  });

  it('falls back to the product’s own history when no shop is fresh', () => {
    const h = [pt(20, 1000)];
    const item = { history: h, offers: [offer('takealot', h, { checked: 5 })] };
    expect(seriesFor(item, NOW)).toBe(h);
  });
});
