/**
 * stripe-webhook (v2, billing platform) — per-intent effect DISPATCH (thin IO).
 *
 * All decisions live in ./effects.ts (pure, vitest-tested); this module only
 * moves rows: it receives a minimal structural DB client (the service-role
 * supabase-js client satisfies it) plus a Stripe refetcher, and applies the
 * per-intent local effects for one durably-received event.
 *
 * Contract with index.ts (the receipt shell):
 *  - called ONLY after the event row is durably 'processing';
 *  - returns { note } — a human-readable processing note ('skipped_…' honest
 *    no-ops included) stored on the processed row;
 *  - throws RetryableEffectError (or any infra error) when the effect could
 *    not be applied YET — index.ts then walks the row through
 *    processing → failed → retryable so the retry worker re-runs it. The 2xx
 *    already sent to Stripe is never broken by a dispatch failure.
 *
 * Idempotency (duplicate + out-of-order deliveries are byte-identical no-ops):
 *  - billing_customers: upsert on the user_id primary key;
 *  - customer_subscriptions: refetch-current (requiresRefetch intents) +
 *    deterministic closed row + upsert on unique stripe_subscription_id;
 *  - entitlements: converge-to-desired against the 0015 partial-unique active
 *    grant (insert conflicts are benign);
 *  - commission_entries: ONE row per invoice (0018 unique index; duplicate
 *    insert = benign 23505);
 *  - commission_adjustments: ONE row per source event key (0018 unique index;
 *    keys built with handlers.buildIdempotencyKey scopes);
 *  - partners status mirror: deterministic UPDATE of the two mirror columns.
 *
 * NEVER: grants for catalog-unknown price ids, PI-Verified/admin/partner/
 * invite entitlements, deletes, or edits of financial history (adjustments
 * are append-only; entries only ever advance status).
 */
import { buildIdempotencyKey, routeWebhookEvent } from './handlers.ts';
import {
  buildCommissionAdjustmentRow,
  buildCommissionEntryRow,
  buildCustomerSubscriptionRow,
  buildEntitlementInsertRow,
  commissionMonthDate,
  decideCommissionEligibility,
  decideEntitlementMirror,
  decideReversal,
  extractCheckoutMapping,
  extractChargeSnapshot,
  extractConnectAccountSnapshot,
  extractDisputeSnapshot,
  extractInvoiceSnapshot,
  extractRefundSnapshot,
  extractSubscriptionSnapshot,
  noContractNote,
  pickAttributionToLock,
  pickLatestRuleVersion,
  type AttributionCandidate,
  type CatalogOffer,
  type ChargeSnapshot,
  type CommissionRuleRow,
  type RefundSnapshot,
} from './effects.ts';

// ── minimal structural DB client (satisfied by supabase-js) ──────────────────

export interface DbError {
  code?: string;
  message?: string;
}

export interface DbResult<T> {
  data: T;
  error: DbError | null;
}

type Row = Record<string, unknown>;

export interface DbSelectQuery extends PromiseLike<DbResult<Row[] | null>> {
  eq(column: string, value: unknown): DbSelectQuery;
  maybeSingle(): PromiseLike<DbResult<Row | null>>;
}

export interface DbUpdateQuery extends PromiseLike<DbResult<unknown>> {
  eq(column: string, value: unknown): DbUpdateQuery;
}

export interface DbUpsertQuery extends PromiseLike<DbResult<unknown>> {
  select(columns: string): { maybeSingle(): PromiseLike<DbResult<Row | null>> };
}

export interface DbTable {
  select(columns: string): DbSelectQuery;
  insert(values: Row): PromiseLike<DbResult<unknown>>;
  upsert(values: Row, options: { onConflict: string; ignoreDuplicates?: boolean }): DbUpsertQuery;
  update(values: Row): DbUpdateQuery;
}

export interface DbClient {
  from(table: string): DbTable;
}

/** Re-fetch the CURRENT Stripe object (requiresRefetch intents). */
export type StripeResource = 'subscription' | 'invoice' | 'charge' | 'refund' | 'dispute' | 'account';
export type StripeRefetcher = (resource: StripeResource, id: string) => Promise<Row>;

export interface DispatchDeps {
  db: DbClient;
  refetch: StripeRefetcher;
}

export interface WebhookEventFacts {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  object: Row;
}

/** Thrown when the effect cannot be applied YET — the retry worker re-runs it. */
export class RetryableEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableEffectError';
  }
}

const UNIQUE_VIOLATION = '23505';

