/** @vitest-environment jsdom */
/**
 * Konto → Plan i rozliczenia — every DESIGN V3.0 §P2 state, against the REAL
 * billing authority merged in the backend PR.
 *
 * The panel is mounted with a mocked SERVICE boundary only: the state itself
 * comes from `deriveBillingPlanState()` over `customer_subscriptions` rows in
 * the shape the Stripe webhook writes, so these tests exercise the authority
 * rather than a hand-made view model. A row that the webhook could not produce
 * would fail here the same way it would fail in production.
 *
 * The sharp edge these tests guard: the billing Edge Functions are NOT
 * deployed yet, so every action can come back refused. A refusal must render
 * as a refusal — the panel may never flip a plan locally, invent a scheduled
 * change, or report a server action it did not make.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerSubscriptionRow } from '@/services/billing';

const rows = vi.hoisted(() => ({ current: [] as CustomerSubscriptionRow[], error: false }));
const service = vi.hoisted(() => ({
  cancel: vi.fn(),
  resume: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  cancelScheduled: vi.fn(),
  portal: vi.fn(),
}));

/* The hook is the seam to the server; the DERIVATION under it stays real. */
vi.mock('./useBillingPlan', async () => {
  const actual = await import('@/billing/account/planPanelState');
  return {
    useBillingPlan: () => ({
      state: rows.error ? null : actual.deriveBillingPlanState(rows.current, NOW),
      isLoading: false,
      isError: rows.error,
      refetch: vi.fn(async () => undefined),
    }),
    useRefreshBillingPlan: () => vi.fn(async () => undefined),
  };
});

vi.mock('@/services/subscriptionManagement', () => ({
  cancelSubscriptionAtPeriodEnd: service.cancel,
  resumeSubscription: service.resume,
  previewPlanChange: service.preview,
  confirmPlanChange: service.confirm,
  cancelScheduledPlanChange: service.cancelScheduled,
  openBillingPortal: service.portal,
}));

import { PlanAndBillingPanel } from './PlanAndBillingPanel';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const PERIOD_END = '2026-10-19T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

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

/* React's documented switch for a manual `act()` environment (we render with
   `react-dom/client` directly, as the rest of this repo's DOM tests do). */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  rows.current = [row()];
  rows.error = false;
  for (const fn of Object.values(service)) fn.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = () =>
  act(() => {
    root.render(
      <MemoryRouter>
        <PlanAndBillingPanel />
      </MemoryRouter>,
    );
  });

const q = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const panel = () => q('plan-panel')!;
const text = () => host.textContent ?? '';
const click = async (testId: string) => {
  const el = q(testId);
  expect(el, testId).not.toBeNull();
  await act(async () => el!.click());
};

