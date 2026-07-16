/**
 * stripe-webhook (v2, billing platform) — PURE per-intent effect mapping.
 *
 * Same pattern as ./handlers.ts: zero IO, zero Deno APIs, zero SDK imports —
 * the repo's vitest suite unit-tests every payload→row mapper, the Madrid
 * hold-calendar mirror, the round-half-up reversal arithmetic and the
 * closed row key lists without a Deno runtime. ./dispatch.ts is the thin IO
 * layer that feeds these decisions into service-role writes; index.ts stays
 * the receipt shell (signature → matrix → durable insert → state machine).
 *
 * MIRROR modules (pinned equal by repo tests, the established repo pattern):
 *  - Madrid calendar helpers mirror src/billing/domain/holdCalendar.ts
 *    (H1–H4: earned in Madrid month M → eligible Madrid midnight 1st of M+3).
 *  - divideRoundHalfUp / proportional reversal mirror
 *    src/billing/domain/types.ts + refundAdjustments.ts (R1–R5: proportional
 *    reversal round-half-up on cents, cumulative cap, append-only).
 *  - The entitlement mirror decision mirrors planFromSubscription
 *    (src/access/subscription.ts): active|trialing → granted open-ended;
 *    past_due → granted until current_period_end; anything else → no grant.
 *
 * FINANCIAL GUARDRAILS (locked):
 *  - a price id that does not resolve in billing_price_catalog NEVER produces
 *    a subscription cache row, an entitlement, or a commission entry;
 *  - entitlements are only ever written with source_type 'paid_subscription'
 *    — this module can never mint admin/partner/invite grants;
 *  - commission entries are keyed one-per-invoice (0018 unique index);
 *    adjustments are keyed per source event (0018 unique index) — duplicate
 *    and out-of-order deliveries are byte-identical no-ops;
 *  - intents whose target tables/semantics do not exist in migrations
 *    0014–0021 are explicit, honest no-ops (`skipped_no_contract`) — never
 *    invented writers (see NO_CONTRACT_REASONS below for the exact gaps).
 */

// ── generic payload narrowing (verified Stripe payloads are still unknown JSON) ──

type Payload = Record<string, unknown>;

function asObject(value: unknown): Payload | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Stripe expandable field: either the id string or the expanded object. */
function asId(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  const expanded = asObject(value);
  return expanded ? asString(expanded.id) : null;
}

/** Stripe epoch seconds → ISO timestamptz (mirror of mapping.ts epochToIso). */
export function epochToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

// ── Madrid hold calendar MIRROR (src/billing/domain/holdCalendar.ts) ─────────
// Pinned equal by src/services/stripeWebhookEffects.test.ts.

export const BUSINESS_TIMEZONE = 'Europe/Madrid' as const;
export const HOLD_ELIGIBILITY_MONTH_OFFSET = 3 as const;

const madridPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function madridWallClock(utcMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = madridPartsFormatter.formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl part '${type}' missing`);
    return Number(part.value);
  };
  const rawHour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Madrid-calendar month key 'YYYY-MM' of a UTC instant (H3 mirror). */
export function monthKeyMadrid(utcMs: number): string {
  const wall = madridWallClock(utcMs);
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}`;
}

