/**
 * Subscription management service — the client half of Account → Plan i
 * rozliczenia. The panel never computes money: a preview without a Stripe
 * amount is rejected, and every function error maps to a typed reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() =>
  vi.fn<() => Promise<{ data: { session: { access_token: string } | null } }>>(),
);

vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke }, auth: { getSession } },
  isSupabaseConfigured: true,
}));

import {
  cancelScheduledPlanChange,
  cancelSubscriptionAtPeriodEnd,
  confirmPlanChange,
  manageReasonFromCode,
  openBillingPortal,
  previewPlanChange,
  resumeSubscription,
} from './subscriptionManagement';

const SUB = {
  stripeSubscriptionId: 'sub_fake_1',
  status: 'active',
  cancelAtPeriodEnd: true,
  currentPeriodEnd: '2026-10-19T00:00:00.000Z',
};

/** A Supabase FunctionsHttpError carries the function's JSON body on `context`. */
const httpError = (code: string) => ({
  name: 'FunctionsHttpError',
  context: { json: async () => ({ error: code }) },
});

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
});

describe('cancel / resume — one action, one subscription', () => {
  it('cancel posts the cancel action and returns Stripe\'s state', async () => {
    invoke.mockResolvedValue({ data: { ok: true, subscription: SUB, synced: true }, error: null });
    const result = await cancelSubscriptionAtPeriodEnd();
    expect(invoke).toHaveBeenCalledWith('manage-subscription', { body: { action: 'cancel' } });
    expect(result).toEqual({ ok: true, data: { subscription: SUB, synced: true } });
  });

  it('resume posts the resume action — never a checkout, never a new subscription', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, subscription: { ...SUB, cancelAtPeriodEnd: false }, synced: false },
      error: null,
    });
    const result = await resumeSubscription();
    expect(invoke).toHaveBeenCalledWith('manage-subscription', { body: { action: 'resume' } });
    expect(result.ok && result.data.subscription.cancelAtPeriodEnd).toBe(false);
    expect(result.ok && result.data.synced).toBe(false);
  });

  it('typed refusals reach the caller (nothing to resume, already cancelling, declined card)', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError('not_cancelling') });
    expect(await resumeSubscription()).toEqual({ ok: false, reason: 'not_cancelling' });
    invoke.mockResolvedValue({ data: null, error: httpError('already_cancelling') });
    expect(await cancelSubscriptionAtPeriodEnd()).toEqual({ ok: false, reason: 'already_cancelling' });
    invoke.mockResolvedValue({ data: null, error: httpError('payment_failed') });
    expect(await confirmPlanChange('pro_monthly_standard', 1)).toEqual({ ok: false, reason: 'payment_failed' });
  });

  it('a signed-out caller never reaches the function', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await cancelSubscriptionAtPeriodEnd()).toEqual({ ok: false, reason: 'not_signed_in' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('plan change preview — the amount is Stripe\'s or there is no preview', () => {
  it('an immediate upgrade preview carries the amount due today and the proration timestamp to confirm with', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        kind: 'immediate',
        targetOfferKey: 'pro_monthly_standard',
        prorationTimestamp: 1_790_000_000,
        amountDueTodayCents: 600,
        currency: 'eur',
        prorationCents: 600,
        taxCents: 0,
        appliedBalanceCents: 0,
        nextRenewalAt: '2026-10-19T00:00:00.000Z',
        nextAmountCents: 2499,
        resetBillingCycle: false,
      },
      error: null,
    });
    const result = await previewPlanChange('pro_monthly_standard');
    expect(invoke).toHaveBeenCalledWith('manage-subscription', {
      body: { action: 'preview_change', targetOfferKey: 'pro_monthly_standard' },
    });
    expect(result.ok && result.data).toMatchObject({
      kind: 'immediate',
      amountDueTodayCents: 600,
      prorationTimestamp: 1_790_000_000,
      nextAmountCents: 2499,
    });
  });

  it('a preview WITHOUT a Stripe amount is refused — the UI must never invent one', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, kind: 'immediate', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1 },
      error: null,
    });
    expect(await previewPlanChange('pro_monthly_standard')).toEqual({ ok: false, reason: 'failed' });
  });

  it('a downgrade preview is the period-end plan: nothing due today', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        kind: 'scheduled',
        targetOfferKey: 'home_monthly_standard',
        effectiveAt: '2026-10-19T00:00:00.000Z',
        amountDueTodayCents: 0,
        nextAmountCents: 999,
      },
      error: null,
    });
    const result = await previewPlanChange('home_monthly_standard');
    expect(result.ok && result.data).toEqual({
      kind: 'scheduled',
      targetOfferKey: 'home_monthly_standard',
      effectiveAt: '2026-10-19T00:00:00.000Z',
      amountDueTodayCents: 0,
      nextAmountCents: 999,
    });
  });

  it('confirm echoes the preview timestamp; a stale preview is refused by the server', async () => {
    invoke.mockResolvedValue({ data: { ok: true, subscription: SUB, synced: true }, error: null });
    await confirmPlanChange('pro_monthly_standard', 1_790_000_000);
    expect(invoke).toHaveBeenCalledWith('manage-subscription', {
      body: { action: 'confirm_change', targetOfferKey: 'pro_monthly_standard', prorationTimestamp: 1_790_000_000 },
    });
    invoke.mockResolvedValue({ data: null, error: httpError('preview_expired') });
    expect(await confirmPlanChange('pro_monthly_standard', 1)).toEqual({ ok: false, reason: 'preview_expired' });
  });

  it('a scheduled (period-end) confirm carries no proration timestamp — no money moves today', async () => {
    invoke.mockResolvedValue({ data: { ok: true, subscription: SUB, synced: true }, error: null });
    await confirmPlanChange('home_monthly_standard');
    expect(invoke).toHaveBeenCalledWith('manage-subscription', {
      body: { action: 'confirm_change', targetOfferKey: 'home_monthly_standard' },
    });
  });

  it('cancelling a scheduled change posts its own action', async () => {
    invoke.mockResolvedValue({ data: { ok: true, subscription: SUB, synced: true }, error: null });
    await cancelScheduledPlanChange();
    expect(invoke).toHaveBeenCalledWith('manage-subscription', { body: { action: 'cancel_scheduled_change' } });
  });
});

