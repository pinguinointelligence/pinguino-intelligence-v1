/**
 * Konto → Plan i rozliczenia — DESIGN V3.0 §P2, all eight states in one panel.
 *
 * ONE PANEL, ONE SHAPE. Every state renders the same skeleton — plan name and
 * status chip, a facts list, one sentence, then actions — so the customer
 * learns the layout once. The design holds it to 640 px on desktop: these are
 * settings, not a dashboard.
 *
 * THE AUTHORITY IS THE SERVER. Everything displayed comes from
 * `useBillingPlan()` → `deriveBillingPlanState()` over the user's own
 * `customer_subscriptions` rows, which only the billing webhook writes. This
 * file computes NO date, NO amount and NO entitlement: it formats what the
 * authority already decided. The amount on the upgrade screen is the payment
 * processor's own invoice preview, never `pricePro - priceHome`.
 *
 * (The processor is deliberately not named here: `studioBoundary.test.ts` keeps
 * every payment vendor out of `src/features/**`, comments included.)
 *
 * IT FAILS HONESTLY. The billing Edge Functions are not deployed yet, so every
 * action here can come back refused. A refusal renders as a refusal: the panel
 * never flips the plan locally, never invents a scheduled change, and never
 * reports a server action it did not make. A failed READ is not "no plan" — it
 * says the read failed, because telling a paying customer they have nothing is
 * the worst possible guess.
 */
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { formatEur } from '@/billing/catalog/offerDisplay';
import { byOfferKey } from '@/billing/catalog/priceCatalog';
import type { BillingPlanState } from '@/billing/account/planPanelState';
import { useBillingPlan, useRefreshBillingPlan } from './useBillingPlan';
import {
  cancelScheduledPlanChange,
  cancelSubscriptionAtPeriodEnd,
  confirmPlanChange,
  openBillingPortal,
  previewPlanChange,
  resumeSubscription,
  type ChangePreview,
  type ManageFailureReason,
} from '@/services/subscriptionManagement';
import {
  CADENCE_LABEL,
  PRODUCT_LABEL,
  STATUS_CHIP,
  fill,
  formatPlanDate,
  planBillingCopy as copy,
  type PlanChipTone,
} from './planBillingCopy';

const PANEL = 'rounded-[12px] border border-[var(--g-line)] bg-white p-5 sm:p-6';
/** Settings, not a dashboard: the design holds the panel at 640 px. */
const PANEL_WIDTH = 'w-full max-w-[640px]';

const CHIP_TONE: Record<PlanChipTone, string> = {
  live: 'border-[var(--g-line)] bg-[var(--g-ivory)] text-[var(--g-ink)]',
  ending: 'border-[#e3d9bd] bg-[#fdf6e3] text-[#6f5200]',
  ended: 'border-[var(--g-line)] bg-[#f4f3f0] text-[var(--g-text-secondary)]',
  attention: 'border-[#e8cfcb] bg-[#fdf1ef] text-[#8a2b1d]',
  none: 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)]',
};

