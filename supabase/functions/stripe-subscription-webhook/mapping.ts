/**
 * stripe-subscription-webhook — PURE mapping/decision logic (no IO, no Deno
 * APIs, no SDK). Kept separate from index.ts so the repo's vitest suite can
 * unit-test the exact routing, status mapping, price-allowlist gating and the
 * CLOSED upsert payload without a Deno runtime.
 *
 * The tier consumer is `planFromSubscription` (src/access/subscription.ts):
 * active | trialing → Pro; past_due → Pro until current_period_end; anything
 * else → free. This module therefore only has to store Stripe's status
 * vocabulary faithfully — an unknown status passes through verbatim and
 * fail-safes to free downstream.
 */

/** Events that carry the full subscription object → upsert path. */
export const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

/** Event that links a checkout to a user → billing_customers mapping path. */
export const CUSTOMER_MAPPING_EVENTS = ['checkout.session.completed'] as const;

/**
 * Observed but deliberately no-op in v1: Stripe ALWAYS follows payment
 * transitions with a customer.subscription.updated carrying the new status,
 * which is our single source of truth per subscription object.
 */
export const OBSERVED_NOOP_EVENTS = ['invoice.payment_succeeded', 'invoice.payment_failed'] as const;

export type EventRoute =
  | 'subscription_upsert'
  | 'customer_mapping'
  | 'acknowledge_noop'
  | 'acknowledge_unsupported';

export function routeEvent(eventType: string): EventRoute {
  if ((SUBSCRIPTION_EVENTS as readonly string[]).includes(eventType)) return 'subscription_upsert';
  if ((CUSTOMER_MAPPING_EVENTS as readonly string[]).includes(eventType)) return 'customer_mapping';
  if ((OBSERVED_NOOP_EVENTS as readonly string[]).includes(eventType)) return 'acknowledge_noop';
  return 'acknowledge_unsupported';
}

/** The Stripe statuses `planFromSubscription` recognises (lockstep-tested). */
export const KNOWN_STRIPE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
] as const;

/**
 * Stripe status → internal subscription_status. Explicit, no pass-through of
 * anything surprising for the deleted event: a deleted subscription is
 * `canceled` no matter what status the payload carried. Unknown statuses are
 * stored verbatim — `planFromSubscription` treats them as free (fail-safe).
 */
export function mapStripeStatus(eventType: string, stripeStatus: string): string {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  return stripeStatus;
}

/**
 * Parse the Pro price-id allowlist env (comma-separated). EMPTY config means
 * NO upserts happen at all — the writer refuses to grant tier on unconfigured
 * mapping rather than trusting whatever price arrives.
 */
export function parsePriceAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type SubscriptionAction =
  | 'upsert'
  | 'ignore_no_allowlist_configured'
  | 'ignore_unlisted_price'
  | 'retry_unmapped_customer';

/**
 * Decide what to do with a subscription event. Order matters and is pinned by
 * tests: an unconfigured/foreign price is IGNORED (200 — Stripe must not
 * retry it forever), while a missing user mapping is RETRYABLE (non-2xx — the
 * checkout.session.completed race resolves and Stripe redelivers).
 */
export function decideSubscriptionAction(input: {
  priceId: string | null;
  allowlist: readonly string[];
  userId: string | null;
}): SubscriptionAction {
  if (input.allowlist.length === 0) return 'ignore_no_allowlist_configured';
  if (!input.priceId || !input.allowlist.includes(input.priceId)) return 'ignore_unlisted_price';
  if (!input.userId) return 'retry_unmapped_customer';
  return 'upsert';
}

/** Stripe epoch seconds → ISO timestamp (or null). */
export function epochToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/** The CLOSED upsert payload — exactly the 0003 columns the writer owns. */
export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** Pinned by tests against the 0003 schema — no unknown key can ride along. */
export const SUBSCRIPTION_ROW_KEYS: readonly (keyof SubscriptionRow)[] = [
  'user_id',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_price_id',
  'subscription_status',
  'current_period_end',
  'cancel_at_period_end',
];

/**
 * Build the closed upsert row — field-by-field on purpose (no spread of the
 * Stripe object), deterministic, so a redelivered event produces a
 * byte-identical row (idempotent together with the ON CONFLICT
 * stripe_subscription_id unique key from migration 0003).
 */
export function buildSubscriptionRow(input: {
  userId: string;
  eventType: string;
  subscription: {
    id: string;
    customer: string;
    status: string;
    priceId: string | null;
    currentPeriodEndEpoch: number | null;
    cancelAtPeriodEnd: boolean;
  };
}): SubscriptionRow {
  return {
    user_id: input.userId,
    stripe_customer_id: input.subscription.customer,
    stripe_subscription_id: input.subscription.id,
    stripe_price_id: input.subscription.priceId,
    subscription_status: mapStripeStatus(input.eventType, input.subscription.status),
    current_period_end: epochToIso(input.subscription.currentPeriodEndEpoch),
    cancel_at_period_end: input.subscription.cancelAtPeriodEnd,
  };
}
