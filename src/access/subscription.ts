/**
 * Subscription → plan mapping (Phase 2B.1) — PURE, no IO, no vendor SDK.
 *
 * The frontend reads its own subscription row (read-own RLS) and derives whether
 * the user is Pro. `past_due` keeps Pro access until `current_period_end` (grace);
 * canceled / incomplete / unpaid / none → free. Status is kept as a string so a
 * future billing status never breaks an old saved row.
 *
 * Billing-platform evolution (catalog-aware, backward compatible):
 * `planFromSubscription` keeps its exact paid semantics — every existing
 * consumer is untouched. The NEW `productFromSubscription` /
 * `resolveSubscriptionAccess` layer maps the row's `stripe_price_id` to
 * 'home' | 'pro' via the typed price catalog's env mapping so entitlement
 * code can finally distinguish Home vs Pro.
 *
 * Fail-safe fallback (documented, price-id-agnostic): a subscription with a
 * paid status but an UNKNOWN/unconfigured price id resolves to
 * `{ paid: true, product: null }` — access is never revoked by a mapping
 * gap; callers log the null product upstream and treat it as the legacy
 * price-id-agnostic paid tier.
 */
import {
  productForPriceId,
  type BillingProduct,
  type ConfiguredPriceIds,
} from '@/billing/catalog/priceCatalog';

export type { BillingProduct, ConfiguredPriceIds };

/** The subscription statuses we recognise (others fall through to free). */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

/** The subscription row shape the frontend reads (subset of the DB columns). */
export interface Subscription {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string | null;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export type SubscriptionPlan = 'pro' | 'free';

/** Derive the plan from a subscription row. Pure + time-injectable for tests. */
export function planFromSubscription(
  subscription: Subscription | null,
  now: Date = new Date(),
): SubscriptionPlan {
  if (!subscription) return 'free';
  const status = subscription.subscription_status;
  if (status === 'active' || status === 'trialing') return 'pro';
  if (status === 'past_due') {
    const end = subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null;
    return end && end.getTime() > now.getTime() ? 'pro' : 'free';
  }
  return 'free';
}

/**
 * Map a subscription row's price id to its billing product via the catalog
 * env mapping. Pure: `configuredPriceIds` is the env-resolved
 * envVarName → vendor price id map (values are opaque here).
 * Unknown/missing price → null (never guess a product).
 */
export function productFromSubscription(
  subscription: Subscription | null,
  configuredPriceIds: ConfiguredPriceIds,
): BillingProduct | null {
  if (!subscription || !subscription.stripe_price_id) return null;
  return productForPriceId(subscription.stripe_price_id, configuredPriceIds);
}

/** Paid flag + which product the paid access is for (null = unmapped price). */
export interface SubscriptionAccess {
  paid: boolean;
  product: BillingProduct | null;
}

/**
 * Combined resolution for entitlement code: `paid` uses the EXACT
 * `planFromSubscription` semantics (active|trialing → paid; past_due grace);
 * `product` is only reported for a paid subscription — a free/lapsed row
 * always resolves `{ paid: false, product: null }` so no consumer can grant
 * a product on an unpaid subscription.
 *
 * Fail-safe: paid status + unknown price id → `{ paid: true, product: null }`
 * (the documented price-id-agnostic fallback; log upstream, never revoke).
 */
export function resolveSubscriptionAccess(
  subscription: Subscription | null,
  configuredPriceIds: ConfiguredPriceIds,
  now: Date = new Date(),
): SubscriptionAccess {
  const paid = planFromSubscription(subscription, now) === 'pro';
  if (!paid) return { paid: false, product: null };
  return { paid: true, product: productFromSubscription(subscription, configuredPriceIds) };
}
