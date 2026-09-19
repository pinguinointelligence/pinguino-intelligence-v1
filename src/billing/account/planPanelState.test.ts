/**
 * Account → Plan i rozliczenia — pure state derivation.
 *
 * Every date the panel shows is copied from the authority row (never
 * computed), the status vocabulary is closed, and `paidAccessActive` agrees
 * with the SQL paid-access predicate + the webhook entitlement mirror.
 */
import { describe, expect, it } from 'vitest';
import type { CustomerSubscriptionRow } from '@/services/billing';
import { deriveBillingPlanState, paidAccessFromRow, pickPanelRow } from './planPanelState';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const PERIOD_END = '2026-10-19T00:00:00.000Z';
const PAST_END = '2026-09-01T00:00:00.000Z';

const row = (over: Partial<CustomerSubscriptionRow> = {}): CustomerSubscriptionRow => ({
  stripe_subscription_id: 'sub_fake_1',
  offer_key: 'home_monthly_standard',
  product: 'home',
  cadence: 'monthly',
  status: 'active',
  current_period_start: '2026-09-19T00:00:00.000Z',
  current_period_end: PERIOD_END,
  cancel_at_period_end: false,
  ended_at: null,
  cancelled_at: null,
  scheduled_offer_key: null,
  scheduled_change_at: null,
  ...over,
});

describe('no plan', () => {
  it('no rows → none, only „Wybierz plan” actions, no paid access', () => {
    const state = deriveBillingPlanState([], NOW);
    expect(state.status).toBe('none');
    expect(state.paidAccessActive).toBe(false);
    expect(state.actions).toMatchObject({ choosePlan: true, renew: false, cancel: false, upgradeToPro: false });
    expect(state.renewsAt).toBeNull();
  });
});

describe('active HOME (A. new purchase → auto-renew ON)', () => {
  it('shows plan, cadence, catalog price and the Stripe renewal date; offers cancel + „Przejdź na PRO”', () => {
    const state = deriveBillingPlanState([row()], NOW);
    expect(state).toMatchObject({
      status: 'active',
      product: 'home',
      cadence: 'monthly',
      offerKey: 'home_monthly_standard',
      amountCents: 999,
      priceLabel: '9,99 € / miesiąc',
      renewsAt: PERIOD_END,
      accessUntil: null,
      expiredAt: null,
      scheduled: null,
      paidAccessActive: true,
    });
    expect(state.actions).toMatchObject({
      cancel: true,
      resume: false,
      upgradeToPro: true,
      downgradeToHome: false,
      changeCadence: true,
      renew: false,
      choosePlan: false,
    });
  });

  it('yearly HOME shows the yearly catalog price', () => {
    const state = deriveBillingPlanState([row({ offer_key: 'home_yearly_standard', cadence: 'annual' })], NOW);
    expect(state.priceLabel).toBe('49 € / rok');
    expect(state.cadence).toBe('annual');
  });
});

describe('active PRO', () => {
  it('never offers „Przejdź na PRO”; offers „Zmień na HOME”, cadence change, cancel', () => {
    const state = deriveBillingPlanState([row({ offer_key: 'pro_monthly_standard', product: 'pro' })], NOW);
    expect(state.status).toBe('active');
    expect(state.priceLabel).toBe('24,99 € / miesiąc');
    expect(state.actions).toMatchObject({ upgradeToPro: false, downgradeToHome: true, changeCadence: true, cancel: true });
  });
});

describe('B. cancel at period end', () => {
  it('HOME stays active with „Dostęp do” = Stripe current_period_end, no renewal, only „Wznów”', () => {
    const state = deriveBillingPlanState([row({ cancel_at_period_end: true, cancelled_at: '2026-09-25T10:00:00.000Z' })], NOW);
    expect(state).toMatchObject({
      status: 'cancelling',
      product: 'home',
      accessUntil: PERIOD_END,
      renewsAt: null,
      paidAccessActive: true,
    });
    expect(state.actions).toMatchObject({ resume: true, cancel: false, upgradeToPro: false, renew: false });
  });

  it('H. a cancelled plan whose date has passed (deletion event still in flight) is expired and unpaid', () => {
    const state = deriveBillingPlanState([row({ product: 'pro', offer_key: 'pro_monthly_standard', cancel_at_period_end: true, current_period_end: PAST_END })], NOW);
    expect(state.status).toBe('expired');
    expect(state.paidAccessActive).toBe(false);
    expect(state.expiredAt).toBe(PAST_END);
    expect(state.actions.renew).toBe(true);
  });
});

describe('C. cancel → resume (same period)', () => {
  it('the resumed row is plain active again with the ORIGINAL renewal date', () => {
    const cancelled = deriveBillingPlanState([row({ cancel_at_period_end: true })], NOW);
    const resumed = deriveBillingPlanState([row({ cancel_at_period_end: false })], NOW);
    expect(cancelled.accessUntil).toBe(PERIOD_END);
    expect(resumed.status).toBe('active');
    expect(resumed.renewsAt).toBe(PERIOD_END);
    expect(resumed.stripeSubscriptionId).toBe(cancelled.stripeSubscriptionId); // no second subscription
  });
});

