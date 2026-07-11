/**
 * Module 7 — attribution: referral attribution decisions + §4.6 benefit
 * non-stacking. Pure decision functions over explicit evidence inputs —
 * the DB (`referral_attributions`) is the authority; cookies/links/codes are
 * evidence only (locked architecture decision #7).
 *
 * LOCKED RULES implemented here (cited as A1..A8 in code):
 *  A1  30-day link/cookie window (timestamps are always inputs).
 *  A2  An explicit VALID code entered before the first attributed paid
 *      conversion overrides an unconverted passive cookie.
 *  A3  Once a subscription is paid-attributed it is LOCKED to that partner
 *      for its commissionable lifetime — a later code can never steal it.
 *  A4  A previously-unattributed monthly subscription converting to annual
 *      with a valid code → attributed to that partner for the conversion and
 *      future renewals.
 *  A5  An already-attributed monthly subscription KEEPS its partner through
 *      conversion (follows from A3).
 *  A6  Exactly ONE partner per commissionable payment.
 *  A7  Self-referral (the partner's own user/account) → typed rejection.
 *  A8  §4.6 benefit non-stacking: ONE 15-month benefit per qualifying initial
 *      annual purchase/conversion; no second-code stacking; no repeat on
 *      renewals; no cancel-and-rebuy repeat; the partner's own free
 *      entitlement is not eligible; invite-trial users ARE eligible when they
 *      buy annual through a partner.
 *
 * Resolved ambiguity (documented in TEST_MATRIX.md): evidence pointing at a
 * self-referring partner is discarded and remaining evidence is considered;
 * if NO non-self evidence remains, the decision is a typed 'self_referral'
 * refusal when self evidence existed, else 'no_evidence'.
 */

import { assertUtcMs, frozen, type UtcMs } from './types';

/** A1: locked default attribution window — 30 days. */
export const ATTRIBUTION_WINDOW_DAYS = 30 as const;
export const ATTRIBUTION_WINDOW_MS: number = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Passive link/cookie evidence. */
export interface CookieEvidence {
  readonly partnerId: string;
  /** The partner's own account user id (A7 self-referral check). */
  readonly partnerUserId: string;
  readonly clickedAtUtcMs: UtcMs;
}

/** Explicit code entry evidence. */
export interface ExplicitCodeEvidence {
  readonly partnerId: string;
  readonly partnerUserId: string;
  readonly enteredAtUtcMs: UtcMs;
  /** Result of partnerCodes validation + existence lookup (evidence input). */
  readonly codeValid: boolean;
}

/** A3: existing paid-locked attribution row (DB authority). */
export interface ExistingAttribution {
  readonly partnerId: string;
  readonly lockedAtUtcMs: UtcMs;
}

export type AttributionSource = 'existing_lock' | 'explicit_code' | 'cookie';

export type AttributionRefusalReason =
  | 'no_evidence'
  | 'window_expired'
  | 'invalid_code'
  | 'self_referral';

export type AttributionDecision =
  | { readonly attributed: true; readonly partnerId: string; readonly source: AttributionSource }
  | { readonly attributed: false; readonly reason: AttributionRefusalReason };

export interface AttributionInput {
  /** A3: pre-existing paid-locked attribution, if any. */
  readonly existingAttribution?: ExistingAttribution | null;
  readonly explicitCode?: ExplicitCodeEvidence | null;
  readonly cookie?: CookieEvidence | null;
  /** The paying user (A7). */
  readonly subjectUserId: string;
  /** Instant of the commissionable payment being attributed. */
  readonly paymentAtUtcMs: UtcMs;
  /** Override for the A1 window (tests/config); defaults to 30 days. */
  readonly windowMs?: number;
}

/**
 * A1–A7: decide the single partner (A6) attributed for one commissionable
 * payment. Deterministic precedence:
 *   1. existing paid lock (A3/A5 — cannot be stolen),
 *   2. explicit VALID code entered before this payment (A2, A4),
 *   3. passive cookie within the 30-day window (A1),
 * with self-referring evidence discarded (A7).
 */
