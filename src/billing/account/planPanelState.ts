/**
 * Account → Plan i rozliczenia — PURE state derivation (no IO, no copy).
 *
 * Input: the user's `customer_subscriptions` rows exactly as the webhook wrote
 * them (Stripe dates, Stripe statuses, the mirrored scheduled change). Output:
 * the one panel state the UI renders and the actions it may offer. Nothing
 * here computes a date, a proration or an amount: every timestamp is copied
 * from the authority row and every price is looked up in the price catalog.
 *
 * Status vocabulary (locked, test-pinned):
 *  - none              no subscription has ever existed for this account
 *  - active            paid, auto-renews at `renewsAt`
 *  - cancelling        cancel_at_period_end: paid until `accessUntil`, no renewal
 *  - scheduled_change  paid, switches to `scheduled.offerKey` at `scheduled.at`
 *  - payment_problem   Stripe could not collect (past_due / unpaid / incomplete)
 *  - expired           the last subscription ended (`expiredAt`)
 *
 * `paidAccessActive` mirrors the SQL paid-access predicate
 * (gellatti_has_paid_access_v1) and the webhook entitlement mirror: active |
 * trialing → paid (bounded by current_period_end when cancelling), past_due →
 * paid while inside current_period_end, everything else → not paid.
 */
import { byOfferKey, type BillingProduct, type OfferCadence } from '@/billing/catalog/priceCatalog';
import { formatEur, INTERVAL_PL } from '@/billing/catalog/offerDisplay';
import type { CustomerSubscriptionRow } from '@/services/billing';

export type BillingPlanStatus =
  | 'none'
  | 'active'
  | 'cancelling'
  | 'scheduled_change'
  | 'payment_problem'
  | 'expired';

export interface ScheduledPlanChange {
  offerKey: string;
  product: BillingProduct | null;
  cadence: OfferCadence | null;
  /** ISO — when the new offer starts (Stripe schedule phase start). */
  at: string;
}

export interface BillingPlanActions {
  cancel: boolean;
  resume: boolean;
  upgradeToPro: boolean;
  downgradeToHome: boolean;
  changeCadence: boolean;
  cancelScheduledChange: boolean;
  /**
   * Monthly → yearly from the account panel. FALSE for now: that conversion is
   * priced by the owner-accepted conversion authority (full-month credit,
   * annual term anchored at the current period start — owner decision
   * 2026-09-18), which has no server implementation yet, so the panel must not
   * offer a button the backend refuses.
   */
  convertToYearly: boolean;
  /** Expired: „Odnów HOME” / „Przejdź na PRO” — a NEW checkout. */
  renew: boolean;
  /** No plan ever: „Wybierz HOME” / „Wybierz PRO”. */
  choosePlan: boolean;
  updatePaymentMethod: boolean;
}

export interface BillingPlanState {
  status: BillingPlanStatus;
  stripeSubscriptionId: string | null;
  offerKey: string | null;
  product: BillingProduct | null;
  cadence: OfferCadence | null;
  /** Catalog amount in cents for `offerKey` (display authority), null when unknown. */
  amountCents: number | null;
  /** e.g. "9,99 € / miesiąc" — from the catalog, never typed by hand. */
  priceLabel: string | null;
  /** active / scheduled_change / payment_problem: the next renewal (Stripe current_period_end). */
  renewsAt: string | null;
  /** cancelling: paid access lasts until this date (Stripe current_period_end). */
  accessUntil: string | null;
  /** expired: when the plan ended (Stripe ended_at, else the last period end). */
  expiredAt: string | null;
  scheduled: ScheduledPlanChange | null;
  /** Consistent with the entitlement authority — see file header. */
  paidAccessActive: boolean;
  /** Stripe status verbatim (support/debug; never branch UI copy on it). */
  rawStatus: string | null;
  actions: BillingPlanActions;
}

/** Statuses under which the Stripe subscription object is still live. */
const LIVE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];
const PAYMENT_PROBLEM_STATUSES: readonly string[] = ['past_due', 'unpaid', 'incomplete'];

const NO_ACTIONS: BillingPlanActions = {
  cancel: false,
  resume: false,
  upgradeToPro: false,
  downgradeToHome: false,
  changeCadence: false,
  cancelScheduledChange: false,
  convertToYearly: false,
  renew: false,
  choosePlan: false,
  updatePaymentMethod: false,
};

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const asProduct = (value: string | null | undefined): BillingProduct | null =>
  value === 'home' || value === 'pro' ? value : null;

const asCadence = (value: string | null | undefined): OfferCadence | null =>
  value === 'monthly' || value === 'annual' || value === 'initial_15_month' ? value : null;

/** Pick the row the panel is about: the live one (latest period end) or the last ended one. */
export function pickPanelRow(rows: readonly CustomerSubscriptionRow[]): CustomerSubscriptionRow | null {
  if (rows.length === 0) return null;
  const byPeriodEndDesc = (a: CustomerSubscriptionRow, b: CustomerSubscriptionRow) =>
    (ms(b.current_period_end) ?? 0) - (ms(a.current_period_end) ?? 0);
  const live = rows.filter((row) => LIVE_STATUSES.includes(row.status)).sort(byPeriodEndDesc);
  if (live.length > 0) return live[0] ?? null;
  const ended = [...rows].sort(
    (a, b) =>
      (ms(b.ended_at) ?? ms(b.current_period_end) ?? 0) - (ms(a.ended_at) ?? ms(a.current_period_end) ?? 0),
  );
  return ended[0] ?? null;
}

