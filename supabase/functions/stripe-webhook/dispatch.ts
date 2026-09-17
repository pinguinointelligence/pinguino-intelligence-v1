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
import { decideShopSettlement } from '../_shared/shopSettlement.ts';
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
  decideDisputeReinstatement,
  decideStatusAfterReinstatement,
  extractInvoicePaymentSnapshot,
  extractInvoiceSnapshot,
  extractRefundSnapshot,
  extractSubscriptionSnapshot,
  noContractNote,
  pickAttributionToLock,
  pickLatestRuleVersion,
  pickPaidPaymentIntent,
  resolvePaymentIntentInvoice,
  type AttributionCandidate,
  type CatalogOffer,
  type ChargeSnapshot,
  type CommissionRuleRow,
  type InvoiceSnapshot,
  type RefundSnapshot,
  extractShopOrderSettlement,
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
  /** Column ∈ values — one lookup for "pending or active", never two. */
  in(column: string, values: readonly unknown[]): DbSelectQuery;
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
  /**
   * Elite rate resolution (owner override 2026-08-31 §11) calls
   * `gellatti_partner_elite_rate_v1` as an RPC rather than through `from`,
   * because it is a SECURITY DEFINER function, not a table. The member was
   * missing from this interface even though the call site existed, so the
   * strict build failed while `tsc --noEmit` did not — the two use different
   * configs and only the build type-checks the Edge functions.
   */
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError | null }>;
}

/** Re-fetch the CURRENT Stripe object (requiresRefetch intents). */
export type StripeResource = 'subscription' | 'invoice' | 'charge' | 'refund' | 'dispute' | 'account';
export type StripeRefetcher = (resource: StripeResource, id: string) => Promise<Row>;

/**
 * Every item of a Stripe list, walked to the last page. A first page is never
 * evidence that nothing else exists: a charge can carry more refunds than one
 * page, and an invoice more payments.
 */
export type StripeList =
  | 'invoice_payments_by_invoice'
  | 'invoice_payments_by_payment_intent'
  | 'refunds_by_charge'
  | 'refunds_by_payment_intent'
  | 'disputes_by_payment_intent';
export type StripeListAll = (list: StripeList, filter: string) => Promise<Row[]>;

export interface DispatchDeps {
  db: DbClient;
  refetch: StripeRefetcher;
  listAll: StripeListAll;
}

export interface WebhookEventFacts {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  object: Row;
}

/** Thrown when the effect cannot be applied YET — the retry worker re-runs it. */
/**
 * A refusal that RETRYING CANNOT FIX. Two identities for one Stripe customer
 * is a fact about the data, not a transient condition, so it must not be
 * parked as retryable — it needs a human.
 */
export class EffectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectConflictError';
  }
}

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

/**
 * SHOP ORDER SETTLEMENT — the provider's own event is the payment authority.
 *
 * Before this writer existed the Shop became `paid` ONLY when the customer's
 * browser came back to the success URL and triggered `shop-order-sync`.
 * Forensic evidence on staging: Stripe delivered `checkout.session.completed`
 * for order G-20260831-2DA655 at 13:16:13.98 carrying `pi_shop_order_id`, and
 * `paid_at` was written 6.6 s later by the browser return — the webhook was
 * live but shop-blind. A customer who paid and closed the tab left the money
 * captured and the order `pending` for ever. Three such sessions already sit
 * in the table from 2026-08-29.
 *
 * The transition is state-guarded so the webhook and the return path converge
 * instead of fighting:
 *  - only `pending` moves to `paid` — a `refunded` order is never walked back;
 *  - `paid_at` is stamped once, by whichever authority arrives first;
 *  - the destination is only written when the session actually carries one;
 *  - re-delivery is a no-op, on top of the durable event-id uniqueness.
 */
