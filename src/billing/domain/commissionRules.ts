/**
 * Module 1 — commissionRules: versioned, data-driven commission rate table +
 * commissionable-event classifier.
 *
 * LOCKED RULES implemented here (cited as C1..C6 in code):
 *  C1  Rate table v1 (integer cents, EUR):
 *        HOME monthly  std 199 / gold 249 / elite 299
 *        HOME annual   std 900 / gold 1400 / elite 1900
 *        PRO  monthly  std 499 / gold 599 / elite 699
 *        PRO  annual   std 2900 / gold 3900 / elite 4900
 *  C2  Commission is keyed by (product, cadence, tier) — NEVER by monetary
 *      variant: launch/founding/standard price variants share the cadence rate.
 *  C3  The 15-month initial period classifies as ONE annual commission.
 *  C4  Each later 12-month renewal = one annual commission.
 *  C5  Commissionable events: first monthly payment, monthly renewal, first
 *      annual-or-15-month payment, annual renewal, conversion payment
 *      (annual, once).
 *  C6  NO commission (typed refusal) for: failed/incomplete/void/unpaid
 *      invoices, zero-value invoices, free partner entitlements, free invite
 *      access, self-referrals, duplicate events, fraud-marked events.
 *
 * Pure + deterministic. No IO, no Date.now(), integer cents only.
 */

import {
  BillingDomainError,
  frozen,
  type Cadence,
  type Currency,
  type Product,
  type Tier,
} from './types';

export type CommissionRuleVersion = 'v1';

export const COMMISSION_RULE_VERSION_V1: CommissionRuleVersion = 'v1';

/** Immutable resolved rate snapshot returned by resolveCommission. */
export interface CommissionRateSnapshot {
  readonly ruleVersion: CommissionRuleVersion;
  readonly product: Product;
  readonly cadence: Cadence;
  readonly tier: Tier;
  readonly amountCents: number;
  readonly currency: Currency;
}

/**
 * C1: rate table v1. Data-driven and versioned so future versions append a
 * new table instead of mutating this one. Keyed strictly by
 * (product, cadence, tier) — C2: monetary variants (launch/founding/standard
 * prices) intentionally do NOT appear in the key.
 */
const RATE_TABLE_V1: Readonly<Record<Product, Readonly<Record<Cadence, Readonly<Record<Tier, number>>>>>> = frozen({
  home: frozen({
    monthly: frozen({ standard: 199, gold: 249, elite: 299 }),
    annual: frozen({ standard: 900, gold: 1400, elite: 1900 }),
  }),
  pro: frozen({
    monthly: frozen({ standard: 499, gold: 599, elite: 699 }),
    annual: frozen({ standard: 2900, gold: 3900, elite: 4900 }),
  }),
});

const RATE_TABLES: Readonly<Record<CommissionRuleVersion, typeof RATE_TABLE_V1>> = frozen({
  v1: RATE_TABLE_V1,
});

export class UnknownRuleVersionError extends BillingDomainError {
  constructor(version: string) {
    super('unknown_rule_version', `unknown commission rule version '${version}'`);
    this.name = 'UnknownRuleVersionError';
  }
}

export class UnknownRateKeyError extends BillingDomainError {
  constructor(product: string, cadence: string, tier: string) {
    super('unknown_rate_key', `no rate for (${product}, ${cadence}, ${tier})`);
    this.name = 'UnknownRateKeyError';
  }
}

/**
 * Resolve the commission rate for (product, cadence, tier) under a rule
 * version. Returns an immutable snapshot (C1/C2). The `tierSnapshot` argument
 * is the effective tier taken from THAT month's tier snapshot (see
 * tierSnapshots.ts — no retroactive tier changes).
 */
export function resolveCommission(
  ruleVersion: string,
  product: Product,
  cadence: Cadence,
  tierSnapshot: Tier,
): CommissionRateSnapshot {
  if (!(ruleVersion in RATE_TABLES)) {
    throw new UnknownRuleVersionError(ruleVersion);
  }
  const table = RATE_TABLES[ruleVersion as CommissionRuleVersion];
  const amountCents = table[product]?.[cadence]?.[tierSnapshot];
  if (typeof amountCents !== 'number') {
    throw new UnknownRateKeyError(product, cadence, tierSnapshot);
  }
  return frozen({
    ruleVersion: ruleVersion as CommissionRuleVersion,
    product,
    cadence,
    tier: tierSnapshot,
    amountCents,
    currency: 'eur' as const,
  });
}

// ---------------------------------------------------------------------------
// Commissionable-event classifier
// ---------------------------------------------------------------------------

