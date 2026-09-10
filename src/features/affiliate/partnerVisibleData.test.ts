/// <reference types="node" />
/**
 * D-LINK-04 / E-REV-03 — what a partner may see about customers.
 *
 * The workspace RPC is already careful: everything about customers is an
 * AGGREGATE. `paidCustomers` is a count, `uniqueVisitors` counts distinct
 * salted hashes, and no name, email or user id is returned anywhere. The leak
 * was on the rendering side — the commissions table printed raw contract values
 * and the raw Stripe invoice id.
 *
 * These guards protect the page, because the RPC being careful is worth nothing
 * if the page prints something the RPC never intended to be shown.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMMISSION_CADENCE_COPY,
  COMMISSION_PRODUCT_COPY,
  COMMISSION_STATUS_COPY,
  PAYOUT_STATUS_COPY,
  commissionAmountLabel,
  commissionStatusCopy,
} from './commissionDisplay';

const partnerPage = readFileSync(
  new URL('../../pages/community/PartnerPage.tsx', import.meta.url),
  'utf8',
);

describe('E-REV-03: the partner reads customer copy, never raw codes', () => {
  it('the raw Stripe invoice id is gone from the page', () => {
    // Not shortened, not masked — removed. It identifies a specific customer's
    // invoice, means nothing to the partner, and the row is already identified
    // by its date, plan and amount.
    expect(partnerPage).not.toContain('row.invoiceId');
    expect(partnerPage).not.toMatch(/'Invoice'/);
  });

  it('no contract value is printed straight into a cell', () => {
    for (const raw of ['String(row.status)', 'String(row.product)', 'String(row.cadence)']) {
      expect(partnerPage, `${raw} must go through the display map`).not.toContain(raw);
    }
  });

  it('a reversal reads as money going out, with a minus', () => {
    // E-REV-03's own example: "Zwrot płatności · −€4.99".
    expect(COMMISSION_STATUS_COPY.reversed.label).toBe('Zwrot płatności');
    expect(COMMISSION_STATUS_COPY.reversed.negative).toBe(true);
    expect(commissionAmountLabel(499, 'reversed', (c) => `€${(c / 100).toFixed(2)}`)).toBe(
      '−€4.99',
    );
    // …and an earning never gets a minus.
    expect(commissionAmountLabel(499, 'paid', (c) => `€${(c / 100).toFixed(2)}`)).toBe('€4.99');
  });

  it('an amount stored negative still renders as one minus, not two', () => {
    expect(commissionAmountLabel(-499, 'reversed', (c) => `€${(c / 100).toFixed(2)}`)).toBe(
      '−€4.99',
    );
  });

  it('every canonical database value has copy', () => {
    // The CHECK constraints allow exactly these. A value the map has not been
    // taught must never reach a partner as a raw string.
    expect(Object.keys(COMMISSION_STATUS_COPY).sort()).toEqual([
      'eligible',
      'held',
      'paid',
      'reversed',
    ]);
    expect(Object.keys(COMMISSION_PRODUCT_COPY).sort()).toEqual([
      'home',
      'pro',
      'shop_starter_pack',
    ]);
    expect(Object.keys(COMMISSION_CADENCE_COPY).sort()).toEqual([
      'annual',
      'monthly',
      'one_off',
    ]);
  });

  it('the payouts list also reads as copy — a second raw render lived there', () => {
    // `skipped_negative_balance` shown raw tells a partner nothing and alarms
    // them. The three skipped_* states are ordinary, not failures.
    expect(partnerPage).toContain('payoutStatusCopy(row.status)');
    expect(Object.keys(PAYOUT_STATUS_COPY).sort()).toEqual([
      'failed',
      'paid',
      'pending',
      'processing',
      'skipped_below_threshold',
      'skipped_negative_balance',
      'skipped_not_payable',
    ]);
    for (const copy of Object.values(PAYOUT_STATUS_COPY)) {
      expect(copy.label).not.toMatch(/_|skipped/i);
      expect(copy.help.length).toBeGreaterThan(0);
    }
  });

  it('an unknown value degrades to a dash instead of leaking', () => {
    expect(commissionStatusCopy('some_new_state_nobody_taught_us').label).toBe('—');
  });
});

describe('D-LINK-04: no customer PII in partner-visible data', () => {
  const FORBIDDEN: readonly [RegExp, string][] = [
    [/row\.(customerEmail|email)\b/i, 'customer email'],
    [/row\.(customerName|fullName)\b/i, 'customer name'],
    [/row\.userId\b/i, 'customer user id'],
    [/visitor_hash|visitorHash/i, 'raw visitor hash'],
    [/stripe_customer|customerId/i, 'Stripe customer id'],
  ];

  it('the partner page renders none of them', () => {
    for (const [pattern, what] of FORBIDDEN) {
      expect(partnerPage, `partner page must not render ${what}`).not.toMatch(pattern);
    }
  });
});
