/**
 * Module 2 — refundAdjustments: refund / dispute commission reversals.
 *
 * LOCKED RULES implemented here (cited as R1..R6 in code):
 *  R1  Full refund → full reversal of the commission.
 *  R2  Partial refund → proportional reversal =
 *        round-half-up(originalCommissionCents × refundedGrossCents / originalGrossCents)
 *      computed in pure integer arithmetic.
 *  R3  Cap: cumulative reversals never exceed the original commission;
 *      multiple partial refunds accumulate correctly against the cap.
 *  R4  A reversal is an APPEND-ONLY adjustment — the original commission entry
 *      is never mutated (locked architecture decision #3).
 *  R5  Dispute lost = full reversal (of whatever is still un-reversed).
 *  R6  Dispute later won + funds reinstated = restore ONCE, idempotent by
 *      source event id.
 *
 * Pure + deterministic. Integer cents only. Resolved ambiguity (documented in
 * TEST_MATRIX.md): the same duplicate-by-source-event-id guard that R6
 * requires for reinstatements is also applied to refund/dispute reversals, so
 * replaying the same Stripe event can never double-append an adjustment.
 */

import { BillingDomainError, assertIntegerCents, divideRoundHalfUp, frozen, type Currency } from './types';

/** Minimal immutable view of a ledger commission entry (R4: never mutated). */
export interface CommissionEntryView {
  readonly entryId: string;
  /** Original commission amount, integer cents > 0. */
  readonly commissionCents: number;
  /** Original commissionable gross amount, integer cents > 0. */
  readonly grossCents: number;
  readonly currency: Currency;
}

export type AdjustmentKind = 'refund_reversal' | 'dispute_reversal' | 'dispute_reinstatement';

/** Append-only adjustment record (R4). Negative = reversal, positive = reinstatement. */
export interface CommissionAdjustment {
  readonly entryId: string;
  readonly kind: AdjustmentKind;
  /** Signed integer cents: reversals < 0, reinstatements > 0. */
  readonly amountCents: number;
  /** Id of the source event (refund id / dispute id / reinstatement event id). */
  readonly sourceEventId: string;
  /** For dispute_reinstatement only: the dispute reversal being restored (R6 idempotency). */
  readonly disputeSourceEventId?: string;
  readonly currency: Currency;
}

export type AdjustmentRefusalReason =
  | 'duplicate_source_event'
  | 'nothing_left_to_reverse'
  | 'no_matching_dispute_reversal'
  | 'already_reinstated';

export type AdjustmentResult =
  | { readonly applied: true; readonly adjustment: CommissionAdjustment }
  | { readonly applied: false; readonly reason: AdjustmentRefusalReason };

export class InvalidRefundInputError extends BillingDomainError {
  constructor(message: string) {
    super('invalid_refund_input', message);
    this.name = 'InvalidRefundInputError';
  }
}

function assertEntry(entry: CommissionEntryView): void {
  assertIntegerCents(entry.commissionCents, 'entry.commissionCents');
  assertIntegerCents(entry.grossCents, 'entry.grossCents');
  if (entry.grossCents <= 0) {
    throw new InvalidRefundInputError(`entry ${entry.entryId}: grossCents must be > 0`);
  }
  if (entry.commissionCents <= 0) {
    throw new InvalidRefundInputError(`entry ${entry.entryId}: commissionCents must be > 0`);
  }
}

/**
 * R2: raw proportional reversal, UNCAPPED —
 * round-half-up(commission × refundedGross / originalGross), integer math only.
 */
export function proportionalReversalCents(
  originalCommissionCents: number,
  originalGrossCents: number,
  refundedGrossCents: number,
): number {
  assertIntegerCents(originalCommissionCents, 'proportionalReversalCents.originalCommissionCents');
  assertIntegerCents(originalGrossCents, 'proportionalReversalCents.originalGrossCents');
  assertIntegerCents(refundedGrossCents, 'proportionalReversalCents.refundedGrossCents');
  if (originalGrossCents <= 0) {
    throw new InvalidRefundInputError('originalGrossCents must be > 0');
  }
  return divideRoundHalfUp(originalCommissionCents * refundedGrossCents, originalGrossCents);
}

/**
 * Net reversed cents so far, as a positive number. Reversals are negative
 * adjustments, reinstatements positive (R6 restores), so the net reversed
 * amount is simply the negated sum.
 */
export function cumulativeReversedCents(adjustments: readonly CommissionAdjustment[]): number {
  let sum = 0;
  for (const adjustment of adjustments) {
    sum += adjustment.amountCents;
  }
  return 0 - sum; // `0 -` avoids IEEE negative zero when sum === 0
}

