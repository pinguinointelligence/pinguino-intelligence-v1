/**
 * Module 5 — payoutNetting: monthly payout batch math + commission lifecycle
 * state machine.
 *
 * LOCKED RULES implemented here (cited as P1..P7 in code):
 *  P1  Batch input = eligible commission entries + adjustments per
 *      partner/currency; negative adjustments are applied to gross.
 *  P2  Threshold (default 2500 cents = EUR 25, configurable): below-threshold
 *      POSITIVE balances carry forward untouched (no transfer).
 *  P3  Negative net carries forward and blocks positive payout until
 *      net > 0 AND net ≥ threshold.
 *  P4  Net zero → no transfer.
 *  P5  Output is an immutable per-partner batch line
 *      {eligibleGross, adjustments, netPayable, thresholdMet, carryForward}.
 *  P6  Deterministic idempotency key: batchMonth + partnerId + currency + mode.
 *  P7  Commission lifecycle state machine — ONLY the legal transitions below;
 *      anything else throws a typed IllegalCommissionTransitionError.
 *
 * Pure + deterministic. Integer cents only.
 */

import {
  BillingDomainError,
  assertIntegerCents,
  frozen,
  type Currency,
  type MonthKey,
} from './types';

/** P2: default payout threshold — EUR 25.00 = 2500 integer cents. */
export const DEFAULT_PAYOUT_THRESHOLD_CENTS = 2500 as const;

export interface EligibleEntryInput {
  readonly entryId: string;
  /** Commission amount, integer cents > 0. */
  readonly amountCents: number;
}

export interface AdjustmentInput {
  readonly adjustmentId: string;
  /** Signed integer cents (reversals negative, reinstatements positive). */
  readonly amountCents: number;
}

export interface PartnerBatchInput {
  readonly partnerId: string;
  readonly currency: Currency;
  readonly eligibleEntries: readonly EligibleEntryInput[];
  readonly adjustments: readonly AdjustmentInput[];
  /**
   * Balance carried in from previous batches (signed): positive
   * below-threshold remainders (P2) or negative debt (P3). Default 0.
   */
  readonly carryInCents?: number;
}

/** P5: immutable per-partner batch line. */
export interface PartnerBatchLine {
  readonly partnerId: string;
  readonly currency: Currency;
  /** Sum of eligible commission entries (P1). */
  readonly eligibleGrossCents: number;
  /** Sum of adjustments, signed (P1). */
  readonly adjustmentsCents: number;
  /** Carry-in echoed for auditability. */
  readonly carryInCents: number;
  /** Amount to transfer this batch (0 when no transfer). */
  readonly netPayableCents: number;
  /** P2/P3: whether net > 0 AND net ≥ threshold. */
  readonly thresholdMet: boolean;
  /** Signed balance carried to the next batch (0 when a transfer happens). */
  readonly carryForwardCents: number;
}

/**
 * P1–P5: compute one partner/currency batch line.
 *   net = carryIn + Σ entries + Σ adjustments
 *   transfer  ⇔ net > 0 AND net ≥ threshold   (P2, P3)
 *   net ≤ 0   → no transfer, net carries forward (negative blocks; P3, P4)
 *   0 < net < threshold → no transfer, carries forward untouched (P2)
 */
export function computePartnerBatchLine(
  input: PartnerBatchInput,
  options: { readonly thresholdCents?: number } = {},
): PartnerBatchLine {
  const thresholdCents = options.thresholdCents ?? DEFAULT_PAYOUT_THRESHOLD_CENTS;
  assertIntegerCents(thresholdCents, 'computePartnerBatchLine.thresholdCents');

  let eligibleGrossCents = 0;
  for (const entry of input.eligibleEntries) {
    assertIntegerCents(entry.amountCents, `entry ${entry.entryId}.amountCents`);
    eligibleGrossCents += entry.amountCents;
  }
  let adjustmentsCents = 0;
  for (const adjustment of input.adjustments) {
    assertIntegerCents(adjustment.amountCents, `adjustment ${adjustment.adjustmentId}.amountCents`, true);
    adjustmentsCents += adjustment.amountCents;
  }
  const carryInCents = input.carryInCents ?? 0;
  assertIntegerCents(carryInCents, 'computePartnerBatchLine.carryInCents', true);

  const netCents = carryInCents + eligibleGrossCents + adjustmentsCents;
  // P2 + P3: transfer only when net > 0 AND net ≥ threshold. P4: zero → none.
  const thresholdMet = netCents > 0 && netCents >= thresholdCents;
  return frozen({
    partnerId: input.partnerId,
    currency: input.currency,
    eligibleGrossCents,
    adjustmentsCents,
    carryInCents,
    netPayableCents: thresholdMet ? netCents : 0,
    thresholdMet,
    carryForwardCents: thresholdMet ? 0 : netCents,
  });
}

