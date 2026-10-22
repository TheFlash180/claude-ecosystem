import { describe, it, expect } from 'vitest';
import {
  gtin, needsConfirming, parseBabyCitySearch, parseCheckersSearch, parsePnpSearch,
  readPnp, readProductPage, searchQuery, shopLink, takealotGtin, titleFromSlug,
  titleScore, SUGGEST_AT,
} from '../../../supabase/functions/sync-pricewatch/shops';

describe('shopLink', () => {
  it('reads a product link from each shop', () => {
    expect(shopLink('https://www.babycity.co.za/chelino-amber-camp-cot-601')).toEqual({
      retailer: 'babycity', externalId: 'chelino-amber-camp-cot-601',
      url: 'https://www.babycity.co.za/chelino-amber-camp-cot-601',
    });
    expect(shopLink('https://www.checkers.co.za/product/padkos-roasted-and-salted-peanuts-150g-10426686EA?x=1')).toMatchObject({
      retailer: 'checkers', externalId: 'padkos-roasted-and-salted-peanuts-150g-10426686ea',
    });
    expect(shopLink('https://www.pnp.co.za/pnp-let-s-cook-buffalo-wings/p/000000000000102313_KGM')).toMatchObject({
      retailer: 'pnp', externalId: '000000000000102313_KGM',
    });
  });

  it('refuses anything that is not a product page at a supported shop', () => {
    expect(shopLink('https://www.babycity.co.za/catalogsearch/result/?q=cot')).toBeNull();
    expect(shopLink('https://www.babycity.co.za/catalogsearch')).toBeNull();
    expect(shopLink('https://www.checkers.co.za/search?q=nappies')).toBeNull();
    expect(shopLink('https://www.dischem.co.za/some-product')).toBeNull();
    expect(shopLink('https://evil.example/www.babycity.co.za/x')).toBeNull();
    expect(shopLink('not a url')).toBeNull();
  });
});

describe('gtin', () => {
  it('accepts a real retail barcode and normalises it to 14 digits', () => {
    expect(gtin('6003678922241')).toBe('06003678922241');
    expect(gtin('5000112637922')).toBe('05000112637922');
  });

  it('rejects a wrong check digit', () => {
    expect(gtin('6003678922242')).toBeNull();
  });

  it('rejects in-store codes, which mean nothing across shops', () => {
    // PnP's weighed buffalo wings carry one.
    expect(gtin('2009306000000')).toBeNull();
  });

  it("rejects a Takealot marketplace seller's internal code", () => {
    expect(gtin('MPTALX22907210-0')).toBeNull();
    expect(gtin('')).toBeNull();
    expect(gtin('0000000000000')).toBeNull();
  });
});

describe('takealotGtin', () => {
  const detail = (text: string) => ({
    product_information: { items: [{ id: 'attributes-6', display_name: 'Barcode', displayable_text: text, item_type: 'barcode' }] },
  });

  it('finds a real barcode in the attributes', () => {
    expect(takealotGtin(detail('6003678922241'))).toBe('06003678922241');
  });

  it('ignores the internal code marketplace sellers show instead', () => {
    expect(takealotGtin(detail('MPTALX22907210\\-0'))).toBeNull();
  });
});

const page = (price: string, opts: { meta?: string; shown?: string; gtin?: string; stock?: string } = {}) => `
<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Chelino Amber Camp Cot",
"gtin13":"${opts.gtin ?? ''}","image":"https://img/x.jpg",
"offers":{"@type":"Offer","price":"${price}","priceCurrency":"ZAR","availability":"https://schema.org/${opts.stock ?? 'InStock'}"}}</script>
${opts.meta ? `<meta property="product:price:amount" content="${opts.meta}">` : ''}
</head><body><span class="price">${opts.shown ?? 'R3 699,99'}</span></body></html>`;

describe('readProductPage', () => {
  it('reads a price stated three ways that agree', () => {
    const r = readProductPage(page('3699.99', { meta: '3699.99', gtin: '6003678922241' }));
    expect(r).toMatchObject({ price: 3699.99, title: 'Chelino Amber Camp Cot', gtin: '06003678922241', inStock: true, problem: null });
  });

  it('refuses a price when the meta tag disagrees', () => {
    const r = readProductPage(page('3699.99', { meta: '2999.99' }));
    expect(r.price).toBeNull();
    expect(r.problem).toContain('meta');
  });

  it('refuses a price the page does not show to a person', () => {
    const r = readProductPage(page('3699.99', { shown: 'R2 999,99' }));
    expect(r.price).toBeNull();
    expect(r.problem).toContain('not shown');
  });

  it('refuses a page with no structured price at all', () => {
    expect(readProductPage('<html><body>R100</body></html>').price).toBeNull();
  });

  it('reads out of stock', () => {
    expect(readProductPage(page('3699.99', { stock: 'OutOfStock' })).inStock).toBe(false);
  });
});

