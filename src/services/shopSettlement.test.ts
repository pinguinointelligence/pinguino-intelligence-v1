/**
 * THE settlement authority — shared by the canonical Stripe webhook and by the
 * browser-return reconciliation, so the two cannot drift into separate payment
 * state machines.
 *
 * Owner acceptance condition (2026-08-31): "at least the item subtotal" is not
 * strong enough. A €70, €74 or €100 event must NOT settle a €73.80 order. The
 * order carries an IMMUTABLE `expected_total_cents`, written once by
 * shop-checkout from the numbers handed to the provider, and settlement
 * requires an exact match.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decideShopSettlement,
  type ShopOrderAuthority,
  type ShopSessionFacts,
} from '../../supabase/functions/_shared/shopSettlement.ts';

const ORDER: ShopOrderAuthority = {
  id: 'order-1',
  status: 'pending',
  paidAt: null,
  expectedTotalCents: 7380, // 63.90 items + 9.90 shipping
  expectedCurrency: 'eur',
  sessionId: 'cs_test_1',
};

const SESSION: ShopSessionFacts = {
  orderId: 'order-1',
  sessionId: 'cs_test_1',
  mode: 'payment',
  paymentStatus: 'paid',
  status: 'complete',
  amountTotal: 7380,
  currency: 'eur',
};

const order = (o: Partial<ShopOrderAuthority> = {}) => ({ ...ORDER, ...o });
const session = (s: Partial<ShopSessionFacts> = {}) => ({ ...SESSION, ...s });

describe('shop settlement authority — exact money only', () => {
  it('settles the exact expected total', () => {
    expect(decideShopSettlement(order(), session())).toEqual({ kind: 'settle' });
  });

  it.each([
    ['below the total but above the item subtotal', 7000],
    ['just under', 7379],
    ['just over', 7381],
    ['far over', 10000],
    ['the bare item subtotal', 6390],
  ])('refuses an amount %s', (_label, amountTotal) => {
    const verdict = decideShopSettlement(order(), session({ amountTotal }));
    expect(verdict.kind).toBe('refuse');
    expect((verdict as { note: string }).note).toContain('amount_mismatch');
  });

  it('refuses when the order has no immutable expected total', () => {
    const verdict = decideShopSettlement(order({ expectedTotalCents: null }), session());
    expect(verdict).toEqual({ kind: 'refuse', note: 'shop_order_no_expected_total:order-1' });
  });

  it('refuses a currency that is not the expected one', () => {
    const verdict = decideShopSettlement(order(), session({ currency: 'usd' }));
    expect((verdict as { note: string }).note).toBe('shop_order_currency_mismatch:usd');
  });

  it('refuses a session that is not this order\'s session', () => {
    const verdict = decideShopSettlement(order(), session({ sessionId: 'cs_test_other' }));
    expect((verdict as { note: string }).note).toBe('shop_order_session_mismatch:order-1');
  });

  it('refuses an unexpected checkout mode', () => {
    const verdict = decideShopSettlement(order(), session({ mode: 'subscription' }));
    expect((verdict as { note: string }).note).toBe('shop_order_mode_mismatch:subscription');
  });
});

describe('shop settlement authority — session completion is not payment', () => {
  it('refuses a completed but UNPAID session', () => {
    // Bancontact / EPS / MB WAY / Satispay are enabled on the real Checkout:
    // `checkout.session.completed` can arrive unpaid and settle later.
    const verdict = decideShopSettlement(order(), session({ paymentStatus: 'unpaid' }));
    expect(verdict).toEqual({ kind: 'refuse', note: 'shop_order_not_paid:unpaid' });
  });

  it('settles the same order when the async success arrives', () => {
    expect(decideShopSettlement(order(), session({ paymentStatus: 'paid' })))
      .toEqual({ kind: 'settle' });
  });

  it('refuses a no_payment_required session', () => {
    const verdict = decideShopSettlement(order(), session({ paymentStatus: 'no_payment_required' }));
    expect((verdict as { note: string }).note).toBe('shop_order_not_paid:no_payment_required');
  });
});

describe('shop settlement authority — monotonic state', () => {
  it('expires only a still-pending unpaid order', () => {
    expect(decideShopSettlement(order(), session({ status: 'expired', paymentStatus: 'unpaid' })))
      .toEqual({ kind: 'expire' });
  });

  it.each(['paid', 'refunded', 'cancelled'])('never regresses a %s order', (status) => {
    const verdict = decideShopSettlement(
      order({ status }),
      session({ status: 'expired', paymentStatus: 'unpaid' }),
    );
    expect(verdict.kind).toBe('refuse');
  });

  it('never re-settles an order already paid', () => {
    expect(decideShopSettlement(order({ status: 'paid' }), session()))
      .toEqual({ kind: 'refuse', note: 'shop_order_already_paid' });
  });

  it('refuses an event carrying no session id', () => {
    expect(decideShopSettlement(order(), session({ sessionId: null })))
      .toEqual({ kind: 'refuse', note: 'shop_session_id_missing' });
  });
});

describe('shop settlement authority — both paths converge', () => {
  it('is the single decision the webhook and the return path both call', () => {
    // Structural: if either function stops importing this, they have become
    // two payment state machines again.
    const webhook = readFileSync('supabase/functions/stripe-webhook/dispatch.ts', 'utf8');
    const sync = readFileSync('supabase/functions/shop-order-sync/index.ts', 'utf8');
    for (const source of [webhook, sync]) {
      expect(source).toContain("from '../_shared/shopSettlement.ts'");
      expect(source).toContain('decideShopSettlement(');
    }
  });
});
