import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SHOP — reconciled to GELLATTI_MASTER_DESIGNBOOK_FINAL (v1.0, 2026-08-31).
 *
 * The composition target is the approved V2.1 Shop screen
 * (`index.html?preview=shop`), PDF pages 8-9. Each assertion below pins a rule
 * the Designbook states, or a defect that was actually on served staging —
 * never a style preference.
 */
const SRC = join(process.cwd(), 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('shop presentation', () => {
  it('leads the hero with the product, as the approved screen does', () => {
    // The approved Shop hero's h1 is the PRODUCT, not the page: greige copy
    // left, graphite media right, one chip + one primary action.
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    expect(page).toContain('<ShopHeroPack />');
    expect(page).toContain('<ShopHeroActions />');
    expect(page).toContain('shopCopy.hero.title');
    expect(page).not.toContain('Neutralny placeholder');
    expect(page).not.toContain('brak zatwierdzonego zdjęcia lub packaging assetu');
  });

  it('fills the hero media with a real packaging card, never an empty rectangle', () => {
    const packaging = read('features', 'shop', 'ShopPackaging.tsx');
    // Measured from the approved screen: 260 wide, radius 8, ivory, on graphite.
    expect(packaging).toContain('w-[260px]');
    expect(packaging).toContain('rounded-[8px]');
    expect(packaging).toContain('bg-[var(--g-graphite)]');
    // The wordmark is the official asset, never redrawn (Designbook §3).
    expect(packaging).toContain("/brand/gellatti-wordmark-graphite.svg");
    // The light PRO theme remaps `--color-ivory` to ink, so `bg-ivory` here
    // would paint near-black on near-black graphite.
    expect(packaging).not.toMatch(/["' ]text-ivory["' ]/);
    expect(packaging).not.toMatch(/["' ]bg-ivory["' ]/);
    expect(packaging).toContain('--color-education-ivory');
  });

  it('shows every product inside the approved dashed packaging frame', () => {
    const packaging = read('features', 'shop', 'ShopPackaging.tsx');
    expect(packaging).toContain('border-dashed');
    expect(packaging).toContain('min-h-[230px]');
    expect(packaging).toContain('w-[118px]');
    for (const file of ['ShopProductCard.tsx', 'ShopStarterPack.tsx'] as const) {
      expect(read('features', 'shop', file)).toContain('ShopPackFrame');
    }
  });

  it('states the packed gramatures once, and the total with them', () => {
    const contents = read('features', 'shop', 'ShopStarterPack.tsx');
    expect(contents).toContain('entry.packSizeG');
    expect(contents).toContain('contentsTotalG');
    expect(contents).toContain('shop-contents-total');
  });

  it('closes the page on the approved orange-ruled note', () => {
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    // 2 px rule, warm paper, meaning-bearing — not decoration.
    expect(catalog).toContain('border-l-2 border-[var(--g-orange)]');
    expect(catalog).toContain('shop-closing-note');
  });

  it('states one pack size per line', () => {
    // Served staging printed „Dekstroza · 500 g · 250 g": the retail SKU size
    // and the packed portion, contradicting each other on one line.
    const helper = read('features', 'shop', 'shopContentTitle.ts');
    expect(helper).toContain('export const shopContentTitle');
    for (const file of [
      ['features', 'shop', 'ShopStarterPack.tsx'],
      ['features', 'shop', 'ShopProductCard.tsx'],
      ['features', 'shop', 'ShopCart.tsx'],
    ] as const) {
      expect(read(...file)).toContain('shopContentTitle');
    }
  });

  it('carries availability once per card, in one shared chip', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    // One chip component, used by the card, the detail block and the hero —
    // never three near-identical availability treatments.
    const availability = card.match(/shopAvailabilityLabelPl\(/g) ?? [];
    expect(availability).toHaveLength(1);
    expect(card).toContain('export function ShopAvailabilityChip');
    expect(card).toContain('flex flex-col');
    expect(card).toContain('flex-1');
  });

  it('keeps orange to its approved roles across the Shop', () => {
    // Designbook §5: orange is focus, active tab, ONE key CTA, attention.
    // It is never a page surface, body copy or an ordinary selected state.
    for (const file of [
      'ShopCatalog.tsx', 'ShopProductCard.tsx', 'ShopStarterPack.tsx',
      'ShopCart.tsx', 'ShopHeroActions.tsx', 'ShopPackaging.tsx',
    ] as const) {
      const source = read('features', 'shop', file);
      // No orange page/section fill.
      expect(source).not.toMatch(/bg-\[var\(--g-orange\)\](?!\/)/);
      // No orange body text.
      expect(source).not.toMatch(/text-\[var\(--g-orange\)\]/);
    }
  });

  it('uses the shared button family rather than a second one', () => {
    for (const file of ['ShopProductCard.tsx', 'ShopStarterPack.tsx', 'ShopHeroActions.tsx'] as const) {
      expect(read('features', 'shop', file)).toContain('buttonClasses(');
    }
  });

  it('keeps disabled controls readable', () => {
    // `opacity-45` measures 2.88:1 on a graphite primary; --g-lock on
    // --g-line-quiet measures 5.03:1.
    for (const file of ['ShopProductCard.tsx', 'ShopStarterPack.tsx', 'ShopHeroActions.tsx'] as const) {
      const source = read('features', 'shop', file);
      expect(source).toContain('disabled:bg-[var(--g-line-quiet)]');
      expect(source).toContain('disabled:text-[var(--g-lock)]');
      expect(source).toContain('disabled:opacity-100');
    }
  });

  it('states the shipping cost before the payment page, from one authority', () => {
    const cart = read('features', 'shop', 'ShopCart.tsx');
    expect(cart).toContain('SHOP_SHIPPING_FLAT_CENTS');
    expect(cart).toContain('shopOrderTotals');
    // No invented tax row: Stripe Tax is off, the session charges items +
    // shipping and returns amount_tax 0. A VAT line here would be a claim the
    // checkout cannot honour.
    expect(cart).not.toMatch(/>\s*VAT\s*</);
  });

  it('closes the purchase with a real confirmation', () => {
    const confirmation = read('features', 'shop', 'ShopConfirmation.tsx');
    for (const fact of ['orderNumber', 'shipping', 'items', 'totalCents']) {
      expect(confirmation).toContain(fact);
    }
    // Every payment verdict has a screen, including the ones that failed.
    for (const state of ['paid', 'pending', 'failed', 'cancelled', 'checking']) {
      expect(confirmation).toContain(`'${state}'`);
    }
  });

  it('never announces an absence of allergens', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    // An article with no allergen statement renders nothing — „no allergens"
    // is a regulatory claim, not a default.
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
    const admin = readFileSync(
      join(SRC, 'features', 'admin', 'AdminShopOrderCard.tsx'),
      'utf8',
    );
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
    // Recording a shipment and marking it shipped are ONE action.
    expect(admin).toContain("fulfillmentStatus: 'shipped',");
    expect(admin).toContain('trackingNumber: trackingNumber.trim(),');
  });
});
