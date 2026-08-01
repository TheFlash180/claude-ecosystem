import { describe, it, expect } from 'vitest';
import {
  alertFor, assess, change, formatRand, lastChange, parseTakealotId,
  priceOn, sparkline, stats,
} from '../price';
import type { PricePoint } from '../config';

const NOW = new Date('2026-08-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function pt(days: number, price: number, extra: Partial<PricePoint> = {}): PricePoint {
  return {
    at: daysAgo(days), price, listingPrice: null, inStock: true, stockStatus: null, ...extra,
  };
}

describe('formatRand', () => {
  it('shows whole rands without decimals', () => {
    expect(formatRand(654)).toBe('R654');
  });

  it('groups thousands the South African way, with a non-breaking space', () => {
    // Written as an escape on purpose: en-ZA groups with U+00A0, which is
    // invisible in source and would otherwise look like a plain space to the
    // next person to edit this line. The nbsp is wanted — it stops "R12"
    // wrapping away from "999" at the end of a line.
    expect(formatRand(12999)).toBe('R12\u00a0999');
  });

  it('shows cents only when they exist, with a comma separator', () => {
    // en-ZA convention: R99,50 — not the R99.50 an en-GB habit would produce.
    expect(formatRand(99.5)).toBe('R99,50');
  });

  it('groups millions as well as thousands', () => {
    expect(formatRand(1234567)).toBe('R1\u00a0234\u00a0567');
  });

  it('does not depend on the host locale', () => {
    // The value must be identical whatever Intl would do here: this same
    // string is produced in the browser, in Node under test, and in Deno for
    // push text. toLocaleString('en-ZA') disagrees across all three.
    expect(formatRand(1749)).toBe('R1\u00a0749');
    expect(formatRand(1749)).not.toContain(',');
  });

  it('keeps the minus outside the R', () => {
    expect(formatRand(-250)).toBe('-R250');
  });

  it('rounds cents rather than truncating a near-whole value', () => {
    expect(formatRand(99.999)).toBe('R100');
  });

  it('renders missing prices as a dash rather than R0', () => {
    expect(formatRand(null)).toBe('—');
    expect(formatRand(undefined)).toBe('—');
    expect(formatRand(NaN)).toBe('—');
  });
});

describe('priceOn', () => {
  const points = [pt(60, 1000), pt(30, 800), pt(5, 900)];

  it('reads the series as steps, not a slope', () => {
    // 20 days ago the price was 800 — the value set 30 days ago still stood.
    expect(priceOn(points, daysAgo(20))).toBe(800);
  });

  it('returns null before the first observation', () => {
    expect(priceOn(points, daysAgo(90))).toBeNull();
  });

  it('holds the last price up to now', () => {
    expect(priceOn(points, daysAgo(0))).toBe(900);
  });

  it('is unfazed by unsorted input', () => {
    expect(priceOn([pt(5, 900), pt(60, 1000), pt(30, 800)], daysAgo(20))).toBe(800);
  });
});

describe('stats', () => {
  it('weights typical by how long each price was in force', () => {
    // R500 for one day, R1000 for the rest — "typical" is 1000, even though a
    // plain median of [500, 1000] would sit between them.
    const s = stats([pt(90, 1000), pt(2, 500), pt(1, 1000)], NOW);
    expect(s.typical).toBe(1000);
    expect(s.lowest).toBe(500);
    expect(s.highest).toBe(1000);
  });

  it('reports how long the current price has held', () => {
    const s = stats([pt(60, 1000), pt(10, 900)], NOW);
    expect(Math.round(s.daysAtCurrent)).toBe(10);
  });

  it('handles a single observation without dividing by zero', () => {
    const s = stats([pt(3, 750)], NOW);
    expect(s.current).toBe(750);
    expect(s.typical).toBe(750);
    expect(s.observations).toBe(1);
  });

  it('is empty, not thrown, for no data', () => {
    expect(stats([], NOW).current).toBeNull();
  });
});

describe('assess', () => {
  it('refuses to judge a price it has barely seen', () => {
    const a = assess([pt(3, 500), pt(1, 450)], NOW);
    expect(a.verdict).toBe('unknown');
    expect(a.label).toBe('Learning');
  });

  it('calls the cheapest price yet the lowest', () => {
    const a = assess([pt(120, 1200), pt(60, 1100), pt(1, 900)], NOW);
    expect(a.verdict).toBe('lowest');
  });

  it('calls a price near the top pricey', () => {
    const a = assess([pt(120, 700), pt(60, 800), pt(1, 1000)], NOW);
    expect(a.verdict).toBe('high');
  });

  it('does not call a never-moving price the lowest ever', () => {
    // Flat history: "lowest yet" would be technically true and totally
    // misleading, since it is also the highest ever.
    const a = assess([pt(120, 999), pt(60, 999), pt(1, 999)], NOW);
    expect(a.verdict).toBe('typical');
    expect(a.label).toBe('Unchanged');
  });

  it('flags a permanent "saving" as a fake discount', () => {
    // Takealot claims R981 was-price throughout, but R654 is what it has
    // always actually cost.
    const withClaim = (days: number, price: number) =>
      pt(days, price, { listingPrice: 981 });
    const a = assess([withClaim(120, 654), withClaim(60, 654), withClaim(1, 654)], NOW);
    expect(a.fakeDiscount).toBe(true);
  });

  it('does not flag a genuine drop as fake', () => {
    const a = assess([
      pt(120, 981, { listingPrice: 981 }),
      pt(60, 981, { listingPrice: 981 }),
      pt(1, 654, { listingPrice: 981 }),
    ], NOW);
    expect(a.fakeDiscount).toBe(false);
    expect(a.verdict).toBe('lowest');
  });
});

