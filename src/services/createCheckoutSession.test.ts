/// <reference types="node" />
/**
 * create-checkout-session — pure logic tests + LOCKSTEP with the app price
 * catalog + Deno source scans (client can never pick a price id, allowlisted
 * redirects, closed metadata, deterministic idempotency keys).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planFromSubscription, type Subscription } from '@/access/subscription';
import { PRICE_CATALOG } from '@/billing/catalog/priceCatalog';
import {
  buildAttributionResolutionInput,
  buildCheckoutIdempotencyKey,
  buildCheckoutMetadata,
  hasConflictingActiveSubscription,
  PURCHASABLE_OFFERS,
  resolvePurchasableOffer,
} from '../../supabase/functions/create-checkout-session/logic.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'create-checkout-session');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const logicSource = readFileSync(join(fnDir, 'logic.ts'), 'utf8');

const flagsOff = { launchEnabled: false, foundingEnabled: false };
const flagsOn = { launchEnabled: true, foundingEnabled: true };

describe('offer table — LOCKSTEP with src/billing/catalog/priceCatalog.ts', () => {
  it('carries exactly the 7 direct-checkout offers (all non-15m catalog offers)', () => {
    const direct = PRICE_CATALOG.filter((o) => o.cadence !== 'initial_15_month');
    expect(PURCHASABLE_OFFERS).toHaveLength(direct.length);
    expect(PURCHASABLE_OFFERS).toHaveLength(7);
    for (const offer of direct) {
      const mirrored = PURCHASABLE_OFFERS.find((p) => p.offerKey === offer.offerKey);
      expect(mirrored, offer.offerKey).toBeDefined();
      expect(mirrored!.envVarName, offer.offerKey).toBe(offer.envVarName);
      expect(mirrored!.requiredServerFlag, offer.offerKey).toBe(offer.requiredServerFlag);
    }
  });

  it('NO 15-month offer is purchasable directly, ever', () => {
    for (const offer of PRICE_CATALOG.filter((o) => o.cadence === 'initial_15_month')) {
      expect(
        PURCHASABLE_OFFERS.some((p) => p.offerKey === offer.offerKey),
        offer.offerKey,
      ).toBe(false);
      expect(resolvePurchasableOffer(offer.offerKey, flagsOn)).toEqual({
        ok: false,
        reason: 'unknown_or_unpurchasable_offer',
      });
    }
  });
});

describe('offer eligibility — server-selected price, flags enforced', () => {
  it('standard offers resolve with flags off, to the env var NAME (never a price id)', () => {
    const result = resolvePurchasableOffer('home_monthly_standard', flagsOff);
    expect(result).toEqual({
      ok: true,
      offerKey: 'home_monthly_standard',
      envVarName: 'STRIPE_PRICE_HOME_MONTHLY_STANDARD',
    });
  });

  it('launch/founding offers refuse without their server flag and resolve with it', () => {
    expect(resolvePurchasableOffer('home_yearly_launch', flagsOff)).toEqual({
      ok: false,
      reason: 'launch_not_enabled',
    });
    expect(resolvePurchasableOffer('home_yearly_launch', { ...flagsOff, launchEnabled: true }).ok).toBe(true);

    expect(resolvePurchasableOffer('pro_monthly_founding', flagsOff)).toEqual({
      ok: false,
      reason: 'founding_not_enabled',
    });
    expect(resolvePurchasableOffer('pro_yearly_founding', flagsOff)).toEqual({
      ok: false,
      reason: 'founding_not_enabled',
    });
    expect(resolvePurchasableOffer('pro_yearly_founding', { ...flagsOff, foundingEnabled: true }).ok).toBe(true);
  });

  it('garbage, empty and null offer keys are refused identically to 15m keys', () => {
    for (const raw of ['nonsense', '', null, undefined, 'price_fake_injection']) {
      expect(resolvePurchasableOffer(raw, flagsOn)).toEqual({
        ok: false,
        reason: 'unknown_or_unpurchasable_offer',
      });
    }
  });
});

describe('conflicting-subscription refusal — LOCKSTEP with planFromSubscription', () => {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const asAppRow = (status: string, end: string | null): Subscription => ({
    stripe_subscription_id: 'sub_fake',
    stripe_customer_id: 'cus_fake',
    stripe_price_id: null,
    subscription_status: status,
    current_period_end: end,
    cancel_at_period_end: false,
  });

  it('conflicts exactly when the app would consider the row paid', () => {
    const cases: Array<[string, string | null]> = [
      ['active', null],
      ['trialing', null],
      ['past_due', future],
      ['past_due', past],
      ['past_due', null],
      ['canceled', null],
      ['unpaid', null],
      ['incomplete', null],
      ['some_future_status', null],
    ];
    for (const [status, end] of cases) {
      const expected = planFromSubscription(asAppRow(status, end)) === 'pro';
      expect(
        hasConflictingActiveSubscription(
          [{ subscription_status: status, current_period_end: end }],
          new Date(),
        ),
        `${status}/${end ?? 'null'}`,
      ).toBe(expected);
    }
  });

  it('any single conflicting row among many refuses; none → proceed', () => {
    expect(
      hasConflictingActiveSubscription(
        [
          { subscription_status: 'canceled', current_period_end: null },
          { subscription_status: 'active', current_period_end: null },
        ],
        new Date(),
      ),
    ).toBe(true);
    expect(hasConflictingActiveSubscription([], new Date())).toBe(false);
  });
});

describe('attribution input, metadata and idempotency', () => {
  it('normalizes attribution inputs (trim, empty → null)', () => {
    expect(
      buildAttributionResolutionInput({
        userId: 'user-1',
        explicitCode: '  CODE1 ',
        cookieAttributionId: '',
      }),
    ).toEqual({ userId: 'user-1', explicitCode: 'CODE1', cookieAttributionId: null });
    expect(buildAttributionResolutionInput({ userId: 'user-1' })).toEqual({
      userId: 'user-1',
      explicitCode: null,
      cookieAttributionId: null,
    });
  });

  it('metadata is the CLOSED correlation payload — exactly three keys, all strings', () => {
    const metadata = buildCheckoutMetadata({
      userId: 'user-1',
      offerKey: 'home_yearly_standard',
      attributionId: 'attr-1',
    });
    expect(metadata).toEqual({
      pi_user_id: 'user-1',
      pi_offer_key: 'home_yearly_standard',
      pi_attribution_id: 'attr-1',
    });
    expect(Object.keys(metadata)).toHaveLength(3);
    expect(
      buildCheckoutMetadata({ userId: 'u', offerKey: 'o', attributionId: null }).pi_attribution_id,
    ).toBe('');
  });

  it('idempotency keys are deterministic and distinct per (user, offer, attribution)', () => {
    const a = buildCheckoutIdempotencyKey({ userId: 'u1', offerKey: 'o1', attributionId: 'a1' });
    expect(a).toBe(buildCheckoutIdempotencyKey({ userId: 'u1', offerKey: 'o1', attributionId: 'a1' }));
    expect(a).not.toBe(buildCheckoutIdempotencyKey({ userId: 'u2', offerKey: 'o1', attributionId: 'a1' }));
    expect(a).not.toBe(buildCheckoutIdempotencyKey({ userId: 'u1', offerKey: 'o2', attributionId: 'a1' }));
    expect(a).not.toBe(buildCheckoutIdempotencyKey({ userId: 'u1', offerKey: 'o1', attributionId: null }));
  });
});

describe('Deno entrypoint — source pins', () => {
  it('is labelled NOT DEPLOYED and authenticates via the JWT, never the body', () => {
    expect(/NOT DEPLOYED/.test(indexSource)).toBe(true);
    expect(/auth\.getUser\(\)/.test(indexSource)).toBe(true);
    expect(/client_reference_id: userId/.test(indexSource)).toBe(true);
  });

  it('resolves the price id ONLY from env via the offer table (client never submits one)', () => {
    expect(/Deno\.env\.get\(offer\.envVarName\)/.test(indexSource)).toBe(true);
    expect(/body\.priceId|body\.price_id|body\.price\b/.test(indexSource)).toBe(false);
  });

  it('validates redirect URLs against the env allowlist and refuses conflicts before Stripe', () => {
    expect(/BILLING_REDIRECT_URL_ALLOWLIST/.test(indexSource)).toBe(true);
    expect(/redirect_url_not_allowed/.test(indexSource)).toBe(true);
    expect(/conflicting_active_subscription/.test(indexSource)).toBe(true);
    expect(indexSource.indexOf('conflicting_active_subscription')).toBeLessThan(
      indexSource.indexOf('stripe.checkout.sessions.create'),
    );
  });

  it('passes the deterministic idempotency key to the Stripe call', () => {
    expect(/idempotencyKey: buildCheckoutIdempotencyKey/.test(indexSource)).toBe(true);
  });

  it('contains no secrets and no real-looking Stripe ids', () => {
    for (const source of [indexSource, logicSource]) {
      expect(/sk_(live|test)_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/whsec_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/price_(?!fake)[A-Za-z0-9]{8,}/.test(source)).toBe(false);
    }
  });

  it('the logic module stays pure (no imports, no Deno, no IO)', () => {
    expect(/^\s*import\s/m.test(logicSource)).toBe(false);
    expect(logicSource.includes('Deno.')).toBe(false);
    expect(logicSource.includes('createClient')).toBe(false);
  });
});
