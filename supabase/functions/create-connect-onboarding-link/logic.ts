/**
 * create-connect-onboarding-link — PURE decision logic (no IO, no Deno APIs,
 * no SDK).
 *
 * Rule: hosted Connect onboarding links are minted ONLY for an ACTIVE partner
 * record. In the 0016 schema a `partners` row is CREATED at approval (there is
 * no pre-approval partner row and no separate `active` boolean): `status` is
 * the operational state — 'active' | 'suspended' | 'terminated'. A missing row
 * (never approved) or a non-active status gets a typed refusal, never a
 * Stripe call. Return/refresh URLs must pass the shared origin allowlist
 * (../_shared/urlAllowlist.ts).
 */

export interface PartnerRow {
  /** Operational partner state (0016): 'active' | 'suspended' | 'terminated'. */
  status: string;
}

export type OnboardingEligibility =
  | { ok: true }
  | { ok: false; reason: 'no_partner' | 'partner_inactive' };

/** Active partners only — missing or suspended/terminated is a typed refusal. */
export function decideOnboardingEligibility(
  partner: PartnerRow | null | undefined,
): OnboardingEligibility {
  if (!partner) return { ok: false, reason: 'no_partner' };
  if (partner.status !== 'active') return { ok: false, reason: 'partner_inactive' };
  return { ok: true };
}
