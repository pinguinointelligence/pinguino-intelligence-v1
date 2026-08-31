import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SHOP FINAL PASS (2026-08-31) — the presentation defects the owner named, and
 * the fixes that must not be undone by a later sweep.
 *
 * Each assertion below is a defect that was actually on served staging, not a
 * style preference.
 */
const SRC = join(process.cwd(), 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('shop presentation', () => {
  it('presents the Starter Pack where a placeholder used to announce itself', () => {
    // The hero's graphite half held a dashed panel whose own copy said no
    // photograph existed. A shop does not tell a customer what it is missing.
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    expect(page).toContain('<ShopStarterSpecimen />');
    expect(page).not.toContain('Neutralny placeholder');
    expect(page).not.toContain('brak zatwierdzonego zdjęcia lub packaging assetu');
  });

  it('draws the pack contents to scale from real packed grams', () => {
    const specimen = read('features', 'shop', 'ShopStarterSpecimen.tsx');
    expect(specimen).toContain('entry.packSizeG');
    expect(specimen).toContain('contentsTotalG');
    // The light PRO theme remaps `--color-ivory` to ink, so `text-ivory` here
    // painted near-black on graphite and the panel rendered blank.
    // Delimited so the class is matched, not the comment that explains it.
    expect(specimen).not.toMatch(/["' ]text-ivory["' ]/);
    expect(specimen).not.toMatch(/["' ]bg-ivory["' ]/);
    expect(specimen).toContain('--color-education-ivory');
  });

  it('states one pack size per line', () => {
    // Served staging printed „Dekstroza · 500 g · 250 g": the retail SKU size
    // and the packed portion, contradicting each other on one line.
    const helper = read('features', 'shop', 'shopContentTitle.ts');
    expect(helper).toContain('export const shopContentTitle');
    for (const file of [
      ['features', 'shop', 'ShopStarterSpecimen.tsx'],
      ['features', 'shop', 'ShopProductCard.tsx'],
      ['features', 'shop', 'ShopCart.tsx'],
    ] as const) {
      expect(read(...file)).toContain('shopContentTitle');
    }
  });

  it('carries availability once per card, below the title', () => {
    // The chip used to sit beside the title, so a long name pushed it onto a
    // second line and that card stood taller than the ones beside it.
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    // Call sites only — the import line is not a second rendering.
    const availability = card.match(/shopAvailabilityLabelPl\(/g) ?? [];
    expect(availability).toHaveLength(1);
    expect(card).toContain('flex flex-col');
    expect(card).toContain('flex-1');
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
