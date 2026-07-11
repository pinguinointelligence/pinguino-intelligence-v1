/**
 * Module 5 tests — payoutNetting.
 * Pins P1 (gross + adjustments), P2 (threshold 2500 default; 2499/2500/2501
 * boundaries; below-threshold carry), P3 (negative carry blocks payout),
 * P4 (zero net → no transfer), P5 (immutable line), P6 (deterministic
 * idempotency key), P7 (lifecycle state machine, illegal transitions throw).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYOUT_THRESHOLD_CENTS,
  IllegalCommissionTransitionError,
  LEGAL_COMMISSION_TRANSITIONS,
  assertCommissionTransition,
  buildPayoutIdempotencyKey,
  canTransitionCommission,
  computePartnerBatchLine,
  type CommissionState,
  type PartnerBatchInput,
} from './payoutNetting';
import { BillingDomainError, InvalidCentsError } from './types';

function input(overrides: Partial<PartnerBatchInput> = {}): PartnerBatchInput {
  return {
    partnerId: 'partner_1',
    currency: 'eur',
    eligibleEntries: [],
    adjustments: [],
    ...overrides,
  };
}

function entries(...amounts: number[]): PartnerBatchInput['eligibleEntries'] {
  return amounts.map((amountCents, i) => ({ entryId: `ce_${i}`, amountCents }));
}

function adjustments(...amounts: number[]): PartnerBatchInput['adjustments'] {
  return amounts.map((amountCents, i) => ({ adjustmentId: `adj_${i}`, amountCents }));
}

describe('P1/P2/P3/P4/P5: computePartnerBatchLine', () => {
  it('P2: default threshold is 2500 cents (EUR 25)', () => {
    expect(DEFAULT_PAYOUT_THRESHOLD_CENTS).toBe(2500);
  });

  it('P1: sums entries and applies negative adjustments', () => {
    const line = computePartnerBatchLine(
      input({ eligibleEntries: entries(2000, 1500), adjustments: adjustments(-400) }),
    );
    expect(line).toMatchObject({
      eligibleGrossCents: 3500,
      adjustmentsCents: -400,
      netPayableCents: 3100,
      thresholdMet: true,
      carryForwardCents: 0,
    });
  });

  it('P2 boundary: net 2499 → NO transfer, positive balance carries forward untouched', () => {
    const line = computePartnerBatchLine(input({ eligibleEntries: entries(2499) }));
    expect(line).toMatchObject({ netPayableCents: 0, thresholdMet: false, carryForwardCents: 2499 });
  });

  it('P2 boundary: net 2500 → transfer', () => {
    const line = computePartnerBatchLine(input({ eligibleEntries: entries(2500) }));
    expect(line).toMatchObject({ netPayableCents: 2500, thresholdMet: true, carryForwardCents: 0 });
  });

  it('P2 boundary: net 2501 → transfer', () => {
    const line = computePartnerBatchLine(input({ eligibleEntries: entries(2501) }));
    expect(line).toMatchObject({ netPayableCents: 2501, thresholdMet: true, carryForwardCents: 0 });
  });

  it('P2: carried-forward positive balance accumulates into the next batch', () => {
    const first = computePartnerBatchLine(input({ eligibleEntries: entries(1500) }));
    expect(first.carryForwardCents).toBe(1500);
    const second = computePartnerBatchLine(
      input({ eligibleEntries: entries(1200), carryInCents: first.carryForwardCents }),
    );
    expect(second).toMatchObject({ netPayableCents: 2700, thresholdMet: true, carryForwardCents: 0 });
  });

  it('P3: negative net carries forward and blocks payout', () => {
    const line = computePartnerBatchLine(
      input({ eligibleEntries: entries(1000), adjustments: adjustments(-4000) }),
    );
    expect(line).toMatchObject({ netPayableCents: 0, thresholdMet: false, carryForwardCents: -3000 });
  });

  it('P3: negative carry-in blocks until net > 0 AND ≥ threshold', () => {
    const belowAfterDebt = computePartnerBatchLine(
      input({ eligibleEntries: entries(3000), carryInCents: -1000 }),
    );
    expect(belowAfterDebt).toMatchObject({ netPayableCents: 0, thresholdMet: false, carryForwardCents: 2000 });
    const clearsDebt = computePartnerBatchLine(
      input({ eligibleEntries: entries(3500), carryInCents: -1000 }),
    );
    expect(clearsDebt).toMatchObject({ netPayableCents: 2500, thresholdMet: true, carryForwardCents: 0 });
  });

  it('P4: net zero → no transfer, nothing carried', () => {
    const line = computePartnerBatchLine(
      input({ eligibleEntries: entries(1000), adjustments: adjustments(-1000) }),
    );
    expect(line).toMatchObject({ netPayableCents: 0, thresholdMet: false, carryForwardCents: 0 });
  });

  it('empty batch → all zero, no transfer', () => {
    const line = computePartnerBatchLine(input());
    expect(line).toMatchObject({
      eligibleGrossCents: 0,
      adjustmentsCents: 0,
      carryInCents: 0,
      netPayableCents: 0,
      thresholdMet: false,
      carryForwardCents: 0,
    });
  });

  it('threshold is configurable', () => {
    const line = computePartnerBatchLine(input({ eligibleEntries: entries(500) }), { thresholdCents: 500 });
    expect(line).toMatchObject({ netPayableCents: 500, thresholdMet: true });
  });

  it('positive adjustments (reinstatements) are applied too', () => {
    const line = computePartnerBatchLine(
      input({ eligibleEntries: entries(2000), adjustments: adjustments(-900, 900) }),
    );
    expect(line).toMatchObject({ adjustmentsCents: 0, netPayableCents: 0, carryForwardCents: 2000 });
  });

  it('P5: the batch line is immutable', () => {
    expect(Object.isFrozen(computePartnerBatchLine(input()))).toBe(true);
  });

  it('deterministic: identical inputs → deep-equal lines', () => {
    const a = computePartnerBatchLine(input({ eligibleEntries: entries(2000), carryInCents: 700 }));
    const b = computePartnerBatchLine(input({ eligibleEntries: entries(2000), carryInCents: 700 }));
    expect(a).toEqual(b);
  });

  it('rejects non-integer or negative entry amounts', () => {
    expect(() => computePartnerBatchLine(input({ eligibleEntries: entries(10.5) }))).toThrow(InvalidCentsError);
    expect(() => computePartnerBatchLine(input({ eligibleEntries: entries(-100) }))).toThrow(InvalidCentsError);
    expect(() => computePartnerBatchLine(input({ adjustments: adjustments(1.5) }))).toThrow(InvalidCentsError);
  });
});

describe('P6: buildPayoutIdempotencyKey', () => {
  it('builds the deterministic key batchMonth+partnerId+currency+mode', () => {
    expect(
      buildPayoutIdempotencyKey({ batchMonth: '2026-07', partnerId: 'partner_1', currency: 'eur', mode: 'live' }),
    ).toBe('payout:2026-07:partner_1:eur:live');
  });

  it('same logical batch always produces the same key', () => {
    const parts = { batchMonth: '2026-07', partnerId: 'p1', currency: 'eur' as const, mode: 'live' as const };
    expect(buildPayoutIdempotencyKey(parts)).toBe(buildPayoutIdempotencyKey(parts));
  });

  it('any differing component produces a different key', () => {
    const base = { batchMonth: '2026-07', partnerId: 'p1', currency: 'eur' as const, mode: 'live' as const };
    const key = buildPayoutIdempotencyKey(base);
    expect(buildPayoutIdempotencyKey({ ...base, batchMonth: '2026-08' })).not.toBe(key);
    expect(buildPayoutIdempotencyKey({ ...base, partnerId: 'p2' })).not.toBe(key);
    expect(buildPayoutIdempotencyKey({ ...base, mode: 'dry_run' })).not.toBe(key);
  });

  it('rejects malformed month keys and partner ids', () => {
    expect(() =>
      buildPayoutIdempotencyKey({ batchMonth: '2026-7', partnerId: 'p1', currency: 'eur', mode: 'live' }),
    ).toThrow(BillingDomainError);
    expect(() =>
      buildPayoutIdempotencyKey({ batchMonth: '2026-07', partnerId: '', currency: 'eur', mode: 'live' }),
    ).toThrow(BillingDomainError);
    expect(() =>
      buildPayoutIdempotencyKey({ batchMonth: '2026-07', partnerId: 'p:1', currency: 'eur', mode: 'live' }),
    ).toThrow(BillingDomainError);
  });
});

describe('P7: commission lifecycle state machine', () => {
  const HAPPY_PATH: readonly CommissionState[] = [
    'pending_payment_confirmation',
    'earned',
    'held',
    'eligible',
    'batched',
    'transferred',
    'bank_payout_pending',
    'paid',
  ];

  it('the full happy path is legal end to end', () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i += 1) {
      const from = HAPPY_PATH[i] as CommissionState;
      const to = HAPPY_PATH[i + 1] as CommissionState;
      expect(canTransitionCommission(from, to)).toBe(true);
      expect(assertCommissionTransition(from, to)).toBe(to);
    }
  });

  it('paid, reversed and offset are terminal', () => {
    expect(LEGAL_COMMISSION_TRANSITIONS.paid).toEqual([]);
    expect(LEGAL_COMMISSION_TRANSITIONS.reversed).toEqual([]);
    expect(LEGAL_COMMISSION_TRANSITIONS.offset).toEqual([]);
  });

  it.each([
    ['earned', 'reversed'],
    ['earned', 'partially_reversed'],
    ['held', 'reversed'],
    ['eligible', 'offset'],
    ['batched', 'reversed'],
    ['partially_reversed', 'eligible'],
    ['partially_reversed', 'reversed'],
    ['transferred', 'failed'],
    ['bank_payout_pending', 'failed'],
    ['failed', 'eligible'],
    ['failed', 'manual_review'],
    ['manual_review', 'eligible'],
    ['manual_review', 'reversed'],
    ['pending_payment_confirmation', 'failed'],
  ] as const)('edge %s → %s is legal', (from, to) => {
    expect(canTransitionCommission(from, to)).toBe(true);
  });

  it.each([
    ['pending_payment_confirmation', 'held'],
    ['pending_payment_confirmation', 'paid'],
    ['earned', 'eligible'], // must pass through held
    ['earned', 'paid'],
    ['held', 'batched'], // must pass through eligible
    ['eligible', 'transferred'], // must pass through batched
    ['batched', 'bank_payout_pending'], // must pass through transferred
    ['transferred', 'paid'], // must pass through bank_payout_pending
    ['paid', 'reversed'],
    ['paid', 'earned'],
    ['reversed', 'earned'],
    ['offset', 'eligible'],
  ] as const)('illegal transition %s → %s throws typed error', (from, to) => {
    expect(() => assertCommissionTransition(from as CommissionState, to as CommissionState)).toThrow(
      IllegalCommissionTransitionError,
    );
  });

  it('typed error carries from/to/code', () => {
    try {
      assertCommissionTransition('paid', 'earned');
      expect.unreachable('should have thrown');
    } catch (error) {
      const typed = error as IllegalCommissionTransitionError;
      expect(typed).toBeInstanceOf(IllegalCommissionTransitionError);
      expect(typed.code).toBe('illegal_commission_transition');
      expect(typed.from).toBe('paid');
      expect(typed.to).toBe('earned');
    }
  });

  it('exhaustive pin: exactly 39 legal transitions out of 169 ordered pairs', () => {
    const states = Object.keys(LEGAL_COMMISSION_TRANSITIONS) as CommissionState[];
    expect(states).toHaveLength(13);
    let legal = 0;
    for (const from of states) {
      for (const to of states) {
        if (canTransitionCommission(from, to)) {
          legal += 1;
        } else {
          expect(() => assertCommissionTransition(from, to)).toThrow(IllegalCommissionTransitionError);
        }
      }
    }
    expect(legal).toBe(39);
  });

  it('every legal target is itself a known state and no state transitions to itself', () => {
    const states = new Set(Object.keys(LEGAL_COMMISSION_TRANSITIONS));
    for (const [from, targets] of Object.entries(LEGAL_COMMISSION_TRANSITIONS)) {
      for (const to of targets) {
        expect(states.has(to)).toBe(true);
        expect(to).not.toBe(from);
      }
    }
  });
});
