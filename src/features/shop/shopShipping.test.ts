import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHOP_SHIPPING_COUNTRIES,
  SHOP_SHIPPING_FLAT_CENTS,
  shopOrderTotals,
} from './shopShipping';

/**
 * A shipping cost the customer sees in the cart and a different one Stripe
 * charges is the worst kind of commerce bug: it is invisible until someone
 * complains about their card statement. The cart reads its number from
 * `shopShipping.ts`; Stripe reads its number from the edge function. This test
 * is the only thing keeping them equal.
 */
const edgeSource = () =>
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'shop-checkout', 'index.ts'),
    'utf8',
  );

describe('shop shipping', () => {
  it('charges what the cart promises', () => {
    const rate = edgeSource().match(/SHIPPING_FLAT_CENTS\s*=\s*(\d+)/);
    expect(rate).not.toBeNull();
    expect(Number(rate![1])).toBe(SHOP_SHIPPING_FLAT_CENTS);
  });

  it('ships where the checkout says it ships', () => {
    const block = edgeSource().match(/SHIPPING_COUNTRIES\s*=\s*\[([\s\S]*?)\]/);
    expect(block).not.toBeNull();
    const countries = [...block![1].matchAll(/'([A-Z]{2})'/g)].map((match) => match[1]);
    expect(countries.sort()).toEqual([...SHOP_SHIPPING_COUNTRIES].sort());
  });

  it('adds no shipping to an empty cart', () => {
    expect(shopOrderTotals(0)).toEqual({ subtotalCents: 0, shippingCents: 0, totalCents: 0 });
    expect(shopOrderTotals(5900)).toEqual({
      subtotalCents: 5900,
      shippingCents: 990,
      totalCents: 6890,
    });
  });
});
