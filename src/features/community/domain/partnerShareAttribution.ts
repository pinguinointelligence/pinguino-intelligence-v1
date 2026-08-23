/**
 * Gellatti Partner attribution for shared recipes (§23–§34, §49) — PURE.
 *
 * ── The three roles, never collapsed (§85) ─────────────────────────────────
 *   CREATOR  authored the recipe. Permanent, non-transferable, non-commercial.
 *   SHARER   sent this particular link. Social credit, no money attached.
 *   PARTNER  generated the sale. The ONLY role that can earn a commission.
 * A single person can hold all three at once; they are still three facts.
 *
 * ── Owner eligibility rule (locked 2026-08-23) ─────────────────────────────
 * Commission eligibility is decided by PARTNER STATUS AT THE MOMENT OF THE
 * QUALIFYING REFERRAL OR PURCHASE. Creator status, recipe popularity, sharing
 * volume and historical referrals never create a payment entitlement on their
 * own. Anyone may become a Partner through the activation process, but
 * commissions begin only once that status is active and are NEVER retroactive:
 * links already in circulation from before activation stay unattributed.
 *
 * ── Why this file wraps rather than reimplements ───────────────────────────
 * The commission machinery already exists (`@/billing/domain/attribution`,
 * migrations 0016–0021). This module adds exactly ONE thing the recipe-share
 * journey needs — a third evidence kind sitting between an explicit code and a
 * passive cookie — and then delegates. There is no second attribution system,
 * no second window, and no second definition of self-referral.
 */
import {
  ATTRIBUTION_WINDOW_DAYS,
  ATTRIBUTION_WINDOW_MS,
  decideAttribution,
  type CookieEvidence,
  type ExistingAttribution,
  type ExplicitCodeEvidence,
} from '@/billing/domain/attribution';
import type { UtcMs } from '@/billing/domain/types';

export { ATTRIBUTION_WINDOW_DAYS, ATTRIBUTION_WINDOW_MS };

/** Partner lifecycle states, mirroring `public.partners.status`. */
export type PartnerStatus = 'active' | 'suspended' | 'terminated';

/**
 * Who a share link credits commercially. `partnerId` is stamped SERVER-SIDE
 * at link creation from the sharer's active partner row; the client never
 * supplies it, so a forged one is structurally impossible (§49).
 */
export interface ShareJourneyEvidence {
  readonly partnerId: string;
  readonly partnerUserId: string;
  /** Partner status RIGHT NOW — not at the time the link was created. */
  readonly partnerStatusNow: PartnerStatus;
  readonly shareLinkId: string;
  readonly openedAtUtcMs: UtcMs;
}

export type ShareAttributionSource =
  | 'existing_lock'
  | 'explicit_code'
  | 'share_journey'
  | 'stored_referral';

export type ShareAttributionRefusal =
  | 'no_evidence'
  | 'window_expired'
  | 'invalid_code'
  | 'self_referral'
  | 'partner_not_active';

export type ShareAttributionDecision =
  | {
      readonly attributed: true;
      readonly partnerId: string;
      readonly source: ShareAttributionSource;
    }
  | { readonly attributed: false; readonly reason: ShareAttributionRefusal };

export interface ShareAttributionInput {
  /** An already-locked paid attribution — can never be stolen (rule A3). */
  readonly existingAttribution?: ExistingAttribution | null;
  /** A code the user deliberately typed at checkout. */
  readonly explicitCode?: ExplicitCodeEvidence | null;
  /** The secure recipe-share journey this acquisition came through. */
  readonly shareJourney?: ShareJourneyEvidence | null;
  /** A referral attribution already stored for this acquisition session. */
  readonly storedReferral?: CookieEvidence | null;
  readonly subjectUserId: string;
  readonly paymentAtUtcMs: UtcMs;
  readonly windowMs?: number;
}

/**
 * THE centralized precedence policy (§32). One place, one order:
 *
 *   1. an existing paid lock — a subscription already belongs to a partner;
 *   2. an explicit valid Partner code entered at checkout;
 *   3. the Partner attached to the active secure recipe-share journey;
 *   4. a valid stored referral attribution for this account;
 *   5. no Partner.
 *
 * Exactly ONE partner is attributed per commissionable payment; there is no
 * input combination that returns two (§32 „no double commission").
 *
 * Ineligible share evidence is DISCARDED and the remaining evidence is still
 * considered — a suspended partner must not shadow a valid stored referral —
 * but the refusal reason still reports why, so „nobody referred this" and
 * „the referrer is not an active partner" stay distinguishable.
 */