describe('billing portal', () => {
  it('payment-method update deep-links through Stripe and returns to the billing section', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://billing.stripe.com/session/test' }, error: null });
    const result = await openBillingPortal('payment_method_update');
    expect(invoke).toHaveBeenCalledWith('create-portal-session', {
      body: { returnUrl: expect.stringContaining('/account?section=billing'), flow: 'payment_method_update' },
    });
    expect(result).toEqual({ ok: true, url: 'https://billing.stripe.com/session/test' });
  });

  it('a customer without a Stripe mapping gets a typed refusal, not a dead button', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError('no_billing_customer') });
    expect(await openBillingPortal()).toEqual({ ok: false, reason: 'no_billing_customer' });
  });
});

describe('error code vocabulary', () => {
  it('maps every server refusal the panel branches on', () => {
    expect(manageReasonFromCode('unauthorized')).toBe('not_signed_in');
    expect(manageReasonFromCode('no_active_subscription')).toBe('no_subscription');
    expect(manageReasonFromCode('no_billing_customer')).toBe('no_subscription');
    expect(manageReasonFromCode('billing_not_configured')).toBe('unavailable');
    expect(manageReasonFromCode('offer_price_not_configured')).toBe('unavailable');
    expect(manageReasonFromCode('preview_in_future')).toBe('preview_expired');
    expect(manageReasonFromCode('requires_action')).toBe('requires_action');
    expect(manageReasonFromCode('resume_before_changing_plan')).toBe('resume_before_changing_plan');
    expect(manageReasonFromCode('cancel_scheduled_change_first')).toBe('cancel_scheduled_change_first');
    expect(manageReasonFromCode('something_new')).toBe('failed');
    expect(manageReasonFromCode(null)).toBe('failed');
  });
});