function throwOnDbError(error: DbError | null, context: string): void {
  if (error) throw new RetryableEffectError(`${context}: ${error.message ?? error.code ?? 'db_error'}`);
}

/** Insert where a unique-key conflict means "already applied" (benign). */
async function insertIgnoringDuplicate(db: DbClient, table: string, row: Row, context: string): Promise<'inserted' | 'duplicate'> {
  const { error } = await db.from(table).insert(row);
  if (!error) return 'inserted';
  if (error.code === UNIQUE_VIOLATION) return 'duplicate';
  throw new RetryableEffectError(`${context}: ${error.message ?? error.code ?? 'db_error'}`);
}

// ── checkout completion → billing_customers ─────────────────────────────────

async function applyCheckoutCompletion(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const mapping = extractCheckoutMapping(event.object);
  if (!mapping) return 'skipped_no_user_or_customer_reference';
  const { error } = await deps.db
    .from('billing_customers')
    .upsert({ user_id: mapping.user_id, stripe_customer_id: mapping.stripe_customer_id }, { onConflict: 'user_id' });
  throwOnDbError(error, 'billing_customers upsert');
  return null;
}

// ── subscription state sync → customer_subscriptions + entitlement mirror ────

async function applySubscriptionSync(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_subscription_id';
  // requiresRefetch intent: payload snapshots can arrive out of order — the
  // refetched object is always current (latest-wins by construction).
  const snapshot = extractSubscriptionSnapshot(await deps.refetch('subscription', objectId));

  // NEVER grant on a catalog-unknown price (locked stance shared with the v1
  // webhook's allowlist): no cache row, no entitlement, acknowledged note.
  if (!snapshot.priceId) return 'skipped_unknown_price:none';
  const { data: offerRow, error: offerError } = await deps.db
    .from('billing_price_catalog')
    .select('offer_key, product, cadence, variant, commission_cadence')
    .eq('stripe_price_id', snapshot.priceId)
    .maybeSingle();
  throwOnDbError(offerError, 'billing_price_catalog lookup');
  if (!offerRow) return `skipped_unknown_price:${snapshot.priceId}`;
  const offer = offerRow as unknown as CatalogOffer;

  // The user mapping is written by checkout completion; until it lands this
  // event is retryable (the same self-healing race the v1 webhook documents).
  if (!snapshot.customerId) return 'skipped_no_customer_reference';
  const { data: mappingRow, error: mappingError } = await deps.db
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', snapshot.customerId)
    .maybeSingle();
  throwOnDbError(mappingError, 'billing_customers lookup');
  const userId = mappingRow && typeof mappingRow.user_id === 'string' ? mappingRow.user_id : null;
  if (!userId) throw new RetryableEffectError('customer_not_mapped_yet');

  const row = buildCustomerSubscriptionRow({
    eventType: event.type,
    userId,
    snapshot,
    offer,
    livemode: event.livemode,
  });
  const { data: cacheRow, error: upsertError } = await deps.db
    .from('customer_subscriptions')
    .upsert(row as unknown as Row, { onConflict: 'stripe_subscription_id' })
    .select('id')
    .maybeSingle();
  throwOnDbError(upsertError, 'customer_subscriptions upsert');
  const cacheId = cacheRow && typeof cacheRow.id === 'string' ? cacheRow.id : null;
  if (!cacheId) throw new RetryableEffectError('customer_subscriptions upsert returned no id');

  // Entitlement mirror (0015: paid_subscription rows mirror Stripe) —
  // converge the single active grant for (user, product, this cache row).
  const decision = decideEntitlementMirror(row.status, row.current_period_end);
  const { data: activeRows, error: activeError } = await deps.db
    .from('entitlements')
    .select('id, ends_at')
    .eq('user_id', userId)
    .eq('scope', offer.product)
    .eq('source_type', 'paid_subscription')
    .eq('source_id', cacheId)
    .eq('status', 'active');
  throwOnDbError(activeError, 'entitlements lookup');
  const active = (activeRows ?? [])[0] ?? null;

  if (decision.grant) {
    if (active) {
      const currentEndsAt = typeof active.ends_at === 'string' ? active.ends_at : null;
      if (currentEndsAt !== decision.endsAt) {
        const { error } = await deps.db
          .from('entitlements')
          .update({ ends_at: decision.endsAt })
          .eq('id', active.id as string);
        throwOnDbError(error, 'entitlements window update');
      }
      return null;
    }
    const insertRow = buildEntitlementInsertRow({
      userId,
      product: offer.product,
      subscriptionCacheId: cacheId,
      endsAt: decision.endsAt,
    });
    // 0015 partial-unique active grant: a concurrent duplicate is benign.
    await insertIgnoringDuplicate(deps.db, 'entitlements', insertRow as unknown as Row, 'entitlements insert');
    return null;
  }
  if (active) {
    const { error } = await deps.db
      .from('entitlements')
      .update({ status: 'expired' })
      .eq('id', active.id as string)
      .eq('status', 'active');
    throwOnDbError(error, 'entitlements expire');
    return null;
  }
  return null;
}

