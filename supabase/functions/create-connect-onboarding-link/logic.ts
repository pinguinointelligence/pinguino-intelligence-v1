/**
 * create-connect-onboarding-link — PURE decision logic (no IO, no Deno APIs,
 * no SDK).
 *
 * Rule: hosted Connect onboarding links are minted ONLY for a partner whose
 * application is APPROVED and whose partner record is ACTIVE — a pending,
 * rejected, suspended or missing partner gets a typed refusal, never a
 * Stripe call. Return/refresh URLs must pass the shared origin allowlist
 * (../_shared/urlAllowlist.ts).
 */

export interface PartnerRow {
  /** Partner application status vocabulary (track D/E owns the table). */
  status: string;
  /** Operational kill-switch independent of the application status. */
  active: boolean;
}

export type OnboardingEligibility =
  | { ok: true }
  | { ok: false; reason: 'no_partner' | 'partner_not_approved' | 'partner_inactive' };

/** Approved + active partners only — everything else is a typed refusal. */
export function decideOnboardingEligibility(
  partner: PartnerRow | null | undefined,
): OnboardingEligibility {
  if (!partner) return { ok: false, reason: 'no_partner' };
  if (partner.status !== 'approved') return { ok: false, reason: 'partner_not_approved' };
  if (!partner.active) return { ok: false, reason: 'partner_inactive' };
  return { ok: true };
}