describe('readPnp', () => {
  it("reads the price, stock and barcode from PnP's product API", () => {
    const r = readPnp({
      name: 'Huggies Gold Nappies Size 3 64',
      price: { value: 289.99, formattedValue: 'R289.99' },
      stock: { stockLevelStatus: 'inStock' },
      classifications: [{ features: [{ name: 'Barcode', featureValues: [{ value: '6003678922241' }] }] }],
      images: [{ format: 'product', url: '/medias/x.jpg' }],
    });
    expect(r).toMatchObject({
      price: 289.99, inStock: true, gtin: '06003678922241',
      imageUrl: 'https://www.pnp.co.za/medias/x.jpg', problem: null,
    });
  });

  it('treats a missing or zero price as no reading, never a free product', () => {
    expect(readPnp({ price: { value: 0 } }).price).toBeNull();
    expect(readPnp({}).price).toBeNull();
  });

  it('reads out of stock', () => {
    expect(readPnp({ price: { value: 10 }, stock: { stockLevelStatus: 'outOfStock' } }).inStock).toBe(false);
  });
});

describe('search results', () => {
  it("reads Baby City's results: link, name and image", () => {
    const html = `
      <div class="product-item-info"><div class="image with-options">
      <a href="https://www.babycity.co.za/chelino-amber-camp-cot-601"
         class="product photo product-item-photo" tabindex="-1">
        <span><img class="product-image-photo" src="https://www.babycity.co.za/api/x.jpg?w=1&amp;h=2"
          alt="Chelino&#x20;Amber&#x20;Camp&#x20;Cot"/></span></a></div></div>`;
    expect(parseBabyCitySearch(html)).toEqual([{
      retailer: 'babycity', externalId: 'chelino-amber-camp-cot-601',
      url: 'https://www.babycity.co.za/chelino-amber-camp-cot-601',
      title: 'Chelino Amber Camp Cot', imageUrl: 'https://www.babycity.co.za/api/x.jpg?w=1&h=2',
    }]);
  });

  it("reads Checkers' results from their links, once each", () => {
    const html = '<a href="/product/huggies-gold-nappies-size-3-64s-10612345EA">x</a><a href="/product/huggies-gold-nappies-size-3-64s-10612345EA">y</a>';
    expect(parseCheckersSearch(html)).toEqual([{
      retailer: 'checkers', externalId: 'huggies-gold-nappies-size-3-64s-10612345ea',
      // The id is lower-cased so the same product is one row; the link keeps
      // the shop's own capitalisation.
      url: 'https://www.checkers.co.za/product/huggies-gold-nappies-size-3-64s-10612345EA',
      title: 'Huggies Gold Nappies Size 3 64s', imageUrl: null,
    }]);
  });

  it("reads PnP's search API", () => {
    expect(parsePnpSearch({ products: [{ code: '000000000000123_EA', name: 'Huggies Gold 3', url: '/huggies-gold-3/p/000000000000123_EA' }] }))
      .toEqual([{
        retailer: 'pnp', externalId: '000000000000123_EA',
        url: 'https://www.pnp.co.za/huggies-gold-3/p/000000000000123_EA', title: 'Huggies Gold 3', imageUrl: null,
      }]);
  });

  it('turns a slug into a readable title', () => {
    expect(titleFromSlug('padkos-roasted-and-salted-peanuts-150g-10426686ea')).toBe('Padkos Roasted And Salted Peanuts 150g');
  });
});

describe('matching', () => {
  it('searches on the brand and the start of the title, not the marketing', () => {
    expect(searchQuery('HUAWEI FreeBuds SE 2 | 40-Hour Battery Life | Fast Charge', 'HUAWEI')).toBe('huawei freebuds se 2');
    expect(searchQuery('Chelino Polo Travel System', 'Chelino')).toBe('chelino polo travel system');
  });

  it('scores the same product well enough to suggest it', () => {
    expect(titleScore('Chelino Polo Travel System', 'Chelino Polo Travel System - Black', 'Chelino')).toBeGreaterThanOrEqual(SUGGEST_AT);
  });

  it('never suggests a different size, capacity or model number', () => {
    expect(titleScore('Huggies Gold Nappies Size 3 64', 'Huggies Gold Nappies Size 4 64', 'Huggies')).toBe(0);
    expect(titleScore('Samsung Galaxy S26 Ultra 256GB', 'Samsung Galaxy S26 Ultra 512 GB', 'Samsung')).toBe(0);
  });

  it('compares names, not the marketing after a pipe', () => {
    expect(titleScore('HUAWEI FreeBuds SE 2 | 40-Hour Battery Life | Fast Charge', 'Huawei FreeBuds SE 2 Earphones', 'HUAWEI'))
      .toBeGreaterThanOrEqual(SUGGEST_AT);
  });

  it('never suggests another brand', () => {
    expect(titleScore('Chelino Polo Travel System', 'Bounce Polo Travel System', 'Chelino')).toBe(0);
  });

  it('keeps an unrelated product from the same brand below the line', () => {
    expect(titleScore('Chelino Polo Travel System', 'Chelino Amber Camp Cot', 'Chelino')).toBeLessThan(SUGGEST_AT);
  });

  it('never suggests a different model that shares the brand and a word', () => {
    // The first live match run suggested exactly this for the Polo.
    expect(titleScore('Chelino Polo Travel System', 'Chelino Zippy Travel Stroller - Black and Rose Gold', 'Chelino')).toBe(0);
  });
});

describe('needsConfirming', () => {
  it('holds back a move of more than half', () => {
    expect(needsConfirming(3699.99, 1500)).toBe(true);
    expect(needsConfirming(1000, 1600)).toBe(true);
  });

  it('lets an ordinary change straight through', () => {
    expect(needsConfirming(3699.99, 2999.99)).toBe(false);
    expect(needsConfirming(null, 5)).toBe(false);
  });
});