// ── invoice.paid / invoice.payment_succeeded → commission entry ─────────────

async function applyCommissionablePayment(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_invoice_id';
  const invoice = extractInvoiceSnapshot(await deps.refetch('invoice', objectId));

  const eligibility = decideCommissionEligibility(invoice);
  if (!eligibility.eligible) return `skipped_not_commissionable:${eligibility.reason}`;

  // ONE entry per invoice (0018): an existing entry makes this a pure no-op —
  // invoice.paid and invoice.payment_succeeded share the obj:<invoice> scope.
  const { data: existingEntries, error: existingError } = await deps.db
    .from('commission_entries')
    .select('id')
    .eq('stripe_invoice_id', invoice.id);
  throwOnDbError(existingError, 'commission_entries duplicate check');
  if ((existingEntries ?? []).length > 0) return 'skipped_duplicate_invoice_entry';

  if (!invoice.subscriptionId) return 'skipped_no_subscription_on_invoice';
  const paidAtUtcMs = (invoice.paidAtEpoch ?? event.created) * 1000;

  // Attribution authority (0017): an ACTIVE lock owns the subscription; else
  // the freshest in-window PENDING row is locked by this first payment.
  const { data: activeAttrRows, error: activeAttrError } = await deps.db
    .from('referral_attributions')
    .select('id, partner_id, user_id, status')
    .eq('stripe_subscription_id', invoice.subscriptionId)
    .eq('status', 'active');
  throwOnDbError(activeAttrError, 'referral_attributions active lookup');
  let attribution = (activeAttrRows ?? [])[0] ?? null;

  // The subscription cache row carries the offer resolution + the customer.
  const { data: cacheRow, error: cacheError } = await deps.db
    .from('customer_subscriptions')
    .select('id, user_id, offer_key, product')
    .eq('stripe_subscription_id', invoice.subscriptionId)
    .maybeSingle();
  throwOnDbError(cacheError, 'customer_subscriptions lookup');
  if (!cacheRow) {
    // The subscription_state_sync writer has not landed yet (out-of-order
    // delivery) — retry; NEVER invent an offer resolution here.
    throw new RetryableEffectError('subscription_cache_missing_for_invoice');
  }
  const cacheId = typeof cacheRow.id === 'string' ? cacheRow.id : null;
  const customerUserId = typeof cacheRow.user_id === 'string' ? cacheRow.user_id : null;
  const offerKey = typeof cacheRow.offer_key === 'string' ? cacheRow.offer_key : null;
  const product = typeof cacheRow.product === 'string' ? cacheRow.product : null;
  if (!cacheId || !customerUserId || !offerKey || !product) {
    throw new RetryableEffectError('subscription_cache_incomplete');
  }

  if (!attribution) {
    const { data: pendingRows, error: pendingError } = await deps.db
      .from('referral_attributions')
      .select('id, partner_id, user_id, method, status, window_expires_at, created_at')
      .eq('user_id', customerUserId)
      .eq('status', 'pending');
    throwOnDbError(pendingError, 'referral_attributions pending lookup');
    const picked = pickAttributionToLock(
      (pendingRows ?? []) as unknown as AttributionCandidate[],
      paidAtUtcMs,
    );
    if (picked) {
      attribution = (pendingRows ?? []).find((r) => r.id === picked.id) ?? null;
    }
  }
  if (!attribution) return 'skipped_no_attribution';
  const partnerId = typeof attribution.partner_id === 'string' ? attribution.partner_id : null;
  const attributionId = typeof attribution.id === 'string' ? attribution.id : null;
  if (!partnerId || !attributionId) throw new RetryableEffectError('attribution_row_incomplete');

  // C6 self-referral refusal: the partner may not earn on their own payment.
  const { data: partnerRow, error: partnerError } = await deps.db
    .from('partners')
    .select('user_id')
    .eq('id', partnerId)
    .maybeSingle();
  throwOnDbError(partnerError, 'partners lookup');
  if (partnerRow && partnerRow.user_id === customerUserId) return 'skipped_self_referral';

  // Lock a pending attribution on this first commissionable payment
  // (0017 pending → active; guarded so a concurrent lock never regresses).
  if (attribution.status === 'pending') {
    const { error: lockError } = await deps.db
      .from('referral_attributions')
      .update({
        status: 'active',
        locked_at: new Date(paidAtUtcMs).toISOString(),
        stripe_subscription_id: invoice.subscriptionId,
        subscription_id: cacheId,
      })
      .eq('id', attributionId)
      .eq('status', 'pending');
    throwOnDbError(lockError, 'referral_attributions lock');
  }

  // Offer → commission cadence (0014 CHECK: monthly pays monthly; annual and
  // 15-month pay annual).
  const { data: catalogRow, error: catalogError } = await deps.db
    .from('billing_price_catalog')
    .select('commission_cadence')
    .eq('offer_key', offerKey)
    .maybeSingle();
  throwOnDbError(catalogError, 'billing_price_catalog cadence lookup');
  const commissionCadence =
    catalogRow && typeof catalogRow.commission_cadence === 'string' ? catalogRow.commission_cadence : null;
  if (!commissionCadence) throw new RetryableEffectError('offer_missing_commission_cadence');

  // T6: the tier for the earned month comes from THAT month's snapshot only —
  // never another month, never the partners.tier convenience mirror. Missing
  // snapshot → retry until the snapshot job writes it.
  const month = commissionMonthDate(paidAtUtcMs);
  const { data: snapshotRow, error: snapshotError } = await deps.db
    .from('partner_tier_snapshots')
    .select('tier')
    .eq('partner_id', partnerId)
    .eq('month', month)
    .maybeSingle();
  throwOnDbError(snapshotError, 'partner_tier_snapshots lookup');
  const tier = snapshotRow && typeof snapshotRow.tier === 'string' ? snapshotRow.tier : null;
  if (!tier) throw new RetryableEffectError(`tier_snapshot_missing:${month}`);

  // The versioned rate in force (0018 commission_rules; seed = C1 table v1).
  const { data: ruleRows, error: ruleError } = await deps.db
    .from('commission_rules')
    .select('version, amount_cents')
    .eq('product', product)
    .eq('cadence', commissionCadence)
    .eq('tier', tier);
  throwOnDbError(ruleError, 'commission_rules lookup');
  const rule = pickLatestRuleVersion((ruleRows ?? []) as unknown as CommissionRuleRow[]);
  if (!rule) throw new RetryableEffectError(`commission_rule_missing:${product}/${commissionCadence}/${tier}`);

  const entry = buildCommissionEntryRow({
    partnerId,
    attributionId,
    subscriptionCacheId: cacheId,
    stripeSubscriptionId: invoice.subscriptionId,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: invoice.paymentIntentId,
    offerKey,
    product,
    commissionCadence,
    tier,
    ruleVersion: rule.version,
    amountCents: rule.amount_cents,
    earnedAtUtcMs: paidAtUtcMs,
    livemode: event.livemode,
  });
  const outcome = await insertIgnoringDuplicate(
    deps.db,
    'commission_entries',
    entry as unknown as Row,
    'commission_entries insert',
  );
  return outcome === 'duplicate' ? 'skipped_duplicate_invoice_entry' : null;
}