/** Calendar month arithmetic on 'YYYY-MM' keys (H1/H2 mirror). */
export function addMonths(monthKey: string, monthsToAdd: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match || !Number.isInteger(monthsToAdd)) throw new Error(`invalid month key ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const zeroBased = year * 12 + (month - 1) + monthsToAdd;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = zeroBased - newYear * 12 + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

function madridOffsetMs(utcMs: number): number {
  const wall = madridWallClock(utcMs);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const truncated = Math.floor(utcMs / 1000) * 1000;
  return wallAsUtc - truncated;
}

/** UTC instant of Madrid midnight on (year, month, day) — H4 mirror. */
export function madridMidnightUtcMs(year: number, month: number, day: number): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let candidate = wallAsUtc - madridOffsetMs(wallAsUtc);
  candidate = wallAsUtc - madridOffsetMs(candidate);
  return candidate;
}

/**
 * H1+H3+H4 mirror: payout-eligibility instant (ISO) for a commission earned
 * at `earnedAtUtcMs` — Madrid midnight on the 1st of earned-month + 3.
 */
export function holdEligibilityIso(earnedAtUtcMs: number): string {
  const eligibleMonth = addMonths(monthKeyMadrid(earnedAtUtcMs), HOLD_ELIGIBILITY_MONTH_OFFSET);
  const match = /^(\d{4})-(\d{2})$/.exec(eligibleMonth);
  if (!match) throw new Error(`invalid eligible month ${eligibleMonth}`);
  return new Date(madridMidnightUtcMs(Number(match[1]), Number(match[2]), 1)).toISOString();
}

/**
 * The commission month DATE ('YYYY-MM-01', Madrid) used to look up the
 * partner_tier_snapshots row (0018: month pinned to day 1; T6: THAT month's
 * snapshot only — the dispatcher must never substitute another month).
 */
export function commissionMonthDate(earnedAtUtcMs: number): string {
  return `${monthKeyMadrid(earnedAtUtcMs)}-01`;
}

// ── round-half-up reversal arithmetic MIRROR (types.ts + refundAdjustments.ts) ──

/**
 * Round-half-up integer division mirror (src/billing/domain/types.ts):
 * "proportional refund reversal: round-half-up on cents of the proportional
 * product". Pure integer arithmetic — no floats.
 */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new Error(`divideRoundHalfUp.numerator: expected integer cents, got ${String(numerator)}`);
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`divideRoundHalfUp.denominator: expected integer cents, got ${String(denominator)}`);
  }
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/**
 * R2 mirror: raw proportional reversal, uncapped —
 * round-half-up(commission × refundedGross / originalGross).
 */
export function proportionalReversalCents(
  originalCommissionCents: number,
  originalGrossCents: number,
  refundedGrossCents: number,
): number {
  return divideRoundHalfUp(originalCommissionCents * refundedGrossCents, originalGrossCents);
}

export interface ReversalDecisionInput {
  /** Original commission amount (commission_entries.amount_cents), > 0. */
  commissionCents: number;
  /** Original commissionable gross (the charge/invoice amount), > 0. */
  grossCents: number;
  /**
   * Refunded gross for a proportional reversal (R2), or null for a FULL
   * reversal of whatever is still un-reversed (R5 / invoice void /
   * marked-uncollectible per the WEBHOOK_MATRIX ledger effects).
   */
  refundedGrossCents: number | null;
  /** Signed sum of the entry's prior adjustment amount_cents (reversals < 0). */
  priorAdjustmentsSumCents: number;
}

export type ReversalDecision =
  | { apply: true; amountCents: number; fullyReversedAfter: boolean }
  | { apply: false; reason: 'nothing_left_to_reverse' };

/**
 * R1/R2/R3/R5 mirror: decide the signed adjustment amount for one reversal
 * event. Cumulative reversals are capped at the original commission (R3);
 * `amountCents` is negative (append-only clawback, R4).
 */
export function decideReversal(input: ReversalDecisionInput): ReversalDecision {
  const alreadyReversed = 0 - input.priorAdjustmentsSumCents; // reversals are negative rows
  const remaining = input.commissionCents - alreadyReversed;
  if (remaining <= 0) return { apply: false, reason: 'nothing_left_to_reverse' };
  const proportional =
    input.refundedGrossCents === null
      ? remaining
      : proportionalReversalCents(input.commissionCents, input.grossCents, input.refundedGrossCents);
  const reversal = Math.min(proportional, remaining);
  if (reversal <= 0) return { apply: false, reason: 'nothing_left_to_reverse' };
  return { apply: true, amountCents: -reversal, fullyReversedAfter: reversal === remaining };
}

// ── checkout completion → billing_customers (0003) ──────────────────────────

export interface CheckoutMappingRow {
  user_id: string;
  stripe_customer_id: string;
}

/**
 * checkout.session.completed → the user ↔ Stripe-customer mapping. The
 * checkout creator sets client_reference_id = auth user id AND
 * metadata.pi_user_id (create-checkout-session contract); either works,
 * client_reference_id wins. Missing refs → null (acknowledged no-op — there
 * is nothing safe to map, same stance as stripe-subscription-webhook v1).
 */
export function extractCheckoutMapping(session: Payload): CheckoutMappingRow | null {
  const metadata = asObject(session.metadata);
  const userId = asString(session.client_reference_id) ?? (metadata ? asString(metadata.pi_user_id) : null);
  const customerId = asId(session.customer);
  if (!userId || !customerId) return null;
  return { user_id: userId, stripe_customer_id: customerId };
}

// ── subscription state sync → customer_subscriptions (0015) ─────────────────

export interface SubscriptionSnapshot {
  id: string;
  customerId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodStartEpoch: number | null;
  currentPeriodEndEpoch: number | null;
  cancelAtPeriodEnd: boolean;
  endedAtEpoch: number | null;
  canceledAtEpoch: number | null;
  latestInvoiceId: string | null;
}

/**
 * Version-robust subscription extraction (same stance as the v1 webhook):
 * current_period_* live on the Subscription pre-Basil and on the
 * SubscriptionItem from 2025+ — read both so grace never silently nulls out.
 */
export function extractSubscriptionSnapshot(subscription: Payload): SubscriptionSnapshot {
  const items = asObject(subscription.items);
  const itemsData = items && Array.isArray(items.data) ? (items.data as unknown[]) : [];
  const firstItem = asObject(itemsData[0]);
  const price = firstItem ? asObject(firstItem.price) : null;
  return {
    id: asString(subscription.id) ?? '',
    customerId: asId(subscription.customer),
    status: asString(subscription.status) ?? 'unknown',
    priceId: price ? asString(price.id) : null,
    currentPeriodStartEpoch:
      asNumber(subscription.current_period_start) ??
      (firstItem ? asNumber(firstItem.current_period_start) : null),
    currentPeriodEndEpoch:
      asNumber(subscription.current_period_end) ??
      (firstItem ? asNumber(firstItem.current_period_end) : null),
    cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end) ?? false,
    endedAtEpoch: asNumber(subscription.ended_at),
    canceledAtEpoch: asNumber(subscription.canceled_at),
    latestInvoiceId: asId(subscription.latest_invoice),
  };
}

/**
 * Stripe status → stored status. MIRROR of mapping.ts mapStripeStatus: a
 * deleted subscription is 'canceled' no matter what the payload carried;
 * unknown statuses pass through verbatim (fail-safe to no access downstream).
 */
export function mapSubscriptionStatus(eventType: string, stripeStatus: string): string {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  return stripeStatus;
}

/** billing_price_catalog columns the sync needs (0014). */
export interface CatalogOffer {
  offer_key: string;
  product: string;
  cadence: string;
  variant: string;
  commission_cadence: string;
}

/** The CLOSED customer_subscriptions upsert payload — exactly these keys. */
export interface CustomerSubscriptionRow {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  offer_key: string;
  product: string;
  cadence: string;
  variant: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  cancelled_at: string | null;
  latest_invoice_id: string | null;
  livemode: boolean;
}

/**
 * Pinned by tests — no unknown key can ride along, and the orchestrator-owned
 * columns (stripe_schedule_id, attribution_id, continuity_armed, benefit_used,
 * latest_payment_intent_id) are deliberately ABSENT: this writer never
 * touches the 15-month benefit lifecycle or attribution linkage.
 */
export const CUSTOMER_SUBSCRIPTION_ROW_KEYS: readonly (keyof CustomerSubscriptionRow)[] = [
  'user_id',
  'stripe_customer_id',
  'stripe_subscription_id',
  'offer_key',
  'product',
  'cadence',
  'variant',
  'status',
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'ended_at',
  'cancelled_at',
  'latest_invoice_id',
  'livemode',
];

/** Build the closed upsert row — field-by-field, deterministic (idempotent). */
export function buildCustomerSubscriptionRow(input: {
  eventType: string;
  userId: string;
  snapshot: SubscriptionSnapshot;
  offer: CatalogOffer;
  livemode: boolean;
}): CustomerSubscriptionRow {
  return {
    user_id: input.userId,
    stripe_customer_id: input.snapshot.customerId ?? '',
    stripe_subscription_id: input.snapshot.id,
    offer_key: input.offer.offer_key,
    product: input.offer.product,
    cadence: input.offer.cadence,
    variant: input.offer.variant,
    status: mapSubscriptionStatus(input.eventType, input.snapshot.status),
    current_period_start: epochToIso(input.snapshot.currentPeriodStartEpoch),
    current_period_end: epochToIso(input.snapshot.currentPeriodEndEpoch),
    cancel_at_period_end: input.snapshot.cancelAtPeriodEnd,
    ended_at: epochToIso(input.snapshot.endedAtEpoch),
    cancelled_at: epochToIso(input.snapshot.canceledAtEpoch),
    latest_invoice_id: input.snapshot.latestInvoiceId,
    livemode: input.livemode,
  };
}

// ── entitlement mirror (0015 entitlements, source_type 'paid_subscription') ──

export type EntitlementMirrorDecision =
  | { grant: true; endsAt: string | null }
  | { grant: false };

/**
 * MIRROR of planFromSubscription (src/access/subscription.ts), expressed as
 * an entitlement row the pure resolver (entitlementResolver.ts) reads back
 * identically: active | trialing → active open-ended grant; past_due →
 * active grant bounded by current_period_end (the resolver's clock check IS
 * the grace check); anything else → no grant (existing active row expires).
 */
export function decideEntitlementMirror(
  storedStatus: string,
  currentPeriodEndIso: string | null,
): EntitlementMirrorDecision {
  if (storedStatus === 'active' || storedStatus === 'trialing') {
    return { grant: true, endsAt: null };
  }
  if (storedStatus === 'past_due') {
    return currentPeriodEndIso !== null ? { grant: true, endsAt: currentPeriodEndIso } : { grant: false };
  }
  return { grant: false };
}

/** The CLOSED entitlements insert payload (0015) — paid_subscription only. */
export interface EntitlementInsertRow {
  user_id: string;
  scope: string;
  source_type: 'paid_subscription';
  source_id: string;
  ends_at: string | null;
  status: 'active';
  granted_by: 'system:webhook';
}

export const ENTITLEMENT_INSERT_ROW_KEYS: readonly (keyof EntitlementInsertRow)[] = [
  'user_id',
  'scope',
  'source_type',
  'source_id',
  'ends_at',
  'status',
  'granted_by',
];

export function buildEntitlementInsertRow(input: {
  userId: string;
  /** billing_price_catalog product — the entitlement scope ('home' | 'pro'). */
  product: string;
  /** customer_subscriptions.id (the granting record, 0015 source_id). */
  subscriptionCacheId: string;
  endsAt: string | null;
}): EntitlementInsertRow {
  return {
    user_id: input.userId,
    scope: input.product,
    source_type: 'paid_subscription',
    source_id: input.subscriptionCacheId,
    ends_at: input.endsAt,
    status: 'active',
    granted_by: 'system:webhook',
  };
}

// ── invoice → commission entry (0018, ONE entry per invoice) ─────────────────

export interface InvoiceSnapshot {
  id: string;
  status: string;
  amountPaidCents: number;
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  paidAtEpoch: number | null;
}

/**
 * Version-robust invoice extraction: `subscription` is top-level pre-Basil
 * and under parent.subscription_details.subscription from 2025+.
 */
export function extractInvoiceSnapshot(invoice: Payload): InvoiceSnapshot {
  const parent = asObject(invoice.parent);
  const subscriptionDetails = parent ? asObject(parent.subscription_details) : null;
  const statusTransitions = asObject(invoice.status_transitions);
  return {
    id: asString(invoice.id) ?? '',
    status: asString(invoice.status) ?? 'unknown',
    amountPaidCents: asNumber(invoice.amount_paid) ?? 0,
    customerId: asId(invoice.customer),
    subscriptionId:
      asId(invoice.subscription) ??
      (subscriptionDetails ? asId(subscriptionDetails.subscription) : null),
    paymentIntentId: asId(invoice.payment_intent),
    paidAtEpoch: statusTransitions ? asNumber(statusTransitions.paid_at) : null,
  };
}

export type CommissionEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'invoice_not_paid' | 'zero_value_invoice' };

/**
 * C6 mirror (commissionRules.classifyCommissionableEvent, invoice-evidence
 * subset): only a PAID invoice with a positive amount can earn commission.
 * Duplicate/self-referral/attribution refusals are decided by the dispatcher
 * against DB evidence (unique invoice index, partners.user_id comparison).
 */
export function decideCommissionEligibility(invoice: InvoiceSnapshot): CommissionEligibility {
  if (invoice.status !== 'paid') return { eligible: false, reason: 'invoice_not_paid' };
  if (invoice.amountPaidCents <= 0) return { eligible: false, reason: 'zero_value_invoice' };
  return { eligible: true };
}

/** referral_attributions columns the lock decision needs (0017). */
export interface AttributionCandidate {
  id: string;
  method: string;
  status: string;
  window_expires_at: string;
  created_at: string;
}

/**
 * Pick the pending attribution to LOCK on the first commissionable payment
 * (0017 state machine pending → active). Decision-7 mirror: explicit code
 * beats an unconverted cookie; the window must not have expired at payment
 * time; newest evidence wins within a method.
 */
export function pickAttributionToLock(
  candidates: readonly AttributionCandidate[],
  paidAtUtcMs: number,
): AttributionCandidate | null {
  const inWindow = candidates.filter(
    (c) => c.status === 'pending' && new Date(c.window_expires_at).getTime() > paidAtUtcMs,
  );
  const byRecency = (a: AttributionCandidate, b: AttributionCandidate) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const explicit = inWindow.filter((c) => c.method === 'explicit_code').sort(byRecency);
  if (explicit.length > 0) return explicit[0] ?? null;
  const cookie = inWindow.filter((c) => c.method === 'referral_link').sort(byRecency);
  return cookie[0] ?? null;
}

/** The CLOSED commission_entries insert payload (0018) — exactly these keys. */
export interface CommissionEntryRow {
  partner_id: string;
  attribution_id: string | null;
  subscription_id: string | null;
  stripe_subscription_id: string;
  stripe_invoice_id: string;
  stripe_payment_intent_id: string | null;
  offer_key: string;
  product: string;
  cadence: string;
  tier: string;
  rule_version: number;
  amount_cents: number;
  currency: 'eur';
  status: 'held';
  earned_at: string;
  eligible_at: string;
  livemode: boolean;
}

export const COMMISSION_ENTRY_ROW_KEYS: readonly (keyof CommissionEntryRow)[] = [
  'partner_id',
  'attribution_id',
  'subscription_id',
  'stripe_subscription_id',
  'stripe_invoice_id',
  'stripe_payment_intent_id',
  'offer_key',
  'product',
  'cadence',
  'tier',
  'rule_version',
  'amount_cents',
  'currency',
  'status',
  'earned_at',
  'eligible_at',
  'livemode',
];

/**
 * Build the immutable ledger row: status 'held', earned_at = the payment
 * instant, eligible_at = Madrid midnight on the 1st of earned-month + 3
 * (H1 mirror), cadence = the offer's COMMISSION cadence (0014: monthly offers
 * pay monthly; annual and 15-month offers pay annual), amount from the
 * versioned commission_rules row in force (0018 seed = C1 rate table v1).
 */
export function buildCommissionEntryRow(input: {
  partnerId: string;
  attributionId: string | null;
  subscriptionCacheId: string | null;
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  stripePaymentIntentId: string | null;
  offerKey: string;
  product: string;
  commissionCadence: string;
  tier: string;
  ruleVersion: number;
  amountCents: number;
  earnedAtUtcMs: number;
  livemode: boolean;
}): CommissionEntryRow {
  return {
    partner_id: input.partnerId,
    attribution_id: input.attributionId,
    subscription_id: input.subscriptionCacheId,
    stripe_subscription_id: input.stripeSubscriptionId,
    stripe_invoice_id: input.stripeInvoiceId,
    stripe_payment_intent_id: input.stripePaymentIntentId,
    offer_key: input.offerKey,
    product: input.product,
    cadence: input.commissionCadence,
    tier: input.tier,
    rule_version: input.ruleVersion,
    amount_cents: input.amountCents,
    currency: 'eur',
    status: 'held',
    earned_at: new Date(input.earnedAtUtcMs).toISOString(),
    eligible_at: holdEligibilityIso(input.earnedAtUtcMs),
    livemode: input.livemode,
  };
}

/** commission_rules row subset (0018). */
export interface CommissionRuleRow {
  version: number;
  amount_cents: number;
}

/**
 * The rate IN FORCE when earned = the highest seeded rule version for the
 * (product, cadence, tier) cell — versions append, never mutate (0018).
 */
export function pickLatestRuleVersion(rows: readonly CommissionRuleRow[]): CommissionRuleRow | null {
  let latest: CommissionRuleRow | null = null;
  for (const row of rows) {
    if (latest === null || row.version > latest.version) latest = row;
  }
  return latest;
}

// ── adjustments (0018, append-only) ──────────────────────────────────────────

/** The CLOSED commission_adjustments insert payload (0018). */
export interface CommissionAdjustmentRow {
  partner_id: string;
  commission_entry_id: string;
  amount_cents: number;
  currency: 'eur';
  kind: 'refund_reversal' | 'dispute_reversal';
  reason: string;
  source_event_key: string;
}

export const COMMISSION_ADJUSTMENT_ROW_KEYS: readonly (keyof CommissionAdjustmentRow)[] = [
  'partner_id',
  'commission_entry_id',
  'amount_cents',
  'currency',
  'kind',
  'reason',
  'source_event_key',
];

export function buildCommissionAdjustmentRow(input: {
  partnerId: string;
  commissionEntryId: string;
  amountCents: number;
  kind: 'refund_reversal' | 'dispute_reversal';
  reason: string;
  sourceEventKey: string;
}): CommissionAdjustmentRow {
  return {
    partner_id: input.partnerId,
    commission_entry_id: input.commissionEntryId,
    amount_cents: input.amountCents,
    currency: 'eur',
    kind: input.kind,
    reason: input.reason,
    source_event_key: input.sourceEventKey,
  };
}

// ── refunds / disputes / connect account extraction ──────────────────────────

export interface RefundSnapshot {
  id: string;
  status: string | null;
  amountCents: number;
  chargeId: string | null;
  paymentIntentId: string | null;
}

export function extractRefundSnapshot(refund: Payload): RefundSnapshot {
  return {
    id: asString(refund.id) ?? '',
    status: asString(refund.status),
    amountCents: asNumber(refund.amount) ?? 0,
    chargeId: asId(refund.charge),
    paymentIntentId: asId(refund.payment_intent),
  };
}

export interface ChargeSnapshot {
  id: string;
  amountCents: number;
  invoiceId: string | null;
  paymentIntentId: string | null;
  refunds: RefundSnapshot[];
}

export function extractChargeSnapshot(charge: Payload): ChargeSnapshot {
  const refundsList = asObject(charge.refunds);
  const refundsData = refundsList && Array.isArray(refundsList.data) ? (refundsList.data as unknown[]) : [];
  const refunds: RefundSnapshot[] = [];
  for (const item of refundsData) {
    const refund = asObject(item);
    if (refund) refunds.push(extractRefundSnapshot(refund));
  }
  return {
    id: asString(charge.id) ?? '',
    amountCents: asNumber(charge.amount) ?? 0,
    invoiceId: asId(charge.invoice),
    paymentIntentId: asId(charge.payment_intent),
    refunds,
  };
}

export interface DisputeSnapshot {
  id: string;
  chargeId: string | null;
  paymentIntentId: string | null;
}

export function extractDisputeSnapshot(dispute: Payload): DisputeSnapshot {
  return {
    id: asString(dispute.id) ?? '',
    chargeId: asId(dispute.charge),
    paymentIntentId: asId(dispute.payment_intent),
  };
}

export interface ConnectAccountSnapshot {
  id: string;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

/**
 * account.updated → partners status mirror (0016 columns exist verbatim for
 * this: onboarding_complete ← details_submitted, payouts_enabled ←
 * payouts_enabled). Requirements details have no local column — not stored.
 */
export function extractConnectAccountSnapshot(account: Payload): ConnectAccountSnapshot {
  return {
    id: asString(account.id) ?? '',
    detailsSubmitted: asBoolean(account.details_submitted) ?? false,
    payoutsEnabled: asBoolean(account.payouts_enabled) ?? false,
  };
}

// ── honest no-contract map ───────────────────────────────────────────────────

/**
 * Intents/events whose local effects have NO implementable contract in
 * migrations 0014–0021 — each is an explicit no-op recorded as
 * `skipped_no_contract:<reason>` in the event row's processing note, never an
 * invented writer. The exact gaps:
 *  - checkout async status / invoice mirror / dunning state / dispute mirror /
 *    conversion-intent payment linkage / schedule → benefit-use linkage:
 *    no target table or linkage column exists;
 *  - transfer/payout events: partner_payouts.stripe_transfer_id is written by
 *    the payout job at transfer time (0019) and no po_* column exists anywhere;
 *  - transfer.reversed / payout.failed / payout.canceled carry-forward:
 *    commission_adjustments.commission_entry_id is NOT NULL (0018) — a
 *    transfer/payout-level adjustment spans many entries and cannot be
 *    represented; payoutNetting owns carry-forward;
 *  - charge.dispute.funds_reinstated: 0018 restricts kind to
 *    refund_reversal | dispute_reversal | manual — the domain module's
 *    'dispute_reinstatement' kind cannot be stored (flagged for review).
 */
export const NO_CONTRACT_REASONS: Readonly<Record<string, string>> = {
  'checkout.session.async_payment_succeeded': 'no_checkout_correlation_table',
  'checkout.session.async_payment_failed': 'no_checkout_correlation_table',
  'subscription_schedule.created': 'no_schedule_linkage_column_on_partner_benefit_uses',
  'subscription_schedule.updated': 'no_schedule_linkage_column_on_partner_benefit_uses',
  'subscription_schedule.released': 'no_schedule_linkage_column_on_partner_benefit_uses',
  'subscription_schedule.canceled': 'no_schedule_linkage_column_on_partner_benefit_uses',
  'subscription_schedule.completed': 'no_schedule_linkage_column_on_partner_benefit_uses',
  'invoice.finalized': 'no_invoice_mirror_table',
  'invoice.payment_failed': 'no_invoice_dunning_mirror_table',
  'invoice.payment_action_required': 'no_invoice_dunning_mirror_table',
  'payment_intent.processing': 'no_payment_intent_column_on_conversion_intents',
  'payment_intent.succeeded': 'no_payment_intent_column_on_conversion_intents',
  'payment_intent.payment_failed': 'no_payment_intent_column_on_conversion_intents',
  'payment_intent.canceled': 'no_payment_intent_column_on_conversion_intents',
  'charge.dispute.created': 'no_dispute_mirror_table',
  'charge.dispute.updated': 'no_dispute_mirror_table',
  'charge.dispute.closed': 'no_dispute_mirror_table',
  'charge.dispute.funds_reinstated': 'adjustment_kind_vocabulary_lacks_reinstatement',
  'transfer.created': 'transfer_linkage_written_by_payout_job',
  'transfer.updated': 'transfer_linkage_written_by_payout_job',
  'transfer.reversed': 'adjustment_requires_single_commission_entry',
  'payout.created': 'no_stripe_payout_id_column',
  'payout.updated': 'no_stripe_payout_id_column',
  'payout.paid': 'no_stripe_payout_id_column',
  'payout.failed': 'no_stripe_payout_id_column_and_adjustment_requires_single_entry',
  'payout.canceled': 'no_stripe_payout_id_column_and_adjustment_requires_single_entry',
};

/** Formatted processing note for an honest no-op. */
export function noContractNote(eventType: string): string | null {
  const reason = NO_CONTRACT_REASONS[eventType];
  return reason ? `skipped_no_contract:${reason}` : null;
}
