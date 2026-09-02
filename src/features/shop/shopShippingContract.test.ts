import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localStarterPackTotals, shopOrderTotals } from './shopShipping';

/**
 * ONE SHIPPING AUTHORITY.
 *
 * The predecessor of this test compared a constant in the cart with a constant
 * in the Edge Function and failed when they diverged. That detects drift; it
 * does not prevent it. Two editable copies of a price the customer pays is a
 * bug class, not a maintenance chore — invisible until someone reads their card
 * statement.
 *
 * `shop_shipping_rates` is now the only place a rate exists. This test fails if
 * either side reintroduces a literal, which is the failure mode that matters:
 * a future edit that "just hardcodes it for now".
 */
const edgeSource = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'shop-checkout', 'index.ts'),
  'utf8',
);
const clientSource = readFileSync(
  join(process.cwd(), 'src', 'features', 'shop', 'shopShipping.ts'),
  'utf8',
);
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

describe('shipping has exactly one authority', () => {
  it('checkout declares no country list and no flat rate of its own', () => {
    const code = strip(edgeSource);
    expect(code).not.toMatch(/SHIPPING_COUNTRIES\s*=/);
    expect(code).not.toMatch(/SHIPPING_FLAT_CENTS\s*=/);
    expect(code).not.toMatch(/fixed_amount:\s*\{\s*amount:\s*\d/);
  });

  it('checkout resolves the rate from the table, server-side', () => {
    expect(edgeSource).toContain("from('shop_shipping_rates')");
    expect(edgeSource).toContain('loadShippingRates');
    // A client may name a country; it may never name a price.
    expect(edgeSource).toContain('shipping_unavailable_for_country');
    expect(strip(edgeSource)).not.toMatch(/body\.(shipping|price|amount)Cents/);
  });

  it('the order records the resolved shipping and the settlement total', () => {
    expect(edgeSource).toContain('shipping_cents: shippingCents');
    expect(edgeSource).toContain('expected_total_cents: subtotal + shippingCents');
  });

  it('the cart module cannot invent a rate', () => {
    const code = strip(clientSource);
    expect(code).not.toMatch(/\b990\b/);
    expect(code).not.toMatch(/SHOP_SHIPPING_COUNTRIES/);
    // Shipping arrives as a parameter, so a caller with no rate has no offer.
    expect(code).toMatch(
      /shopOrderTotals\s*=\s*\(\s*subtotalCents:\s*number,\s*shippingCents:\s*number/,
    );
  });
});

describe('totals', () => {
  it('adds the resolved shipping to a non-empty cart', () => {
    expect(shopOrderTotals(5900, 990)).toEqual({
      subtotalCents: 5900,
      shippingCents: 990,
      totalCents: 6890,
    });
  });

  it('adds no shipping to an empty cart', () => {
    expect(shopOrderTotals(0, 990)).toEqual({
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
  });

  it('never lets a negative rate reduce a total', () => {
    expect(shopOrderTotals(5900, -500).totalCents).toBe(5900);
  });

  it('charges nothing at all for a Local Starter Pack', () => {
    expect(localStarterPackTotals()).toEqual({
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
  });
});
