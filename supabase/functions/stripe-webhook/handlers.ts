/**
 * stripe-webhook (v2, billing platform) — PURE routing/decision logic.
 *
 * Same pattern as ../stripe-subscription-webhook/mapping.ts: zero IO, zero
 * Deno APIs, zero SDK imports, so the repo's vitest suite unit-tests the
 * exact event matrix, idempotency keys, duplicate/out-of-order decisions and
 * the durable-event state machine without a Deno runtime. index.ts is the
 * thin Deno shell (signature verification, insert-first durability,
 * dispatch, 2xx after durable receipt).
 *
 * The event list is DELIBERATE (§13.3 domains) — no wildcard subscriptions.
 * `docs/billing-partner/WEBHOOK_MATRIX.md` is the human-readable mirror of
 * this table and is lockstep-tested against it.
 */

/** How a handler's local effect is deduplicated. */
export type IdempotencyScope =
  /** Once per Stripe event id (pure event facts). */
  | 'event'
  /** Once per Stripe object id (e.g. one commission entry per invoice). */
  | 'object'
  /** Latest-wins per object; keyed on object id + event created. */
  | 'object_version';

export type HandlerKind =
  | 'checkout_completion'
  | 'checkout_async_payment_succeeded'
  | 'checkout_async_payment_failed'
  | 'subscription_state_sync'
  | 'schedule_state_sync'
  | 'invoice_finalized'
  | 'commissionable_payment'
  | 'payment_failure_notice'
  | 'invoice_voided'
  | 'invoice_uncollectible'
  | 'payment_intent_progress'
  | 'refund_reversal'
  | 'dispute_lifecycle'
  | 'connect_account_status'
  | 'transfer_status'
  | 'payout_status';

export interface HandlerIntent {
  kind: HandlerKind;
  idempotencyScope: IdempotencyScope;
  /**
   * True → the handler must RE-FETCH the current object from Stripe before
   * applying local effects (payload snapshots can arrive out of order; the
   * refetched object is always current). False → the event payload is an
   * immutable fact that can be applied directly.
   */
  requiresRefetch: boolean;
  /** Human description of the commission-ledger consequence (may be none). */
  ledgerEffect: string;
  /** Local tables/domains the handler touches (beyond stripe_webhook_events). */
  localEffects: readonly string[];
}

const intent = (
  kind: HandlerKind,
  idempotencyScope: IdempotencyScope,
  requiresRefetch: boolean,
  ledgerEffect: string,
  localEffects: readonly string[],
): HandlerIntent => ({ kind, idempotencyScope, requiresRefetch, ledgerEffect, localEffects });

/**
 * The full deliberate event matrix. Kept as a single flat record so tests
 * and WEBHOOK_MATRIX.md can pin it 1:1.
 */