function Chip({ label, tone }: { label: string; tone: PlanChipTone }) {
  return (
    <span
      data-testid="plan-status-chip"
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] uppercase',
        CHIP_TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return null;
  return (
    <dl className="mt-4 grid gap-2" data-testid="plan-facts">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-[13px] text-[var(--g-text-secondary)]">{label}</dt>
          <dd className="font-mono text-[13px] tabular-nums text-[var(--g-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The facts list per state — dates only when the authority supplied one. */
function factRows(state: BillingPlanState): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const product = state.product ? (PRODUCT_LABEL[state.product] ?? null) : null;
  if (product) rows.push([copy.facts.plan, product]);
  const cadence = state.cadence ? CADENCE_LABEL[state.cadence] : null;
  if (cadence) rows.push([copy.facts.cadence, cadence]);
  if (state.priceLabel) rows.push([copy.facts.price, state.priceLabel]);

  const renews = formatPlanDate(state.renewsAt);
  const until = formatPlanDate(state.accessUntil);
  const ended = formatPlanDate(state.expiredAt);
  const changes = formatPlanDate(state.scheduled?.at ?? null);

  if (state.status === 'cancelling' && until) rows.push([copy.facts.accessUntil, until]);
  else if (state.status === 'expired' && ended) rows.push([copy.facts.expiredAt, ended]);
  else if (renews) rows.push([copy.facts.renewal, renews]);
  if (changes) rows.push([copy.facts.changesAt, changes]);
  return rows;
}

/** The single sentence per state. Falls back to a dateless variant, never an invented date. */
function sentenceFor(state: BillingPlanState): string {
  const pro = state.product === 'pro';
  switch (state.status) {
    case 'active': {
      const date = formatPlanDate(state.renewsAt);
      if (!date) return copy.sentence.activeNoDate;
      return fill(pro ? copy.sentence.activePro : copy.sentence.activeHome, { date });
    }
    case 'cancelling': {
      const date = formatPlanDate(state.accessUntil);
      if (!date) return copy.sentence.cancellingNoDate;
      return fill(pro ? copy.sentence.cancellingPro : copy.sentence.cancellingHome, { date });
    }
    case 'scheduled_change': {
      const date = formatPlanDate(state.scheduled?.at ?? null);
      const from = (state.product ? PRODUCT_LABEL[state.product] : null) ?? 'Obecny plan';
      const to =
        (state.scheduled?.product ? PRODUCT_LABEL[state.scheduled.product] : null) ?? 'nowy plan';
      if (!date) return copy.sentence.activeNoDate;
      return fill(copy.sentence.scheduledChange, { from, to, date });
    }
    case 'expired': {
      const date = formatPlanDate(state.expiredAt);
      if (!date) return copy.sentence.expiredNoDate;
      return fill(pro ? copy.sentence.expiredPro : copy.sentence.expiredHome, { date });
    }
    case 'payment_problem': {
      const date = formatPlanDate(state.renewsAt);
      return date
        ? fill(copy.sentence.paymentProblemUntil, { date })
        : copy.sentence.paymentProblem;
    }
    case 'none':
    default:
      return copy.sentence.none;
  }
}

/** Amounts stacked in mono, so they read without counting (design: desktop §Home → Pro). */
function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-[var(--g-text-secondary)]">{label}</span>
      <span className="font-mono text-[15px] tabular-nums text-[var(--g-ink)]">{value}</span>
    </div>
  );
}

type Busy = null | 'cancel' | 'resume' | 'preview' | 'confirm' | 'cancelScheduled' | 'portal';