// ── reversal plumbing shared by refunds / disputes / voided invoices ─────────

interface EntryForReversal {
  id: string;
  partnerId: string;
  commissionCents: number;
  status: string;
}

async function findEntryByInvoiceOrPaymentIntent(
  deps: DispatchDeps,
  invoiceId: string | null,
  paymentIntentId: string | null,
): Promise<EntryForReversal | null> {
  const read = async (column: string, value: string): Promise<EntryForReversal | null> => {
    const { data, error } = await deps.db
      .from('commission_entries')
      .select('id, partner_id, amount_cents, status')
      .eq(column, value);
    throwOnDbError(error, `commission_entries lookup by ${column}`);
    const row = (data ?? [])[0] ?? null;
    if (!row) return null;
    return {
      id: String(row.id),
      partnerId: String(row.partner_id),
      commissionCents: Number(row.amount_cents),
      status: String(row.status),
    };
  };
  if (invoiceId) {
    const byInvoice = await read('stripe_invoice_id', invoiceId);
    if (byInvoice) return byInvoice;
  }
  if (paymentIntentId) return read('stripe_payment_intent_id', paymentIntentId);
  return null;
}

async function appendReversal(
  deps: DispatchDeps,
  entry: EntryForReversal,
  input: {
    refundedGrossCents: number | null;
    grossCents: number;
    kind: 'refund_reversal' | 'dispute_reversal';
    reason: string;
    sourceEventKey: string;
  },
): Promise<string | null> {
  const { data: priorRows, error: priorError } = await deps.db
    .from('commission_adjustments')
    .select('amount_cents, source_event_key')
    .eq('commission_entry_id', entry.id);
  throwOnDbError(priorError, 'commission_adjustments lookup');
  const prior = priorRows ?? [];
  // Duplicate-by-source-event guard (R6 pattern; DB unique index is the
  // backstop for races) — a replayed event can never claw back twice.
  if (prior.some((r) => r.source_event_key === input.sourceEventKey)) {
    return 'skipped_duplicate_reversal';
  }
  let priorSum = 0;
  for (const r of prior) priorSum += Number(r.amount_cents ?? 0);

  const decision = decideReversal({
    commissionCents: entry.commissionCents,
    grossCents: input.grossCents,
    refundedGrossCents: input.refundedGrossCents,
    priorAdjustmentsSumCents: priorSum,
  });
  if (!decision.apply) return `skipped_${decision.reason}`;

  const adjustment = buildCommissionAdjustmentRow({
    partnerId: entry.partnerId,
    commissionEntryId: entry.id,
    amountCents: decision.amountCents,
    kind: input.kind,
    reason: input.reason,
    sourceEventKey: input.sourceEventKey,
  });
  const outcome = await insertIgnoringDuplicate(
    deps.db,
    'commission_adjustments',
    adjustment as unknown as Row,
    'commission_adjustments insert',
  );
  if (outcome === 'duplicate') return 'skipped_duplicate_reversal';

  // 0018: "reversed = refund/dispute clawback ... via an adjustment row + a
  // status flip". Only held/eligible entries flip; a PAID entry keeps its
  // status — the negative adjustment re-opens the balance in payout netting.
  if (decision.fullyReversedAfter && (entry.status === 'held' || entry.status === 'eligible')) {
    const { error } = await deps.db
      .from('commission_entries')
      .update({ status: 'reversed' })
      .eq('id', entry.id)
      .eq('status', entry.status);
    throwOnDbError(error, 'commission_entries status flip');
  }
  return null;
}

