/**
 * Capability-matrix regression pins (Mapper v1.0 checkpoint).
 *
 * Locks the access rule the UI depends on:
 *   Demo → exact grams HIDDEN;
 *   paid subscription (PINGUINO Home OR Pro price) → exact grams VISIBLE;
 *   accepted-correction persistence stays behind `exactCorrectionGrams`.
 *
 * Grams visibility is a CAPABILITY (`fullFormula`), never a plan-name or
 * price-id check: `planFromSubscription` grants the paid tier for ANY
 * active/trialing subscription regardless of `stripe_price_id`, so a
 * Home-priced subscriber is never mistakenly redacted like Demo or told to
 * upgrade merely to see grams. (A per-plan Home/Pro capability split is NOT
 * implemented yet — subscriptions carry a price id but no plan mapping.)
 */
import { describe, expect, it } from 'vitest';
import { capabilitiesFor } from './plans';
import { planFromSubscription, type Subscription } from './subscription';

const subscription = (over: Partial<Subscription>): Subscription => ({
  stripe_subscription_id: 'sub_test',
  stripe_customer_id: 'cus_test',
  stripe_price_id: null,
  subscription_status: 'active',
  current_period_end: null,
  cancel_at_period_end: false,
  ...over,
});

describe('capability matrix — grams visibility by tier', () => {
  it('Demo → grams hidden (structure/direction only, no exact values, no saving)', () => {
    const demo = capabilitiesFor('demo');
    expect(demo.fullFormula).toBe(false);
    expect(demo.exactCorrectionGrams).toBe(false);
    expect(demo.technicalView).toBe(false);
    expect(demo.saveRecipes).toBe(false);
  });

  it('signed-in without subscription → may save, still no exact grams and no correction persistence', () => {
    const free = capabilitiesFor('free');
    expect(free.saveRecipes).toBe(true);
    expect(free.myRecipes).toBe(true);
    expect(free.fullFormula).toBe(false);
    expect(free.exactCorrectionGrams).toBe(false);
  });

  it('paid tier → exact grams visible and correction persistence allowed', () => {
    const pro = capabilitiesFor('pro');
    expect(pro.fullFormula).toBe(true);
    expect(pro.exactCorrectionGrams).toBe(true);
    expect(pro.technicalView).toBe(true);
    expect(pro.saveRecipes).toBe(true);
  });
});

describe('capability matrix — starter preview capabilities (explicit names, never isPro)', () => {
  it('demo → canViewExactGrams false, canApplyStarterToStudio false', () => {
    const demo = capabilitiesFor('demo');
    expect(demo.canViewExactGrams).toBe(false);
    expect(demo.canApplyStarterToStudio).toBe(false);
  });

  it('free (signed-in, no subscription) → consistent with the redaction model: both false', () => {
    // The locked plan matrix names only Demo/Home/Pro; `free` is the
    // signed-in-unpaid state and keeps the fullFormula redaction model.
    const free = capabilitiesFor('free');
    expect(free.canViewExactGrams).toBe(false);
    expect(free.canApplyStarterToStudio).toBe(false);
  });

  it('paid tier (Home AND Pro subscriptions) → both true', () => {
    const pro = capabilitiesFor('pro');
    expect(pro.canViewExactGrams).toBe(true);
    expect(pro.canApplyStarterToStudio).toBe(true);
  });

  it('canViewExactGrams never disagrees with the existing fullFormula redaction model', () => {
    for (const tier of ['demo', 'free', 'pro'] as const) {
      const caps = capabilitiesFor(tier);
      expect(caps.canViewExactGrams, tier).toBe(caps.fullFormula);
    }
  });
});

describe('paid-tier resolution is price-id-agnostic (Home and Pro subscriptions both see grams)', () => {
  it('an active Home-priced subscription resolves to the paid tier — never treated as Demo', () => {
    const plan = planFromSubscription(subscription({ stripe_price_id: 'price_home_monthly_test' }));
    expect(plan).toBe('pro');
    expect(capabilitiesFor(plan).fullFormula).toBe(true);
    expect(capabilitiesFor(plan).canViewExactGrams).toBe(true);
    expect(capabilitiesFor(plan).canApplyStarterToStudio).toBe(true);
  });

  it('an active Pro-priced subscription resolves to the paid tier', () => {
    const plan = planFromSubscription(subscription({ stripe_price_id: 'price_pro_monthly_test' }));
    expect(plan).toBe('pro');
    expect(capabilitiesFor(plan).fullFormula).toBe(true);
    expect(capabilitiesFor(plan).canViewExactGrams).toBe(true);
    expect(capabilitiesFor(plan).canApplyStarterToStudio).toBe(true);
  });

  it('no subscription → free tier → grams redacted (upgrade guidance, not a crash)', () => {
    expect(planFromSubscription(null)).toBe('free');
    expect(capabilitiesFor('free').fullFormula).toBe(false);
    expect(capabilitiesFor('free').canViewExactGrams).toBe(false);
    expect(capabilitiesFor('free').canApplyStarterToStudio).toBe(false);
  });
});
