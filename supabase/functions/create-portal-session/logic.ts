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

/**
 * Optional portal deep link. Account → Plan i rozliczenia sends the customer
 * straight to the payment-method update after a failed renewal (Stripe
 * `flow_data.type = payment_method_update`) — card storage stays Stripe's.
 * Anything else is refused rather than guessed.
 */
export type PortalFlow = 'payment_method_update';

export type PortalFlowDecision =
  | { ok: true; flow: PortalFlow | null }
  | { ok: false; reason: 'unknown_portal_flow' };

export function decidePortalFlow(raw: unknown): PortalFlowDecision {
  if (raw === undefined || raw === null || raw === '') return { ok: true, flow: null };
  if (raw === 'payment_method_update') return { ok: true, flow: raw };
  return { ok: false, reason: 'unknown_portal_flow' };
}

/** Auth'd user → customer id requirement (the only portal precondition). */
export function decidePortalEligibility(
  billingCustomer: BillingCustomerRow | null | undefined,
): PortalEligibility {
  const customerId = billingCustomer?.stripe_customer_id?.trim() ?? '';
  if (customerId.length === 0) return { ok: false, reason: 'no_billing_customer' };
  return { ok: true, customerId };
}
