/**
 * Module 1 tests — commissionRules.
 * Pins C1 (all 12 locked rates), C2 (keying by product/cadence/tier only),
 * C3 (15-month initial = ONE annual commission), C4 (annual renewals),
 * C5 (commissionable kinds), C6 (typed refusals).
 */

import { describe, expect, it } from 'vitest';
import {
  COMMISSION_RULE_VERSION_V1,
  UnknownRuleVersionError,
  classifyCommissionableEvent,
  resolveCommission,
  type CommissionEventEvidence,
} from './commissionRules';
import type { Cadence, Product, Tier } from './types';

const NO_PRIOR = new Set<string>();

function paidEvent(overrides: Partial<CommissionEventEvidence> = {}): CommissionEventEvidence {
  return {
    eventId: 'evt_1',
    eventKind: 'first_monthly_payment',
    invoiceStatus: 'paid',
    grossAmountCents: 990,
    isSelfReferral: false,
    isFraudMarked: false,
    alreadyProcessedEventIds: NO_PRIOR,
    ...overrides,
  };
}

describe('C1: rate table v1 — all 12 locked rates', () => {
  const LOCKED_RATES: readonly [Product, Cadence, Tier, number][] = [
    ['home', 'monthly', 'standard', 199],
    ['home', 'monthly', 'gold', 249],
    ['home', 'monthly', 'elite', 299],
    ['home', 'annual', 'standard', 900],
    ['home', 'annual', 'gold', 1400],
    ['home', 'annual', 'elite', 1900],
    ['pro', 'monthly', 'standard', 499],
    ['pro', 'monthly', 'gold', 599],
    ['pro', 'monthly', 'elite', 699],
    ['pro', 'annual', 'standard', 2900],
    ['pro', 'annual', 'gold', 3900],
    ['pro', 'annual', 'elite', 4900],
  ];

  it.each(LOCKED_RATES)('%s %s %s → %d cents', (product, cadence, tier, cents) => {
    const snapshot = resolveCommission('v1', product, cadence, tier);
    expect(snapshot).toEqual({
      ruleVersion: 'v1',
      product,
      cadence,
      tier,
      amountCents: cents,
      currency: 'eur',
    });
  });

  it('returns an immutable snapshot', () => {
    const snapshot = resolveCommission('v1', 'home', 'monthly', 'standard');
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('exposes the v1 version constant', () => {
    expect(COMMISSION_RULE_VERSION_V1).toBe('v1');
  });

  it('throws a typed error for an unknown rule version', () => {
    expect(() => resolveCommission('v2', 'home', 'monthly', 'standard')).toThrow(UnknownRuleVersionError);
    expect(() => resolveCommission('', 'home', 'monthly', 'standard')).toThrow(UnknownRuleVersionError);
  });

  it('is deterministic: repeated resolution yields identical values', () => {
    expect(resolveCommission('v1', 'pro', 'annual', 'elite')).toEqual(
      resolveCommission('v1', 'pro', 'annual', 'elite'),
    );
  });
});

describe('C2/C3/C4: cadence keying — never by monetary variant', () => {
  it('C3: the 15-month initial payment classifies as ONE annual commission', () => {
    const classification = classifyCommissionableEvent(
      paidEvent({ eventKind: 'first_annual_payment', grossAmountCents: 12900 }),
    );
    expect(classification).toEqual({
      commissionable: true,
      eventKind: 'first_annual_payment',
      cadence: 'annual',
    });
  });

  it('C2: launch/founding/standard price variants share the cadence rate (gross does not change the rate key)', () => {
    // Same event kind at three different monetary variants → identical cadence
    // classification → identical resolved rate.
    for (const gross of [4900, 6900, 9900]) {
      const classification = classifyCommissionableEvent(
        paidEvent({ eventKind: 'first_annual_payment', grossAmountCents: gross }),
      );
      expect(classification).toMatchObject({ commissionable: true, cadence: 'annual' });
    }
    const rate = resolveCommission('v1', 'home', 'annual', 'standard');
    expect(rate.amountCents).toBe(900); // one rate regardless of variant
  });

  it('C4: each later 12-month renewal classifies as one annual commission', () => {
    const classification = classifyCommissionableEvent(paidEvent({ eventKind: 'annual_renewal' }));
    expect(classification).toMatchObject({ commissionable: true, cadence: 'annual' });
  });
});

describe('C5: commissionable event kinds', () => {
  it.each([
    ['first_monthly_payment', 'monthly'],
    ['monthly_renewal', 'monthly'],
    ['first_annual_payment', 'annual'],
    ['annual_renewal', 'annual'],
    ['conversion_payment', 'annual'],
  ] as const)('%s → commission at %s cadence', (kind, cadence) => {
    const classification = classifyCommissionableEvent(paidEvent({ eventKind: kind }));
    expect(classification).toEqual({ commissionable: true, eventKind: kind, cadence });
  });

  it('conversion payment commissions ONCE: repeat refused', () => {
    const repeat = classifyCommissionableEvent(
      paidEvent({ eventKind: 'conversion_payment', conversionAlreadyCommissioned: true }),
    );
    expect(repeat).toEqual({ commissionable: false, reason: 'conversion_already_commissioned' });
  });

  it('conversion payment allowed when not previously commissioned (flag false or absent)', () => {
    expect(
      classifyCommissionableEvent(
        paidEvent({ eventKind: 'conversion_payment', conversionAlreadyCommissioned: false }),
      ),
    ).toMatchObject({ commissionable: true });
    expect(classifyCommissionableEvent(paidEvent({ eventKind: 'conversion_payment' }))).toMatchObject({
      commissionable: true,
    });
  });
});

describe('C6: typed refusals', () => {
  it.each(['failed', 'incomplete', 'void', 'unpaid'] as const)(
    '%s invoice → invoice_not_paid',
    (status) => {
      expect(classifyCommissionableEvent(paidEvent({ invoiceStatus: status }))).toEqual({
        commissionable: false,
        reason: 'invoice_not_paid',
      });
    },
  );

  it('zero-value invoice → zero_value_invoice', () => {
    expect(classifyCommissionableEvent(paidEvent({ grossAmountCents: 0 }))).toEqual({
      commissionable: false,
      reason: 'zero_value_invoice',
    });
  });

  it('free partner entitlement → free_partner_entitlement (no invoice needed)', () => {
    expect(
      classifyCommissionableEvent(
        paidEvent({ eventKind: 'free_partner_entitlement', invoiceStatus: 'none', grossAmountCents: 0 }),
      ),
    ).toEqual({ commissionable: false, reason: 'free_partner_entitlement' });
  });

  it('free invite access → free_invite_access', () => {
    expect(
      classifyCommissionableEvent(
        paidEvent({ eventKind: 'free_invite_access', invoiceStatus: 'none', grossAmountCents: 0 }),
      ),
    ).toEqual({ commissionable: false, reason: 'free_invite_access' });
  });

  it('self-referral → self_referral', () => {
    expect(classifyCommissionableEvent(paidEvent({ isSelfReferral: true }))).toEqual({
      commissionable: false,
      reason: 'self_referral',
    });
  });

  it('duplicate event id → duplicate_event', () => {
    expect(
      classifyCommissionableEvent(paidEvent({ alreadyProcessedEventIds: new Set(['evt_1']) })),
    ).toEqual({ commissionable: false, reason: 'duplicate_event' });
  });

  it('fraud-marked → fraud_marked', () => {
    expect(classifyCommissionableEvent(paidEvent({ isFraudMarked: true }))).toEqual({
      commissionable: false,
      reason: 'fraud_marked',
    });
  });

  it('refusal precedence: fraud beats duplicate beats self-referral beats invoice status', () => {
    expect(
      classifyCommissionableEvent(
        paidEvent({
          isFraudMarked: true,
          alreadyProcessedEventIds: new Set(['evt_1']),
          isSelfReferral: true,
          invoiceStatus: 'failed',
        }),
      ),
    ).toEqual({ commissionable: false, reason: 'fraud_marked' });
    expect(
      classifyCommissionableEvent(
        paidEvent({
          alreadyProcessedEventIds: new Set(['evt_1']),
          isSelfReferral: true,
          invoiceStatus: 'failed',
        }),
      ),
    ).toEqual({ commissionable: false, reason: 'duplicate_event' });
    expect(
      classifyCommissionableEvent(paidEvent({ isSelfReferral: true, invoiceStatus: 'failed' })),
    ).toEqual({ commissionable: false, reason: 'self_referral' });
  });

  it('classification results are immutable', () => {
    expect(Object.isFrozen(classifyCommissionableEvent(paidEvent()))).toBe(true);
    expect(Object.isFrozen(classifyCommissionableEvent(paidEvent({ isFraudMarked: true })))).toBe(true);
  });
});