describe('the eight states render from the authority', () => {
  it('1 · Home aktywny — renewal date, upgrade and the quiet cancel', async () => {
    await mount();
    expect(panel().dataset.planStatus).toBe('active');
    expect(panel().dataset.planProduct).toBe('home');
    expect(q('plan-status-chip')?.textContent).toBe('Aktywny');
    expect(text()).toContain('odnawia się automatycznie');
    expect(text()).toContain('19 października 2026');
    expect(q('plan-upgrade-pro')).not.toBeNull();
    expect(q('plan-cancel')).not.toBeNull();
    expect(q('plan-resume')).toBeNull();
  });

  it('2 · Pro aktywny — offers the downgrade, never an upgrade to itself', async () => {
    rows.current = [row({ product: 'pro', offer_key: 'pro_monthly_standard' })];
    await mount();
    expect(panel().dataset.planProduct).toBe('pro');
    expect(q('plan-downgrade-home')).not.toBeNull();
    expect(q('plan-upgrade-pro')).toBeNull();
  });

  it('3 · Home anulowany — „Możesz korzystać do", amber chip, resume only', async () => {
    rows.current = [row({ cancel_at_period_end: true })];
    await mount();
    expect(panel().dataset.planStatus).toBe('cancelling');
    expect(q('plan-status-chip')?.dataset.tone).toBe('ending');
    expect(text()).toContain('Możesz korzystać z Home do 19 października 2026');
    expect(text()).not.toContain('odnawia się automatycznie');
    expect(q('plan-resume')).not.toBeNull();
    expect(q('plan-cancel')).toBeNull();
  });

  it('4 · Pro anulowany — says plainly what stops working after the date', async () => {
    rows.current = [
      row({ product: 'pro', offer_key: 'pro_monthly_standard', cancel_at_period_end: true }),
    ];
    await mount();
    expect(text()).toContain('Możesz korzystać z Pro do');
    expect(text()).toContain('Produkcja, etykiety i przestrzeń Pro');
  });

  it('5 · Home wygasł — grey chip, the saved recipe waits, renew or go Pro', async () => {
    rows.current = [row({ status: 'canceled', ended_at: PAST, current_period_end: PAST })];
    await mount();
    expect(panel().dataset.planStatus).toBe('expired');
    expect(q('plan-status-chip')?.dataset.tone).toBe('ended');
    expect(text()).toContain('Zapisana receptura czeka');
    expect(q('plan-renew')).not.toBeNull();
    expect(q('plan-renew-pro')).not.toBeNull();
  });

  it('6 · Pro wygasł — history waits, Produkcja is closed until renewal', async () => {
    rows.current = [
      row({
        product: 'pro',
        offer_key: 'pro_monthly_standard',
        status: 'canceled',
        ended_at: PAST,
        current_period_end: PAST,
      }),
    ];
    await mount();
    expect(text()).toContain('historia produkcji');
    expect(text()).toContain('Produkcja jest zamknięta');
    expect(q('plan-renew')?.textContent).toBe('Odnów Pro');
    expect(q('plan-renew-pro')).toBeNull();
  });

  it('7 · Home → Pro — the amount shown is the Stripe preview, and the panel marks the decision', async () => {
    service.preview.mockResolvedValue({
      ok: true,
      data: {
        kind: 'immediate',
        targetOfferKey: 'pro_monthly_standard',
        prorationTimestamp: 1_790_000_000,
        amountDueTodayCents: 637,
        currency: 'eur',
        prorationCents: 637,
        taxCents: 0,
        appliedBalanceCents: 0,
        nextRenewalAt: PERIOD_END,
        nextAmountCents: 2499,
        resetBillingCycle: false,
      },
    });
    await mount();
    await click('plan-upgrade-pro');
    expect(service.preview).toHaveBeenCalledWith('pro_monthly_standard');
    expect(q('plan-panel-preview')?.dataset.previewKind).toBe('immediate');
    expect(text()).toContain('Pro zacznie działać od razu');
    expect(text()).toContain('6,37 €'); // Stripe's amount, formatted by the catalogue helper
    expect(text()).toContain('24,99 €'); // what the next period costs
  });

  it('8 · Problem z płatnością — red chip, never „Wygasł", repair action', async () => {
    rows.current = [row({ status: 'past_due' })];
    await mount();
    expect(panel().dataset.planStatus).toBe('payment_problem');
    expect(q('plan-status-chip')?.dataset.tone).toBe('attention');
    expect(q('plan-status-chip')?.textContent).not.toBe('Wygasł');
    expect(text()).toContain('Nie udało się odnowić subskrypcji');
    expect(q('plan-update-payment')).not.toBeNull();
  });

  it('scheduled downgrade — Pro until the date, then Home, with the change cancellable', async () => {
    rows.current = [
      row({
        product: 'pro',
        offer_key: 'pro_monthly_standard',
        scheduled_offer_key: 'home_monthly_standard',
        scheduled_change_at: PERIOD_END,
      }),
    ];
    await mount();
    expect(panel().dataset.planStatus).toBe('scheduled_change');
    expect(text()).toContain('Pro pozostaje aktywny do 19 października 2026');
    expect(text()).toContain('Potem przejdziesz na Home');
    expect(q('plan-cancel-scheduled')).not.toBeNull();
  });

  it('no plan at all — the account still works and offers both plans', async () => {
    rows.current = [];
    await mount();
    expect(panel().dataset.planStatus).toBe('none');
    expect(text()).toContain('Nie masz aktywnego planu');
    expect(q('plan-choose-home')).not.toBeNull();
    expect(q('plan-choose-pro')).not.toBeNull();
  });
});