async function applyShopOrderSettlement(
  deps: DispatchDeps,
  event: WebhookEventFacts,
): Promise<string | null> {
  const shop = extractShopOrderSettlement(event.object);
  if (!shop) return null; // not a shop session — billing owns this event

  const { data: current, error: readError } = await deps.db
    .from('shop_orders')
    .select('id,status,paid_at,expected_total_cents,expected_currency,stripe_checkout_session_id')
    .eq('id', shop.orderId)
    .maybeSingle();
  throwOnDbError(readError, 'shop_orders lookup');
  if (!current) return `shop_order_not_found:${shop.orderId}`;

  // ONE settlement authority, shared with shop-order-sync.
  const verdict = decideShopSettlement(
    {
      id: String(current.id),
      status: String(current.status),
      paidAt: (current.paid_at as string | null) ?? null,
      expectedTotalCents: (current.expected_total_cents as number | null) ?? null,
      expectedCurrency: (current.expected_currency as string | null) ?? null,
      sessionId: (current.stripe_checkout_session_id as string | null) ?? null,
    },
    {
      orderId: shop.orderId,
      sessionId: shop.sessionId,
      mode: shop.mode,
      paymentStatus: shop.paymentStatus,
      status: shop.sessionStatus,
      amountTotal: shop.amountTotal,
      currency: shop.currency,
    },
  );

  if (verdict.kind === 'refuse') return verdict.note;

  if (verdict.kind === 'expire') {
    const now = new Date().toISOString();
    const { error } = await deps.db
      .from('shop_orders')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('id', shop.orderId)
      .eq('status', 'pending');
    throwOnDbError(error, 'shop_orders expire');
    return 'shop_order_expired';
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: 'paid', updated_at: now };
  if (!current.paid_at) patch.paid_at = now;
  if (shop.paymentIntentId) patch.stripe_payment_intent_id = shop.paymentIntentId;
  if (shop.amountTotal !== null) patch.total_cents = shop.amountTotal;
  if (shop.shippingCents !== null) patch.shipping_cents = shop.shippingCents;
  if (shop.taxCents !== null) patch.tax_cents = shop.taxCents;
  if (shop.shipping) {
    patch.shipping_name = shop.shipping.name;
    patch.shipping_line1 = shop.shipping.line1;
    patch.shipping_line2 = shop.shipping.line2;
    patch.shipping_postal_code = shop.shipping.postalCode;
    patch.shipping_city = shop.shipping.city;
    patch.shipping_state = shop.shipping.state;
    patch.shipping_country = shop.shipping.country;
    patch.shipping_phone = shop.shipping.phone;
  }

  // Guarded on `pending`: a concurrent shop-order-sync can win the race, and
  // the loser writes nothing rather than stamping a second paid transition.
  const { error } = await deps.db
    .from('shop_orders')
    .update(patch)
    .eq('id', shop.orderId)
    .eq('status', 'pending');
  throwOnDbError(error, 'shop_orders settle');
  return null;
}

async function applyCheckoutCompletion(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  // A shop session settles here FIRST; it carries no billing customer mapping,
  // so the subscription path below would otherwise skip the event entirely.
  const shopNote = await applyShopOrderSettlement(deps, event);
  if (extractShopOrderSettlement(event.object)) return shopNote ?? 'shop_order_settled';

  const mapping = extractCheckoutMapping(event.object);
  if (!mapping) return 'skipped_no_user_or_customer_reference';
  const { error } = await deps.db
    .from('billing_customers')
    .upsert({ user_id: mapping.user_id, stripe_customer_id: mapping.stripe_customer_id }, { onConflict: 'user_id' });
  throwOnDbError(error, 'billing_customers upsert');
  return null;
}

/** A Stripe metadata value is only usable as a user id if it IS one. */
const asUserId = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

/**
 * WHO owns this subscription, without depending on event ORDER.
 *
 * `checkout.session.completed` and `customer.subscription.created` are
 * delivered ~50 ms apart and processed concurrently, so this writer used to
 * lose a coin flip: it needed the `billing_customers` mapping that checkout
 * writes, and threw `customer_not_mapped_yet` when it ran first. That failure
 * parked the event in `received` for a retry worker that DOES NOT EXIST, so a
 * lost race stranded the payment for ever. GROW-010 caught it on PRO annual;
 * nothing about it was PRO-annual specific.
 *
 * `create-checkout-session` already stamps the closed correlation payload onto
 * `subscription_data.metadata`, so the answer is inside the object this writer
 * ALREADY refetches from Stripe. The mapping stays canonical where it exists;
 * the metadata is a strictly-validated fallback, never an override:
 *
 *  - the mapping wins whenever it exists;
 *  - a mapping that disagrees with the metadata FAILS CLOSED — two identities
 *    for one customer is never something to guess past;
 *  - the value must be a real UUID, and it arrives on the Stripe-signed event;
 *  - a missing or malformed id keeps the original retryable refusal, so an
 *    unknown user is still never invented;
 *  - the mapping is then written back conflict-safely, which is what makes the
 *    NEXT event in the race healthy instead of merely this one.
 *
 * Correlation only. Plan authority stays the price → catalog lookup in the
 * caller; `pi_offer_key` never decides what anybody is entitled to.
 */
async function resolveSubscriptionUserId(
  deps: DispatchDeps,
  snapshot: { customerId: string | null; metadataUserId: string | null },
): Promise<string> {
  const customerId = snapshot.customerId as string;
  const { data: mappingRow, error: mappingError } = await deps.db
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  throwOnDbError(mappingError, 'billing_customers lookup');
  const mapped = mappingRow && typeof mappingRow.user_id === 'string' ? mappingRow.user_id : null;
  const claimed = asUserId(snapshot.metadataUserId);

  if (mapped) {
    if (claimed && claimed !== mapped.toLowerCase()) {
      throw new EffectConflictError(`customer_user_conflict:${customerId}`);
    }
    return mapped;
  }
  if (!claimed) throw new RetryableEffectError('customer_not_mapped_yet');

  // Heal the mapping so every LATER event is healthy too. ignoreDuplicates
  // keeps a mapping written concurrently by checkout completion authoritative:
  // this write never clobbers, it only fills a gap.
  const { error: healError } = await deps.db
    .from('billing_customers')
    .upsert(
      { user_id: claimed, stripe_customer_id: customerId } as unknown as Row,
      { onConflict: 'stripe_customer_id', ignoreDuplicates: true },
    );
  if (healError) {
    // Losing this race is success, not failure — it means the mapping exists
    // now. Re-read decides, so a genuine conflict is still caught.
    const { data: recheck } = await deps.db
      .from('billing_customers')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    const settled = recheck && typeof recheck.user_id === 'string' ? recheck.user_id : null;
    if (!settled) throw new RetryableEffectError('customer_not_mapped_yet');
    if (settled.toLowerCase() !== claimed) {
      throw new EffectConflictError(`customer_user_conflict:${customerId}`);
    }
    return settled;
  }
  return claimed;
}

