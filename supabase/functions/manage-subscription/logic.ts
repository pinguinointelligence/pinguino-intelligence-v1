/**
 * manage-subscription — PURE decision logic (no IO, no Deno APIs, no SDK).
 * index.ts is the thin Deno shell that talks to Stripe.
 *
 * Account → Plan i rozliczenia. The rules a mature SaaS follows, encoded once
 * and test-pinned:
 *
 *  - CANCEL never removes access now: it is Stripe `cancel_at_period_end`;
 *    the plan stays active until current_period_end and is simply not renewed.
 *  - RESUME before that date clears the flag on the SAME subscription — no
 *    second subscription, no new charge; the original renewal date holds.
 *  - A plan change is either IMMEDIATE (going up to a richer plan at the same
 *    cadence) with Stripe proration — the customer pays only the difference
 *    for the rest of the current period — or SCHEDULED (going down: PRO →
 *    HOME, or yearly → monthly) at the end of the paid period through a
 *    Subscription Schedule, so an already-paid plan is never taken away.
 *  - MONTHLY → YEARLY mid-period is NOT priced here: the owner-accepted
 *    conversion authority owns it (see PlanChangeDecision below).
 *  - The amount the customer sees before confirming comes from a REAL Stripe
 *    invoice preview; this module only extracts it. It never computes
 *    `pricePro - priceHome` itself.
 *  - A confirm is valid ONLY against the proration timestamp of the preview
 *    the customer saw (the accepted conversion-machine rule); a stale one
 *    demands a fresh preview.
 *  - Every Stripe mutation carries a deterministic idempotency key, so a
 *    retried request can never apply the change twice.
 */

export type ManagedProduct = 'home' | 'pro';
export type ManagedCadence = 'monthly' | 'annual';

export interface ManageableOffer {
  offerKey: string;
  product: ManagedProduct;
  cadence: ManagedCadence;
}

/**
 * The offers a customer may move between from the account panel: the direct
 * checkout offers (lockstep-tested against create-checkout-session's
 * PURCHASABLE_OFFERS and src/billing/catalog/priceCatalog.ts). 15-month
 * partner offers are never a change target.
 */
export const MANAGEABLE_OFFERS: readonly ManageableOffer[] = [
  { offerKey: 'home_monthly_standard', product: 'home', cadence: 'monthly' },
  { offerKey: 'home_yearly_standard', product: 'home', cadence: 'annual' },
  { offerKey: 'home_yearly_launch', product: 'home', cadence: 'annual' },
  { offerKey: 'pro_monthly_standard', product: 'pro', cadence: 'monthly' },
  { offerKey: 'pro_monthly_founding', product: 'pro', cadence: 'monthly' },
  { offerKey: 'pro_yearly_standard', product: 'pro', cadence: 'annual' },
  { offerKey: 'pro_yearly_founding', product: 'pro', cadence: 'annual' },
];

export function manageableOffer(offerKey: string | null | undefined): ManageableOffer | null {
  const key = (offerKey ?? '').trim();
  return MANAGEABLE_OFFERS.find((offer) => offer.offerKey === key) ?? null;
}

// ── request parsing (closed action vocabulary) ──────────────────────────────

export type ManageAction =
  | { action: 'cancel' }
  | { action: 'resume' }
  | { action: 'preview_change'; targetOfferKey: string }
  | { action: 'confirm_change'; targetOfferKey: string; prorationTimestamp: number | null }
  | { action: 'cancel_scheduled_change' };

export type ParsedRequest =
  | { ok: true; request: ManageAction }
  | { ok: false; reason: 'unknown_action' | 'missing_target_offer' | 'invalid_proration_timestamp' };

