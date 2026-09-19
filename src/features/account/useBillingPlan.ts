/**
 * Account → Plan i rozliczenia — the data hook (no UI, no copy).
 *
 * Reads the user's OWN `customer_subscriptions` rows (RLS-scoped) and derives
 * the panel state with the pure `deriveBillingPlanState`. Nothing is cached in
 * localStorage and no date is computed here: after a refresh, a re-login or on
 * another device the same rows produce the same state, because the state IS
 * the billing authority's rows.
 *
 * `refreshBillingPlan` is what a management action calls when it returns: the
 * Edge Function has already re-synced the cache through the webhook writer, so
 * an invalidation shows the new state immediately instead of waiting for the
 * webhook delivery.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { deriveBillingPlanState, type BillingPlanState } from '@/billing/account/planPanelState';
import { getMyCustomerSubscriptions } from '@/services/billing';
import { useAuthStore } from '@/stores/authStore';

/** The one query key for the account plan panel (invalidate after any mutation). */
export const BILLING_PLAN_QUERY_KEY = ['billing', 'plan'] as const;

export interface BillingPlanQuery {
  state: BillingPlanState | null;
  isLoading: boolean;
  /** True when the read failed — the panel must say so, never render "no plan". */
  isError: boolean;
  refetch: () => Promise<unknown>;
}

export function useBillingPlan(): BillingPlanQuery {
  const isSignedIn = useAuthStore((state) => state.status === 'authed');
  const query = useQuery({
    queryKey: BILLING_PLAN_QUERY_KEY,
    queryFn: getMyCustomerSubscriptions,
    enabled: isSignedIn,
    staleTime: 30_000,
  });
  return {
    // A failed read is NOT "no plan": leave the state null and let the panel
    // show an error, so a network blip never tells a paying customer they have
    // nothing.
    state: query.data ? deriveBillingPlanState(query.data) : null,
    isLoading: isSignedIn && query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Invalidate the plan panel (after cancel / resume / plan change / renewal return). */
export async function refreshBillingPlan(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: BILLING_PLAN_QUERY_KEY });
}

/** Hook form of `refreshBillingPlan` for components. */
export function useRefreshBillingPlan(): () => Promise<void> {
  const client = useQueryClient();
  return () => refreshBillingPlan(client);
}