describe('transitions the backend does not support stay unavailable', () => {
  it('a monthly plan is never offered the yearly conversion the server refuses', async () => {
    await mount();
    // `actions.convertToYearly` is false while the owner credit policy has no
    // server implementation, so there is no button for the refusal to answer.
    expect(q('plan-convert-yearly')).toBeNull();
    expect(text()).not.toContain('Zmień okres rozliczeniowy');
  });

  it('a cancelled plan offers resume, not a plan change', async () => {
    rows.current = [row({ cancel_at_period_end: true })];
    await mount();
    expect(q('plan-upgrade-pro')).toBeNull();
    expect(q('plan-downgrade-home')).toBeNull();
  });
});

describe('it fails honestly while the billing functions are not deployed', () => {
  it('a refused cancel leaves the plan exactly as the server still reports it', async () => {
    service.cancel.mockResolvedValue({ ok: false, reason: 'unavailable' });
    await mount();
    await click('plan-cancel');
    expect(q('plan-panel-error')?.textContent).toContain('Nic nie zostało zmienione');
    // the authority still says active — the panel did not move it
    expect(panel().dataset.planStatus).toBe('active');
    expect(text()).toContain('odnawia się automatycznie');
    expect(q('plan-resume')).toBeNull();
  });

  it('a refused resume does not pretend auto-renew came back', async () => {
    rows.current = [row({ cancel_at_period_end: true })];
    service.resume.mockResolvedValue({ ok: false, reason: 'failed' });
    await mount();
    await click('plan-resume');
    expect(q('plan-panel-error')).not.toBeNull();
    expect(panel().dataset.planStatus).toBe('cancelling');
    expect(text()).toContain('Możesz korzystać z Home do');
  });

  it('a refused preview shows the refusal and never invents an amount', async () => {
    service.preview.mockResolvedValue({ ok: false, reason: 'failed' });
    await mount();
    await click('plan-upgrade-pro');
    expect(q('plan-panel-preview')).toBeNull();
    expect(q('plan-panel-error')).not.toBeNull();
    /* The catalogue price of the CURRENT plan stays on screen — that is a real
       fact about what the customer pays today. What must not appear is a
       preview amount: no „Dzisiaj zapłacisz", and nothing about the next
       period, because Stripe never answered. */
    expect(text()).not.toContain('Dzisiaj zapłacisz');
    expect(text()).not.toContain('Od kolejnego okresu');
    expect(text()).not.toContain('24,99 €');
  });

  it('a declined confirm keeps the customer on the old plan', async () => {
    service.preview.mockResolvedValue({
      ok: true,
      data: {
        kind: 'immediate',
        targetOfferKey: 'pro_monthly_standard',
        prorationTimestamp: 1_790_000_000,
        amountDueTodayCents: 637,
        currency: 'eur',
        prorationCents: 637,
        taxCents: 0,
        appliedBalanceCents: 0,
        nextRenewalAt: PERIOD_END,
        nextAmountCents: 2499,
        resetBillingCycle: false,
      },
    });
    service.confirm.mockResolvedValue({ ok: false, reason: 'payment_failed' });
    await mount();
    await click('plan-upgrade-pro');
    await click('plan-confirm-change');
    expect(q('plan-panel-error')?.textContent).toContain('Płatność została odrzucona');
    // still on the preview screen, still Home underneath
    expect(q('plan-panel-preview')).not.toBeNull();
    expect(service.confirm).toHaveBeenCalledWith('pro_monthly_standard', 1_790_000_000);
  });

  it('a failed READ is never rendered as „no plan"', async () => {
    rows.error = true;
    await mount();
    expect(q('plan-panel-read-error')).not.toBeNull();
    expect(text()).toContain('Nie udało się odczytać');
    expect(text()).not.toContain('Nie masz aktywnego planu');
    expect(q('plan-choose-home')).toBeNull();
  });

  it('the payment repair goes to the Stripe portal, and a failure says so', async () => {
    rows.current = [row({ status: 'past_due' })];
    service.portal.mockResolvedValue({ ok: false, reason: 'failed' });
    await mount();
    await click('plan-update-payment');
    expect(service.portal).toHaveBeenCalledWith('payment_method_update');
    expect(q('plan-panel-error')).not.toBeNull();
  });
});

describe('no local subscription state', () => {
  it('the component never writes a plan value of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve('src/features/account/PlanAndBillingPanel.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    // no persistence, no hand-rolled plan state, no arithmetic on prices
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/setState\(\s*\{\s*status:/);
    expect(source).not.toMatch(/amountCents\s*[-+*/]/);
    // the one true refresh path after a mutation
    expect(source).toContain('await refetch()');
  });
});