export function parseManageRequest(body: unknown): ParsedRequest {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const action = typeof raw.action === 'string' ? raw.action : '';
  const target = typeof raw.targetOfferKey === 'string' ? raw.targetOfferKey.trim() : '';
  switch (action) {
    case 'cancel':
    case 'resume':
    case 'cancel_scheduled_change':
      return { ok: true, request: { action } };
    case 'preview_change':
      if (!target) return { ok: false, reason: 'missing_target_offer' };
      return { ok: true, request: { action, targetOfferKey: target } };
    case 'confirm_change': {
      if (!target) return { ok: false, reason: 'missing_target_offer' };
      const ts = raw.prorationTimestamp;
      if (ts === undefined || ts === null) {
        return { ok: true, request: { action, targetOfferKey: target, prorationTimestamp: null } };
      }
      if (typeof ts !== 'number' || !Number.isInteger(ts) || ts <= 0) {
        return { ok: false, reason: 'invalid_proration_timestamp' };
      }
      return { ok: true, request: { action, targetOfferKey: target, prorationTimestamp: ts } };
    }
    default:
      return { ok: false, reason: 'unknown_action' };
  }
}

// ── which cached subscription is "the" subscription to manage ───────────────

/** The customer_subscriptions subset the picker needs. */
export interface ManagedSubscriptionRow {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  offer_key: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** Statuses under which a subscription is still a live Stripe object to manage. */
export const MANAGEABLE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due', 'unpaid'];

/**
 * Pick the subscription the panel actions apply to: a live one (see
 * MANAGEABLE_STATUSES), preferring the latest current_period_end. Cancelled /
 * ended rows are never managed — an expired plan is renewed through Checkout
 * (a NEW subscription, real transaction date), never by reviving the old one.
 */
export function pickManagedSubscription(
  rows: readonly ManagedSubscriptionRow[],
): ManagedSubscriptionRow | null {
  const live = rows.filter((row) => MANAGEABLE_STATUSES.includes(row.status));
  if (live.length === 0) return null;
  const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  return [...live].sort((a, b) => ms(b.current_period_end) - ms(a.current_period_end))[0] ?? null;
}

// ── cancel / resume eligibility ─────────────────────────────────────────────

export type CancelDecision =
  | { ok: true }
  | { ok: false; reason: 'already_cancelling' | 'not_manageable' };

export function decideCancel(sub: { status: string; cancelAtPeriodEnd: boolean }): CancelDecision {
  if (!MANAGEABLE_STATUSES.includes(sub.status)) return { ok: false, reason: 'not_manageable' };
  if (sub.cancelAtPeriodEnd) return { ok: false, reason: 'already_cancelling' };
  return { ok: true };
}

export type ResumeDecision =
  | { ok: true }
  | { ok: false; reason: 'not_cancelling' | 'period_already_ended' | 'not_manageable' };

/**
 * Resume = subscription still live + cancel_at_period_end set + the paid
 * period has not ended. Clearing the flag re-arms auto-renew on the original
 * date with NO charge now.
 */
export function decideResume(
  sub: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEndEpoch: number | null },
  nowEpoch: number,
): ResumeDecision {
  if (!MANAGEABLE_STATUSES.includes(sub.status)) return { ok: false, reason: 'not_manageable' };
  if (!sub.cancelAtPeriodEnd) return { ok: false, reason: 'not_cancelling' };
  if (sub.currentPeriodEndEpoch !== null && sub.currentPeriodEndEpoch <= nowEpoch) {
    return { ok: false, reason: 'period_already_ended' };
  }
  return { ok: true };
}

// ── plan change: immediate (prorated) vs scheduled (period end) ─────────────

const PRODUCT_RANK: Record<ManagedProduct, number> = { home: 1, pro: 2 };
const CADENCE_RANK: Record<ManagedCadence, number> = { monthly: 1, annual: 2 };

