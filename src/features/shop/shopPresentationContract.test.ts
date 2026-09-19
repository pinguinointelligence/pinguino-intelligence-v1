import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ShopProduct } from '@/services/shop';
import { ShopProductCard } from './ShopProductCard';
import {
  SHOP_SINGLE_OWN_PHOTOS,
  SHOP_SINGLE_PLACEHOLDER_SKUS,
  SHOP_SINGLE_PLACEHOLDER_SRC,
  SHOP_STARTER_SHOTS,
} from './shopStarterShots';

/**
 * SHOP — reconciled to the owner-approved C3 screen (approved 2026-08-31;
 * product-emphasis correction and global header override 2026-09-01).
 *
 * C3 SUPERSEDES the Designbook §7 Shop screen this file used to pin. The hero,
 * the second full-width Starter Pack card, the dashed packaging frames and the
 * orange-ruled closing note were removed BY OWNER DECISION, not by drift, and
 * the assertions that pinned them are replaced here by the ones that pin C3.
 *
 * Everything below is either a rule the owner stated or a defect that was
 * actually on served staging — never a style preference. The behavioural and
 * regulatory assertions (allergens, double-order, disabled contrast, shipping
 * authority, confirmation states, the email promise) are carried over unchanged.
 */
const SRC = join(process.cwd(), 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

/** One single article as the catalogue delivers it; tests vary `sku` and `imageUrl`. */
const SINGLE: ShopProduct = {
  id: 'contract-single',
  sku: 'GEL-CONTRACT-SINGLE',
  slug: 'contract-single',
  kind: 'single',
  title: 'Dekstroza',
  description: null,
  canonicalIngredientId: null,
  packSizeG: 500,
  priceCents: 990,
  currency: 'eur',
  imageUrl: null,
  availability: 'in_stock',
  leadTimeWeeks: null,
  contents: [],
  contentsTotalG: null,
  allergens: [],
};

/** One „Kup osobno" row, rendered as the customer receives it. */
const row = (product: Partial<ShopProduct>) =>
  renderToStaticMarkup(
    createElement(ShopProductCard, {
      product: { ...SINGLE, ...product },
      inCart: false,
      onAdd: () => undefined,
    }),
  );

describe('shop C3 · one product, no duplicate', () => {
  it('has no hero and no second Starter Pack block', () => {
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    expect(page).not.toContain('ShopHeroPack');
    expect(page).not.toContain('ShopHeroActions');
    expect(page).not.toContain('DestinationHero\n        variant="shop"');
    // ONE offer component, rendered once, above the contents.
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog.match(/<ShopStarterOffer/g) ?? []).toHaveLength(1);
    expect(catalog).toContain('<ShopStarterContents');
    expect(catalog).not.toContain('ShopStarterPack');
  });

  it('closes the page without the orange-ruled note the old screen ended on', () => {
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog).not.toContain('shop-closing-note');
    expect(catalog).not.toContain('border-l-2 border-[var(--g-orange)]');
  });

  it('never routes the empty cart back to the one product the page leads with', () => {
    const cart = read('features', 'shop', 'ShopCart.tsx');
    expect(cart).not.toContain('emptyCta');
    expect(cart).not.toContain('onBrowse');
  });
});

