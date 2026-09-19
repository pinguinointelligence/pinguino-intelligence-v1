/**
 * Billing service (Phase 2B.1) — reads the current user's subscription only.
 *
 * READ-ONLY by design: there is no insert/update/delete here, and RLS grants no
 * write to the frontend, so a user can never promote themselves to Pro. The
 * Stripe Checkout / Portal / webhook writers are server-side Edge Functions
 * (2B.2 / 2B.3) — never the browser.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import type { Subscription } from '@/access/subscription';

const COLUMNS =
  'stripe_subscription_id, stripe_customer_id, stripe_price_id, subscription_status, current_period_end, cancel_at_period_end';

/**
 * The catalog-aware subscription cache row (migration 0015 + scheduled change
 * columns) — what Account → Plan i rozliczenia renders. Written ONLY by the
 * stripe-webhook subscription sync; every date here is Stripe's, never
 * computed in the browser.
 */
export interface CustomerSubscriptionRow {
  stripe_subscription_id: string;
  offer_key: string;
  product: string;
  cadence: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  cancelled_at: string | null;
  scheduled_offer_key: string | null;
  scheduled_change_at: string | null;
}

const CUSTOMER_SUBSCRIPTION_COLUMNS =
  'stripe_subscription_id, offer_key, product, cadence, status, current_period_start, current_period_end, cancel_at_period_end, ended_at, cancelled_at, scheduled_offer_key, scheduled_change_at';

/**
 * ALL of the current user's customer_subscriptions rows (RLS: own rows only).
 * The pure `deriveBillingPlanState` picks the live one (or the last expired
 * one) — history rows are needed to say "Twój plan HOME wygasł 19.10.2026".
 */
export async function getMyCustomerSubscriptions(): Promise<CustomerSubscriptionRow[]> {
  if (!supabase) return emptyUnconfiguredRead('billing.getMyCustomerSubscriptions', []);
  const { data, error } = await supabase
    .from('customer_subscriptions')
    .select(CUSTOMER_SUBSCRIPTION_COLUMNS)
    .order('current_period_end', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CustomerSubscriptionRow[]).filter(
    (row) => typeof row.stripe_subscription_id === 'string' && typeof row.status === 'string',
  );
}

/** The current user's most relevant subscription row (RLS scopes it to them). */
export async function getMySubscription(): Promise<Subscription | null> {
  if (!supabase) return emptyUnconfiguredRead('billing.getMySubscription', null);
  const { data, error } = await supabase
    .from('subscriptions')
    .select(COLUMNS)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Subscription | null) ?? null;
}
