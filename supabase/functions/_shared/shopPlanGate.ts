/**
 * THE shop order gate (owner, 2026-09-18): PUBLIC VIEW for everyone, ORDER only with an active HOME or PRO plan.
 *
 * It asks the existing Billing authority `gellatti_has_paid_access_v1`, the same function the database asks before
 * inserting a DIGITAL_DOCUMENT order (`shop_document_place_order`). The shop therefore never grows its own idea of a
 * subscription: no plan name, no Stripe price id, no e-mail, no test role, no shop-owned customer list. When the
 * central HOME/PRO rule changes, every shop order path follows.
 *
 * Fail closed: an authority that cannot be asked is not a yes.
 *
 * PURE — no IO of its own, no Deno APIs — so the app suite can test it directly.
 */

/** The machine code every shop order path answers when the account has no active HOME or PRO plan. */
export const PLAN_REQUIRED = 'plan_required';
/** The authority could not be asked; nothing is created. */
export const PLAN_CHECK_FAILED = 'plan_check_failed';

/** The one call this gate makes, typed structurally (the service-role client satisfies it). */
export interface PlanAuthority {
  rpc: (
    fn: 'gellatti_has_paid_access_v1',
    args: { p_user_id: string },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

export type ShopOrderPlanDecision =
  | { allowed: true }
  | { allowed: false; status: 403; error: typeof PLAN_REQUIRED }
  | { allowed: false; status: 503; error: typeof PLAN_CHECK_FAILED };

export async function decideShopOrderPlan(
  authority: PlanAuthority,
  userId: string,
): Promise<ShopOrderPlanDecision> {
  const { data, error } = await authority.rpc('gellatti_has_paid_access_v1', {
    p_user_id: userId,
  });
  if (error) return { allowed: false, status: 503, error: PLAN_CHECK_FAILED };
  return data === true ? { allowed: true } : { allowed: false, status: 403, error: PLAN_REQUIRED };
}
