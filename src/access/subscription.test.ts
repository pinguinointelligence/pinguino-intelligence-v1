import { describe, expect, it } from 'vitest';
import { capabilitiesFor } from './plans';
import { planFromSubscription, type Subscription } from './subscription';

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