/** Mirror of gellatti_has_paid_access_v1 + the webhook entitlement mirror (cancel-bounded). */
export function paidAccessFromRow(row: CustomerSubscriptionRow | null, now: Date): boolean {
  if (!row) return false;
  const end = ms(row.current_period_end);
  if (row.status === 'active' || row.status === 'trialing') {
    if (row.cancel_at_period_end && end !== null) return end > now.getTime();
    return true;
  }
  if (row.status === 'past_due') return end !== null && end > now.getTime();
  return false;
}

function priceOf(offerKey: string | null): { amountCents: number | null; label: string | null } {
  if (!offerKey) return { amountCents: null, label: null };
  const offer = byOfferKey(offerKey);
  // An offer key the catalog does not know (a price configured in Stripe but
  // not in the catalog) leaves the price UNKNOWN — the panel shows no amount
  // rather than a made-up one.
  if (!offer) return { amountCents: null, label: null };
  return {
    amountCents: offer.amountCents,
    label: `${formatEur(offer.amountCents)} / ${INTERVAL_PL[offer.interval]}`,
  };
}

const EMPTY: BillingPlanState = {
  status: 'none',
  stripeSubscriptionId: null,
  offerKey: null,
  product: null,
  cadence: null,
  amountCents: null,
  priceLabel: null,
  renewsAt: null,
  accessUntil: null,
  expiredAt: null,
  scheduled: null,
  paidAccessActive: false,
  rawStatus: null,
  actions: { ...NO_ACTIONS, choosePlan: true },
};

export function deriveBillingPlanState(
  rows: readonly CustomerSubscriptionRow[],
  now: Date = new Date(),
): BillingPlanState {
  const row = pickPanelRow(rows);
  if (!row) return EMPTY;

  const product = asProduct(row.product);
  const cadence = asCadence(row.cadence);
  const price = priceOf(row.offer_key);
  const periodEnd = row.current_period_end ?? null;
  const periodEndMs = ms(periodEnd);
  const paid = paidAccessFromRow(row, now);
  const live = LIVE_STATUSES.includes(row.status);

  const base: BillingPlanState = {
    ...EMPTY,
    stripeSubscriptionId: row.stripe_subscription_id,
    offerKey: row.offer_key,
    product,
    cadence,
    amountCents: price.amountCents,
    priceLabel: price.label,
    rawStatus: row.status,
    paidAccessActive: paid,
    actions: { ...NO_ACTIONS },
  };

  // Ended, or a cancel-at-period-end whose date has passed while the deletion
  // event is still in flight → the plan is over. Honest, not optimistic.
  const cancelWindowPassed =
    row.cancel_at_period_end && periodEndMs !== null && periodEndMs <= now.getTime();
  if (!live || cancelWindowPassed) {
    return {
      ...base,
      status: 'expired',
      paidAccessActive: false,
      expiredAt: row.ended_at ?? periodEnd,
      actions: { ...NO_ACTIONS, renew: true },
    };
  }

  if (PAYMENT_PROBLEM_STATUSES.includes(row.status)) {
    return {
      ...base,
      status: 'payment_problem',
      renewsAt: periodEnd,
      actions: {
        ...NO_ACTIONS,
        updatePaymentMethod: true,
        cancel: !row.cancel_at_period_end,
        resume: row.cancel_at_period_end && paid,
      },
    };
  }

  if (row.cancel_at_period_end) {
    return {
      ...base,
      status: 'cancelling',
      accessUntil: periodEnd,
      actions: { ...NO_ACTIONS, resume: true },
    };
  }

  const scheduled: ScheduledPlanChange | null =
    row.scheduled_offer_key && row.scheduled_change_at
      ? (() => {
          // Unknown offer key → product/cadence stay null; the pending change
          // is still reported (the authority says one exists).
          const offer = byOfferKey(row.scheduled_offer_key);
          return {
            offerKey: row.scheduled_offer_key,
            product: offer?.product ?? null,
            cadence: offer?.cadence ?? null,
            at: row.scheduled_change_at,
          };
        })()
      : null;

  if (scheduled) {
    return {
      ...base,
      status: 'scheduled_change',
      renewsAt: periodEnd,
      scheduled,
      // No upgrade/cadence action while a schedule drives the subscription:
      // Stripe refuses a direct change there, so the pending change is
      // cancelled first („Anuluj zmianę planu”) and then the upgrade offered.
      actions: { ...NO_ACTIONS, cancelScheduledChange: true, cancel: true },
    };
  }

  return {
    ...base,
    status: 'active',
    renewsAt: periodEnd,
    actions: {
      ...NO_ACTIONS,
      cancel: true,
      upgradeToPro: product === 'home',
      downgradeToHome: product === 'pro',
      // Yearly → monthly is executable today (scheduled at period end).
      // Monthly → yearly waits for the conversion authority (see the action's doc).
      changeCadence: cadence === 'annual',
    },
  };
}
