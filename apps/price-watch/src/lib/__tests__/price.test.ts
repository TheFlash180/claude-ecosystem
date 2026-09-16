import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  alertFor, assess, change, formatRand, justUnder, lastChange, lowestMarker,
  parseTakealotId, priceOn, shortDate, sparkline, stats, targetContext,
  targetSuggestions,
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

describe('stats: when the low was set', () => {
  it('reports the date the lowest price was observed', () => {
    const s = stats([pt(90, 1000), pt(30, 700), pt(5, 900)], NOW);
    expect(s.lowest).toBe(700);
    expect(s.lowestAt).toBe(daysAgo(30));
  });

  it('keeps the first date when the low is matched again later', () => {
    // A price dipping back to an old record has not set a new one, and dating
    // it today would claim a drop that did not happen.
    const s = stats([pt(90, 700), pt(30, 900), pt(5, 700)], NOW);
    expect(s.lowestAt).toBe(daysAgo(90));
  });

  it('has no date when there is no data', () => {
    expect(stats([], NOW).lowestAt).toBeNull();
  });
});

describe('justUnder', () => {
  it('steps a whole rand below a whole-rand price', () => {
    expect(justUnder(2099)).toBe(2098);
  });

  it('lands strictly below a price carrying cents', () => {
    expect(justUnder(269.99)).toBe(269);
    expect(269).toBeLessThan(269.99);
  });

  it('never suggests a target of zero or less', () => {
    expect(justUnder(1)).toBe(1);
    expect(justUnder(0.5)).toBe(1);
  });
});