export const WEBHOOK_EVENT_INTENTS: Readonly<Record<string, HandlerIntent>> = {
  // ── Checkout ──────────────────────────────────────────────────────────────
  'checkout.session.completed': intent(
    'checkout_completion',
    'object',
    false,
    'none (attribution locks later, on the first commissionable payment)',
    ['billing_customers', 'checkout session correlation (metadata → user/offer/attribution)'],
  ),
  'checkout.session.async_payment_succeeded': intent(
    'checkout_async_payment_succeeded',
    'object',
    false,
    'none (invoice.paid carries the money fact)',
    ['checkout session correlation status'],
  ),
  'checkout.session.async_payment_failed': intent(
    'checkout_async_payment_failed',
    'object',
    false,
    'none',
    ['checkout session correlation status'],
  ),

  // ── Subscriptions (cache truth) ───────────────────────────────────────────
  'customer.subscription.created': intent(
    'subscription_state_sync',
    'object_version',
    true,
    'none',
    ['subscriptions'],
  ),
  'customer.subscription.updated': intent(
    'subscription_state_sync',
    'object_version',
    true,
    'none',
    ['subscriptions'],
  ),
  'customer.subscription.deleted': intent(
    'subscription_state_sync',
    'object_version',
    true,
    'none',
    ['subscriptions'],
  ),

  // ── Subscription schedules (15-month benefit) ─────────────────────────────
  'subscription_schedule.created': intent(
    'schedule_state_sync',
    'object_version',
    true,
    'none',
    ['partner_benefit_uses (schedule linkage)'],
  ),
  'subscription_schedule.updated': intent(
    'schedule_state_sync',
    'object_version',
    true,
    'none',
    ['partner_benefit_uses (schedule linkage)'],
  ),
  'subscription_schedule.released': intent(
    'schedule_state_sync',
    'object_version',
    true,
    'none',
    ['partner_benefit_uses (schedule linkage)'],
  ),
  'subscription_schedule.canceled': intent(
    'schedule_state_sync',
    'object_version',
    true,
    'none',
    ['partner_benefit_uses (schedule linkage)'],
  ),
  'subscription_schedule.completed': intent(
    'schedule_state_sync',
    'object_version',
    true,
    'none',
    ['partner_benefit_uses (schedule linkage)'],
  ),

  // ── Invoices (the money truth) ────────────────────────────────────────────
  'invoice.finalized': intent(
    'invoice_finalized',
    'object_version',
    false,
    'none (finalization is a pre-payment fact)',
    ['invoice mirror'],
  ),
  'invoice.paid': intent(
    'commissionable_payment',
    'object',
    true,
    'commission_entries: ONE entry per invoice; locks referral_attributions on first commissionable payment',
    ['commission_entries', 'referral_attributions', 'invoice mirror'],
  ),
  'invoice.payment_succeeded': intent(
    'commissionable_payment',
    'object',
    true,
    'same as invoice.paid — object-scoped so the pair can never double-book one invoice',
    ['commission_entries', 'referral_attributions', 'invoice mirror'],
  ),
  'invoice.payment_failed': intent(
    'payment_failure_notice',
    'object_version',
    true,
    'none (no entry is written for a failed payment)',
    ['invoice mirror (dunning state)'],
  ),
  'invoice.payment_action_required': intent(
    'payment_failure_notice',
    'object_version',
    true,
    'none',
    ['invoice mirror (dunning state)'],
  ),
  'invoice.voided': intent(
    'invoice_voided',
    'object',
    true,
    'commission_adjustments: full reversal appended IF an entry exists for the invoice',
    ['commission_adjustments', 'invoice mirror'],
  ),
  'invoice.marked_uncollectible': intent(
    'invoice_uncollectible',
    'object',
    true,
    'commission_adjustments: full reversal appended IF an entry exists for the invoice',
    ['commission_adjustments', 'invoice mirror'],
  ),

  // ── Payment intents (async/SEPA progress for the conversion flow) ─────────
  'payment_intent.processing': intent(
    'payment_intent_progress',
    'object_version',
    false,
    'none',
    ['conversion intent correlation (async path progress)'],
  ),
  'payment_intent.succeeded': intent(
    'payment_intent_progress',
    'object_version',
    false,
    'none (invoice.paid is the ledger trigger)',
    ['conversion intent correlation (async path progress)'],
  ),
  'payment_intent.payment_failed': intent(
    'payment_intent_progress',
    'object_version',
    false,
    'none',
    ['conversion intent correlation (async path progress)'],
  ),
  'payment_intent.canceled': intent(
    'payment_intent_progress',
    'object_version',
    false,
    'none',
    ['conversion intent correlation (async path progress)'],
  ),

  // ── Refunds (proportional reversal) ───────────────────────────────────────
  'charge.refunded': intent(
    'refund_reversal',
    'object',
    true,
    'commission_adjustments: proportional reversal per refund (round-half-up on cents)',
    ['commission_adjustments'],
  ),
  'refund.created': intent(
    'refund_reversal',
    'object',
    true,
    'commission_adjustments: proportional reversal per refund id (object-scoped — never doubled)',
    ['commission_adjustments'],
  ),
  'refund.updated': intent(
    'refund_reversal',
    'object',
    true,
    'commission_adjustments: reconcile reversal if the refund amount/status changed',
    ['commission_adjustments'],
  ),
  // Pinned-API caveat: older API versions deliver refund updates as
  // charge.refund.updated instead of refund.updated — routed identically.
  'charge.refund.updated': intent(
    'refund_reversal',
    'object',
    true,
    'same as refund.updated (legacy event name on older pinned API versions)',
    ['commission_adjustments'],
  ),

  // ── Disputes ──────────────────────────────────────────────────────────────
  'charge.dispute.created': intent(
    'dispute_lifecycle',
    'object_version',
    true,
    'none on open (funds events carry the money movement)',
    ['dispute mirror'],
  ),
  'charge.dispute.updated': intent(
    'dispute_lifecycle',
    'object_version',
    true,
    'none',
    ['dispute mirror'],
  ),
  'charge.dispute.closed': intent(
    'dispute_lifecycle',
    'object_version',
    true,
    'none (funds_withdrawn/reinstated already booked the movements)',
    ['dispute mirror'],
  ),
  'charge.dispute.funds_withdrawn': intent(
    'dispute_lifecycle',
    'object',
    true,
    'commission_adjustments: reversal appended for the disputed payment',
    ['commission_adjustments', 'dispute mirror'],
  ),
  'charge.dispute.funds_reinstated': intent(
    'dispute_lifecycle',
    'object',
    true,
    'commission_adjustments: re-credit appended (history is never mutated)',
    ['commission_adjustments', 'dispute mirror'],
  ),

  // ── Connect: partner account status ───────────────────────────────────────
  'account.updated': intent(
    'connect_account_status',
    'object_version',
    true,
    'none',
    ['partner account status mirror (charges/payouts enabled, requirements)'],
  ),

  // ── Connect: transfers (payout batch execution) ───────────────────────────
  'transfer.created': intent(
    'transfer_status',
    'object',
    false,
    'none (the batch already booked the payout items; this links the transfer id)',
    ['partner_payout_items (transfer linkage)'],
  ),
  'transfer.updated': intent(
    'transfer_status',
    'object_version',
    true,
    'none',
    ['partner_payout_items (transfer linkage)'],
  ),
  'transfer.reversed': intent(
    'transfer_status',
    'object',
    true,
    'commission_adjustments: negative carry-forward appended for the reversed transfer',
    ['commission_adjustments', 'partner_payout_items (transfer linkage)'],
  ),

  // ── Connect: payouts (partner bank payouts) ───────────────────────────────
  'payout.created': intent(
    'payout_status',
    'object_version',
    false,
    'none',
    ['partner_payouts (status mirror)'],
  ),
  'payout.updated': intent(
    'payout_status',
    'object_version',
    true,
    'none',
    ['partner_payouts (status mirror)'],
  ),
  'payout.paid': intent(
    'payout_status',
    'object_version',
    true,
    'none (entries were settled at transfer time; this closes the loop)',
    ['partner_payouts (status mirror)'],
  ),
  'payout.failed': intent(
    'payout_status',
    'object_version',
    true,
    'commission_adjustments: failed payout re-opens the balance (carry-forward)',
    ['commission_adjustments', 'partner_payouts (status mirror)'],
  ),
  'payout.canceled': intent(
    'payout_status',
    'object_version',
    true,
    'commission_adjustments: canceled payout re-opens the balance (carry-forward)',
    ['commission_adjustments', 'partner_payouts (status mirror)'],
  ),
};

