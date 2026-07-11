/**
 * Module 2 tests — refundAdjustments.
 * Pins R1 (full refund → full reversal), R2 (proportional round-half-up),
 * R3 (cumulative cap), R4 (append-only), R5 (dispute lost = full reversal),
 * R6 (dispute won reinstates ONCE, idempotent by source event id).
 */

import { describe, expect, it } from 'vitest';
import {
  applyDisputeLost,
  applyDisputeReinstatement,
  applyRefund,
  cumulativeReversedCents,
  proportionalReversalCents,
  InvalidRefundInputError,
  type CommissionAdjustment,
  type CommissionEntryView,
} from './refundAdjustments';
import { InvalidCentsError } from './types';

const ENTRY: CommissionEntryView = {
  entryId: 'ce_1',
  commissionCents: 900, // HOME annual standard
  grossCents: 10000,
  currency: 'eur',
};

function adjustmentOf(result: ReturnType<typeof applyRefund>): CommissionAdjustment {
  if (!result.applied) throw new Error(`expected applied, got ${result.reason}`);
  return result.adjustment;
}

describe('R2: proportionalReversalCents — integer round-half-up', () => {
  it('exact proportion (half refund → half commission)', () => {
    expect(proportionalReversalCents(900, 10000, 5000)).toBe(450);
  });

  it('rounds down below .5', () => {
    // 199 × 333 / 1000 = 66.267 → 66
    expect(proportionalReversalCents(199, 1000, 333)).toBe(66);
  });

  it('rounds up above .5', () => {
    // 199 × 335 / 1000 = 66.665 → 67
    expect(proportionalReversalCents(199, 1000, 335)).toBe(67);
  });

  it('rounds exact halves UP (round-half-up, locked rounding rule)', () => {
    // 250 × 502 / 1000 = 125.5 → 126
    expect(proportionalReversalCents(250, 1000, 502)).toBe(126);
    // 100 × 1 / 200 = 0.5 → 1
    expect(proportionalReversalCents(100, 200, 1)).toBe(1);
  });

  it('thirds behave deterministically', () => {
    expect(proportionalReversalCents(100, 3, 1)).toBe(33); // 33.33…
    expect(proportionalReversalCents(100, 3, 2)).toBe(67); // 66.67…
  });

  it('full refund yields the full commission', () => {
    expect(proportionalReversalCents(900, 10000, 10000)).toBe(900);
  });

  it('zero refund yields zero', () => {
    expect(proportionalReversalCents(900, 10000, 0)).toBe(0);
  });

  it('rejects invalid inputs', () => {
    expect(() => proportionalReversalCents(900, 0, 100)).toThrow(InvalidRefundInputError);
    expect(() => proportionalReversalCents(9.5, 100, 100)).toThrow(InvalidCentsError);
    expect(() => proportionalReversalCents(900, 100, -1)).toThrow(InvalidCentsError);
  });
});

describe('R1/R3/R4: applyRefund', () => {
  it('R1: full refund → full reversal', () => {
    const result = applyRefund(ENTRY, [], { sourceEventId: 're_full', refundedGrossCents: 10000 });
    expect(adjustmentOf(result)).toEqual({
      entryId: 'ce_1',
      kind: 'refund_reversal',
      amountCents: -900,
      sourceEventId: 're_full',
      currency: 'eur',
    });
  });

  it('R2: partial refund → proportional reversal', () => {
    const result = applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 });
    expect(adjustmentOf(result).amountCents).toBe(-450);
  });

  it('R3: multiple partial refunds accumulate to exactly the full commission', () => {
    const first = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 }));
    const second = adjustmentOf(
      applyRefund(ENTRY, [first], { sourceEventId: 're_2', refundedGrossCents: 5000 }),
    );
    expect(first.amountCents + second.amountCents).toBe(-900);
    const third = applyRefund(ENTRY, [first, second], { sourceEventId: 're_3', refundedGrossCents: 1 });
    expect(third).toEqual({ applied: false, reason: 'nothing_left_to_reverse' });
  });

  it('R3: cap — a refund can never push cumulative reversals past the original commission', () => {
    // 80% refund twice: 720 then capped at the remaining 180.
    const first = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 8000 }));
    expect(first.amountCents).toBe(-720);
    const second = adjustmentOf(
      applyRefund(ENTRY, [first], { sourceEventId: 're_2', refundedGrossCents: 8000 }),
    );
    expect(second.amountCents).toBe(-180);
    expect(cumulativeReversedCents([first, second])).toBe(900);
  });

  it('R3: rounding across many small refunds still respects the cap', () => {
    const adjustments: CommissionAdjustment[] = [];
    // 11 refunds of 10% each (needs the cap on the last one).
    for (let i = 0; i < 11; i += 1) {
      const result = applyRefund(ENTRY, adjustments, {
        sourceEventId: `re_${i}`,
        refundedGrossCents: 1000,
      });
      if (result.applied) adjustments.push(result.adjustment);
    }
    expect(cumulativeReversedCents(adjustments)).toBe(900);
  });

  it('replaying the same refund source event id refuses (duplicate guard)', () => {
    const first = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 }));
    expect(applyRefund(ENTRY, [first], { sourceEventId: 're_1', refundedGrossCents: 5000 })).toEqual({
      applied: false,
      reason: 'duplicate_source_event',
    });
  });

  it('R4: append-only — the entry object is never mutated and the adjustment is frozen', () => {
    const snapshot = { ...ENTRY };
    const result = applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 });
    expect(ENTRY).toEqual(snapshot);
    expect(Object.isFrozen(adjustmentOf(result))).toBe(true);
  });

  it('rejects invalid entries', () => {
    expect(() =>
      applyRefund({ ...ENTRY, grossCents: 0 }, [], { sourceEventId: 'x', refundedGrossCents: 1 }),
    ).toThrow(InvalidRefundInputError);
    expect(() =>
      applyRefund({ ...ENTRY, commissionCents: 0 }, [], { sourceEventId: 'x', refundedGrossCents: 1 }),
    ).toThrow(InvalidRefundInputError);
  });
});