/** Batch execution modes (P6): a live transfer run or a dry run preview. */
export type BatchMode = 'live' | 'dry_run';

/**
 * P6: deterministic idempotency key builder —
 * `payout:{batchMonth}:{partnerId}:{currency}:{mode}`.
 * The same logical batch always produces the same key, so a re-run can never
 * duplicate a Stripe transfer.
 */
export function buildPayoutIdempotencyKey(parts: {
  readonly batchMonth: MonthKey;
  readonly partnerId: string;
  readonly currency: Currency;
  readonly mode: BatchMode;
}): string {
  if (!/^\d{4}-\d{2}$/.test(parts.batchMonth)) {
    throw new BillingDomainError('invalid_month_key', `batchMonth must be 'YYYY-MM', got '${parts.batchMonth}'`);
  }
  if (parts.partnerId.length === 0 || parts.partnerId.includes(':')) {
    throw new BillingDomainError('invalid_partner_id', `partnerId must be non-empty without ':', got '${parts.partnerId}'`);
  }
  return `payout:${parts.batchMonth}:${parts.partnerId}:${parts.currency}:${parts.mode}`;
}

// ---------------------------------------------------------------------------
// P7 — commission lifecycle state machine
// ---------------------------------------------------------------------------

export type CommissionState =
  | 'pending_payment_confirmation'
  | 'earned'
  | 'held'
  | 'eligible'
  | 'batched'
  | 'transferred'
  | 'bank_payout_pending'
  | 'paid'
  | 'reversed'
  | 'partially_reversed'
  | 'offset'
  | 'failed'
  | 'manual_review';

/**
 * P7: the ONLY legal transitions.
 *
 * Happy path: pending_payment_confirmation → earned → held → eligible →
 * batched → transferred → bank_payout_pending → paid.
 *
 * Edge semantics (resolved ambiguity — the locked spec names the edge states
 * but not every edge; the exact edge set below is documented in
 * TEST_MATRIX.md):
 *  - reversed / partially_reversed reachable from any pre-transfer money
 *    state (earned/held/eligible/batched) via refunds/disputes;
 *    partially_reversed may continue to eligible/batched with the remainder
 *    or degrade to reversed.
 *  - offset: a balance consumed by negative-carry netting (from eligible or
 *    partially_reversed). Terminal.
 *  - failed: transfer or bank payout failure; recoverable to eligible
 *    (retry) or escalated to manual_review.
 *  - manual_review reachable from any non-terminal state; resolvable back to
 *    earned/held/eligible or terminally to reversed/offset/failed.
 *  - Terminal states: paid, reversed, offset.
 */
export const LEGAL_COMMISSION_TRANSITIONS: Readonly<Record<CommissionState, readonly CommissionState[]>> = frozen({
  pending_payment_confirmation: frozen(['earned', 'failed', 'manual_review'] as const),
  earned: frozen(['held', 'reversed', 'partially_reversed', 'manual_review'] as const),
  held: frozen(['eligible', 'reversed', 'partially_reversed', 'manual_review'] as const),
  eligible: frozen(['batched', 'reversed', 'partially_reversed', 'offset', 'manual_review'] as const),
  batched: frozen(['transferred', 'reversed', 'partially_reversed', 'manual_review'] as const),
  transferred: frozen(['bank_payout_pending', 'failed', 'manual_review'] as const),
  bank_payout_pending: frozen(['paid', 'failed', 'manual_review'] as const),
  paid: frozen([] as const),
  reversed: frozen([] as const),
  partially_reversed: frozen(['eligible', 'batched', 'reversed', 'offset', 'manual_review'] as const),
  offset: frozen([] as const),
  failed: frozen(['eligible', 'manual_review'] as const),
  manual_review: frozen(['earned', 'held', 'eligible', 'reversed', 'offset', 'failed'] as const),
});

export class IllegalCommissionTransitionError extends BillingDomainError {
  readonly from: CommissionState;
  readonly to: CommissionState;
  constructor(from: CommissionState, to: CommissionState) {
    super('illegal_commission_transition', `illegal commission transition ${from} → ${to}`);
    this.name = 'IllegalCommissionTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** P7: is `from → to` a legal transition? */
export function canTransitionCommission(from: CommissionState, to: CommissionState): boolean {
  return LEGAL_COMMISSION_TRANSITIONS[from].includes(to);
}

/** P7: assert legality; returns `to` for chaining, throws typed error otherwise. */
export function assertCommissionTransition(from: CommissionState, to: CommissionState): CommissionState {
  if (!canTransitionCommission(from, to)) {
    throw new IllegalCommissionTransitionError(from, to);
  }
  return to;
}