export type PlanChangeDecision =
  | {
      kind: 'immediate';
      /** True when the cadence changes (yearly → monthly): the cycle restarts now. */
      resetBillingCycle: boolean;
    }
  | { kind: 'scheduled' }
  /**
   * Monthly → yearly while the plan is running. This is NOT ours to price:
   * the owner-accepted conversion authority
   * (src/billing/catalog/conversionStateMachine.ts, MONTHLY_CREDIT_POLICY =
   * 'full_current_period', owner decision 2026-09-18) credits the WHOLE paid
   * month and anchors the annual term at the current period start — which
   * Stripe's default time-based proration does not produce. Applying a
   * standard proration here would charge the customer under a policy the
   * owner replaced, so this path refuses instead of inventing a second
   * algorithm. It becomes available when that authority gets its server
   * implementation.
   */
  | { kind: 'conversion_authority' }
  | { kind: 'noop'; reason: 'same_offer' };

/**
 * Locked mapping (see ACCOUNT_PLAN_MANAGEMENT.md):
 *  - same offer                         → nothing to do;
 *  - product DOWN (PRO → HOME)          → scheduled at period end, whatever
 *    the cadence does: an already-paid plan is never taken away mid-period;
 *  - monthly → yearly (tier up or not)  → the conversion authority owns it;
 *  - product UP at the same cadence     → immediate, prorated, same period end
 *    (the customer pays only the difference for the remaining time);
 *  - product UP, yearly → monthly       → immediate, prorated, new cycle;
 *  - yearly → monthly, same product     → scheduled (the paid year runs out);
 *  - same product + cadence, other variant → immediate, prorated.
 */
export function decidePlanChange(from: ManageableOffer, to: ManageableOffer): PlanChangeDecision {
  if (from.offerKey === to.offerKey) return { kind: 'noop', reason: 'same_offer' };
  const productDelta = PRODUCT_RANK[to.product] - PRODUCT_RANK[from.product];
  const cadenceDelta = CADENCE_RANK[to.cadence] - CADENCE_RANK[from.cadence];
  if (productDelta < 0) return { kind: 'scheduled' };
  // monthly → yearly mid-period: owner-accepted conversion authority only.
  if (cadenceDelta > 0) return { kind: 'conversion_authority' };
  if (productDelta > 0) return { kind: 'immediate', resetBillingCycle: cadenceDelta !== 0 };
  if (cadenceDelta < 0) return { kind: 'scheduled' };
  // same product + cadence, different variant (standard ↔ launch/founding):
  // a price change inside the same tier — apply like an upgrade, prorated.
  return { kind: 'immediate', resetBillingCycle: false };
}

/**
 * A confirm must name the preview it confirms. The window is deliberately
 * short: proration is computed AT a timestamp, so an old one would bill the
 * customer for time that has already passed.
 */
export const PREVIEW_VALIDITY_SECONDS = 30 * 60;

export type ConfirmTimestampDecision =
  | { ok: true }
  | { ok: false; reason: 'preview_required' | 'preview_expired' | 'preview_in_future' };

export function decideConfirmTimestamp(
  prorationTimestamp: number | null,
  nowEpoch: number,
): ConfirmTimestampDecision {
  if (prorationTimestamp === null) return { ok: false, reason: 'preview_required' };
  if (prorationTimestamp > nowEpoch + 60) return { ok: false, reason: 'preview_in_future' };
  if (nowEpoch - prorationTimestamp > PREVIEW_VALIDITY_SECONDS) {
    return { ok: false, reason: 'preview_expired' };
  }
  return { ok: true };
}

// ── Stripe call shapes (closed parameter objects) ───────────────────────────

/** subscriptions.update params for an IMMEDIATE, prorated change. */
export interface ImmediateChangeParams {
  items: Array<{ id: string; price: string }>;
  proration_behavior: 'always_invoice';
  proration_date: number;
  /** Charge the difference now; a declined card fails the change instead of leaving it half-applied. */
  payment_behavior: 'error_if_incomplete';
  billing_cycle_anchor?: 'now';
  /** Stripe stamps the active offer key on the subscription — correlation only. */
  metadata: { pi_offer_key: string };
}