// ── subscription state sync → customer_subscriptions + entitlement mirror ────

async function applySubscriptionSync(
  deps: DispatchDeps,
  event: WebhookEventFacts,
  overrideSubscriptionId?: string,
): Promise<string | null> {
  const objectId =
    overrideSubscriptionId ?? (typeof event.object.id === 'string' ? event.object.id : null);
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

  if (!snapshot.customerId) return 'skipped_no_customer_reference';
  const userId = await resolveSubscriptionUserId(deps, snapshot);

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
  let cache = cacheRow;
  if (!cache) {
    // The subscription writer has not landed yet. Retrying here meant nothing:
    // a retryable failure parks the event for a worker that does not exist, so
    // the invoice stranded with the payment already taken. Still NEVER invent
    // an offer resolution — run the SAME subscription-sync authority for this
    // subscription id and re-read. One writer, one catalog lookup.
    await applySubscriptionSync(deps, event, invoice.subscriptionId);
    const { data: healedRow, error: healedError } = await deps.db
      .from('customer_subscriptions')
      .select('id, user_id, offer_key, product')
      .eq('stripe_subscription_id', invoice.subscriptionId)
      .maybeSingle();
    throwOnDbError(healedError, 'customer_subscriptions re-read');
    cache = healedRow;
  }
  if (!cache) {
    throw new RetryableEffectError('subscription_cache_missing_for_invoice');
  }
  const cacheId = typeof cache.id === 'string' ? cache.id : null;
  const customerUserId = typeof cache.user_id === 'string' ? cache.user_id : null;
  const offerKey = typeof cache.offer_key === 'string' ? cache.offer_key : null;
  const product = typeof cache.product === 'string' ? cache.product : null;
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

  // Rate resolution splits by tier (owner override 2026-08-31 §11):
  //   standard/gold → the global versioned table (0018 commission_rules)
  //   elite         → the partner's OWN versioned rate profile, resolved at the
  //                   instant the commission was EARNED, so appending a later
  //                   version can never change an earlier entry.
  // An elite partner with no profile in force is a data error, not a licence to
  // guess: it defers as retryable so an admin can fix the profile, rather than
  // silently paying the old fixed elite rate or the standard rate.
  const { data: ruleRows, error: ruleError } = await deps.db
    .from('commission_rules')
    .select('version, amount_cents')
    .eq('product', product)
    .eq('cadence', commissionCadence)
    .eq('tier', tier);
  throwOnDbError(ruleError, 'commission_rules lookup');
  const rule = pickLatestRuleVersion((ruleRows ?? []) as unknown as CommissionRuleRow[]);
  if (!rule) throw new RetryableEffectError(`commission_rule_missing:${product}/${commissionCadence}/${tier}`);

  let amountCents = rule.amount_cents;
  let rateProfileVersionId: string | null = null;

  if (tier === 'elite') {
    const { data: eliteRows, error: eliteError } = await deps.db.rpc('gellatti_partner_elite_rate_v1', {
      p_partner_id: partnerId,
      p_product: product,
      p_cadence: commissionCadence,
      p_at: new Date(paidAtUtcMs).toISOString(),
    });
    throwOnDbError(eliteError, 'partner_rate_profiles lookup');
    const eliteRate = Array.isArray(eliteRows) ? eliteRows[0] : eliteRows;
    const eliteAmount = eliteRate && typeof eliteRate.amount_cents === 'number' ? eliteRate.amount_cents : null;
    const eliteVersionId =
      eliteRate && typeof eliteRate.rate_profile_version_id === 'string'
        ? eliteRate.rate_profile_version_id
        : null;
    if (eliteAmount === null || eliteVersionId === null) {
      throw new RetryableEffectError(`elite_rate_profile_missing:${partnerId}`);
    }
    amountCents = eliteAmount;
    rateProfileVersionId = eliteVersionId;
  }

  const paidByPaymentIntent = pickPaidPaymentIntent(
    invoice.id,
    (await deps.listAll('invoice_payments_by_invoice', invoice.id)).map(extractInvoicePaymentSnapshot),
  );
  const entry = buildCommissionEntryRow({
    partnerId,
    attributionId,
    subscriptionCacheId: cacheId,
    stripeSubscriptionId: invoice.subscriptionId,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: paidByPaymentIntent,
    offerKey,
    product,
    commissionCadence,
    tier,
    ruleVersion: rule.version,
    rateProfileVersionId,
    amountCents,
    earnedAtUtcMs: paidAtUtcMs,
    livemode: event.livemode,
  });
  const outcome = await insertIgnoringDuplicate(
    deps.db,
    'commission_entries',
    entry as unknown as Row,
    'commission_entries insert',
  );
  if (outcome === 'duplicate') return 'skipped_duplicate_invoice_entry';
  // The money may already have moved back before this entry existed.
  return await reconcileReversalsForPaidInvoice(deps, invoice, paidByPaymentIntent, event);
}