describe('lastChange', () => {
  it('finds the most recent movement, skipping repeats', () => {
    const c = lastChange([pt(90, 1000), pt(30, 800), pt(10, 800), pt(1, 800)]);
    expect(c).toMatchObject({ from: 1000, to: 800, direction: 'down' });
  });

  it('returns null when the price has never moved', () => {
    expect(lastChange([pt(90, 500), pt(10, 500)])).toBeNull();
  });
});

describe('change', () => {
  it('reports a drop as negative', () => {
    const c = change(1000, 750);
    expect(c.pct).toBeCloseTo(-25);
    expect(c.direction).toBe('down');
  });

  it('does not divide by zero when the old price was zero', () => {
    const c = change(0, 500);
    expect(Number.isFinite(c.pct)).toBe(true);
    expect(c.delta).toBe(500);
  });
});

describe('sparkline', () => {
  it('draws steps, holding each price until the next reading', () => {
    const pts = sparkline([pt(30, 1000), pt(15, 500)], NOW);
    // Every segment is either horizontal or vertical, never diagonal.
    for (let i = 1; i < pts.length; i++) {
      const flat = pts[i].y === pts[i - 1].y;
      const vertical = pts[i].x === pts[i - 1].x;
      expect(flat || vertical).toBe(true);
    }
  });

  it('reaches the right edge so the line ends at today', () => {
    const pts = sparkline([pt(30, 1000), pt(15, 500)], NOW);
    expect(pts[pts.length - 1].x).toBe(1);
  });

  it('puts the cheapest price at the bottom of the box', () => {
    const pts = sparkline([pt(30, 1000), pt(15, 500)], NOW);
    expect(Math.max(...pts.map(p => p.y))).toBe(1); // y=1 is the bottom
  });

  it('returns nothing to draw for a single point', () => {
    expect(sparkline([pt(5, 100)], NOW)).toEqual([]);
  });

  it('pins a flat series to the middle instead of dividing by zero', () => {
    const pts = sparkline([pt(30, 700), pt(10, 700)], NOW);
    expect(pts.every(p => p.y === 0.5)).toBe(true);
  });
});

describe('alertFor', () => {
  const base = { previous: 1000, current: 900, targetPrice: null, wasInStock: true, inStock: true };

  it('fires on a real drop', () => {
    expect(alertFor(base)).toBe('drop');
  });

  it('ignores a trivial wobble on an expensive item', () => {
    expect(alertFor({ ...base, previous: 7000, current: 6997 })).toBeNull();
  });

  it('ignores a small percentage move even in rands', () => {
    expect(alertFor({ ...base, previous: 20000, current: 19950 })).toBeNull();
  });

  it('fires when a target is crossed', () => {
    expect(alertFor({ ...base, previous: 1000, current: 900, targetPrice: 950 })).toBe('target');
  });

  it('does not re-fire for a price already below target', () => {
    // Sitting under target for weeks must not alert every single day.
    expect(alertFor({ ...base, previous: 900, current: 890, targetPrice: 950 })).toBeNull();
  });

  it('fires when something comes back into stock', () => {
    expect(alertFor({
      previous: 900, current: 900, targetPrice: null, wasInStock: false, inStock: true,
    })).toBe('restock');
  });

  it('never alerts on an out-of-stock item', () => {
    expect(alertFor({ ...base, inStock: false })).toBeNull();
  });

  it('never reads a zeroed price as a bargain', () => {
    // A delisted product can report 0; that is missing data, not free.
    expect(alertFor({ ...base, previous: 1000, current: 0 })).toBeNull();
  });
});

describe('parseTakealotId', () => {
  it('pulls the id out of a product URL', () => {
    expect(parseTakealotId('https://www.takealot.com/some-slug/PLID100228371'))
      .toBe('PLID100228371');
  });

  it('handles a URL with query junk appended', () => {
    expect(parseTakealotId('https://www.takealot.com/x/PLID12345?src=share'))
      .toBe('PLID12345');
  });

  it('accepts a bare numeric id', () => {
    expect(parseTakealotId('100228371')).toBe('PLID100228371');
  });

  it('rejects anything it cannot identify rather than guessing', () => {
    expect(parseTakealotId('samsung ssd')).toBeNull();
    expect(parseTakealotId('')).toBeNull();
    expect(parseTakealotId('https://www.takealot.com/')).toBeNull();
  });
});
