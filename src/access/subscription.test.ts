import { describe, expect, it } from 'vitest';
import { capabilitiesFor } from './plans';
import {
  planFromSubscription,
  productFromSubscription,
  resolveSubscriptionAccess,
  type ConfiguredPriceIds,
  type Subscription,
} from './subscription';

const sub = (over: Partial<Subscription>): Subscription => ({
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  stripe_price_id: 'price_1',
  subscription_status: 'active',
  current_period_end: null,
  cancel_at_period_end: false,
  ...over,
});

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

describe('planFromSubscription', () => {
  it('no subscription → free', () => {
    expect(planFromSubscription(null)).toBe('free');
  });

  it('active / trialing → pro', () => {
    expect(planFromSubscription(sub({ subscription_status: 'active' }))).toBe('pro');
    expect(planFromSubscription(sub({ subscription_status: 'trialing' }))).toBe('pro');
  });

  it('past_due keeps pro until current_period_end, then free', () => {
    expect(
      planFromSubscription(sub({ subscription_status: 'past_due', current_period_end: future })),
    ).toBe('pro');
    expect(
      planFromSubscription(sub({ subscription_status: 'past_due', current_period_end: past })),
    ).toBe('free');
    // past_due with no period end → no grace
    expect(
      planFromSubscription(sub({ subscription_status: 'past_due', current_period_end: null })),
    ).toBe('free');
  });

  it('canceled / incomplete / incomplete_expired / unpaid → free', () => {
    for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid'] as const) {
      expect(planFromSubscription(sub({ subscription_status: status })), status).toBe('free');
    }
  });

  it('an unknown future status falls through to free (fail safe)', () => {
    expect(planFromSubscription(sub({ subscription_status: 'some_new_status' }))).toBe('free');
  });
});

describe('capabilities by tier', () => {
  it('pro unlocks exact grams / full formula / technical view', () => {
    const pro = capabilitiesFor('pro');
    expect(pro.exactCorrectionGrams).toBe(true);
    expect(pro.fullFormula).toBe(true);
    expect(pro.technicalView).toBe(true);
    expect(pro.saveRecipes).toBe(true);
  });

  it('free (signed-in) stays redacted but may save / use My Recipes', () => {
    const free = capabilitiesFor('free');
    expect(free.exactCorrectionGrams).toBe(false);
    expect(free.fullFormula).toBe(false);
    expect(free.technicalView).toBe(false);
    expect(free.saveRecipes).toBe(true);
    expect(free.myRecipes).toBe(true);
  });

  it('demo (anonymous) is fully redacted and cannot save', () => {
    const demo = capabilitiesFor('demo');
    expect(demo.exactCorrectionGrams).toBe(false);
    expect(demo.saveRecipes).toBe(false);
    expect(demo.myRecipes).toBe(false);
  });

  it('production / rescue modes stay reserved (off) everywhere in 2B.1', () => {
    for (const tier of ['demo', 'free', 'pro'] as const) {
      expect(capabilitiesFor(tier).productionMode).toBe(false);
      expect(capabilitiesFor(tier).rescueMode).toBe(false);
    }
  });
});

// ── Catalog-aware evolution (billing platform) ──────────────────────────────
// planFromSubscription above is UNCHANGED — these pins cover the additive
// layer that finally distinguishes Home vs Pro via the price catalog.

const configured: ConfiguredPriceIds = {
  STRIPE_PRICE_HOME_MONTHLY_STANDARD: 'price_fake_home_m',
  STRIPE_PRICE_HOME_YEARLY_STANDARD: 'price_fake_home_y',
  STRIPE_PRICE_PRO_MONTHLY_STANDARD: 'price_fake_pro_m',
  STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER: 'price_fake_pro_15f',
};

describe('productFromSubscription — price id → home|pro via the catalog env mapping', () => {
  it('maps configured Home and Pro price ids (including 15-month prices)', () => {
    expect(productFromSubscription(sub({ stripe_price_id: 'price_fake_home_m' }), configured)).toBe('home');
    expect(productFromSubscription(sub({ stripe_price_id: 'price_fake_home_y' }), configured)).toBe('home');
    expect(productFromSubscription(sub({ stripe_price_id: 'price_fake_pro_m' }), configured)).toBe('pro');
    expect(productFromSubscription(sub({ stripe_price_id: 'price_fake_pro_15f' }), configured)).toBe('pro');
  });

  it('unknown price, missing price, missing row or empty config → null (never a guessed product)', () => {
    expect(productFromSubscription(sub({ stripe_price_id: 'price_fake_foreign' }), configured)).toBeNull();
    expect(productFromSubscription(sub({ stripe_price_id: null }), configured)).toBeNull();
    expect(productFromSubscription(null, configured)).toBeNull();
    expect(productFromSubscription(sub({}), {})).toBeNull();
  });
});

describe('resolveSubscriptionAccess — {paid, product} without breaking any consumer', () => {
  it('paid stays in exact lockstep with planFromSubscription across all statuses', () => {
    const rows = [
      sub({ subscription_status: 'active' }),
      sub({ subscription_status: 'trialing' }),
      sub({ subscription_status: 'past_due', current_period_end: future }),
      sub({ subscription_status: 'past_due', current_period_end: past }),
      sub({ subscription_status: 'canceled' }),
      sub({ subscription_status: 'some_new_status' }),
      null,
    ];
    for (const row of rows) {
      const access = resolveSubscriptionAccess(row, configured);
      expect(access.paid, row?.subscription_status ?? 'null').toBe(
        planFromSubscription(row) === 'pro',
      );
    }
  });

  it('paid + mapped price → the mapped product', () => {
    expect(
      resolveSubscriptionAccess(sub({ stripe_price_id: 'price_fake_home_m' }), configured),
    ).toEqual({ paid: true, product: 'home' });
    expect(
      resolveSubscriptionAccess(sub({ stripe_price_id: 'price_fake_pro_m' }), configured),
    ).toEqual({ paid: true, product: 'pro' });
  });

  it('FAIL-SAFE: paid status + unknown price → paid with product null (access never revoked by a mapping gap)', () => {
    expect(
      resolveSubscriptionAccess(sub({ stripe_price_id: 'price_fake_foreign' }), configured),
    ).toEqual({ paid: true, product: null });
    expect(resolveSubscriptionAccess(sub({}), {})).toEqual({ paid: true, product: null });
  });

  it('unpaid rows never report a product, even when the price would map', () => {
    expect(
      resolveSubscriptionAccess(
        sub({ subscription_status: 'canceled', stripe_price_id: 'price_fake_home_m' }),
        configured,
      ),
    ).toEqual({ paid: false, product: null });
    expect(resolveSubscriptionAccess(null, configured)).toEqual({ paid: false, product: null });
  });

  it('past_due grace resolves product while the grace lasts, nothing after', () => {
    const row = sub({ subscription_status: 'past_due', current_period_end: future, stripe_price_id: 'price_fake_home_y' });
    expect(resolveSubscriptionAccess(row, configured)).toEqual({ paid: true, product: 'home' });
    const lapsed = sub({ subscription_status: 'past_due', current_period_end: past, stripe_price_id: 'price_fake_home_y' });
    expect(resolveSubscriptionAccess(lapsed, configured)).toEqual({ paid: false, product: null });
  });
});
