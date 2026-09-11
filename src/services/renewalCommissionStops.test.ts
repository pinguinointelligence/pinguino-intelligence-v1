/**
 * H-DASH-11 — renewals stop earning commission once the paid entitlement ends.
 *
 * Nothing has to "switch commission off": it is only ever booked from a PAID
 * invoice. When a subscription ends Stripe stops invoicing; a renewal that is
 * attempted and fails is a payment-failure notice, which books nothing; and an
 * invoice that is not paid, or paid at zero, is refused by the writer itself.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decideCommissionEligibility,
  type InvoiceSnapshot,
} from '../../supabase/functions/stripe-webhook/effects';
import {
  SUPPORTED_WEBHOOK_EVENTS,
  routeWebhookEvent,
} from '../../supabase/functions/stripe-webhook/handlers';

const invoice = (status: string, amountPaidCents: number): InvoiceSnapshot => ({
  id: 'in_test',
  status,
  amountPaidCents,
  customerId: 'cus_test',
  subscriptionId: 'sub_test',
  paymentIntentId: null,
  paidAtEpoch: null,
});

describe('H-DASH-11 — no commission after the paid entitlement ends', () => {
  it('only a paid invoice can book commission: exactly invoice.paid and invoice.payment_succeeded', () => {
    const booking = SUPPORTED_WEBHOOK_EVENTS.filter(
      (type) => routeWebhookEvent(type)?.kind === 'commissionable_payment',
    ).sort();
    expect(booking).toEqual(['invoice.paid', 'invoice.payment_succeeded']);
  });

  it('the end of a subscription books nothing', () => {
    expect(SUPPORTED_WEBHOOK_EVENTS).toContain('customer.subscription.deleted');
    expect(routeWebhookEvent('customer.subscription.deleted')?.kind).not.toBe(
      'commissionable_payment',
    );
  });

  it('a failed renewal books nothing', () => {
    expect(routeWebhookEvent('invoice.payment_failed')?.kind).toBe('payment_failure_notice');
  });

  it('an invoice that is not paid, or paid at zero, is refused by the writer', () => {
    for (const status of ['open', 'draft', 'void', 'uncollectible']) {
      expect(decideCommissionEligibility(invoice(status, 4900)), status).toEqual({
        eligible: false,
        reason: 'invoice_not_paid',
      });
    }
    expect(decideCommissionEligibility(invoice('paid', 0))).toEqual({
      eligible: false,
      reason: 'zero_value_invoice',
    });
  });

  it('the commission writer is reached from one place only — the paid-invoice intent', () => {
    const dispatch = readFileSync(
      new URL('../../supabase/functions/stripe-webhook/dispatch.ts', import.meta.url),
      'utf8',
    );
    expect(dispatch.match(/await applyCommissionablePayment\(/g)).toHaveLength(1);
    const at = dispatch.indexOf('await applyCommissionablePayment(');
    expect(dispatch.lastIndexOf("case '", at)).toBe(
      dispatch.lastIndexOf("case 'commissionable_payment'", at),
    );
  });
});
