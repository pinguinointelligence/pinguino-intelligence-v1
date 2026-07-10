/// <reference types="node" />
/**
 * Stripe subscription webhook writer (2B.3) — NON-deployed source guards.
 *
 * The pure mapping module is unit-tested directly (vitest imports it — no
 * Deno runtime needed) and LOCKSTEPPED with the app's real
 * `planFromSubscription`, so the rows the webhook would write provably grant
 * or deny Pro exactly as the tier policy (migration 0013) expects. The Deno
 * entrypoint is pinned at source level: signature-verified before any DB
 * touch, closed writes to exactly two billing tables, no secrets.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planFromSubscription, type Subscription } from '@/access/subscription';
import {
  buildSubscriptionRow,
  decideSubscriptionAction,
  epochToIso,
  KNOWN_STRIPE_STATUSES,
  mapStripeStatus,
  parsePriceAllowlist,
  routeEvent,
  SUBSCRIPTION_ROW_KEYS,
} from '../../supabase/functions/stripe-subscription-webhook/mapping.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'stripe-subscription-webhook');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const mappingSource = readFileSync(join(fnDir, 'mapping.ts'), 'utf8');
const migration0003 = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0003_billing_subscriptions.sql'),
  'utf8',
);
const webhookPlan = readFileSync(
  join(ROOT, 'docs', 'spine', 'STRIPE_SUBSCRIPTION_WEBHOOK_PLAN.md'),
  'utf8',
);

/** A webhook-built row viewed through the app's real plan derivation. */
const planOf = (row: ReturnType<typeof buildSubscriptionRow>, now?: Date) =>
  planFromSubscription(row as unknown as Subscription, now);

const sub = (over: Partial<Parameters<typeof buildSubscriptionRow>[0]['subscription']> = {}) =>
  buildSubscriptionRow({
    userId: 'user-1',
    eventType: over.status === 'deleted-event' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
    subscription: {
      id: 'sub_fake_1',
      customer: 'cus_fake_1',
      status: 'active',
      priceId: 'price_fake_pro',
      currentPeriodEndEpoch: 2_000_000_000,
      cancelAtPeriodEnd: false,
      ...over,
    },
  });

describe('event routing — supported, no-op and unsupported events', () => {
  it('subscription lifecycle events route to the upsert path', () => {
    expect(routeEvent('customer.subscription.created')).toBe('subscription_upsert');
    expect(routeEvent('customer.subscription.updated')).toBe('subscription_upsert');
    expect(routeEvent('customer.subscription.deleted')).toBe('subscription_upsert');
  });

  it('checkout completion routes to the customer-mapping path', () => {
    expect(routeEvent('checkout.session.completed')).toBe('customer_mapping');
  });

  it('invoice payment events are observed no-ops (subscription.updated is the source of truth)', () => {
    expect(routeEvent('invoice.payment_succeeded')).toBe('acknowledge_noop');
    expect(routeEvent('invoice.payment_failed')).toBe('acknowledge_noop');
  });

  it('anything else is acknowledged as unsupported — never a crash, never a write', () => {
    expect(routeEvent('customer.created')).toBe('acknowledge_unsupported');
    expect(routeEvent('payment_intent.succeeded')).toBe('acknowledge_unsupported');
    expect(routeEvent('')).toBe('acknowledge_unsupported');
  });
});