/**
 * C5: payment-event kinds that CAN earn commission.
 *  - first_monthly_payment      → one monthly commission
 *  - monthly_renewal            → one monthly commission
 *  - first_annual_payment       → one annual commission; C3: the 15-month
 *                                 initial period is exactly this kind (ONE
 *                                 annual commission, never monthly + extras)
 *  - annual_renewal             → C4: one annual commission per 12-month renewal
 *  - conversion_payment         → annual commission, ONCE per conversion
 * Non-payment grant kinds that can never earn commission (C6):
 *  - free_partner_entitlement, free_invite_access
 */
export type CommissionableEventKind =
  | 'first_monthly_payment'
  | 'monthly_renewal'
  | 'first_annual_payment'
  | 'annual_renewal'
  | 'conversion_payment';

export type NonCommissionableGrantKind = 'free_partner_entitlement' | 'free_invite_access';

export type EventKind = CommissionableEventKind | NonCommissionableGrantKind;

/** Invoice statuses as evidence. `none` = no invoice exists (free grants). */
export type InvoiceStatus = 'paid' | 'failed' | 'incomplete' | 'void' | 'unpaid' | 'none';

/** C6: typed refusal reasons (checked in this documented precedence order). */
export type CommissionRefusalReason =
  | 'fraud_marked'
  | 'duplicate_event'
  | 'self_referral'
  | 'free_partner_entitlement'
  | 'free_invite_access'
  | 'invoice_not_paid'
  | 'zero_value_invoice'
  | 'conversion_already_commissioned';

export interface CommissionEventEvidence {
  /** Stable unique id of the source event (e.g. Stripe event/invoice id). */
  readonly eventId: string;
  readonly eventKind: EventKind;
  readonly invoiceStatus: InvoiceStatus;
  /** Gross invoice amount in integer cents (0 for free grants). */
  readonly grossAmountCents: number;
  /** True when the attributed partner is the paying user (attribution.ts decides this). */
  readonly isSelfReferral: boolean;
  /** True when the event/customer is fraud-marked. */
  readonly isFraudMarked: boolean;
  /** Event ids already classified as commissionable — duplicate guard input. */
  readonly alreadyProcessedEventIds: ReadonlySet<string>;
  /**
   * C5: conversion earns commission ONCE. True when a commission was already
   * granted for this subscription's conversion.
   */
  readonly conversionAlreadyCommissioned?: boolean;
}

export type CommissionClassification =
  | {
      readonly commissionable: true;
      readonly eventKind: CommissionableEventKind;
      /** Cadence used to key the rate lookup (C2/C3/C4). */
      readonly cadence: Cadence;
    }
  | {
      readonly commissionable: false;
      readonly reason: CommissionRefusalReason;
    };

const CADENCE_BY_KIND: Readonly<Record<CommissionableEventKind, Cadence>> = frozen({
  first_monthly_payment: 'monthly',
  monthly_renewal: 'monthly',
  // C3: 15-month initial period = ONE annual commission.
  first_annual_payment: 'annual',
  // C4: each later 12-month renewal = one annual commission.
  annual_renewal: 'annual',
  // C5: conversion payment commissions at the annual rate, once.
  conversion_payment: 'annual',
});

/**
 * C5/C6: classify a payment/grant event. Refusals are checked in a fixed,
 * documented precedence order (fraud → duplicate → self-referral → free
 * grants → invoice status → zero value → conversion repeat) so results are
 * deterministic when multiple refusal conditions hold at once.
 */
export function classifyCommissionableEvent(evidence: CommissionEventEvidence): CommissionClassification {
  if (evidence.isFraudMarked) {
    return frozen({ commissionable: false as const, reason: 'fraud_marked' as const });
  }
  if (evidence.alreadyProcessedEventIds.has(evidence.eventId)) {
    return frozen({ commissionable: false as const, reason: 'duplicate_event' as const });
  }
  if (evidence.isSelfReferral) {
    return frozen({ commissionable: false as const, reason: 'self_referral' as const });
  }
  if (evidence.eventKind === 'free_partner_entitlement' || evidence.eventKind === 'free_invite_access') {
    // C6: free entitlements never create commission (they also never create
    // Stripe objects — see inviteCodes.ts grant spec).
    return frozen({ commissionable: false as const, reason: evidence.eventKind });
  }
  if (evidence.invoiceStatus !== 'paid') {
    return frozen({ commissionable: false as const, reason: 'invoice_not_paid' as const });
  }
  if (evidence.grossAmountCents <= 0) {
    return frozen({ commissionable: false as const, reason: 'zero_value_invoice' as const });
  }
  if (evidence.eventKind === 'conversion_payment' && evidence.conversionAlreadyCommissioned === true) {
    return frozen({ commissionable: false as const, reason: 'conversion_already_commissioned' as const });
  }
  return frozen({
    commissionable: true as const,
    eventKind: evidence.eventKind,
    cadence: CADENCE_BY_KIND[evidence.eventKind],
  });
}
