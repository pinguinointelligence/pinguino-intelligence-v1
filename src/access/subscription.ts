/**
 * Subscription → plan mapping (Phase 2B.1) — PURE, no IO, no vendor SDK.
 *
 * The frontend reads its own subscription row (read-own RLS) and derives whether
 * the user is Pro. `past_due` keeps Pro access until `current_period_end` (grace);
 * canceled / incomplete / unpaid / none → free. Status is kept as a string so a
 * future billing status never breaks an old saved row.
 */

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