describe('status mapping — lockstep with the app planFromSubscription', () => {
  it('active maps to a row the app derives as Pro', () => {
    expect(planOf(sub({ status: 'active' }))).toBe('pro');
  });

  it('trialing maps to Pro', () => {
    expect(planOf(sub({ status: 'trialing' }))).toBe('pro');
  });

  it('past_due keeps Pro ONLY until current_period_end (grace)', () => {
    const row = sub({ status: 'past_due', currentPeriodEndEpoch: 2_000_000_000 });
    expect(planOf(row, new Date(1_999_999_000 * 1000))).toBe('pro');
    expect(planOf(row, new Date(2_000_000_001 * 1000))).toBe('free');
  });

  it('a deleted event forces canceled regardless of the payload status → free', () => {
    expect(mapStripeStatus('customer.subscription.deleted', 'active')).toBe('canceled');
    const row = buildSubscriptionRow({
      userId: 'user-1',
      eventType: 'customer.subscription.deleted',
      subscription: {
        id: 'sub_fake_1',
        customer: 'cus_fake_1',
        status: 'active',
        priceId: 'price_fake_pro',
        currentPeriodEndEpoch: 2_000_000_000,
        cancelAtPeriodEnd: true,
      },
    });
    expect(row.subscription_status).toBe('canceled');
    expect(planOf(row)).toBe('free');
  });

  it('canceled/unpaid/unknown statuses all derive free (fail-safe)', () => {
    expect(planOf(sub({ status: 'canceled' }))).toBe('free');
    expect(planOf(sub({ status: 'unpaid' }))).toBe('free');
    expect(planOf(sub({ status: 'some_future_status' }))).toBe('free');
  });

  it('the known status vocabulary stays in lockstep with SubscriptionStatus', () => {
    const subscriptionSource = readFileSync(join(ROOT, 'src', 'access', 'subscription.ts'), 'utf8');
    for (const status of KNOWN_STRIPE_STATUSES) {
      expect(subscriptionSource.includes(`'${status}'`), status).toBe(true);
    }
  });
});

describe('price allowlist — arbitrary prices can never grant tier', () => {
  it('parses the comma-separated env shape (fake ids only in tests)', () => {
    expect(parsePriceAllowlist('price_fake_a, price_fake_b')).toEqual(['price_fake_a', 'price_fake_b']);
    expect(parsePriceAllowlist('')).toEqual([]);
    expect(parsePriceAllowlist(undefined)).toEqual([]);
    expect(parsePriceAllowlist(null)).toEqual([]);
  });

  it('EMPTY allowlist config → no upsert ever (refuses to grant on unconfigured mapping)', () => {
    expect(
      decideSubscriptionAction({ priceId: 'price_fake_pro', allowlist: [], userId: 'user-1' }),
    ).toBe('ignore_no_allowlist_configured');
  });

  it('an unlisted/foreign price is ignored (200, no retry loop, no tier)', () => {
    expect(
      decideSubscriptionAction({
        priceId: 'price_fake_other_product',
        allowlist: ['price_fake_pro'],
        userId: 'user-1',
      }),
    ).toBe('ignore_unlisted_price');
    expect(
      decideSubscriptionAction({ priceId: null, allowlist: ['price_fake_pro'], userId: 'user-1' }),
    ).toBe('ignore_unlisted_price');
  });

  it('a listed price with a missing user mapping is RETRYABLE (checkout race self-heals)', () => {
    expect(
      decideSubscriptionAction({ priceId: 'price_fake_pro', allowlist: ['price_fake_pro'], userId: null }),
    ).toBe('retry_unmapped_customer');
  });

  it('listed price + mapped user → upsert', () => {
    expect(
      decideSubscriptionAction({
        priceId: 'price_fake_pro',
        allowlist: ['price_fake_pro'],
        userId: 'user-1',
      }),
    ).toBe('upsert');
  });
});

describe('closed upsert payload — deterministic and schema-exact', () => {
  it('is idempotent: the same event builds a byte-identical row', () => {
    expect(JSON.stringify(sub())).toBe(JSON.stringify(sub()));
  });

  it('carries exactly the closed key set', () => {
    expect(Object.keys(sub()).sort()).toEqual([...SUBSCRIPTION_ROW_KEYS].sort());
  });

  it('every row key is a real 0003 subscriptions column (and never a DB-managed one)', () => {
    for (const key of SUBSCRIPTION_ROW_KEYS) {
      expect(new RegExp(`^\\s*${key}\\s`, 'm').test(migration0003), key).toBe(true);
    }
    expect(SUBSCRIPTION_ROW_KEYS).not.toContain('id');
    expect(SUBSCRIPTION_ROW_KEYS).not.toContain('created_at');
    expect(SUBSCRIPTION_ROW_KEYS).not.toContain('updated_at');
  });

  it('epoch conversion is exact and null-safe', () => {
    expect(epochToIso(2_000_000_000)).toBe('2033-05-18T03:33:20.000Z');
    expect(epochToIso(null)).toBeNull();
    expect(epochToIso(undefined)).toBeNull();
    expect(epochToIso(Number.NaN)).toBeNull();
  });

  it('idempotency is anchored on the 0003 unique stripe_subscription_id + onConflict upsert', () => {
    expect(/stripe_subscription_id text not null unique/.test(migration0003)).toBe(true);
    expect(/onConflict: 'stripe_subscription_id'/.test(indexSource)).toBe(true);
    expect(/onConflict: 'user_id'/.test(indexSource)).toBe(true); // billing_customers pk
  });
});

