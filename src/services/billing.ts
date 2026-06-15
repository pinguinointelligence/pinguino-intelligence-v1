/**
 * Billing service (Phase 2B.1) — reads the current user's subscription only.
 *
 * READ-ONLY by design: there is no insert/update/delete here, and RLS grants no
 * write to the frontend, so a user can never promote themselves to Pro. The
 * Stripe Checkout / Portal / webhook writers are server-side Edge Functions
 * (2B.2 / 2B.3) — never the browser.
 */
import { supabase } from '@/lib/supabase/client';
import type { Subscription } from '@/access/subscription';

const COLUMNS =
  'stripe_subscription_id, stripe_customer_id, stripe_price_id, subscription_status, current_period_end, cancel_at_period_end';

/** The current user's most relevant subscription row (RLS scopes it to them). */
export async function getMySubscription(): Promise<Subscription | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .select(COLUMNS)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Subscription | null) ?? null;
}
