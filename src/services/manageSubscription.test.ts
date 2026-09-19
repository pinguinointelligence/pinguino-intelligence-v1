/// <reference types="node" />
/**
 * manage-subscription — pure logic tests + Deno source pins.
 *
 * Account → Plan i rozliczenia: cancel is cancel_at_period_end, resume clears
 * it on the same subscription, going up is immediate + prorated (preview from
 * Stripe), going down is scheduled at period end, every mutation is
 * idempotent, and the panel's offers stay in lockstep with the catalog.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MANAGEABLE_OFFERS,
  MANAGEABLE_STATUSES,
  PREVIEW_VALIDITY_SECONDS,
  buildCancelIdempotencyKey,
  buildChangeIdempotencyKey,
  buildImmediateChangeParams,
  buildPreviewParams,
  buildResumeIdempotencyKey,
  buildScheduleIdempotencyKey,
  buildScheduledChangePhases,
  decideCancel,
  decideConfirmTimestamp,
  decidePlanChange,
  decideResume,
  extractLiveSubscription,
  manageableOffer,
  parseManageRequest,
  pickManagedSubscription,
  summarizeInvoicePreview,
  toStateReply,
} from '../../supabase/functions/manage-subscription/logic.ts';
import { PURCHASABLE_OFFERS } from '../../supabase/functions/create-checkout-session/logic.ts';
import { PRICE_CATALOG } from '../billing/catalog/priceCatalog';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'manage-subscription');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const logicSource = readFileSync(join(fnDir, 'logic.ts'), 'utf8');

const offer = (key: string) => manageableOffer(key)!;

describe('manageable offers — lockstep with checkout + catalog', () => {
  it('exactly the direct-checkout offers, with the catalog product/cadence', () => {
    expect(MANAGEABLE_OFFERS.map((o) => o.offerKey).sort()).toEqual(
      PURCHASABLE_OFFERS.map((o) => o.offerKey).sort(),
    );
    for (const o of MANAGEABLE_OFFERS) {
      const catalog = PRICE_CATALOG.find((c) => c.offerKey === o.offerKey)!;
      expect(catalog, o.offerKey).toBeDefined();
      expect(o.product).toBe(catalog.product);
      expect(o.cadence).toBe(catalog.cadence);
    }
  });

  it('15-month partner offers are never a change target', () => {
    expect(manageableOffer('home_15m_standard_partner')).toBeNull();
    expect(manageableOffer('pro_15m_founding_partner')).toBeNull();
    expect(manageableOffer('')).toBeNull();
    expect(manageableOffer(undefined)).toBeNull();
  });
});

describe('request parsing — closed action vocabulary', () => {
  it('accepts the five actions and refuses anything else', () => {
    expect(parseManageRequest({ action: 'cancel' })).toEqual({ ok: true, request: { action: 'cancel' } });
    expect(parseManageRequest({ action: 'resume' })).toEqual({ ok: true, request: { action: 'resume' } });
    expect(parseManageRequest({ action: 'cancel_scheduled_change' })).toEqual({
      ok: true,
      request: { action: 'cancel_scheduled_change' },
    });
    expect(parseManageRequest({ action: 'preview_change', targetOfferKey: ' pro_monthly_standard ' })).toEqual({
      ok: true,
      request: { action: 'preview_change', targetOfferKey: 'pro_monthly_standard' },
    });
    expect(
      parseManageRequest({ action: 'confirm_change', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1_790_000_000 }),
    ).toEqual({
      ok: true,
      request: { action: 'confirm_change', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1_790_000_000 },
    });
    expect(parseManageRequest({ action: 'delete_everything' })).toEqual({ ok: false, reason: 'unknown_action' });
    expect(parseManageRequest(null)).toEqual({ ok: false, reason: 'unknown_action' });
    expect(parseManageRequest({ action: 'preview_change' })).toEqual({ ok: false, reason: 'missing_target_offer' });
    expect(parseManageRequest({ action: 'confirm_change', targetOfferKey: 'x', prorationTimestamp: 'now' })).toEqual({
      ok: false,
      reason: 'invalid_proration_timestamp',
    });
  });
});

describe('which subscription is managed', () => {
  const row = (over: Partial<Parameters<typeof pickManagedSubscription>[0][number]>) => ({
    stripe_subscription_id: 'sub_fake_1',
    stripe_customer_id: 'cus_fake_1',
    offer_key: 'home_monthly_standard',
    status: 'active',
    current_period_end: '2026-10-19T00:00:00.000Z',
    cancel_at_period_end: false,
    ...over,
  });

  it('a live subscription is managed; cancelled/ended ones never are (renew = new checkout)', () => {
    expect(pickManagedSubscription([row({})])?.stripe_subscription_id).toBe('sub_fake_1');
    expect(pickManagedSubscription([row({ status: 'canceled' })])).toBeNull();
    expect(pickManagedSubscription([row({ status: 'incomplete_expired' })])).toBeNull();
    expect(pickManagedSubscription([])).toBeNull();
    expect(MANAGEABLE_STATUSES).toEqual(['active', 'trialing', 'past_due', 'unpaid']);
  });

  it('prefers the latest period end when an old cancelled row coexists with the live one', () => {
    const picked = pickManagedSubscription([
      row({ stripe_subscription_id: 'sub_old', status: 'canceled', current_period_end: '2026-01-01T00:00:00.000Z' }),
      row({ stripe_subscription_id: 'sub_new', status: 'active', current_period_end: '2026-12-01T00:00:00.000Z' }),
      row({ stripe_subscription_id: 'sub_mid', status: 'past_due', current_period_end: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(picked?.stripe_subscription_id).toBe('sub_new');
  });
});

describe('cancel at period end / resume', () => {
  const END = 1_790_000_000;

  it('cancel is allowed once on a live subscription', () => {
    expect(decideCancel({ status: 'active', cancelAtPeriodEnd: false })).toEqual({ ok: true });
    expect(decideCancel({ status: 'past_due', cancelAtPeriodEnd: false })).toEqual({ ok: true });
    expect(decideCancel({ status: 'active', cancelAtPeriodEnd: true })).toEqual({ ok: false, reason: 'already_cancelling' });
    expect(decideCancel({ status: 'canceled', cancelAtPeriodEnd: false })).toEqual({ ok: false, reason: 'not_manageable' });
  });

  it('resume requires cancel_at_period_end and a period that has not ended', () => {
    expect(decideResume({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEndEpoch: END }, END - 1)).toEqual({ ok: true });
    expect(decideResume({ status: 'active', cancelAtPeriodEnd: false, currentPeriodEndEpoch: END }, END - 1)).toEqual({
      ok: false,
      reason: 'not_cancelling',
    });
    expect(decideResume({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEndEpoch: END }, END)).toEqual({
      ok: false,
      reason: 'period_already_ended',
    });
    expect(decideResume({ status: 'canceled', cancelAtPeriodEnd: true, currentPeriodEndEpoch: END }, END - 1)).toEqual({
      ok: false,
      reason: 'not_manageable',
    });
  });

  it('idempotency keys are deterministic per subscription + period (a retry cannot double-apply)', () => {
    expect(buildCancelIdempotencyKey('sub_fake_1', END)).toBe(buildCancelIdempotencyKey('sub_fake_1', END));
    expect(buildCancelIdempotencyKey('sub_fake_1', END)).not.toBe(buildResumeIdempotencyKey('sub_fake_1', END));
    expect(buildResumeIdempotencyKey('sub_fake_1', null)).toBe('manage:resume:sub_fake_1:none');
  });
});

describe('plan change decision — up is immediate + prorated, down waits for the paid period', () => {
  it('HOME → PRO (same cadence): immediate, same billing cycle (monthly and yearly alike)', () => {
    expect(decidePlanChange(offer('home_monthly_standard'), offer('pro_monthly_standard'))).toEqual({
      kind: 'immediate',
      resetBillingCycle: false,
    });
    expect(decidePlanChange(offer('home_yearly_standard'), offer('pro_yearly_standard'))).toEqual({
      kind: 'immediate',
      resetBillingCycle: false,
    });
  });

  it('PRO → HOME: scheduled at period end, whatever the cadence', () => {
    expect(decidePlanChange(offer('pro_monthly_standard'), offer('home_monthly_standard'))).toEqual({ kind: 'scheduled' });
    expect(decidePlanChange(offer('pro_yearly_standard'), offer('home_yearly_standard'))).toEqual({ kind: 'scheduled' });
    expect(decidePlanChange(offer('pro_yearly_standard'), offer('home_monthly_standard'))).toEqual({ kind: 'scheduled' });
    expect(decidePlanChange(offer('pro_monthly_standard'), offer('home_yearly_standard'))).toEqual({ kind: 'scheduled' });
  });

  it('monthly → yearly belongs to the owner-accepted conversion authority, never to a default proration', () => {
    // MONTHLY_CREDIT_POLICY = 'full_current_period' (owner 2026-09-18) credits
    // the WHOLE paid month and anchors the annual term at the current period
    // start. Stripe's default time-based proration does not produce that, so
    // this path refuses rather than charging under a replaced policy.
    expect(decidePlanChange(offer('home_monthly_standard'), offer('home_yearly_standard'))).toEqual({
      kind: 'conversion_authority',
    });
    // tier + cadence at once is the same conversion question
    expect(decidePlanChange(offer('home_monthly_standard'), offer('pro_yearly_standard'))).toEqual({
      kind: 'conversion_authority',
    });
    expect(decidePlanChange(offer('pro_monthly_standard'), offer('pro_yearly_standard'))).toEqual({
      kind: 'conversion_authority',
    });
  });

  it('yearly → monthly moves no money now: same product scheduled, richer product immediate', () => {
    expect(decidePlanChange(offer('pro_yearly_standard'), offer('pro_monthly_standard'))).toEqual({ kind: 'scheduled' });
    // HOME yearly → PRO monthly is still an upgrade: applied now, new cycle.
    expect(decidePlanChange(offer('home_yearly_standard'), offer('pro_monthly_standard'))).toEqual({
      kind: 'immediate',
      resetBillingCycle: true,
    });
  });

  it('same offer is a no-op', () => {
    expect(decidePlanChange(offer('home_monthly_standard'), offer('home_monthly_standard'))).toEqual({
      kind: 'noop',
      reason: 'same_offer',
    });
  });

  it('a confirm must name a fresh preview timestamp', () => {
    const now = 1_790_000_000;
    expect(decideConfirmTimestamp(null, now)).toEqual({ ok: false, reason: 'preview_required' });
    expect(decideConfirmTimestamp(now - 5, now)).toEqual({ ok: true });
    expect(decideConfirmTimestamp(now - PREVIEW_VALIDITY_SECONDS - 1, now)).toEqual({ ok: false, reason: 'preview_expired' });
    expect(decideConfirmTimestamp(now + 3600, now)).toEqual({ ok: false, reason: 'preview_in_future' });
  });
});

describe('Stripe call shapes — proration is Stripe\'s, never ours', () => {
  it('preview and confirm carry the SAME item/price/proration timestamp/anchor', () => {
    const preview = buildPreviewParams({
      customerId: 'cus_fake_1',
      subscriptionId: 'sub_fake_1',
      itemId: 'si_fake_1',
      targetPriceId: 'price_fake_pro_m',
      prorationTimestamp: 1_790_000_000,
      resetBillingCycle: false,
    });
    const confirm = buildImmediateChangeParams({
      itemId: 'si_fake_1',
      targetPriceId: 'price_fake_pro_m',
      targetOfferKey: 'pro_monthly_standard',
      prorationTimestamp: 1_790_000_000,
      resetBillingCycle: false,
    });
    expect(preview.subscription_details.items).toEqual(confirm.items);
    expect(preview.subscription_details.proration_date).toBe(confirm.proration_date);
    expect(preview.subscription_details.proration_behavior).toBe('always_invoice');
    expect(confirm.proration_behavior).toBe('always_invoice');
    expect(confirm.payment_behavior).toBe('error_if_incomplete');
    expect('billing_cycle_anchor' in preview.subscription_details).toBe(false);
    expect('billing_cycle_anchor' in confirm).toBe(false);
  });

  it('a cadence change resets the billing cycle in BOTH preview and confirm', () => {
    const preview = buildPreviewParams({
      customerId: 'cus_fake_1',
      subscriptionId: 'sub_fake_1',
      itemId: 'si_fake_1',
      targetPriceId: 'price_fake_pro_y',
      prorationTimestamp: 1_790_000_000,
      resetBillingCycle: true,
    });
    const confirm = buildImmediateChangeParams({
      itemId: 'si_fake_1',
      targetPriceId: 'price_fake_pro_y',
      targetOfferKey: 'pro_yearly_standard',
      prorationTimestamp: 1_790_000_000,
      resetBillingCycle: true,
    });
    expect(preview.subscription_details.billing_cycle_anchor).toBe('now');
    expect(confirm.billing_cycle_anchor).toBe('now');
  });

  it('a scheduled downgrade keeps the current price until period end, then switches — no proration', () => {
    const phases = buildScheduledChangePhases({
      currentPriceId: 'price_fake_pro_m',
      currentPhaseStartEpoch: 1_787_000_000,
      currentPeriodEndEpoch: 1_790_000_000,
      targetPriceId: 'price_fake_home_m',
      targetOfferKey: 'home_monthly_standard',
    });
    expect(phases.phases[0]).toEqual({
      items: [{ price: 'price_fake_pro_m', quantity: 1 }],
      start_date: 1_787_000_000,
      end_date: 1_790_000_000,
    });
    expect(phases.phases[1].items).toEqual([{ price: 'price_fake_home_m', quantity: 1 }]);
    expect(phases.end_behavior).toBe('release');
    expect(phases.proration_behavior).toBe('none');
  });

  it('change/schedule idempotency keys are deterministic per target + timestamp/period', () => {
    const a = buildChangeIdempotencyKey({ subscriptionId: 'sub_1', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1 });
    expect(a).toBe(buildChangeIdempotencyKey({ subscriptionId: 'sub_1', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1 }));
    expect(a).not.toBe(buildChangeIdempotencyKey({ subscriptionId: 'sub_1', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 2 }));
    const s = buildScheduleIdempotencyKey({ subscriptionId: 'sub_1', targetOfferKey: 'home_monthly_standard', currentPeriodEndEpoch: 9 });
    expect(s).toBe('manage:schedule:sub_1:home_monthly_standard:9');
  });
});

describe('Stripe object extraction', () => {
  it('reads the live subscription (Basil item periods, schedule linkage, item id)', () => {
    const live = extractLiveSubscription({
      id: 'sub_fake_1',
      customer: 'cus_fake_1',
      status: 'active',
      cancel_at_period_end: true,
      schedule: { id: 'sched_fake_1' },
      items: {
        data: [
          {
            id: 'si_fake_1',
            price: { id: 'price_fake_home_m' },
            current_period_start: 1_787_000_000,
            current_period_end: 1_790_000_000,
          },
        ],
      },
    });
    expect(live).toEqual({
      id: 'sub_fake_1',
      customerId: 'cus_fake_1',
      status: 'active',
      cancelAtPeriodEnd: true,
      itemId: 'si_fake_1',
      priceId: 'price_fake_home_m',
      currentPeriodStartEpoch: 1_787_000_000,
      currentPeriodEndEpoch: 1_790_000_000,
      scheduleId: 'sched_fake_1',
    });
    expect(toStateReply(live)).toEqual({
      stripeSubscriptionId: 'sub_fake_1',
      status: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it('summarises a Stripe invoice preview: amount due today, proration lines, next period end', () => {
    // HOME monthly (9.99) → PRO monthly (24.99) with 12 of 30 days left:
    // Stripe credits the unused HOME and charges the PRO remainder.
    const summary = summarizeInvoicePreview({
      amount_due: 600,
      currency: 'eur',
      tax: 0,
      starting_balance: 0,
      ending_balance: 0,
      lines: {
        data: [
          { amount: -400, proration: true, period: { start: 1_789_000_000, end: 1_790_000_000 } },
          { amount: 1000, proration: true, period: { start: 1_789_000_000, end: 1_790_000_000 } },
        ],
      },
    });
    expect(summary).toEqual({
      amountDueCents: 600,
      currency: 'eur',
      prorationCents: 600,
      taxCents: 0,
      appliedBalanceCents: 0,
      nextRenewalEpoch: 1_790_000_000,
    });
  });

  it('never reports a negative amount due; credit applied is read from the balance movement', () => {
    const summary = summarizeInvoicePreview({
      amount_due: 0,
      currency: 'EUR',
      starting_balance: -2000,
      ending_balance: -1400,
      lines: { data: [{ amount: 600, proration: true, period: { start: 1, end: 2 } }] },
    });
    expect(summary.amountDueCents).toBe(0);
    expect(summary.currency).toBe('eur');
    expect(summary.appliedBalanceCents).toBe(600);
  });
});

describe('Deno entrypoint — source pins', () => {
  it('authenticates from the JWT and takes identity only from server-side tables', () => {
    expect(/auth\.getUser\(\)/.test(indexSource)).toBe(true);
    expect(/\.from\('billing_customers'\)/.test(indexSource)).toBe(true);
    expect(/\.from\('customer_subscriptions'\)/.test(indexSource)).toBe(true);
    expect(/body\.(customer|subscription|price|user)/i.test(indexSource)).toBe(false);
    expect(/priceId\s*[:=]\s*body/.test(indexSource)).toBe(false);
  });

  it('reads only billing tables and never writes them directly — the cache is refreshed through the webhook writer', () => {
    const tables = [...indexSource.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(['billing_customers', 'billing_price_catalog', 'customer_subscriptions']);
    for (const write of ['.upsert(', '.insert(', '.update({', '.delete(']) {
      expect(indexSource.includes(write), write).toBe(false);
    }
    expect(/syncSubscriptionNow\(/.test(indexSource)).toBe(true);
    expect(/from '\.\.\/stripe-webhook\/dispatch\.ts'/.test(indexSource)).toBe(true);
  });

  it('cancel is cancel_at_period_end, resume clears it; never subscriptions.cancel/del, never a new subscription', () => {
    expect(/cancel_at_period_end:\s*true/.test(indexSource)).toBe(true);
    expect(/cancel_at_period_end:\s*false/.test(indexSource)).toBe(true);
    expect(/subscriptions\.(cancel|del)\(/.test(indexSource)).toBe(false);
    expect(/subscriptions\.create\(/.test(indexSource)).toBe(false);
    expect(/checkout\.sessions\.create\(/.test(indexSource)).toBe(false);
    expect(/refunds\.create\(/.test(indexSource)).toBe(false);
  });

  it('refuses monthly → yearly instead of applying a second proration algorithm', () => {
    expect(/cadence_conversion_not_available/.test(indexSource)).toBe(true);
    // the refusal happens before any Stripe call for that change
    expect(indexSource.indexOf('cadence_conversion_not_available')).toBeLessThan(
      indexSource.indexOf('invoices.createPreview'),
    );
  });

  it('the preview amount comes from Stripe (invoices.createPreview); no local price arithmetic', () => {
    expect(/invoices\.createPreview\(/.test(indexSource)).toBe(true);
    expect(/amount_cents\s*-\s*/.test(indexSource)).toBe(false);
    expect(/2499|999|19900|4900/.test(indexSource)).toBe(false);
  });

  it('downgrades go through a Subscription Schedule; cancelling the change releases it', () => {
    expect(/subscriptionSchedules\.create\(/.test(indexSource)).toBe(true);
    expect(/subscriptionSchedules\.update\(/.test(indexSource)).toBe(true);
    expect(/subscriptionSchedules\.release\(/.test(indexSource)).toBe(true);
  });

  it('every Stripe mutation carries an idempotency key', () => {
    const mutations = indexSource.match(/stripe\.(subscriptions\.update|subscriptionSchedules\.(create|update))\(/g) ?? [];
    expect(mutations.length).toBeGreaterThanOrEqual(4);
    expect((indexSource.match(/idempotencyKey/g) ?? []).length).toBeGreaterThanOrEqual(mutations.length);
  });

  it('contains no secrets; env by NAME only', () => {
    expect(/STRIPE_SECRET_KEY/.test(indexSource)).toBe(true);
    expect(/sk_(live|test)_[A-Za-z0-9]/.test(indexSource)).toBe(false);
    expect(/price_1[A-Za-z0-9]{8,}/.test(indexSource)).toBe(false);
  });

  it('the logic module stays pure (no imports, no Deno, no IO)', () => {
    expect(/^\s*import\s/m.test(logicSource)).toBe(false);
    expect(logicSource.includes('Deno.')).toBe(false);
    expect(logicSource.includes('fetch(')).toBe(false);
  });
});