describe('Deno entrypoint — signature-first, closed writes, no secrets', () => {
  it('verifies the Stripe signature over the RAW body BEFORE any DB access', () => {
    expect(/constructEventAsync/.test(indexSource)).toBe(true);
    expect(/req\.text\(\)/.test(indexSource)).toBe(true);
    expect(/missing_signature/.test(indexSource)).toBe(true);
    expect(/invalid_signature/.test(indexSource)).toBe(true);
    expect(indexSource.indexOf('constructEventAsync')).toBeLessThan(indexSource.indexOf(".from('"));
  });

  it('acknowledges unsupported/no-op routes with 200 and returns before creating the DB client', () => {
    const ackIndex = indexSource.indexOf("route === 'acknowledge_unsupported'");
    // the CODE occurrence (Deno.env.get), not the header-comment mention
    const adminIndex = indexSource.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(ackIndex).toBeGreaterThan(-1);
    expect(adminIndex).toBeGreaterThan(-1);
    expect(ackIndex).toBeLessThan(adminIndex);
  });

  it('writes touch exactly billing_customers and subscriptions — nothing else', () => {
    const tables = [...indexSource.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]).sort();
    expect([...new Set(tables)]).toEqual(['billing_customers', 'subscriptions']);
    const code = indexSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(
      /accepted_corrections|mapper_basement|pi_calculated|pac_value|pod_value|saved_recipes|inventory/.test(
        code,
      ),
    ).toBe(false);
    expect(/\.from\('products'\)/.test(code)).toBe(false);
    // the upsert argument is the closed builder result / explicit literal — no
    // spread of Stripe objects into the DB
    expect(/upsert\(\s*\{[^}]*\.\.\./.test(indexSource.replace(/\s+/g, ' '))).toBe(false);
    expect(/upsert\(row,/.test(indexSource)).toBe(true);
  });

  it('never deletes or updates rows and never writes from the mapping module', () => {
    expect(indexSource.includes('.delete(')).toBe(false);
    expect(indexSource.includes('.update(')).toBe(false);
    expect(mappingSource.includes('.from(')).toBe(false);
    expect(mappingSource.includes('createClient')).toBe(false);
  });

  it('contains no secret VALUES — env names only, and no live-looking ids anywhere', () => {
    for (const source of [indexSource, mappingSource]) {
      expect(/whsec_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/sk_(live|test)_[A-Za-z0-9]/.test(source)).toBe(false);
      expect(/price_(?!fake)[A-Za-z0-9]{8,}/.test(source)).toBe(false);
      expect(/pk_(live|test)_[A-Za-z0-9]/.test(source)).toBe(false);
    }
    expect(/Deno\.env\.get\('STRIPE_WEBHOOK_SIGNING_SECRET'\)/.test(indexSource)).toBe(true);
    expect(/Deno\.env\.get\('STRIPE_PRO_PRICE_IDS'\)/.test(indexSource)).toBe(true);
  });

  it('is labelled NOT DEPLOYED and the plan doc keeps the freshness caveat honest', () => {
    expect(/NOT DEPLOYED/.test(indexSource)).toBe(true);
    expect(/NOT deployed/i.test(webhookPlan)).toBe(true);
    expect(/freshness[\s\S]{0,60}manual|manual[\s\S]{0,60}freshness/i.test(webhookPlan)).toBe(true);
  });
});