describe('shop C3 · the product carries the emphasis, never the money', () => {
  it('names the product simply, and only once', () => {
    const copy = read('copy', 'shop.ts');
    expect(copy).toContain("name: 'Zestaw Startowy'");
    // No second prominent brand treatment beside the official wordmark.
    expect(copy).not.toContain('offerKicker');
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    expect(offer.match(/shopProductName\(product\)/g) ?? []).toHaveLength(1);
  });

  /**
   * SUPERSEDED BY DESIGN S1 (owner correction 2026-09-18), the way C3 itself
   * superseded Designbook §7.
   *
   * C3 gave the graphite to the product NAME alone and kept the price on white
   * below it, because the page around the offer was ivory. The owner has since
   * decided that Sklep, Affiliate and Franchise share ONE dark entry block and
   * that the Shop offer IS that block: the pack, the question, the conditions,
   * the price and the action all stand on the same ground. A rule that splits
   * graphite from white inside the offer has nothing left to split.
   *
   * What the owner's decision does NOT relax, and what this pins instead:
   *  * the offer stands on the SHARED top — no hero of its own, ever again;
   *  * the offer declares no graphite ground of its own, so there is exactly
   *    one dark body on the page and one component that owns it;
   *  * the money still gets no fill, no field and no frame of its own.
   * The reading order and every other C3 rule below are untouched.
   */
  it('stands on the shared destination top, and never builds a second one', () => {
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    expect(offer).toContain("from '@/components/shared/destinationEditorial'");
    expect(offer).toContain('<DestinationTop');
    // The dark body belongs to the shared component. The offer owns none.
    expect(offer).not.toContain('bg-[var(--g-graphite)]');
    expect(offer).not.toContain('rounded-[14px] border-l-[3px]');
    // Orange still fills ONE thing here: the 6 px made-to-order dot. The accent
    // action is the shared control family's accent member, declared once in
    // `applicationControlStyles`, never a fill typed into this page.
    const orangeFills = offer.match(/[^"']*bg-\[var\(--g-orange\)\]/g) ?? [];
    expect(orangeFills).toHaveLength(1);
    expect(orangeFills[0]).toContain('rounded-full');
    expect(orangeFills[0]).toContain('size-1.5');
    // The price is text on the ground — no fill, no field, no frame.
    const price = offer.slice(
      offer.indexOf('shop-starter-price') - 400,
      offer.indexOf('shop-starter-price'),
    );
    expect(price).not.toMatch(/bg-\[/);
  });

  it('keeps the price on the page ground, below the conditions', () => {
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    const availability = offer.indexOf('shop-starter-availability');
    const price = offer.indexOf('shopMoney(product.priceCents');
    const cta = offer.indexOf('shop-add-');
    expect(availability).toBeGreaterThan(-1);
    // product → availability → price → add to cart, in source order.
    expect(price).toBeGreaterThan(availability);
    expect(cta).toBeGreaterThan(price);
  });

  it('keeps the real Starter Pack photography, and never swaps in the placeholder', () => {
    // The approved shots exactly: the same views, files and order.
    expect(SHOP_STARTER_SHOTS.map(({ id, src, thumb }) => ({ id, src, thumb }))).toEqual([
      { id: 'front', src: '/shop/starter-front.jpg', thumb: '/shop/starter-front-thumb.jpg' },
      { id: 'angle', src: '/shop/starter-angle.jpg', thumb: '/shop/starter-angle-thumb.jpg' },
      { id: 'side', src: '/shop/starter-side.jpg', thumb: '/shop/starter-side-thumb.jpg' },
    ]);
    // The strip offers only what is NOT on display.
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    expect(offer).toContain('SHOP_STARTER_SHOTS.filter((s) => s.id !== primary.id)');
    // The offer never reaches for the singles' placeholder or their photos.
    expect(offer).not.toContain('SHOP_SINGLE_PLACEHOLDER');
    expect(offer).not.toContain('single-placeholder');
    expect(offer).not.toContain('SHOP_SINGLE_OWN_PHOTOS');
    expect(offer).not.toContain('/shop/singles/');
  });

  /* OWNER DECISIONS: 2026-09-12 a shared placeholder photo, scoped to exactly
     these seven articles on 2026-09-17; later on 2026-09-17 each of the seven
     gets its own photo, with the placeholder kept behind it as the fallback.
     Both supersede C3's „the reserved frame is never filled with invented
     imagery" for these seven ONLY. The list is repeated here on purpose, so
     that extending it is a decision and never a side effect. */
  const SEVEN = [
    'GEL-DEX-500',
    'GEL-FRU-500',
    'GEL-INU-500',
    'GEL-STB-500',
    'GEL-YOL-500',
    'GEL-SMP-500',
    'GEL-CRP-500',
  ];

  it('gives each of the seven physical singles its own photo, and no other article', () => {
    expect([...SHOP_SINGLE_OWN_PHOTOS.keys()].sort()).toEqual([...SEVEN].sort());
    const files = [...SHOP_SINGLE_OWN_PHOTOS.values()];
    // One file per article, never shared between two.
    expect(new Set(files).size).toBe(SEVEN.length);
    for (const src of files) {
      expect(src).toMatch(/^\/shop\/singles\/[a-z0-9-]+\.png$/);
      const path = join(process.cwd(), 'public', src);
      expect(existsSync(path)).toBe(true);
      // The approved placeholder format: a transparent (RGBA) 512 px square PNG.
      const png = readFileSync(path);
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(512);
      expect(png.readUInt32BE(20)).toBe(512);
      expect(png[25]).toBe(6);
    }
    for (const sku of SEVEN) {
      const markup = row({ sku, imageUrl: null });
      expect(markup).toContain(`src="${SHOP_SINGLE_OWN_PHOTOS.get(sku)}"`);
      expect(markup).not.toContain(SHOP_SINGLE_PLACEHOLDER_SRC);
      // Decorative: the name beside it names the article, so the picture is
      // never announced a second time.
      expect(markup).toMatch(/<img[^>]*\salt=""/);
      // Same slot as before: the frame opens the row, before the name.
      expect(markup.indexOf('shop-reserved-frame')).toBeGreaterThan(-1);
      expect(markup.indexOf('shop-reserved-frame')).toBeLessThan(markup.indexOf('<h3'));
    }
    // A single the owner has not named keeps today's empty reserved frame.
    const unnamed = row({ sku: 'GEL-NEW-500', imageUrl: null });
    expect(unnamed).toContain('shop-reserved-frame');
    expect(unnamed).not.toContain('<img');
    // The frame keeps the ivory ground C3 pinned before these decisions.
    expect(read('features', 'shop', 'ShopPackaging.tsx')).toMatch(/bg-\[var\(--g-ivory\)\]/);
  });

  it('keeps the shared placeholder behind the own photos of the same seven', () => {
    expect([...SHOP_SINGLE_PLACEHOLDER_SKUS].sort()).toEqual([...SEVEN].sort());
    // ONE shared file, and it ships.
    expect(SHOP_SINGLE_PLACEHOLDER_SRC).toBe('/shop/single-placeholder.png');
    expect(existsSync(join(process.cwd(), 'public', SHOP_SINGLE_PLACEHOLDER_SRC))).toBe(true);
    // The order a failed picture gives way in (walked event by event in
    // ShopPackaging.runtime.test.tsx): imageUrl, own photo, placeholder, outline.
    expect(read('features', 'shop', 'ShopPackaging.tsx')).toContain(
      '[imageUrl, ownPhoto, placeholder].find(',
    );
  });

  it("lets an article's imageUrl win over its own photo and the placeholder", () => {
    const own = row({ sku: 'GEL-DEX-500', imageUrl: '/shop/own-photo.jpg' });
    expect(own).toContain('src="/shop/own-photo.jpg"');
    expect(own).not.toContain('/shop/singles/dextrose.png');
    expect(own).not.toContain(SHOP_SINGLE_PLACEHOLDER_SRC);
    expect(own).toMatch(/<img[^>]*\salt=""/);
  });
});

describe('shop C3 · structure below the offer', () => {
  it('states the packed gramatures once, with the total', () => {
    const contents = read('features', 'shop', 'ShopStarterContents.tsx');
    expect(contents).toContain('entry.packSizeG');
    expect(contents).toContain('contentsTotalG');
    expect(contents).toContain('shop-contents-total');
    // One hairline joins the list to the offer; the list itself has no rules.
    expect(contents).toContain('border-t border-[var(--g-line)]');
    expect(contents).not.toContain('border-b border-[var(--g-line)]');
  });

  it('states one pack size per line', () => {
    // Served staging printed „Dekstroza · 500 g · 250 g": the retail SKU size
    // and the packed portion, contradicting each other on one line.
    const helper = read('features', 'shop', 'shopContentTitle.ts');
    expect(helper).toContain('export const shopContentTitle');
    expect(read('features', 'shop', 'ShopStarterContents.tsx')).toContain('shopContentTitle');
    for (const file of ['ShopProductCard.tsx', 'ShopStarterOffer.tsx'] as const) {
      expect(read('features', 'shop', file)).toContain('shopProductName');
    }
    expect(read('features', 'shop', 'ShopCart.tsx')).toContain('shopContentTitle');
  });

  it('renders a single ingredient as a compact row, not an ecommerce card', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    // No border, fill or shadow around the article itself.
    expect(card).not.toMatch(/<article\s+className="[^"]*\brounded-\[12px\]/);
    expect(card).not.toMatch(/<article\s+className="[^"]*\bbg-white/);
    expect(card).toContain('border-t border-[var(--g-line-quiet)]');
    // Availability once per row, from the one shared component.
    expect(card.match(/shopAvailabilityLabelPl\(/g) ?? []).toHaveLength(1);
    expect(card).toContain('export function ShopAvailabilityChip');
  });

  it('keeps orange to its approved roles across the Shop', () => {
    for (const file of [
      'ShopCatalog.tsx',
      'ShopProductCard.tsx',
      'ShopStarterOffer.tsx',
      'ShopStarterContents.tsx',
      'ShopCart.tsx',
      'ShopPackaging.tsx',
      'shopStarterShots.ts',
    ] as const) {
      const source = read('features', 'shop', file);
      // No orange body text, and no orange ground on anything with content:
      // the only permitted fill is the small round status dot.
      expect(source).not.toMatch(/text-\[var\(--g-orange\)\]/);
      for (const fill of source.match(/[^"']*bg-\[var\(--g-orange\)\]/g) ?? []) {
        expect(fill).toContain('rounded-full');
      }
    }
  });

  it('uses ONE button family at the approved 12 px radius', () => {
    // The approved control is `border-radius: var(--radius-pro-studio)` = 12 px.
    // The bare `buttonClasses` recipe renders 10 px, so mixing the two put two
    // button radii on one page.
    for (const file of [
      'ShopProductCard.tsx',
      'ShopStarterOffer.tsx',
      'ShopCart.tsx',
      'ShopConfirmation.tsx',
    ] as const) {
      const source = read('features', 'shop', file);
      // `Accent` joined the family on 2026-09-18: the same recipe and the same
      // 12 px radius, in the fill a graphite ground can actually show.
      expect(source).toMatch(/application(Primary|Accent|Secondary|Quiet)Classes\(/);
      expect(source).not.toMatch(/\bbuttonClasses\(/);
    }
  });

  it('keeps disabled controls readable', () => {
    // `opacity-45` measures 2.88:1 on a graphite primary; --g-lock on
    // --g-line-quiet measures 5.03:1.
    for (const file of ['ShopProductCard.tsx', 'ShopStarterOffer.tsx'] as const) {
      const source = read('features', 'shop', file);
      expect(source).toContain('disabled:bg-[var(--g-line-quiet)]');
      expect(source).toContain('disabled:text-[var(--g-lock)]');
      expect(source).toContain('disabled:opacity-100');
    }
  });
});

describe('shop C3 · the Shop declares no header of its own', () => {
  it('consumes the shared header slot instead of building one', () => {
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    // AppShell derives the neutral state from the route. The Shop supplies no
    // switch markup and therefore cannot move or duplicate the global control.
    expect(page).not.toContain('<HomeProSwitch');
    // The basket is a Shop utility BELOW that row, never a header control.
    expect(page).toContain('shop-cart-link');
    // …and a 44 px touch target.
    expect(page).toMatch(/className="[^"]*\bmin-h-11\b[^"]*"\s*data-testid="shop-cart-link"/);
    const surface = read('components', 'shared', 'DestinationSurface.tsx');
    expect(surface).toContain('<AppShell');
    const shell = read('features', 'shell', 'AppShell.tsx');
    expect(shell).toContain('<HomeProSwitch');
    expect(shell).toContain(': null;');
    // No geometry is declared by the Shop: those files belong to the header
    // lane (#76) and this feature must never redeclare them.
    for (const source of [page, surface, read('features', 'shop', 'ShopCatalog.tsx')]) {
      expect(source).not.toContain('APP_HEADER_ROW');
      expect(source).not.toContain('DESKTOP_WORKBENCH_COLUMNS');
      expect(source).not.toContain('--pro-header-height');
      expect(source).not.toContain('--pro-page-gutter');
    }
  });
});

describe('shop C3 · commerce behaviour is unchanged', () => {
  it('states the shipping cost before the payment page, from one authority', () => {
    const cart = read('features', 'shop', 'ShopCart.tsx');
    /* The cart no longer knows a rate. It resolves one from the shipping
       authority for the chosen country and withholds the row when there is
       none — a constant here would be a promise checkout might not keep. */
    expect(cart).not.toContain('SHOP_SHIPPING_FLAT_CENTS');
    expect(cart).toContain('getShippingRate');
    expect(cart).toContain('shopOrderTotals');
    // No invented tax row: the session charges items + shipping and returns
    // amount_tax 0. A VAT line here would be a claim checkout cannot honour.
    expect(cart).not.toMatch(/>\s*VAT\s*</);
  });

  it('closes the purchase with a real confirmation', () => {
    const confirmation = read('features', 'shop', 'ShopConfirmation.tsx');
    for (const fact of ['orderNumber', 'shipping', 'items', 'totalCents']) {
      expect(confirmation).toContain(fact);
    }
    for (const state of ['paid', 'pending', 'failed', 'cancelled', 'checking']) {
      expect(confirmation).toContain(`'${state}'`);
    }
  });

  it('never announces an absence of allergens', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    expect(card).toContain('if (allergens.length === 0) return null;');
  });

  it('cannot mint a second order from one click', () => {
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog).toContain('starting.current');
    expect(catalog).toContain('checkoutPending');
    const checkout = readFileSync(
      join(process.cwd(), 'supabase', 'functions', 'shop-checkout', 'index.ts'),
      'utf8',
    );
    expect(checkout).toContain('DOUBLE-CLICK / BACK-BUTTON GUARD');
    expect(checkout).toContain('reused: true');
  });

  it('gives fulfilment the address, the money and the tracking number', () => {
    const admin = readFileSync(join(SRC, 'features', 'admin', 'AdminShopOrderCard.tsx'), 'utf8');
    for (const needed of [
      'shipping.line1',
      'shipping.postalCode',
      'shipping.country',
      'admin.packingList',
      'trackingNumber',
      'shippingCents',
    ]) {
      expect(admin).toContain(needed);
    }
    expect(admin).toContain("fulfillmentStatus: 'shipped',");
    expect(admin).toContain('trackingNumber: trackingNumber.trim(),');
  });
});

/**
 * S-29. Gellatti has NO transactional email provider, no shared email job and
 * no mail module — audited 2026-08-31 across `supabase/functions/**` and
 * `src/**`. Until one exists, the Shop must not tell a customer that a message
 * is on its way. The order IS saved and IS visible under „Zamówienia", so the
 * confirmation points there instead.
 */
describe('shop makes no promise the system cannot keep', () => {
  it('never claims an email was or will be sent', () => {
    const copy = readFileSync(join(SRC, 'copy', 'shop.ts'), 'utf8');
    for (const claim of [
      'trafia na Twój adres e-mail',
      'dostaniesz mailem',
      'goes to your email',
      'arrives by email',
    ]) {
      expect(copy).not.toContain(claim);
    }
  });
});