describe('D. expired plan', () => {
  it('a canceled row → expired with the Stripe ended_at, „Odnów” action, account still usable (no throw)', () => {
    const state = deriveBillingPlanState(
      [row({ status: 'canceled', ended_at: PAST_END, current_period_end: PAST_END, cancelled_at: '2026-08-20T00:00:00.000Z' })],
      NOW,
    );
    expect(state).toMatchObject({ status: 'expired', product: 'home', expiredAt: PAST_END, paidAccessActive: false });
    expect(state.actions).toMatchObject({ renew: true, choosePlan: false, cancel: false, resume: false });
  });

  it('after renewing, the NEW active row wins over the old expired one (real transaction date, no back-dating)', () => {
    const state = deriveBillingPlanState(
      [
        row({ stripe_subscription_id: 'sub_old', status: 'canceled', ended_at: PAST_END, current_period_end: PAST_END }),
        row({ stripe_subscription_id: 'sub_new', current_period_start: '2026-09-25T12:00:00.000Z', current_period_end: '2026-10-25T12:00:00.000Z' }),
      ],
      NOW,
    );
    expect(state.status).toBe('active');
    expect(state.stripeSubscriptionId).toBe('sub_new');
    expect(state.renewsAt).toBe('2026-10-25T12:00:00.000Z');
  });
});

describe('G. scheduled downgrade PRO → HOME (next period)', () => {
  it('PRO stays active until period end; the panel names the next offer and its Stripe start date', () => {
    const state = deriveBillingPlanState(
      [row({ offer_key: 'pro_yearly_standard', product: 'pro', cadence: 'annual', scheduled_offer_key: 'home_yearly_standard', scheduled_change_at: PERIOD_END })],
      NOW,
    );
    expect(state).toMatchObject({
      status: 'scheduled_change',
      product: 'pro',
      renewsAt: PERIOD_END,
      paidAccessActive: true,
      scheduled: { offerKey: 'home_yearly_standard', product: 'home', cadence: 'annual', at: PERIOD_END },
    });
    // Stripe refuses a direct change on a schedule-managed subscription, so the
    // panel offers „Anuluj zmianę planu” first — never a dead upgrade button.
    expect(state.actions).toMatchObject({
      cancelScheduledChange: true,
      downgradeToHome: false,
      upgradeToPro: false,
      changeCadence: false,
      cancel: true,
    });
  });
});

describe('I. payment failure', () => {
  it('past_due inside the period: payment_problem (NOT expired), paid access kept in grace, „Zaktualizuj metodę płatności”', () => {
    const state = deriveBillingPlanState([row({ status: 'past_due' })], NOW);
    expect(state.status).toBe('payment_problem');
    expect(state.paidAccessActive).toBe(true);
    expect(state.renewsAt).toBe(PERIOD_END);
    expect(state.actions).toMatchObject({ updatePaymentMethod: true, cancel: true, renew: false });
  });

  it('past_due after the period end: still a payment problem to fix, but no paid access', () => {
    const state = deriveBillingPlanState([row({ status: 'past_due', current_period_end: PAST_END })], NOW);
    expect(state.status).toBe('payment_problem');
    expect(state.paidAccessActive).toBe(false);
  });

  it('unpaid / incomplete are payment problems, never fabricated cancellations', () => {
    for (const status of ['unpaid', 'incomplete']) {
      const state = deriveBillingPlanState([row({ status })], NOW);
      expect(state.status, status).toBe('payment_problem');
      expect(state.expiredAt, status).toBeNull();
    }
  });
});

describe('paidAccessActive — lockstep with the paid-access authority', () => {
  it('active/trialing paid; past_due paid inside the period; cancelled-at-period-end paid until the date', () => {
    expect(paidAccessFromRow(row(), NOW)).toBe(true);
    expect(paidAccessFromRow(row({ status: 'trialing' }), NOW)).toBe(true);
    expect(paidAccessFromRow(row({ status: 'past_due' }), NOW)).toBe(true);
    expect(paidAccessFromRow(row({ status: 'past_due', current_period_end: PAST_END }), NOW)).toBe(false);
    expect(paidAccessFromRow(row({ cancel_at_period_end: true }), NOW)).toBe(true);
    expect(paidAccessFromRow(row({ cancel_at_period_end: true }), new Date(PERIOD_END))).toBe(false);
    expect(paidAccessFromRow(row({ status: 'canceled' }), NOW)).toBe(false);
    expect(paidAccessFromRow(null, NOW)).toBe(false);
  });
});

describe('row selection is stable across refresh/devices (pure function of the rows)', () => {
  it('the same rows in any order give the same state', () => {
    const rows = [
      row({ stripe_subscription_id: 'a', status: 'canceled', ended_at: PAST_END, current_period_end: PAST_END }),
      row({ stripe_subscription_id: 'b', cancel_at_period_end: true }),
    ];
    const forward = deriveBillingPlanState(rows, NOW);
    const backward = deriveBillingPlanState([...rows].reverse(), NOW);
    expect(backward).toEqual(forward);
    expect(pickPanelRow(rows)?.stripe_subscription_id).toBe('b');
    expect(forward.status).toBe('cancelling');
    expect(forward.accessUntil).toBe(PERIOD_END);
  });

  it('an unknown offer key never crashes the panel — price is simply unknown', () => {
    const state = deriveBillingPlanState([row({ offer_key: 'mystery_offer' })], NOW);
    expect(state.status).toBe('active');
    expect(state.priceLabel).toBeNull();
    expect(state.amountCents).toBeNull();
  });
});
