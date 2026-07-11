/**
 * 15-month referral benefit — subscription-schedule orchestration (PURE).
 *
 * §12.6 invariants encoded here and pinned by tests:
 *  - SINGLE BENEFIT: a user consumes the 15-month benefit at most once, ever
 *    (`benefitAlreadyUsed` refuses a second grant — "no second benefit");
 *  - the benefit applies ONLY to a referred ANNUAL purchase: the buyer's
 *    chosen annual offer maps to its 15-month partner counterpart as phase 1
 *    (exactly ONE iteration) and renews into the SAME annual offer as
 *    phase 2 (the 15m offer's `renewalOfferKey` closes the loop);
 *  - IDEMPOTENT creation: if a schedule already exists for the subscription,
 *    the decision is to reuse it — never create a second schedule. The
 *    deterministic idempotency key makes the Stripe call itself replay-safe;
 *  - CANCELLATION semantics are per phase: cancel during the 15-month phase
 *    → the schedule is released/ends at the phase end and phase 2 NEVER
 *    starts (the benefit is still consumed — no re-grant); cancel during the
 *    renewal phase → normal annual cancel-at-period-end. Nothing here
 *    refunds or claws back the benefit.
 *
 * This module DECIDES; the Edge Function that talks to Stripe executes the
 * decision. 15-month prices are never client-selectable (see priceCatalog).
 */
import {
  byOfferKey,
  initialFifteenMonthOfferForAnnual,
  type OfferKey,
} from './priceCatalog';

/** The schedule plan the Stripe call executes: two phases, one iteration. */
export interface SchedulePlan {
  /** Phase 1: the 15-month partner offer (interval month × 15). */
  firstPhaseOfferKey: OfferKey;
  /** Exactly one 15-month iteration — never repeats. */
  firstPhaseIterations: 1;
  /** Phase 2: the mapped 12-month offer the schedule renews into. */
  secondPhaseOfferKey: OfferKey;
}

export type ScheduleDecision =
  | { action: 'create_schedule'; plan: SchedulePlan; idempotencyKey: string }
  | { action: 'reuse_existing_schedule' }
  | {
      action: 'no_benefit';
      reason:
        | 'not_referred'
        | 'benefit_already_used'
        | 'offer_not_annual'
        | 'no_fifteen_month_counterpart';
    };

export interface ScheduleDecisionInput {
  /** Internal user id (for the deterministic idempotency key). */
  userId: string;
  /** The ANNUAL offer the buyer chose (already server-validated). */
  purchasedOfferKey: OfferKey;
  /** Locked attribution says this purchase is partner-referred. */
  referred: boolean;
  /** `partner_benefit_uses` already has a row for this user. */
  benefitAlreadyUsed: boolean;
  /** Stripe schedule already attached to this subscription (id opaque). */
  existingScheduleId: string | null;
}

/**
 * Decide whether/how to create the 15-month schedule for a referred annual
 * purchase. Deterministic: identical input → identical decision, and the
 * idempotency key depends only on user + offer, so a retried orchestration
 * can never create a second schedule or grant a second benefit.
 */
export function decideScheduleCreation(input: ScheduleDecisionInput): ScheduleDecision {
  if (input.existingScheduleId) return { action: 'reuse_existing_schedule' };
  if (!input.referred) return { action: 'no_benefit', reason: 'not_referred' };
  if (input.benefitAlreadyUsed) return { action: 'no_benefit', reason: 'benefit_already_used' };

  const purchased = byOfferKey(input.purchasedOfferKey);
  if (!purchased || purchased.cadence !== 'annual') {
    return { action: 'no_benefit', reason: 'offer_not_annual' };
  }

  const fifteenMonth = initialFifteenMonthOfferForAnnual(purchased.offerKey);
  if (!fifteenMonth || !fifteenMonth.renewalOfferKey) {
    return { action: 'no_benefit', reason: 'no_fifteen_month_counterpart' };
  }

  return {
    action: 'create_schedule',
    plan: {
      firstPhaseOfferKey: fifteenMonth.offerKey,
      firstPhaseIterations: 1,
      secondPhaseOfferKey: fifteenMonth.renewalOfferKey,
    },
    idempotencyKey: `benefit-schedule:${input.userId}:${purchased.offerKey}`,
  };
}

export type SchedulePhase = 'first_15_month' | 'renewal_annual';

export interface CancellationSemantics {
  phase: SchedulePhase;
  /**
   * Which Stripe operation implements the cancel: during phase 1 the
   * SCHEDULE is amended so it ends with the current phase (paid time is
   * honored, phase 2 never starts); during phase 2 it is a plain
   * subscription cancel-at-period-end (the schedule already released).
   */
  mechanism: 'end_schedule_after_current_phase' | 'cancel_subscription_at_period_end';
  /** Access always runs to the end of the already-paid current phase. */
  endsAtPhaseEnd: true;
  /** Whether the renewal (annual) phase still starts afterwards. */
  renewalPhaseStarts: false;
  /** The single-use benefit stays consumed either way — never re-granted. */
  benefitRemainsConsumed: true;
}

/** Per-phase cancellation semantics (§12.6). Pure lookup, test-pinned. */
export function cancellationSemanticsFor(phase: SchedulePhase): CancellationSemantics {
  return {
    phase,
    mechanism:
      phase === 'first_15_month'
        ? 'end_schedule_after_current_phase'
        : 'cancel_subscription_at_period_end',
    endsAtPhaseEnd: true,
    renewalPhaseStarts: false,
    benefitRemainsConsumed: true,
  };
}