describe('targetSuggestions', () => {
  it('offers one-tap targets below the record', () => {
    const s = stats([pt(60, 2249), pt(20, 2099)], NOW);
    expect(targetSuggestions(s)).toEqual([
      { label: 'Under the low', value: 2098 },
      { label: '5% under', value: 1994 },
      { label: '10% under', value: 1889 },
    ]);
  });

  it('offers nothing off a single reading', () => {
    // One price is not a record, and a "beat the low" target built from it
    // would be asking the product to beat a number it is already at.
    expect(targetSuggestions(stats([pt(3, 750)], NOW))).toEqual([]);
    expect(targetSuggestions(stats([], NOW))).toEqual([]);
  });

  it('collapses suggestions that round to the same rand', () => {
    // On a cheap item 5% and 10% are pennies apart; two identical chips are
    // just confusing.
    const s = stats([pt(60, 12), pt(20, 10)], NOW);
    const values = targetSuggestions(s).map(x => x.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('targetContext', () => {
  const s = stats([pt(60, 2249), pt(20, 2099)], NOW);

  it('says how far under the record a target is', () => {
    // The low itself is on the card's own row directly above this sentence,
    // so the gap is the only part worth repeating.
    expect(targetContext(1500, s)).toBe('R599 under the lowest seen.');
  });

  it('calls out a target the product has already beaten', () => {
    // The useful warning: you are waiting for a price it has already hit.
    expect(targetContext(2200, s)).toContain('already been this cheap');
  });

  it('recognises a target sitting exactly on the record', () => {
    expect(targetContext(2099, s)).toBe('Exactly the lowest seen (R2\u00a0099).');
  });

  it('says nothing when there is no target', () => {
    expect(targetContext(null, s)).toBeNull();
  });

  it('declines to compare without enough history', () => {
    expect(targetContext(500, stats([pt(3, 750)], NOW))).toContain('Not enough history');
  });
});

describe('lowestMarker', () => {
  it('puts the marker on the floor of the scale, at the right moment', () => {
    // Half-way along a 100-day span, and y=1 because the low defines the
    // bottom of the chart's range.
    const m = lowestMarker([pt(100, 1000), pt(50, 800), pt(10, 900)], NOW);
    expect(m?.y).toBe(1);
    expect(m?.x).toBeCloseTo(0.5, 2);
  });

  it('draws nothing when the sparkline draws nothing', () => {
    expect(lowestMarker([pt(3, 750)], NOW)).toBeNull();
    expect(lowestMarker([], NOW)).toBeNull();
  });

  it('pins a flat series to the middle, like the line it sits on', () => {
    expect(lowestMarker([pt(60, 500), pt(20, 500)], NOW)?.y).toBe(0.5);
  });
});

describe('shortDate', () => {
  it('is a South African calendar day', () => {
    // 00:30 UTC is already the next day in Johannesburg.
    expect(shortDate('2026-09-14T22:30:00Z')).toBe('15 Sep');
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

  it('fires again on every further drop while under target', () => {
    // R800 with a R700 target drops to R600 — alert. Two days later it drops
    // again to R500 — alert again. The target does not move; it just keeps
    // being met by a cheaper price.
    expect(alertFor({ ...base, previous: 800, current: 600, targetPrice: 700 })).toBe('target');
    expect(alertFor({ ...base, previous: 600, current: 500, targetPrice: 700 })).toBe('target');
  });

  it('ignores the noise thresholds once under target', () => {
    // Above target a R5 move is noise worth suppressing. Under a target you
    // set deliberately, it is the thing you asked to be told about.
    expect(alertFor({ ...base, previous: 605, current: 600, targetPrice: 700 })).toBe('target');
  });

  it('does not re-fire for a price that has not moved', () => {
    // The case that must not nag: sitting at R500 under a R600 target for days
    // on end. Only a further drop alerts again.
    expect(alertFor({ ...base, previous: 500, current: 500, targetPrice: 600 })).toBeNull();
  });

  it('does not fire when the price rises but is still under target', () => {
    expect(alertFor({ ...base, previous: 500, current: 550, targetPrice: 700 })).toBeNull();
  });

  it('fires on the first reading of a product already under target', () => {
    expect(alertFor({ ...base, previous: null, current: 500, targetPrice: 700 })).toBe('target');
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

describe('the notifier decides alerts the same way the app does', () => {
  // Same reasoning as the money parity check below: the edge function cannot
  // import from src/, so it carries its own copy of alertFor. A rule that
  // fires on the server but not in the UI — or the reverse — makes the app
  // look like it is lying about its own notifications.
  const src = readFileSync(
    new URL('../../../supabase/functions/notify-pricewatch/index.ts', import.meta.url),
    'utf8',
  );
  const body = src.match(/function alertFor\(i: AlertInput\): AlertKind \{[\s\S]*?\n\}/)?.[0];

  it('still has an alertFor() to compare against', () => {
    expect(body).toBeTruthy();
  });

  const notifierAlertFor = new Function(
    'MIN_DROP_PCT', 'MIN_DROP_RAND',
    `${body!.replace(/: AlertInput/g, '').replace(/: AlertKind/g, '')}; return alertFor;`,
  )(3, 20) as typeof alertFor;

  const cases: { name: string; input: Parameters<typeof alertFor>[0] }[] = [
    { name: 'target crossed', input: { previous: 800, current: 600, targetPrice: 700, wasInStock: true, inStock: true } },
    { name: 'second drop under target', input: { previous: 600, current: 500, targetPrice: 700, wasInStock: true, inStock: true } },
    { name: 'held under target', input: { previous: 500, current: 500, targetPrice: 600, wasInStock: true, inStock: true } },
    { name: 'small drop under target', input: { previous: 605, current: 600, targetPrice: 700, wasInStock: true, inStock: true } },
    { name: 'rise under target', input: { previous: 500, current: 550, targetPrice: 700, wasInStock: true, inStock: true } },
    { name: 'plain drop, no target', input: { previous: 1000, current: 900, targetPrice: null, wasInStock: true, inStock: true } },
    { name: 'noise drop, no target', input: { previous: 7000, current: 6997, targetPrice: null, wasInStock: true, inStock: true } },
    { name: 'restock', input: { previous: 900, current: 900, targetPrice: null, wasInStock: false, inStock: true } },
    { name: 'out of stock', input: { previous: 1000, current: 900, targetPrice: null, wasInStock: true, inStock: false } },
    { name: 'zeroed price', input: { previous: 1000, current: 0, targetPrice: 500, wasInStock: true, inStock: true } },
    { name: 'first reading under target', input: { previous: null, current: 500, targetPrice: 700, wasInStock: true, inStock: true } },
  ];

  it.each(cases)('agrees on $name', ({ input }) => {
    expect(notifierAlertFor(input)).toBe(alertFor(input));
  });
});

describe('the notifier formats money the same way the app does', () => {
  // The edge function cannot import from src/, so notify-pricewatch carries
  // its own copy of formatRand. The file says to keep the two in step; this
  // reads the deployed copy of record out of the source and checks that it
  // does, because a push disagreeing with the card it refers to reads as the
  // app lying about a price.
  const src = readFileSync(
    new URL('../../../supabase/functions/notify-pricewatch/index.ts', import.meta.url),
    'utf8',
  );
  const body = src.match(/function rand\(v: number\): string \{[\s\S]*?\n\}/)?.[0];

  it('still has a rand() to compare against', () => {
    expect(body).toBeTruthy();
  });

  // Strip the TS annotations so the function can be evaluated here.
  const notifierRand = new Function(
    `${body!.replace(/: number/g, '').replace(/: string/g, '')}; return rand;`,
  )() as (v: number) => string;

  it.each([0, 5, 99.99, 100, 749.5, 1749.99, 1750, 12345.67, 999999.99, 1000000])(
    'agrees with formatRand for %p',
    (v) => {
      // The one deliberate difference: the notifier groups with a plain space
      // because some Android shades render U+00A0 as a box.
      expect(notifierRand(v)).toBe(formatRand(v).replace(/ /g, ' '));
    },
  );

  it('shows cents when they exist rather than rounding them away', () => {
    expect(notifierRand(1749.99)).toBe('R1 749,99');
    expect(notifierRand(1750)).toBe('R1 750');
  });
});