// ── is a commission entry EXPECTED but not written yet? ─────────────────────

/**
 * A reversal that finds no entry is not automatically an honest no-op.
 *
 * Two different situations produce the same empty lookup:
 *   - nothing was ever owed here (the invoice was not paid, nobody referred
 *     this customer, the partner referred themselves) — a real no-op;
 *   - the money IS commissionable and the entry has simply not been written
 *     yet, because the paid-invoice delivery is still queued, is parked on a
 *     missing dependency, or is committing right now in another transaction.
 *
 * Treating the second case as a no-op is how a refunded or charged-back
 * payment keeps its commission: the reversal is dropped, the booking that
 * follows knows nothing about it, and nothing ever revisits the pair. So the
 * second case defers instead — the durable event is retried until the entry
 * exists — while the first keeps its honest note and is never retried.
 */
type EntryExpectation = { expected: true } | { expected: false; reason: string };

async function expectCommissionEntry(
  deps: DispatchDeps,
  invoiceId: string | null,
): Promise<EntryExpectation> {
  if (!invoiceId) return { expected: false, reason: 'no_invoice' };
  const invoice = extractInvoiceSnapshot(await deps.refetch('invoice', invoiceId));
  const eligibility = decideCommissionEligibility(invoice);
  if (!eligibility.eligible) return { expected: false, reason: eligibility.reason };
  if (!invoice.subscriptionId) return { expected: false, reason: 'no_subscription' };

  const { data: cacheRow, error: cacheError } = await deps.db
    .from('customer_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', invoice.subscriptionId)
    .maybeSingle();
  throwOnDbError(cacheError, 'customer_subscriptions lookup for reversal expectation');
  // No cache row yet means the subscription writer has not landed either: the
  // booking is still ahead of us, not absent.
  if (!cacheRow) return { expected: true };
  const customerUserId = typeof cacheRow.user_id === 'string' ? cacheRow.user_id : null;
  if (!customerUserId) return { expected: true };

  const { data: attributionRows, error: attributionError } = await deps.db
    .from('referral_attributions')
    .select('id, partner_id, status')
    .eq('user_id', customerUserId)
    .in('status', ['pending', 'active']);
  throwOnDbError(attributionError, 'referral_attributions lookup for reversal expectation');
  const attribution = (attributionRows ?? [])[0] ?? null;
  if (!attribution) return { expected: false, reason: 'no_attribution' };

  const partnerId = typeof attribution.partner_id === 'string' ? attribution.partner_id : null;
  if (partnerId) {
    const { data: partnerRow, error: partnerError } = await deps.db
      .from('partners')
      .select('user_id')
      .eq('id', partnerId)
      .maybeSingle();
    throwOnDbError(partnerError, 'partners lookup for reversal expectation');
    if (partnerRow && partnerRow.user_id === customerUserId) {
      return { expected: false, reason: 'self_referral' };
    }
  }
  return { expected: true };
}