// ── invoice.voided / invoice.marked_uncollectible → full reversal ────────────

async function applyInvoiceVoidReversal(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_invoice_id';
  const invoice = extractInvoiceSnapshot(await deps.refetch('invoice', objectId));
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoice.id, invoice.paymentIntentId);
  // Ledger effect is "full reversal appended IF an entry exists" — no entry,
  // no effect; the (nonexistent) invoice mirror is an honest no-op.
  if (!entry) return 'skipped_no_commission_entry_for_invoice';
  return appendReversal(deps, entry, {
    refundedGrossCents: null, // full reversal of whatever is un-reversed
    grossCents: Math.max(invoice.amountPaidCents, 1),
    kind: 'refund_reversal',
    reason: event.type,
    sourceEventKey: buildIdempotencyKey('object', {
      eventId: event.id,
      objectId: invoice.id,
      eventCreated: event.created,
    }),
  });
}

// ── charge.refunded / refund.* → proportional reversal ───────────────────────

async function applyOneRefund(
  deps: DispatchDeps,
  charge: ChargeSnapshot,
  refund: RefundSnapshot,
  event: WebhookEventFacts,
): Promise<string | null> {
  if (refund.status !== 'succeeded') return `skipped_refund_not_succeeded:${refund.id}`;
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, charge.invoiceId, charge.paymentIntentId);
  if (!entry) return 'skipped_no_commission_entry_for_refund';
  if (charge.amountCents <= 0) return 'skipped_zero_gross_charge';
  return appendReversal(deps, entry, {
    refundedGrossCents: refund.amountCents,
    grossCents: charge.amountCents,
    kind: 'refund_reversal',
    reason: event.type,
    // Object scope per refund id — the per-refund reversal is never doubled
    // across charge.refunded / refund.created / refund.updated deliveries.
    sourceEventKey: buildIdempotencyKey('object', {
      eventId: event.id,
      objectId: refund.id,
      eventCreated: event.created,
    }),
  });
}