export function buildImmediateChangeParams(input: {
  itemId: string;
  targetPriceId: string;
  targetOfferKey: string;
  prorationTimestamp: number;
  resetBillingCycle: boolean;
}): ImmediateChangeParams {
  return {
    items: [{ id: input.itemId, price: input.targetPriceId }],
    proration_behavior: 'always_invoice',
    proration_date: input.prorationTimestamp,
    payment_behavior: 'error_if_incomplete',
    ...(input.resetBillingCycle ? { billing_cycle_anchor: 'now' as const } : {}),
    metadata: { pi_offer_key: input.targetOfferKey },
  };
}

/** invoices.createPreview params — the SAME change the confirm will apply. */
export interface PreviewParams {
  customer: string;
  subscription: string;
  subscription_details: {
    items: Array<{ id: string; price: string }>;
    proration_behavior: 'always_invoice';
    proration_date: number;
    billing_cycle_anchor?: 'now';
  };
}

export function buildPreviewParams(input: {
  customerId: string;
  subscriptionId: string;
  itemId: string;
  targetPriceId: string;
  prorationTimestamp: number;
  resetBillingCycle: boolean;
}): PreviewParams {
  return {
    customer: input.customerId,
    subscription: input.subscriptionId,
    subscription_details: {
      items: [{ id: input.itemId, price: input.targetPriceId }],
      proration_behavior: 'always_invoice',
      proration_date: input.prorationTimestamp,
      ...(input.resetBillingCycle ? { billing_cycle_anchor: 'now' as const } : {}),
    },
  };
}

/**
 * Subscription Schedule phases for a PERIOD-END change: phase 1 = the current
 * price until the paid period ends (nothing changes now), phase 2 = the new
 * price from that instant, renewing normally afterwards. `end_behavior:
 * release` hands the subscription back to a plain subscription once the
 * change has happened.
 */
export interface SchedulePhasesParams {
  phases: [
    { items: Array<{ price: string; quantity: 1 }>; start_date: number; end_date: number },
    { items: Array<{ price: string; quantity: 1 }>; metadata: { pi_offer_key: string } },
  ];
  end_behavior: 'release';
  proration_behavior: 'none';
}

export function buildScheduledChangePhases(input: {
  currentPriceId: string;
  currentPhaseStartEpoch: number;
  currentPeriodEndEpoch: number;
  targetPriceId: string;
  targetOfferKey: string;
}): SchedulePhasesParams {
  return {
    phases: [
      {
        items: [{ price: input.currentPriceId, quantity: 1 }],
        start_date: input.currentPhaseStartEpoch,
        end_date: input.currentPeriodEndEpoch,
      },
      {
        items: [{ price: input.targetPriceId, quantity: 1 }],
        metadata: { pi_offer_key: input.targetOfferKey },
      },
    ],
    end_behavior: 'release',
    proration_behavior: 'none',
  };
}

// ── idempotency keys (deterministic per intent) ─────────────────────────────

export function buildCancelIdempotencyKey(subscriptionId: string, currentPeriodEndEpoch: number | null): string {
  return `manage:cancel:${subscriptionId}:${currentPeriodEndEpoch ?? 'none'}`;
}

export function buildResumeIdempotencyKey(subscriptionId: string, currentPeriodEndEpoch: number | null): string {
  return `manage:resume:${subscriptionId}:${currentPeriodEndEpoch ?? 'none'}`;
}

export function buildChangeIdempotencyKey(input: {
  subscriptionId: string;
  targetOfferKey: string;
  prorationTimestamp: number;
}): string {
  return `manage:change:${input.subscriptionId}:${input.targetOfferKey}:${input.prorationTimestamp}`;
}

export function buildScheduleIdempotencyKey(input: {
  subscriptionId: string;
  targetOfferKey: string;
  currentPeriodEndEpoch: number;
}): string {
  return `manage:schedule:${input.subscriptionId}:${input.targetOfferKey}:${input.currentPeriodEndEpoch}`;
}