/** The note a reversal leaves when nothing was owed, with the reason it decided that. */
function honestNoEntryNote(kind: 'refund' | 'dispute', expectation: EntryExpectation): string {
  const reason = expectation.expected ? 'expected' : expectation.reason;
  return `skipped_no_commission_entry_for_${kind}:${reason}`;
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
  const rewardNote = await reverseReferralRewardForInvoice(deps, invoice.id, event.type);
  // A voided or uncollectible invoice was never paid, so it has no payment to
  // look an entry up by; the invoice id is the whole key.
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoice.id, null);
  // Ledger effect is "full reversal appended IF an entry exists" — no entry,
  // no effect; the (nonexistent) invoice mirror is an honest no-op. The
  // referral reward is a separate ledger and is reversed either way.
  if (!entry) return rewardNote ?? 'skipped_no_commission_entry_for_invoice';
  const commissionNote = await appendReversal(deps, entry, {
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
  return [commissionNote, rewardNote].filter(Boolean).join('; ') || null;
}

// ── charge.refunded / refund.* → proportional reversal ───────────────────────

/**
 * The invoice a charge paid. Basil charges do not name their invoice; the
 * relation is the InvoicePayment of the charge's PaymentIntent. A charge with
 * no paid InvoicePayment was not an invoice payment (a Shop order), and one
 * PaymentIntent paying two invoices is a data conflict for a human.
 */
async function invoiceIdForCharge(deps: DispatchDeps, charge: ChargeSnapshot): Promise<string | null> {
  if (!charge.paymentIntentId) return null;
  const payments = (await deps.listAll('invoice_payments_by_payment_intent', charge.paymentIntentId)).map(
    extractInvoicePaymentSnapshot,
  );
  const resolution = resolvePaymentIntentInvoice(charge.paymentIntentId, payments);
  if (resolution.kind === 'conflict') {
    throw new EffectConflictError(
      `payment_intent_paid_several_invoices:${charge.paymentIntentId}:${resolution.invoiceIds.join(',')}`,
    );
  }
  return resolution.kind === 'invoice' ? resolution.invoiceId : null;
}

async function applyOneRefund(
  deps: DispatchDeps,
  charge: ChargeSnapshot,
  invoiceId: string | null,
  refund: RefundSnapshot,
  event: WebhookEventFacts,
): Promise<string | null> {
  if (refund.status !== 'succeeded') return `skipped_refund_not_succeeded:${refund.id}`;
  const rewardNote = await reverseReferralRewardForInvoice(deps, invoiceId, event.type);
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoiceId, charge.paymentIntentId);
  if (!entry) {
    const expectation = await expectCommissionEntry(deps, invoiceId);
    if (expectation.expected) {
      // The paid invoice is commissionable and its entry is still on the way.
      // Park THIS delivery and let the recovery worker apply it once the entry
      // exists — the alternative is a refunded payment that keeps its commission.
      throw new RetryableEffectError(
        `commission_entry_not_booked_yet:${invoiceId ?? charge.paymentIntentId ?? 'unknown'}`,
      );
    }
    return rewardNote ?? honestNoEntryNote('refund', expectation);
  }
  if (charge.amountCents <= 0) return rewardNote ?? 'skipped_zero_gross_charge';
  const commissionNote = await appendReversal(deps, entry, {
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
  return [commissionNote, rewardNote].filter(Boolean).join('; ') || null;
}

async function applyRefundReversal(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_refund_object_id';

  if (event.type === 'charge.refunded') {
    const charge = extractChargeSnapshot(await deps.refetch('charge', objectId));
    const invoiceId = await invoiceIdForCharge(deps, charge);
    const refunds = (await deps.listAll('refunds_by_charge', charge.id)).map(extractRefundSnapshot);
    if (refunds.length === 0) return 'skipped_no_refunds_listed_for_charge';
    const notes: string[] = [];
    for (const refund of refunds) {
      const note = await applyOneRefund(deps, charge, invoiceId, refund, event);
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
  return applyOneRefund(deps, charge, await invoiceIdForCharge(deps, charge), refund, event);
}

// ── charge.dispute.* → dispute reversal (funds_withdrawn only) ───────────────

async function applyDisputeLifecycle(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  if (event.type === 'charge.dispute.funds_reinstated') return applyDisputeReinstatement(deps, event);
  if (event.type !== 'charge.dispute.funds_withdrawn') {
    // created/updated/closed have no dispute mirror table — honest no-ops.
    // The two money movements (withdrawn, reinstated) are handled above.
    return noContractNote(event.type) ?? 'skipped_no_contract:dispute_event_unmapped';
  }
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_dispute_id';
  const dispute = extractDisputeSnapshot(await deps.refetch('dispute', objectId));
  if (!dispute.chargeId) return 'skipped_dispute_without_charge';
  const charge = extractChargeSnapshot(await deps.refetch('charge', dispute.chargeId));
  const invoiceId = await invoiceIdForCharge(deps, charge);
  // A lost dispute invalidates the purchase exactly as a refund does, so the
  // referral reward is reversed on the same evidence.
  const rewardNote = await reverseReferralRewardForInvoice(deps, invoiceId, event.type);
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoiceId, charge.paymentIntentId);
  if (!entry) {
    const expectation = await expectCommissionEntry(deps, invoiceId);
    if (expectation.expected) {
      throw new RetryableEffectError(
        `commission_entry_not_booked_yet:${invoiceId ?? charge.paymentIntentId ?? 'unknown'}`,
      );
    }
    return rewardNote ?? honestNoEntryNote('dispute', expectation);
  }
  const commissionNote = await appendReversal(deps, entry, {
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
  return [commissionNote, rewardNote].filter(Boolean).join('; ') || null;
}

/**
 * charge.dispute.funds_reinstated → the commission this dispute reversed comes
 * back (R6), once.
 *
 * It restores the dispute's OWN reversal, never a refund's: money a refund took
 * keeps its own negative adjustment. `reversed` means "nothing left to pay", so
 * when the balance turns positive again the entry returns to the hold calendar;
 * a `paid` entry keeps its status and the positive adjustment nets in the next
 * batch rather than rewriting a payout that already happened.
 */
async function applyDisputeReinstatement(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return 'skipped_no_dispute_id';
  const dispute = extractDisputeSnapshot(await deps.refetch('dispute', objectId));
  if (dispute.reinstatedCents <= 0) return 'skipped_no_reinstated_funds';
  if (!dispute.chargeId) return 'skipped_dispute_without_charge';
  const charge = extractChargeSnapshot(await deps.refetch('charge', dispute.chargeId));
  const invoiceId = await invoiceIdForCharge(deps, charge);
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoiceId, charge.paymentIntentId);
  if (!entry) {
    const expectation = await expectCommissionEntry(deps, invoiceId);
    if (expectation.expected) {
      throw new RetryableEffectError(
        `commission_entry_not_booked_yet:${invoiceId ?? charge.paymentIntentId ?? 'unknown'}`,
      );
    }
    return honestNoEntryNote('dispute', expectation);
  }
  if (!charge.paymentIntentId) return 'skipped_dispute_without_payment_intent';
  /* ORDER DOES NOT MATTER HERE. A reinstatement that arrives before the
     withdrawal has nothing to restore, and refusing it would lose the movement:
     Stripe will not send it again. So this goes through the same reconciliation
     the booking uses — it reads what the dispute actually took and gave back,
     and writes whichever of the two the ledger is missing, under the same keys.
     A later withdrawal delivery is then refused as a duplicate. */
  const notes = await applyMoneyAlreadyMoved(
    deps,
    entry,
    { paymentIntentId: charge.paymentIntentId, grossCents: charge.amountCents },
    { id: event.id, created: event.created },
    event.type,
  );
  // Nothing appended: either it was restored already, or this dispute never
  // took anything to give back.
  return notes.length > 0 ? notes.join('; ') : 'skipped_nothing_to_restore';
}

async function appendReinstatement(
  deps: DispatchDeps,
  entry: EntryForReversal,
  input: { disputeReversalKey: string; reinstatementKey: string; reason: string },
): Promise<string | null> {
  const { data: priorRows, error: priorError } = await deps.db
    .from('commission_adjustments')
    .select('amount_cents, kind, source_event_key')
    .eq('commission_entry_id', entry.id);
  throwOnDbError(priorError, 'commission_adjustments lookup for reinstatement');
  const prior = (priorRows ?? []).map((row) => ({
    amountCents: Number(row.amount_cents ?? 0),
    kind: String(row.kind ?? ''),
    sourceEventKey: String(row.source_event_key ?? ''),
  }));
  const decision = decideDisputeReinstatement({
    priorAdjustments: prior,
    disputeReversalKey: input.disputeReversalKey,
    reinstatementKey: input.reinstatementKey,
  });
  if (!decision.apply) return `skipped_${decision.reason}`;

  const adjustment = buildCommissionAdjustmentRow({
    partnerId: entry.partnerId,
    commissionEntryId: entry.id,
    amountCents: decision.amountCents,
    kind: 'dispute_reinstatement',
    reason: input.reason,
    sourceEventKey: input.reinstatementKey,
  });
  const outcome = await insertIgnoringDuplicate(
    deps.db,
    'commission_adjustments',
    adjustment as unknown as Row,
    'commission_adjustments reinstatement insert',
  );
  if (outcome === 'duplicate') return 'skipped_already_reinstated';

  await settleEntryStatus(deps, entry.id);
  return null;
}

/**
 * Money that moved BEFORE this entry existed, applied the moment it does.
 *
 * The deferral in expectCommissionEntry keeps a reversal alive until the entry
 * is written; this closes the other half of the race — a refund or dispute that
 * was already settled (or delivered while the booking transaction was still
 * open) leaves no delivery to retry. Both paths write the same adjustment with
 * the same key, so whichever arrives second is refused as a duplicate.
 */
/**
 * The entry's status follows its BALANCE, not the order the rows arrived in.
 *
 * A reversal flips a fully clawed-back entry to `reversed` and a reinstatement
 * puts it back, but a repair can write both in one pass — and then the second
 * decision is made against a status the first one already changed. This reads
 * the ledger as it now stands and states the answer once. It is idempotent, so
 * every path can end with it, and it never touches a `paid` entry: money that
 * already moved is settled by the next batch's netting, not by a status.
 */
async function settleEntryStatus(deps: DispatchDeps, entryId: string): Promise<void> {
  const { data: entryRow, error: entryError } = await deps.db
    .from('commission_entries')
    .select('amount_cents, status, eligible_at')
    .eq('id', entryId)
    .maybeSingle();
  throwOnDbError(entryError, 'commission_entries status settle read');
  if (!entryRow) return;
  const status = String(entryRow.status ?? '');
  if (status !== 'reversed' && status !== 'held' && status !== 'eligible') return;

  const { data: adjustmentRows, error: adjustmentError } = await deps.db
    .from('commission_adjustments')
    .select('amount_cents')
    .eq('commission_entry_id', entryId);
  throwOnDbError(adjustmentError, 'commission_adjustments sum for status settle');
  let net = Number(entryRow.amount_cents ?? 0);
  for (const row of adjustmentRows ?? []) net += Number(row.amount_cents ?? 0);

  const parsedEligibleAt = typeof entryRow.eligible_at === 'string' ? Date.parse(entryRow.eligible_at) : Number.NaN;
  const eligibleAtUtcMs = Number.isFinite(parsedEligibleAt) ? parsedEligibleAt : Number.POSITIVE_INFINITY;
  const next = status === 'reversed'
    ? decideStatusAfterReinstatement({
        status,
        commissionCents: Number(entryRow.amount_cents ?? 0),
        adjustmentsSumAfterCents: net - Number(entryRow.amount_cents ?? 0),
        eligibleAtUtcMs,
        nowUtcMs: Date.now(),
      })
    : (net <= 0 ? 'reversed' : null);
  if (!next) return;
  const { error } = await deps.db
    .from('commission_entries')
    .update({ status: next })
    .eq('id', entryId)
    .eq('status', status);
  throwOnDbError(error, 'commission_entries status settle');
}

async function applyMoneyAlreadyMoved(
  deps: DispatchDeps,
  entry: EntryForReversal,
  money: { paymentIntentId: string; grossCents: number },
  keyEvent: { id: string; created: number },
  reason: string,
): Promise<string[]> {
  const notes: string[] = [];
  const grossCents = Math.max(money.grossCents, 1);

  const refunds = (await deps.listAll('refunds_by_payment_intent', money.paymentIntentId)).map(extractRefundSnapshot);
  for (const refund of refunds) {
    if (refund.status !== 'succeeded') continue;
    const note = await appendReversal(deps, entry, {
      refundedGrossCents: refund.amountCents,
      grossCents,
      kind: 'refund_reversal',
      reason,
      sourceEventKey: buildIdempotencyKey('object', {
        eventId: keyEvent.id,
        objectId: refund.id,
        eventCreated: keyEvent.created,
      }),
    });
    if (note === null) notes.push(`reconciled_refund:${refund.id}`);
  }

  const disputes = (await deps.listAll('disputes_by_payment_intent', money.paymentIntentId)).map(extractDisputeSnapshot);
  for (const dispute of disputes) {
    if (dispute.withdrawnCents <= 0) continue;
    const disputeKey = buildIdempotencyKey('object', {
      eventId: keyEvent.id,
      objectId: dispute.id,
      eventCreated: keyEvent.created,
    });
    const reversalNote = await appendReversal(deps, entry, {
      refundedGrossCents: null, // R5: a withdrawn dispute takes the remaining commission
      grossCents,
      kind: 'dispute_reversal',
      reason,
      sourceEventKey: disputeKey,
    });
    if (reversalNote === null) notes.push(`reconciled_dispute:${dispute.id}`);
    if (dispute.reinstatedCents > 0) {
      const restored = await appendReinstatement(deps, entry, {
        disputeReversalKey: disputeKey,
        reinstatementKey: `${disputeKey}:reinstated`,
        reason,
      });
      if (restored === null) notes.push(`reconciled_reinstatement:${dispute.id}`);
    }
  }
  // Always, even when nothing was appended: a previous repair may have left the
  // status behind its own balance.
  await settleEntryStatus(deps, entry.id);
  return notes;
}

async function reconcileReversalsForPaidInvoice(
  deps: DispatchDeps,
  invoice: InvoiceSnapshot,
  paymentIntentId: string | null,
  event: WebhookEventFacts,
): Promise<string | null> {
  if (!paymentIntentId) return null;
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, invoice.id, paymentIntentId);
  if (!entry) return null;
  const notes = await applyMoneyAlreadyMoved(
    deps,
    entry,
    { paymentIntentId, grossCents: invoice.amountPaidCents },
    { id: event.id, created: event.created },
    `reconciled_at_booking:${event.type}`,
  );
  return notes.length > 0 ? notes.join('; ') : null;
}

/**
 * RECONCILIATION, for money that moved while nothing was listening.
 *
 * The deferral keeps a reversal alive until its entry exists, and the booking
 * applies whatever had already moved. Neither helps an entry whose refund or
 * dispute delivery was ANSWERED before either existed — the code that answered
 * it is gone, and Stripe will not send it again. This reads the money back from
 * Stripe for one entry and applies what the ledger is missing, with the same
 * keys, so a later delivery of the same object is still refused as a duplicate.
 *
 * It is a repair, not a second ledger: nothing is deleted, nothing is rewritten,
 * every row it writes is an ordinary append-only adjustment.
 */
export async function reconcileEntryMoney(
  deps: DispatchDeps,
  target: { invoiceId: string | null; paymentIntentId: string | null },
  reason: string,
): Promise<{ applied: string[]; skipped: string | null }> {
  const entry = await findEntryByInvoiceOrPaymentIntent(deps, target.invoiceId, target.paymentIntentId);
  if (!entry) return { applied: [], skipped: 'no_commission_entry' };
  let paymentIntentId = target.paymentIntentId;
  let grossCents = 0;
  if (target.invoiceId) {
    const invoice = extractInvoiceSnapshot(await deps.refetch('invoice', target.invoiceId));
    grossCents = invoice.amountPaidCents;
    if (!paymentIntentId) {
      paymentIntentId = pickPaidPaymentIntent(
        invoice.id,
        (await deps.listAll('invoice_payments_by_invoice', invoice.id)).map(extractInvoicePaymentSnapshot),
      );
    }
  }
  if (!paymentIntentId) return { applied: [], skipped: 'no_payment_intent' };
  const applied = await applyMoneyAlreadyMoved(
    deps,
    entry,
    { paymentIntentId, grossCents },
    { id: `reconcile:${entry.id}`, created: 0 },
    reason,
  );
  return { applied, skipped: applied.length > 0 ? null : 'nothing_missing' };
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

// ── invoice.paid → REFER-A-FRIEND reward (a SEPARATE lane from commission) ──

/**
 * The regular-user reward lane. It runs BESIDE `applyCommissionablePayment`,
 * never inside it: the commission path returns early on
 * `skipped_no_attribution`, and "no partner owns this customer" is exactly the
 * case where a user referral CAN earn. Folding the two together would make the
 * reward unreachable in the only situation it applies to.
 *
 * All qualification lives in `gellatti_record_referral_reward_v1` — first
 * purchase only, one reward per invoice, self-referral impossible, and the
 * partner lane winning any conversion it already owns. This function's whole
 * job is to hand the database the facts and record what it decided.
 *
 * It can never create money: the RPC writes `referral_rewards` and
 * `entitlements`, and touches no commission or payout table.
 */
async function applyReferralReward(deps: DispatchDeps, event: WebhookEventFacts): Promise<string | null> {
  const objectId = typeof event.object.id === 'string' ? event.object.id : null;
  if (!objectId) return null;
  const invoice = extractInvoiceSnapshot(await deps.refetch('invoice', objectId));

  // F7: the SAME paid-and-positive gate the commission lane uses. A failed,
  // void, unpaid or zero-value invoice earns nothing here either.
  const eligibility = decideCommissionEligibility(invoice);
  if (!eligibility.eligible) return null;
  if (!invoice.subscriptionId) return null;

  const { data: cacheRow, error: cacheError } = await deps.db
    .from('customer_subscriptions')
    .select('user_id, offer_key, product')
    .eq('stripe_subscription_id', invoice.subscriptionId)
    .maybeSingle();
  throwOnDbError(cacheError, 'customer_subscriptions lookup for referral reward');
  if (!cacheRow) throw new RetryableEffectError('subscription_cache_missing_for_referral_reward');

  const userId = typeof cacheRow.user_id === 'string' ? cacheRow.user_id : null;
  const offerKey = typeof cacheRow.offer_key === 'string' ? cacheRow.offer_key : null;
  const product = typeof cacheRow.product === 'string' ? cacheRow.product : null;
  if (!userId || !offerKey || !product) throw new RetryableEffectError('subscription_cache_incomplete');

  // Cadence comes from the SAME catalogue column the commission lane reads, so
  // "annual" means one thing in this product: a 15-month initial period is an
  // annual reward exactly as it is an annual commission.
  const { data: catalogRow, error: catalogError } = await deps.db
    .from('billing_price_catalog')
    .select('commission_cadence')
    .eq('offer_key', offerKey)
    .maybeSingle();
  throwOnDbError(catalogError, 'billing_price_catalog cadence lookup for referral reward');
  const cadence =
    catalogRow && typeof catalogRow.commission_cadence === 'string' ? catalogRow.commission_cadence : null;
  if (!cadence) throw new RetryableEffectError('offer_missing_commission_cadence');

  const { data, error } = await deps.db.rpc('gellatti_record_referral_reward_v1', {
    p_referred_user_id: userId,
    p_stripe_subscription_id: invoice.subscriptionId,
    p_stripe_invoice_id: invoice.id,
    p_product: product,
    p_cadence: cadence,
    p_livemode: event.livemode,
  });
  if (error) throw new RetryableEffectError(`referral_reward_rpc_failed:${error.code ?? 'unknown'}`);

  const result = (data ?? {}) as { ok?: unknown; reason?: unknown; bonusDays?: unknown };
  if (result.ok === true) return `referral_reward_earned:${String(result.bonusDays ?? '')}d`;

  // NOTE DISCIPLINE. Most payments in this product have no user referral at
  // all, and every invoice.paid arrives twice (invoice.paid and
  // invoice.payment_succeeded share the object scope). Annotating those two
  // cases would put a line on nearly every payment that says nothing, and
  // would drown the refusals that DO mean something — above all
  // `partner_attribution_wins`, which is the one place the two lanes meet.
  const reason = typeof result.reason === 'string' ? result.reason : null;
  if (reason === 'no_referral_attribution' || reason === 'duplicate_invoice') return null;
  return reason ? `referral_reward_skipped:${reason}` : null;
}

/**
 * F7/F9: a refunded, voided or disputed invoice invalidates the qualifying
 * purchase, so the reward is reversed. Access already granted is NOT clawed
 * back — the RPC only flips the ledger row, and the bank absorbs it.
 */
async function reverseReferralRewardForInvoice(
  deps: DispatchDeps,
  invoiceId: string | null,
  reason: string,
): Promise<string | null> {
  if (!invoiceId) return null;
  const { data, error } = await deps.db.rpc('gellatti_reverse_referral_reward_v1', {
    p_stripe_invoice_id: invoiceId,
    p_reason: reason,
  });
  if (error) throw new RetryableEffectError(`referral_reversal_rpc_failed:${error.code ?? 'unknown'}`);
  const result = (data ?? {}) as { ok?: unknown; reason?: unknown };
  return result.ok === true ? 'referral_reward_reversed' : null;
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
    case 'checkout_async_payment_succeeded':
    case 'checkout_async_payment_failed':
    case 'checkout_session_expired':
      return { note: await applyShopOrderSettlement(deps, event) };
    case 'subscription_state_sync':
      return { note: await applySubscriptionSync(deps, event) };
    case 'commissionable_payment': {
      // Two INDEPENDENT lanes on one payment: at most one of them ever
      // produces value, and the database — not this switch — decides which.
      const commission = await applyCommissionablePayment(deps, event);
      const reward = await applyReferralReward(deps, event);
      const notes = [commission, reward].filter((note): note is string => Boolean(note));
      return { note: notes.length > 0 ? notes.join('; ') : null };
    }
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