describe('R5: applyDisputeLost', () => {
  it('dispute lost → full reversal of the whole commission', () => {
    const result = applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' });
    expect(adjustmentOf(result)).toMatchObject({ kind: 'dispute_reversal', amountCents: -900 });
  });

  it('dispute lost after a partial refund reverses only the remainder', () => {
    const refund = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 }));
    const result = applyDisputeLost(ENTRY, [refund], { sourceEventId: 'dp_1' });
    expect(adjustmentOf(result).amountCents).toBe(-450);
  });

  it('dispute lost after full reversal refuses', () => {
    const full = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 10000 }));
    expect(applyDisputeLost(ENTRY, [full], { sourceEventId: 'dp_1' })).toEqual({
      applied: false,
      reason: 'nothing_left_to_reverse',
    });
  });

  it('replaying the same dispute event refuses', () => {
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' }));
    expect(applyDisputeLost(ENTRY, [lost], { sourceEventId: 'dp_1' })).toEqual({
      applied: false,
      reason: 'duplicate_source_event',
    });
  });
});

describe('R6: applyDisputeReinstatement — restore ONCE, idempotent by source event id', () => {
  it('restores exactly the disputed amount', () => {
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' }));
    const result = applyDisputeReinstatement(ENTRY, [lost], {
      sourceEventId: 'ri_1',
      disputeSourceEventId: 'dp_1',
    });
    expect(adjustmentOf(result)).toMatchObject({
      kind: 'dispute_reinstatement',
      amountCents: 900,
      sourceEventId: 'ri_1',
      disputeSourceEventId: 'dp_1',
    });
  });

  it('restores only the remainder-sized dispute when a refund preceded the dispute', () => {
    const refund = adjustmentOf(applyRefund(ENTRY, [], { sourceEventId: 're_1', refundedGrossCents: 5000 }));
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [refund], { sourceEventId: 'dp_1' }));
    const result = applyDisputeReinstatement(ENTRY, [refund, lost], {
      sourceEventId: 'ri_1',
      disputeSourceEventId: 'dp_1',
    });
    expect(adjustmentOf(result).amountCents).toBe(450);
  });

  it('replaying the same reinstatement event id refuses (idempotent)', () => {
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' }));
    const first = adjustmentOf(
      applyDisputeReinstatement(ENTRY, [lost], { sourceEventId: 'ri_1', disputeSourceEventId: 'dp_1' }),
    );
    expect(
      applyDisputeReinstatement(ENTRY, [lost, first], { sourceEventId: 'ri_1', disputeSourceEventId: 'dp_1' }),
    ).toEqual({ applied: false, reason: 'already_reinstated' });
  });

  it('a SECOND reinstatement for the same dispute under a new event id also refuses (restore ONCE)', () => {
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' }));
    const first = adjustmentOf(
      applyDisputeReinstatement(ENTRY, [lost], { sourceEventId: 'ri_1', disputeSourceEventId: 'dp_1' }),
    );
    expect(
      applyDisputeReinstatement(ENTRY, [lost, first], { sourceEventId: 'ri_2', disputeSourceEventId: 'dp_1' }),
    ).toEqual({ applied: false, reason: 'already_reinstated' });
  });

  it('refuses when no matching dispute reversal exists', () => {
    expect(
      applyDisputeReinstatement(ENTRY, [], { sourceEventId: 'ri_1', disputeSourceEventId: 'dp_missing' }),
    ).toEqual({ applied: false, reason: 'no_matching_dispute_reversal' });
  });

  it('after reinstatement the commission is refundable again (ledger nets correctly)', () => {
    const lost = adjustmentOf(applyDisputeLost(ENTRY, [], { sourceEventId: 'dp_1' }));
    const restored = adjustmentOf(
      applyDisputeReinstatement(ENTRY, [lost], { sourceEventId: 'ri_1', disputeSourceEventId: 'dp_1' }),
    );
    expect(cumulativeReversedCents([lost, restored])).toBe(0);
    const refund = applyRefund(ENTRY, [lost, restored], { sourceEventId: 're_1', refundedGrossCents: 10000 });
    expect(adjustmentOf(refund).amountCents).toBe(-900);
  });
});