// ── Stripe object extraction (closed, version-robust) ───────────────────────

type Payload = Record<string, unknown>;

const asObject = (v: unknown): Payload | null =>
  typeof v === 'object' && v !== null ? (v as Payload) : null;
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const asId = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  const o = asObject(v);
  return o ? asString(o.id) : null;
};

export interface LiveSubscription {
  id: string;
  customerId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  itemId: string | null;
  priceId: string | null;
  currentPeriodStartEpoch: number | null;
  currentPeriodEndEpoch: number | null;
  scheduleId: string | null;
}

/** Basil-robust: periods live on the item from 2025+; top-level pre-Basil. */
export function extractLiveSubscription(subscription: Payload): LiveSubscription {
  const items = asObject(subscription.items);
  const data = items && Array.isArray(items.data) ? (items.data as unknown[]) : [];
  const first = asObject(data[0]);
  const price = first ? asObject(first.price) : null;
  return {
    id: asString(subscription.id) ?? '',
    customerId: asId(subscription.customer),
    status: asString(subscription.status) ?? 'unknown',
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    itemId: first ? asString(first.id) : null,
    priceId: price ? asString(price.id) : null,
    currentPeriodStartEpoch:
      asNumber(subscription.current_period_start) ?? (first ? asNumber(first.current_period_start) : null),
    currentPeriodEndEpoch:
      asNumber(subscription.current_period_end) ?? (first ? asNumber(first.current_period_end) : null),
    scheduleId: asId(subscription.schedule),
  };
}

/** What the customer is told before confirming — every number is Stripe's. */
export interface ChangePreviewSummary {
  /** What is charged today (cents; 0 when credit covers it). */
  amountDueCents: number;
  currency: string;
  /** Sum of proration lines (positive = new plan time, negative = unused credit). */
  prorationCents: number;
  taxCents: number;
  /** Existing customer credit applied by Stripe (cents, ≥ 0). */
  appliedBalanceCents: number;
  /** End of the period the preview bills up to — the next renewal date. */
  nextRenewalEpoch: number | null;
}

export function summarizeInvoicePreview(invoice: Payload): ChangePreviewSummary {
  const lines = asObject(invoice.lines);
  const data = lines && Array.isArray(lines.data) ? (lines.data as unknown[]) : [];
  let prorationCents = 0;
  let nextRenewalEpoch: number | null = null;
  for (const raw of data) {
    const line = asObject(raw);
    if (!line) continue;
    const amount = asNumber(line.amount) ?? 0;
    if (line.proration === true) prorationCents += amount;
    const period = asObject(line.period);
    const end = period ? asNumber(period.end) : null;
    if (end !== null && (nextRenewalEpoch === null || end > nextRenewalEpoch)) nextRenewalEpoch = end;
  }
  const startingBalance = asNumber(invoice.starting_balance) ?? 0;
  const endingBalance = asNumber(invoice.ending_balance) ?? startingBalance;
  return {
    amountDueCents: Math.max(0, asNumber(invoice.amount_due) ?? 0),
    currency: (asString(invoice.currency) ?? 'eur').toLowerCase(),
    prorationCents,
    taxCents: asNumber(invoice.tax) ?? 0,
    // Stripe balances are negative when the customer holds credit; the
    // applied part is the (negative) movement from starting to ending.
    appliedBalanceCents: Math.max(0, endingBalance - startingBalance),
    nextRenewalEpoch,
  };
}

/** The closed state payload every mutation answers with (mirrors the cache row). */
export interface SubscriptionStateReply {
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export function toStateReply(live: LiveSubscription): SubscriptionStateReply {
  return {
    stripeSubscriptionId: live.id,
    status: live.status,
    cancelAtPeriodEnd: live.cancelAtPeriodEnd,
    currentPeriodEnd:
      live.currentPeriodEndEpoch === null ? null : new Date(live.currentPeriodEndEpoch * 1000).toISOString(),
  };
}