function hasSourceEvent(adjustments: readonly CommissionAdjustment[], sourceEventId: string): boolean {
  return adjustments.some((a) => a.sourceEventId === sourceEventId);
}

/**
 * R1/R2/R3/R4: append a refund reversal adjustment for a refund event.
 * `refundedGrossCents === entry.grossCents` (or a chain of partials reaching
 * it) yields exactly a full reversal via the cap.
 */
export function applyRefund(
  entry: CommissionEntryView,
  priorAdjustments: readonly CommissionAdjustment[],
  refund: { readonly sourceEventId: string; readonly refundedGrossCents: number },
): AdjustmentResult {
  assertEntry(entry);
  assertIntegerCents(refund.refundedGrossCents, 'applyRefund.refundedGrossCents');
  if (hasSourceEvent(priorAdjustments, refund.sourceEventId)) {
    return frozen({ applied: false as const, reason: 'duplicate_source_event' as const });
  }
  const alreadyReversed = cumulativeReversedCents(priorAdjustments);
  const remaining = entry.commissionCents - alreadyReversed;
  if (remaining <= 0) {
    // R3: cap reached — nothing left to reverse.
    return frozen({ applied: false as const, reason: 'nothing_left_to_reverse' as const });
  }
  const proportional = proportionalReversalCents(
    entry.commissionCents,
    entry.grossCents,
    refund.refundedGrossCents,
  );
  // R3: cap so cumulative reversals never exceed the original commission.
  const reversal = Math.min(proportional, remaining);
  if (reversal <= 0) {
    return frozen({ applied: false as const, reason: 'nothing_left_to_reverse' as const });
  }
  return frozen({
    applied: true as const,
    adjustment: frozen({
      entryId: entry.entryId,
      kind: 'refund_reversal' as const,
      amountCents: -reversal,
      sourceEventId: refund.sourceEventId,
      currency: entry.currency,
    }),
  });
}

/** R5: dispute lost → full reversal of whatever commission is still un-reversed. */
export function applyDisputeLost(
  entry: CommissionEntryView,
  priorAdjustments: readonly CommissionAdjustment[],
  dispute: { readonly sourceEventId: string },
): AdjustmentResult {
  assertEntry(entry);
  if (hasSourceEvent(priorAdjustments, dispute.sourceEventId)) {
    return frozen({ applied: false as const, reason: 'duplicate_source_event' as const });
  }
  const remaining = entry.commissionCents - cumulativeReversedCents(priorAdjustments);
  if (remaining <= 0) {
    return frozen({ applied: false as const, reason: 'nothing_left_to_reverse' as const });
  }
  return frozen({
    applied: true as const,
    adjustment: frozen({
      entryId: entry.entryId,
      kind: 'dispute_reversal' as const,
      amountCents: -remaining,
      sourceEventId: dispute.sourceEventId,
      currency: entry.currency,
    }),
  });
}

/**
 * R6: dispute later won + funds reinstated → restore ONCE.
 * Restores exactly the amount reversed by the dispute_reversal whose
 * sourceEventId is `disputeSourceEventId`. Idempotent by the reinstatement's
 * own `sourceEventId`: replaying the same reinstatement event refuses with
 * 'already_reinstated'; a second reinstatement for the same dispute (different
 * event id) also refuses.
 */
export function applyDisputeReinstatement(
  entry: CommissionEntryView,
  priorAdjustments: readonly CommissionAdjustment[],
  reinstatement: { readonly sourceEventId: string; readonly disputeSourceEventId: string },
): AdjustmentResult {
  assertEntry(entry);
  if (hasSourceEvent(priorAdjustments, reinstatement.sourceEventId)) {
    return frozen({ applied: false as const, reason: 'already_reinstated' as const });
  }
  const disputeReversal = priorAdjustments.find(
    (a) => a.kind === 'dispute_reversal' && a.sourceEventId === reinstatement.disputeSourceEventId,
  );
  if (!disputeReversal) {
    return frozen({ applied: false as const, reason: 'no_matching_dispute_reversal' as const });
  }
  const alreadyRestored = priorAdjustments.some(
    (a) =>
      a.kind === 'dispute_reinstatement' &&
      a.disputeSourceEventId === reinstatement.disputeSourceEventId,
  );
  if (alreadyRestored) {
    return frozen({ applied: false as const, reason: 'already_reinstated' as const });
  }
  return frozen({
    applied: true as const,
    adjustment: frozen({
      entryId: entry.entryId,
      kind: 'dispute_reinstatement' as const,
      amountCents: -disputeReversal.amountCents, // positive: restores the reversal
      sourceEventId: reinstatement.sourceEventId,
      disputeSourceEventId: reinstatement.disputeSourceEventId,
      currency: entry.currency,
    }),
  });
}