export function decideAttribution(input: AttributionInput): AttributionDecision {
  assertUtcMs(input.paymentAtUtcMs, 'decideAttribution.paymentAtUtcMs');
  const windowMs = input.windowMs ?? ATTRIBUTION_WINDOW_MS;

  // A3 + A5: an existing paid lock always wins; later codes never steal.
  if (input.existingAttribution) {
    return frozen({
      attributed: true as const,
      partnerId: input.existingAttribution.partnerId,
      source: 'existing_lock' as const,
    });
  }

  let sawSelfReferral = false;
  let sawInvalidCode = false;
  let sawExpiredWindow = false;

  // A2/A4: explicit valid code beats an unconverted passive cookie.
  if (input.explicitCode) {
    assertUtcMs(input.explicitCode.enteredAtUtcMs, 'explicitCode.enteredAtUtcMs');
    if (!input.explicitCode.codeValid) {
      sawInvalidCode = true;
    } else if (input.explicitCode.enteredAtUtcMs > input.paymentAtUtcMs) {
      // Entered AFTER the payment → not evidence for this payment (A2:
      // "entered before first attributed paid conversion").
      sawExpiredWindow = true;
    } else if (input.explicitCode.partnerUserId === input.subjectUserId) {
      sawSelfReferral = true; // A7: discard, consider remaining evidence
    } else {
      return frozen({
        attributed: true as const,
        partnerId: input.explicitCode.partnerId,
        source: 'explicit_code' as const,
      });
    }
  }

  // A1: passive cookie within the 30-day window.
  if (input.cookie) {
    assertUtcMs(input.cookie.clickedAtUtcMs, 'cookie.clickedAtUtcMs');
    const windowEndsAtUtcMs = input.cookie.clickedAtUtcMs + windowMs;
    if (input.cookie.clickedAtUtcMs > input.paymentAtUtcMs || input.paymentAtUtcMs >= windowEndsAtUtcMs) {
      sawExpiredWindow = true;
    } else if (input.cookie.partnerUserId === input.subjectUserId) {
      sawSelfReferral = true; // A7
    } else {
      return frozen({
        attributed: true as const,
        partnerId: input.cookie.partnerId,
        source: 'cookie' as const,
      });
    }
  }

  // Typed refusal, most specific reason first (A7 > window > code validity).
  if (sawSelfReferral) {
    return frozen({ attributed: false as const, reason: 'self_referral' as const });
  }
  if (sawExpiredWindow) {
    return frozen({ attributed: false as const, reason: 'window_expired' as const });
  }
  if (sawInvalidCode) {
    return frozen({ attributed: false as const, reason: 'invalid_code' as const });
  }
  return frozen({ attributed: false as const, reason: 'no_evidence' as const });
}

// ---------------------------------------------------------------------------
// A8 — §4.6: 15-month benefit non-stacking
// ---------------------------------------------------------------------------

/** Payment kinds that can be evaluated for the 15-month benefit. */
export type BenefitPaymentKind =
  | 'initial_annual_purchase'
  | 'conversion_to_annual'
  | 'annual_renewal'
  | 'rebuy_after_cancel';

export type BenefitRefusalReason =
  | 'not_attributed'
  | 'renewal_not_eligible'
  | 'stacking_rejected'
  | 'rebuy_not_eligible'
  | 'partner_free_entitlement_not_eligible';

export interface BenefitEvidence {
  readonly paymentKind: BenefitPaymentKind;
  /** Result of decideAttribution for this payment (A8 requires attribution). */
  readonly attributed: boolean;
  /** A benefit was already granted for THIS subscription/purchase (second code → stacking). */
  readonly benefitAlreadyGrantedForSubscription: boolean;
  /** The user already consumed a 15-month benefit on an earlier subscription (cancel-and-rebuy). */
  readonly userHadPriorBenefit: boolean;
  /** The buyer's access is the partner's own free entitlement (not eligible). */
  readonly isPartnersOwnFreeEntitlement: boolean;
  /**
   * The buyer previously had an invite trial. A8: EXPLICITLY eligible —
   * present in the input only so tests document that it must NOT refuse.
   */
  readonly hadInviteTrial: boolean;
}

export type BenefitDecision =
  | { readonly granted: true; readonly benefitMonths: 15 }
  | { readonly granted: false; readonly reason: BenefitRefusalReason };

/**
 * A8 (§4.6): decide whether this payment grants the single 15-month benefit.
 * Grant ⇔ qualifying kind (initial annual purchase OR conversion to annual)
 * AND attributed AND no prior benefit for the subscription (no stacking) AND
 * no prior lifetime benefit use (no cancel-and-rebuy repeat) AND the buyer is
 * not consuming the partner's own free entitlement. Invite-trial history is
 * NOT a refusal.
 */
export function decideFifteenMonthBenefit(evidence: BenefitEvidence): BenefitDecision {
  if (evidence.paymentKind === 'annual_renewal') {
    return frozen({ granted: false as const, reason: 'renewal_not_eligible' as const }); // A8: no repeat on renewals
  }
  if (evidence.paymentKind === 'rebuy_after_cancel') {
    return frozen({ granted: false as const, reason: 'rebuy_not_eligible' as const }); // A8: no cancel-and-rebuy repeat
  }
  if (!evidence.attributed) {
    return frozen({ granted: false as const, reason: 'not_attributed' as const });
  }
  if (evidence.isPartnersOwnFreeEntitlement) {
    return frozen({ granted: false as const, reason: 'partner_free_entitlement_not_eligible' as const });
  }
  if (evidence.benefitAlreadyGrantedForSubscription) {
    return frozen({ granted: false as const, reason: 'stacking_rejected' as const }); // A8: no second code stacking
  }
  if (evidence.userHadPriorBenefit) {
    return frozen({ granted: false as const, reason: 'rebuy_not_eligible' as const }); // A8: lifetime, not per subscription
  }
  // A8: invite-trial users ARE eligible — hadInviteTrial deliberately unused
  // as a refusal condition.
  return frozen({ granted: true as const, benefitMonths: 15 as const });
}