export function PlanAndBillingPanel() {
  const { state, isLoading, isError, refetch } = useBillingPlan();
  const refresh = useRefreshBillingPlan();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChangePreview | null>(null);

  const fail = useCallback((reason: ManageFailureReason) => {
    setError(copy.errors[reason] ?? copy.errors.failed);
  }, []);

  /** After ANY successful mutation the panel re-reads the server. It never patches state locally. */
  const afterMutation = useCallback(async () => {
    setPreview(null);
    await refresh();
    await refetch();
  }, [refresh, refetch]);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, action: () => Promise<{ ok: boolean; reason?: ManageFailureReason }>) => {
      setBusy(kind);
      setError(null);
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        fail(result.reason ?? 'failed');
        return false;
      }
      await afterMutation();
      return true;
    },
    [afterMutation, fail],
  );

  const onCancel = () => run('cancel', cancelSubscriptionAtPeriodEnd);
  const onResume = () => run('resume', resumeSubscription);
  const onCancelScheduled = () => run('cancelScheduled', cancelScheduledPlanChange);

  const onPreview = async (targetOfferKey: string) => {
    setBusy('preview');
    setError(null);
    const result = await previewPlanChange(targetOfferKey);
    setBusy(null);
    if (!result.ok) {
      fail(result.reason);
      return;
    }
    setPreview(result.data);
  };

  const onConfirm = async () => {
    if (!preview) return;
    await run('confirm', () =>
      confirmPlanChange(
        preview.targetOfferKey,
        preview.kind === 'immediate' ? preview.prorationTimestamp : null,
      ),
    );
  };

  const onPortal = async () => {
    setBusy('portal');
    setError(null);
    const result = await openBillingPortal('payment_method_update');
    setBusy(null);
    if (!result.ok) {
      setError(copy.errors.portal);
      return;
    }
    window.location.assign(result.url);
  };

  if (isLoading) {
    return (
      <div className={cn(PANEL, PANEL_WIDTH)} data-testid="plan-panel-loading">
        <p className="text-[13px] text-[var(--g-text-secondary)]">{copy.loading}</p>
      </div>
    );
  }

  /* A failed READ is never "no plan". */
  if (isError || !state) {
    return (
      <div className={cn(PANEL, PANEL_WIDTH)} data-testid="plan-panel-read-error">
        <p className="text-[13px] text-[var(--g-ink)]">{copy.errors.read}</p>
      </div>
    );
  }

  const chip = STATUS_CHIP[state.status];
  const planName = (state.product ? PRODUCT_LABEL[state.product] : null) ?? '—';
  const proAtRisk =
    state.product === 'pro' && (state.status === 'cancelling' || state.status === 'expired');

  /* State 7 — the upgrade/downgrade preview takes over the panel. */
  if (preview) {
    const target = byOfferKey(preview.targetOfferKey);
    const targetName = (target ? PRODUCT_LABEL[target.product] : null) ?? '';
    const scheduled = preview.kind === 'scheduled';
    return (
      <section
        className={cn(PANEL, PANEL_WIDTH, !scheduled && 'border-[var(--g-orange)]')}
        data-testid="plan-panel-preview"
        data-preview-kind={preview.kind}
        aria-label={scheduled ? copy.downgrade.title : copy.upgrade.title}
      >
        <h3 className="text-[15px] font-semibold text-[var(--g-ink)]">
          {scheduled ? copy.downgrade.title : copy.upgrade.title}
        </h3>
        <p className="mt-2 text-[13px] text-[var(--g-text-secondary)]">
          {scheduled
            ? fill(copy.downgrade.effective, {
                date: formatPlanDate(preview.effectiveAt) ?? '',
              })
            : `${copy.upgrade.immediate} ${copy.upgrade.difference}`}
        </p>

        <div className="mt-4 grid gap-2 border-t border-[var(--g-line)] pt-4">
          <Amount
            label={scheduled ? copy.downgrade.nothingToday : copy.upgrade.dueToday}
            value={formatEur(preview.amountDueTodayCents)}
          />
          {!scheduled && preview.nextRenewalAt ? (
            <Amount
              label={copy.upgrade.nextRenewal}
              value={formatPlanDate(preview.nextRenewalAt) ?? '—'}
            />
          ) : null}
          {preview.nextAmountCents !== null ? (
            <Amount
              label={copy.upgrade.fromNextPeriod}
              value={formatEur(preview.nextAmountCents)}
            />
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 text-[13px] text-[#8a2b1d]" data-testid="plan-panel-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClasses('primary', 'sm')}
            onClick={onConfirm}
            disabled={busy !== null}
            data-testid="plan-confirm-change"
          >
            {busy === 'confirm'
              ? copy.working
              : scheduled
                ? copy.downgrade.confirm
                : `${copy.upgrade.confirm}${targetName && !scheduled ? '' : ''}`}
          </button>
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={() => {
              setPreview(null);
              setError(null);
            }}
            disabled={busy !== null}
            data-testid="plan-preview-back"
          >
            {copy.upgrade.back}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(PANEL, PANEL_WIDTH)}
      data-testid="plan-panel"
      data-plan-status={state.status}
      data-plan-product={state.product ?? 'none'}
      aria-label={copy.sectionTitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
            {copy.sectionTitle}
          </p>
          <strong className="mt-1 block text-[17px] font-semibold text-[var(--g-ink)]">
            {planName}
          </strong>
        </div>
        <Chip label={chip.label} tone={chip.tone} />
      </div>

      <Facts rows={factRows(state)} />

      <p className="mt-4 text-[13px] leading-relaxed text-[var(--g-ink)]" data-testid="plan-sentence">
        {sentenceFor(state)}
      </p>
      {proAtRisk ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
          {copy.proEnds}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-[13px] text-[#8a2b1d]" data-testid="plan-panel-error">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {state.actions.upgradeToPro ? (
          <button
            type="button"
            className={buttonClasses('primary', 'sm')}
            onClick={() => onPreview('pro_' + (state.cadence === 'annual' ? 'yearly' : 'monthly') + '_standard')}
            disabled={busy !== null}
            data-testid="plan-upgrade-pro"
          >
            {busy === 'preview' ? copy.upgrade.loading : copy.actions.upgradeToPro}
          </button>
        ) : null}

        {state.actions.downgradeToHome ? (
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={() => onPreview('home_' + (state.cadence === 'annual' ? 'yearly' : 'monthly') + '_standard')}
            disabled={busy !== null}
            data-testid="plan-downgrade-home"
          >
            {busy === 'preview' ? copy.upgrade.loading : copy.actions.downgradeToHome}
          </button>
        ) : null}

        {state.actions.resume ? (
          <button
            type="button"
            className={buttonClasses('primary', 'sm')}
            onClick={onResume}
            disabled={busy !== null}
            data-testid="plan-resume"
          >
            {busy === 'resume' ? copy.working : copy.actions.resume}
          </button>
        ) : null}

        {state.actions.cancelScheduledChange ? (
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={onCancelScheduled}
            disabled={busy !== null}
            data-testid="plan-cancel-scheduled"
          >
            {busy === 'cancelScheduled' ? copy.working : copy.actions.cancelScheduledChange}
          </button>
        ) : null}

        {state.actions.updatePaymentMethod ? (
          <button
            type="button"
            className={buttonClasses('primary', 'sm')}
            onClick={onPortal}
            disabled={busy !== null}
            data-testid="plan-update-payment"
          >
            {busy === 'portal' ? copy.working : copy.actions.updatePaymentMethod}
          </button>
        ) : null}

        {state.actions.renew ? (
          <>
            <Link
              to="/subscription"
              className={buttonClasses('primary', 'sm')}
              data-testid="plan-renew"
            >
              {state.product === 'pro' ? copy.actions.renewPro : copy.actions.renewHome}
            </Link>
            {state.product !== 'pro' ? (
              <Link
                to="/subscription"
                className={buttonClasses('ghost', 'sm')}
                data-testid="plan-renew-pro"
              >
                {copy.actions.upgradeToPro}
              </Link>
            ) : null}
          </>
        ) : null}

        {state.actions.choosePlan ? (
          <>
            <Link
              to="/subscription"
              className={buttonClasses('primary', 'sm')}
              data-testid="plan-choose-home"
            >
              {copy.actions.chooseHome}
            </Link>
            <Link
              to="/subscription"
              className={buttonClasses('ghost', 'sm')}
              data-testid="plan-choose-pro"
            >
              {copy.actions.choosePro}
            </Link>
          </>
        ) : null}

        {/* „ciche Anuluj subskrypcję" — the quiet one, last and unemphasised. */}
        {state.actions.cancel ? (
          <button
            type="button"
            className="pro-focus-ring min-h-10 px-2 text-xs text-[var(--g-text-secondary)] underline underline-offset-4 hover:text-[var(--g-ink)] disabled:opacity-45"
            onClick={onCancel}
            disabled={busy !== null}
            data-testid="plan-cancel"
          >
            {busy === 'cancel' ? copy.working : copy.actions.cancel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