/** The deliberate subscription list (exactly what Nicolas selects in §9). */
export const SUPPORTED_WEBHOOK_EVENTS: readonly string[] = Object.keys(WEBHOOK_EVENT_INTENTS);

/** Route an event type. Null → acknowledge-unsupported (200, no write). */
export function routeWebhookEvent(eventType: string): HandlerIntent | null {
  return WEBHOOK_EVENT_INTENTS[eventType] ?? null;
}

/**
 * Deterministic idempotency key for a handler's LOCAL effect (distinct from
 * the durable stripe_webhook_events unique event id).
 */
export function buildIdempotencyKey(
  scope: IdempotencyScope,
  parts: { eventId: string; objectId: string; eventCreated: number },
): string {
  switch (scope) {
    case 'event':
      return `evt:${parts.eventId}`;
    case 'object':
      return `obj:${parts.objectId}`;
    case 'object_version':
      return `objv:${parts.objectId}:${parts.eventCreated}`;
  }
}

// ── Duplicate / out-of-order tolerance ──────────────────────────────────────

export type ApplyDecision =
  /** Event id already fully processed → acknowledge, do nothing. */
  | 'skip_duplicate'
  /** A NEWER version of the object was already applied → drop this one. */
  | 'skip_stale'
  /** Order ambiguous or handler demands current state → re-fetch, then apply. */
  | 'refetch_current'
  /** Payload can be applied directly. */
  | 'apply';

/**
 * Pure decision: what to do with an event given the stored object version.
 * `storedObjectVersion` is the (event.created, event.id) that last wrote the
 * local mirror of this object; null when the object was never written.
 */
export function decideEventApplication(input: {
  eventId: string;
  eventCreated: number;
  /** stripe_webhook_events already has this event id in state `processed`. */
  alreadyProcessed: boolean;
  requiresRefetch: boolean;
  storedObjectVersion: { lastEventCreated: number; lastEventId: string } | null;
}): ApplyDecision {
  if (input.alreadyProcessed) return 'skip_duplicate';
  const stored = input.storedObjectVersion;
  if (stored) {
    if (stored.lastEventId === input.eventId) return 'skip_duplicate';
    if (input.eventCreated < stored.lastEventCreated) return 'skip_stale';
    if (input.eventCreated === stored.lastEventCreated) return 'refetch_current';
  }
  return input.requiresRefetch ? 'refetch_current' : 'apply';
}

// ── Durable-event state machine (stripe_webhook_events.state) ───────────────

export type WebhookEventState = 'received' | 'processing' | 'processed' | 'failed' | 'retryable';

/** received → processing → processed | failed; failed → retryable → processing. */
export const WEBHOOK_EVENT_STATE_TRANSITIONS: Readonly<
  Record<WebhookEventState, readonly WebhookEventState[]>
> = {
  received: ['processing'],
  processing: ['processed', 'failed'],
  failed: ['retryable'],
  retryable: ['processing'],
  processed: [],
};

export function canTransitionWebhookEventState(
  from: WebhookEventState,
  to: WebhookEventState,
): boolean {
  return WEBHOOK_EVENT_STATE_TRANSITIONS[from].includes(to);
}

/**
 * After a processing failure: retry (→ retryable) while attempts remain,
 * park permanently in `failed` once the budget is spent. Attempts = number
 * of processing attempts ALREADY made including the one that just failed.
 */
export function decideFailureFollowup(
  attempts: number,
  maxAttempts = 5,
): 'retryable' | 'failed' {
  return attempts < maxAttempts ? 'retryable' : 'failed';
}
