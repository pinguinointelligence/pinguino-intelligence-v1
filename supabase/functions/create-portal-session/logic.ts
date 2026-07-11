/**
 * create-portal-session — PURE decision logic (no IO, no Deno APIs, no SDK).
 *
 * Rule: a Customer Portal session requires the AUTHENTICATED user to already
 * have a Stripe customer mapping (billing_customers). No mapping → refuse;
 * the portal is never a place to create identity. The return URL must pass
 * the shared origin allowlist (../_shared/urlAllowlist.ts).
 */

export interface BillingCustomerRow {
  stripe_customer_id: string;
}

export type PortalEligibility =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'no_billing_customer' };

/** Auth'd user → customer id requirement (the only portal precondition). */
export function decidePortalEligibility(
  billingCustomer: BillingCustomerRow | null | undefined,
): PortalEligibility {
  const customerId = billingCustomer?.stripe_customer_id?.trim() ?? '';
  if (customerId.length === 0) return { ok: false, reason: 'no_billing_customer' };
  return { ok: true, customerId };
}
