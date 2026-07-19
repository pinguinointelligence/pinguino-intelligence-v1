/**
 * billingCheckout — the client only ever asks for STANDARD, always-purchasable
 * offer keys, and those keys stay in lockstep with the canonical price catalogue
 * (a typo here would send an unknown offer key the server rightly refuses).
 */
import { describe, expect, it } from 'vitest';
import { PRICE_CATALOG } from '@/billing/catalog/priceCatalog';
import { checkoutOfferKey, type BillingCycle, type BillingProductId } from './billingCheckout';

const PRODUCTS: BillingProductId[] = ['home', 'pro'];
const CYCLES: BillingCycle[] = ['monthly', 'yearly'];

describe('checkoutOfferKey — standard offer keys, lockstep with PRICE_CATALOG', () => {
  it('produces the expected key shape', () => {
    expect(checkoutOfferKey('home', 'monthly')).toBe('home_monthly_standard');
    expect(checkoutOfferKey('home', 'yearly')).toBe('home_yearly_standard');
    expect(checkoutOfferKey('pro', 'monthly')).toBe('pro_monthly_standard');
    expect(checkoutOfferKey('pro', 'yearly')).toBe('pro_yearly_standard');
  });

  it('every produced key is a real, non-flag-gated, non-15-month catalogue offer', () => {
    for (const product of PRODUCTS) {
      for (const cycle of CYCLES) {
        const key = checkoutOfferKey(product, cycle);
        const offer = PRICE_CATALOG.find((o) => o.offerKey === key);
        expect(offer, key).toBeDefined();
        // Standard offers are always sellable — no launch/founding server flag,
        // and never the partner-only 15-month cadence.
        expect(offer!.requiredServerFlag, key).toBeNull();
        expect(offer!.cadence, key).not.toBe('initial_15_month');
      }
    }
  });
});