export function decideShareAttribution(
  input: ShareAttributionInput,
): ShareAttributionDecision {
  const windowMs = input.windowMs ?? ATTRIBUTION_WINDOW_MS;

  let sawInactivePartner = false;
  let sawSelfReferral = false;

  const journey = input.shareJourney ?? null;
  let eligibleJourney: ShareJourneyEvidence | null = null;
  if (journey) {
    // Owner rule: status NOW decides, and it is checked before anything else
    // about this evidence is trusted.
    if (journey.partnerStatusNow !== 'active') {
      sawInactivePartner = true;
    } else if (journey.partnerUserId === input.subjectUserId) {
      sawSelfReferral = true; // §49 — a partner never earns on themselves
    } else if (
      journey.openedAtUtcMs > input.paymentAtUtcMs ||
      input.paymentAtUtcMs >= journey.openedAtUtcMs + windowMs
    ) {
      // outside the attribution window (§33)
    } else {
      eligibleJourney = journey;
    }
  }

  // Steps 1, 2 and 4 are already law in the billing domain — delegate rather
  // than restate them, so the share journey can never drift from the rules
  // the commission ledger enforces.
  const withoutJourney = decideAttribution({
    existingAttribution: input.existingAttribution ?? null,
    explicitCode: input.explicitCode ?? null,
    cookie: input.storedReferral ?? null,
    subjectUserId: input.subjectUserId,
    paymentAtUtcMs: input.paymentAtUtcMs,
    windowMs,
  });

  // 1 + 2: an existing lock or an explicit code outranks the share journey.
  if (
    withoutJourney.attributed &&
    (withoutJourney.source === 'existing_lock' || withoutJourney.source === 'explicit_code')
  ) {
    return {
      attributed: true,
      partnerId: withoutJourney.partnerId,
      source: withoutJourney.source,
    };
  }

  // 3: the share journey beats a passive stored referral.
  if (eligibleJourney) {
    return {
      attributed: true,
      partnerId: eligibleJourney.partnerId,
      source: 'share_journey',
    };
  }

  // 4: fall back to whatever the billing domain decided.
  if (withoutJourney.attributed) {
    return { attributed: true, partnerId: withoutJourney.partnerId, source: 'stored_referral' };
  }

  // 5: typed refusal. Share-specific reasons are reported first because they
  // are the more actionable answer for the person asking.
  if (sawSelfReferral) return { attributed: false, reason: 'self_referral' };
  if (sawInactivePartner) return { attributed: false, reason: 'partner_not_active' };
  return { attributed: false, reason: withoutJourney.reason };
}

/**
 * Should a NEW share link carry Partner attribution? (§27 + owner rule.)
 *
 * Called at link CREATION. Non-retroactivity lives here: a link made while
 * the sharer was not an active partner stores no partner id, and no later
 * activation can reach back and monetise it.
 */
export function partnerIdForNewShare(sharer: {
  readonly partnerId: string | null;
  readonly partnerStatus: PartnerStatus | null;
}): string | null {
  if (!sharer.partnerId) return null;
  return sharer.partnerStatus === 'active' ? sharer.partnerId : null;
}

/**
 * Is this person eligible to EARN right now? The single predicate every
 * commission-adjacent surface should ask, so no screen invents its own rule.
 *
 * Deliberately ignores creator standing: `unique_makers`, `total_makes`,
 * remix counts and share volume are Creator facts and are not arguments here.
 * Recipe success does not pay.
 */
export function isCommissionEligible(partner: {
  readonly status: PartnerStatus | null;
}): boolean {
  return partner.status === 'active';
}

/** Why a person cannot earn — for honest, non-misleading UI copy (§18, §83). */
export type CommissionIneligibility =
  | 'not_a_partner'
  | 'partner_suspended'
  | 'partner_terminated';

export function commissionIneligibilityReason(partner: {
  readonly status: PartnerStatus | null;
}): CommissionIneligibility | null {
  if (partner.status === 'active') return null;
  if (partner.status === 'suspended') return 'partner_suspended';
  if (partner.status === 'terminated') return 'partner_terminated';
  return 'not_a_partner';
}