async function applyRefundReversal(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_refund_object_id';

  if (event.type === 'charge.refunded') {
    const charge = extractChargeSnapshot(await deps.refetch('charge', objectId));
    const notes: string[] = [];
    for (const refund of charge.refunds) {
      const note = await applyOneRefund(deps, charge, refund, event);
      if (note) notes.push(note);
    }
    return notes.length > 0 ? notes.join('; ') : null;
  }

  // refund.created / refund.updated / charge.refund.updated: the object is
  // the refund. Refund amounts are immutable in Stripe; "reconcile" means:
  // append the reversal once the refund is succeeded, exactly once per id.
  const refund = extractRefundSnapshot(await deps.refetch('refund', objectId));
  if (!refund.chargeId) return 'skipped_refund_without_charge';
  const charge = extractChargeSnapshot(await deps.refetch('charge', refund.chargeId));
  return applyOneRefund(deps, charge, refund, event);
}

// ── charge.dispute.* → dispute reversal (funds_withdrawn only) ───────────────

async function applyDisputeLifecycle(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  if (event.type !== 'charge.dispute.funds_withdrawn') {
    // created/updated/closed have no dispute mirror table; funds_reinstated
    // cannot be stored (0018 kind vocabulary) — honest no-ops, see effects.ts.
    return noContractNote(event.type) ?? 'skipped_no_contract:dispute_event_unmapped';
  }
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_dispute_id';
  const dispute = extractDisputeSnapshot(await deps.refetch('dispute', objectId));
  if (!dispute.chargeId) return 'skipped_dispute_without_charge';
  const charge = extractChargeSnapshot(await deps.refetch('charge', dispute.chargeId));
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, charge.invoiceId, charge.paymentIntentId);
  if (!entry) return 'skipped_no_commission_entry_for_dispute';
  return appendReversal(deps, entry, {
    refundedGrossCents: null, // R5: dispute lost → full remaining reversal
    grossCents: Math.max(charge.amountCents, 1),
    kind: 'dispute_reversal',
    reason: event.type,
    sourceEventKey: buildIdempotencyKey('object', {
      eventId: event.id,
      objectId: dispute.id,
      eventCreated: event.created,
    }),
  });
}

// ── account.updated → partners status mirror ─────────────────────────────────

async function applyConnectAccountStatus(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_account_id';
  const account = extractConnectAccountSnapshot(await deps.refetch('account', objectId));
  const { data: partnerRows, error: partnerError } = await deps.db
    .from('partners')
    .select('id')
    .eq('stripe_connect_account_id', account.id);
  throwOnDbError(partnerError, 'partners lookup by connect account');
  if ((partnerRows ?? []).length === 0) return 'skipped_no_partner_for_account';
  const { error } = await deps.db
    .from('partners')
    .update({ onboarding_complete: account.detailsSubmitted, payouts_enabled: account.payoutsEnabled })
    .eq('stripe_connect_account_id', account.id);
  throwOnDbError(error, 'partners status mirror update');
  return null;
}

// ── the dispatcher ────────────────────────────────────────────────────────────

/**
 * Apply the local effects of one durably-received event. Returns the
 * processing note (null = clean apply); throws RetryableEffectError when the
 * effect must be retried by the state-machine worker.
 */
export async function applyEventEffects(deps: DispatchDeps, event: WebhookEventFacts): Promise<{ note: string | null }> {
  const intent = routeWebhookEvent(event.type);
  if (!intent) return { note: 'skipped_unsupported_event' };

  // Explicit honest no-ops first — never invented writers (see effects.ts).
  const skipped = noContractNote(event.type);
  if (skipped) return { note: skipped };

  switch (intent.kind) {
    case 'checkout_completion':
      return { note: await applyCheckoutCompletion(deps, event) };
    case 'subscription_state_sync':
      return { note: await applySubscriptionSync(deps, event) };
    case 'commissionable_payment':
      return { note: await applyCommissionablePayment(deps, event) };
    case 'invoice_voided':
    case 'invoice_uncollectible':
      return { note: await applyInvoiceVoidReversal(deps, event) };
    case 'refund_reversal':
      return { note: await applyRefundReversal(deps, event) };
    case 'dispute_lifecycle':
      return { note: await applyDisputeLifecycle(deps, event) };
    case 'connect_account_status':
      return { note: await applyConnectAccountStatus(deps, event) };
    default:
      // Every remaining kind is covered by NO_CONTRACT_REASONS; reaching here
      // means the matrix gained an event faster than the writers — refuse to
      // guess, park it for review via the retry path.
      throw new RetryableEffectError(`no_writer_for_intent:${intent.kind}`);
  }
}
