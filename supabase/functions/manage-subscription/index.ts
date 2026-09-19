/**
 * manage-subscription — Edge Function (Deno). Account → Plan i rozliczenia.
 *
 * One JWT-authenticated entry point for the subscription actions a customer
 * performs from their own account, all executed against the EXISTING Stripe
 * subscription (never a second one) and mirrored through the SAME writer the
 * webhook uses:
 *
 *   cancel                  → cancel_at_period_end = true (access until period end)
 *   resume                  → cancel_at_period_end = false (same period, no charge)
 *   preview_change          → Stripe invoice preview of an immediate change
 *                             (the amount the customer pays TODAY), or the
 *                             period-end plan for a scheduled downgrade
 *   confirm_change          → immediate: subscriptions.update with proration
 *                             (pays only the difference); scheduled: a
 *                             Subscription Schedule phase at period end
 *   cancel_scheduled_change → release the schedule (plan stays as it is)
 *
 * Invariants (test-pinned via logic.ts + source scans):
 *  - the caller is the JWT user; the customer id comes ONLY from the
 *    server-side billing_customers mapping and the subscription ONLY from the
 *    user's customer_subscriptions cache rows — nothing is taken from the body
 *    except the action and a target OFFER KEY (never a price id);
 *  - the target price is resolved server-side (billing_price_catalog, the
 *    webhook's own authority, with the checkout env names as fallback);
 *  - no amount is ever computed here: previews come from Stripe;
 *  - every Stripe mutation carries a deterministic idempotency key;
 *  - after a mutation the subscription cache is refreshed through
 *    stripe-webhook's `syncSubscriptionNow` (one writer) so the account panel
 *    is consistent on the next refresh, on any device, before the webhook
 *    delivery even lands; the delivery is then a byte-identical no-op.
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION, plus the
 * auto-injected SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 * Optional fallback: the STRIPE_PRICE_* names from create-checkout-session.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PURCHASABLE_OFFERS } from '../create-checkout-session/logic.ts';
import {
  syncSubscriptionNow,
  type DbClient,
  type StripeResource,
} from '../stripe-webhook/dispatch.ts';
import {
  buildCancelIdempotencyKey,
  buildChangeIdempotencyKey,
  buildImmediateChangeParams,
  buildPreviewParams,
  buildResumeIdempotencyKey,
  buildScheduleIdempotencyKey,
  buildScheduledChangePhases,
  decideCancel,
  decideConfirmTimestamp,
  decidePlanChange,
  decideResume,
  extractLiveSubscription,
  manageableOffer,
  parseManageRequest,
  pickManagedSubscription,
  summarizeInvoicePreview,
  toStateReply,
  type ManagedSubscriptionRow,
} from './logic.ts';

// Browser-invoked (supabase.functions.invoke) → answer the preflight.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

type StripeErrorLike = { type?: string; code?: string; statusCode?: number };

/** A declined/authentication-required payment is the customer's fact, not a 5xx. */
function classifyStripeError(error: unknown): 'payment_failed' | 'requires_action' | 'stripe_failed' {
  const e = (error ?? {}) as StripeErrorLike;
  if (e.code === 'subscription_payment_intent_requires_action') return 'requires_action';
  if (e.type === 'StripeCardError' || e.statusCode === 402) return 'payment_failed';
  return 'stripe_failed';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(500, { error: 'billing_not_configured' });

  // 1. The caller is the JWT user — never a body field.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const userId = userData.user.id;

  // 2. Closed action vocabulary.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const parsed = parseManageRequest(rawBody);
  if (!parsed.ok) return json(400, { error: parsed.reason });
  const request = parsed.request;

  // 3. Server-side identity: customer mapping + the user's own cache rows.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: mapping, error: mappingError } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (mappingError) return json(500, { error: 'customer_lookup_failed' });
  const customerId = mapping?.stripe_customer_id ?? null;
  if (!customerId) return json(404, { error: 'no_billing_customer' });

  const { data: cacheRows, error: cacheError } = await admin
    .from('customer_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, offer_key, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId);
  if (cacheError) return json(500, { error: 'subscription_lookup_failed' });
  const managed = pickManagedSubscription((cacheRows ?? []) as ManagedSubscriptionRow[]);
  if (!managed) return json(404, { error: 'no_active_subscription' });
  if (managed.stripe_customer_id !== customerId) return json(409, { error: 'subscription_customer_mismatch' });

  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  const nowEpoch = Math.floor(Date.now() / 1000);

  // 4. Current truth from Stripe (the cache decides WHICH subscription; Stripe decides its state).
  let live: ReturnType<typeof extractLiveSubscription>;
  try {
    live = extractLiveSubscription(
      (await stripe.subscriptions.retrieve(managed.stripe_subscription_id)) as unknown as Record<string, unknown>,
    );
  } catch {
    return json(502, { error: 'stripe_subscription_retrieve_failed' });
  }
  if (live.customerId !== customerId) return json(409, { error: 'subscription_customer_mismatch' });

  const refetch = async (resource: StripeResource, id: string): Promise<Record<string, unknown>> => {
    switch (resource) {
      case 'subscription':
        return (await stripe.subscriptions.retrieve(id)) as unknown as Record<string, unknown>;
      case 'subscription_schedule':
        return (await stripe.subscriptionSchedules.retrieve(id)) as unknown as Record<string, unknown>;
      case 'invoice':
        return (await stripe.invoices.retrieve(id)) as unknown as Record<string, unknown>;
      case 'charge':
        return (await stripe.charges.retrieve(id)) as unknown as Record<string, unknown>;
      case 'refund':
        return (await stripe.refunds.retrieve(id)) as unknown as Record<string, unknown>;
      case 'dispute':
        return (await stripe.disputes.retrieve(id)) as unknown as Record<string, unknown>;
      case 'account':
        return (await stripe.accounts.retrieve(id)) as unknown as Record<string, unknown>;
    }
  };

  /** Mirror the new Stripe state into the cache NOW (same writer as the webhook). */
  const syncCache = async (livemode: boolean): Promise<boolean> => {
    try {
      await syncSubscriptionNow(
        { db: admin as unknown as DbClient, refetch },
        { subscriptionId: managed.stripe_subscription_id, livemode, nowEpoch },
      );
      return true;
    } catch {
      // The webhook delivery converges the cache; the reply still carries Stripe's state.
      console.log(`manage-subscription: inline sync deferred for ${managed.stripe_subscription_id}`);
      return false;
    }
  };

  const releaseScheduleIfAny = async (): Promise<void> => {
    if (!live.scheduleId) return;
    try {
      await stripe.subscriptionSchedules.release(live.scheduleId);
    } catch {
      // Already released/completed → nothing to release; the update below decides.
    }
  };

  const resolveTargetPriceId = async (
    offerKey: string,
  ): Promise<{ priceId: string; amountCents: number | null } | null> => {
    const { data: row } = await admin
      .from('billing_price_catalog')
      .select('stripe_price_id, amount_cents')
      .eq('offer_key', offerKey)
      .maybeSingle();
    if (row?.stripe_price_id) {
      return { priceId: row.stripe_price_id as string, amountCents: (row.amount_cents as number) ?? null };
    }
    const envName = PURCHASABLE_OFFERS.find((o) => o.offerKey === offerKey)?.envVarName;
    const fromEnv = envName ? Deno.env.get(envName) : undefined;
    if (fromEnv) return { priceId: fromEnv, amountCents: (row?.amount_cents as number | undefined) ?? null };
    return null;
  };

  try {
    switch (request.action) {
      // ── cancel at period end ──────────────────────────────────────────────
      case 'cancel': {
        const decision = decideCancel(live);
        if (!decision.ok) return json(409, { error: decision.reason });
        // A pending downgrade is superseded by the cancellation.
        await releaseScheduleIfAny();
        const updated = await stripe.subscriptions.update(
          live.id,
          { cancel_at_period_end: true },
          { idempotencyKey: buildCancelIdempotencyKey(live.id, live.currentPeriodEndEpoch) },
        );
        const state = toStateReply(extractLiveSubscription(updated as unknown as Record<string, unknown>));
        const synced = await syncCache(updated.livemode);
        console.log(`manage-subscription: cancel_at_period_end set on ${live.id}`);
        return json(200, { ok: true, action: 'cancel', subscription: state, synced });
      }

      // ── resume before the period ends ─────────────────────────────────────
      case 'resume': {
        const decision = decideResume(live, nowEpoch);
        if (!decision.ok) return json(409, { error: decision.reason });
        const updated = await stripe.subscriptions.update(
          live.id,
          { cancel_at_period_end: false },
          { idempotencyKey: buildResumeIdempotencyKey(live.id, live.currentPeriodEndEpoch) },
        );
        const state = toStateReply(extractLiveSubscription(updated as unknown as Record<string, unknown>));
        const synced = await syncCache(updated.livemode);
        console.log(`manage-subscription: resumed ${live.id}`);
        return json(200, { ok: true, action: 'resume', subscription: state, synced });
      }

      // ── preview / confirm a plan change ───────────────────────────────────
      case 'preview_change':
      case 'confirm_change': {
        const from = manageableOffer(managed.offer_key);
        const to = manageableOffer(request.targetOfferKey);
        if (!from) return json(409, { error: 'current_offer_not_manageable' });
        if (!to) return json(400, { error: 'unknown_or_unpurchasable_offer' });
        if (!live.itemId || !live.priceId) return json(409, { error: 'subscription_without_item' });
        if (live.cancelAtPeriodEnd) return json(409, { error: 'resume_before_changing_plan' });
        const change = decidePlanChange(from, to);
        if (change.kind === 'noop') return json(409, { error: change.reason });
        // Monthly → yearly is priced by the owner-accepted conversion
        // authority (full-month credit, annual term anchored at the current
        // period start), which has no server implementation yet. Refusing is
        // the honest answer — a default Stripe proration here would charge
        // under a policy the owner replaced.
        if (change.kind === 'conversion_authority') {
          return json(409, { error: 'cadence_conversion_not_available' });
        }
        // Stripe refuses direct updates on a subscription a schedule drives, and
        // a preview of one is meaningless. The pending change must be cancelled
        // first — preview and confirm refuse together, so a preview the customer
        // saw can always be confirmed.
        if (change.kind === 'immediate' && live.scheduleId) {
          return json(409, { error: 'cancel_scheduled_change_first' });
        }
        const target = await resolveTargetPriceId(to.offerKey);
        if (!target) return json(500, { error: 'offer_price_not_configured' });

        if (change.kind === 'scheduled') {
          if (live.currentPeriodEndEpoch === null) return json(409, { error: 'no_current_period_end' });
          if (request.action === 'preview_change') {
            return json(200, {
              ok: true,
              kind: 'scheduled',
              targetOfferKey: to.offerKey,
              effectiveAt: new Date(live.currentPeriodEndEpoch * 1000).toISOString(),
              amountDueTodayCents: 0,
              nextAmountCents: target.amountCents,
            });
          }
          // Confirm: attach (or reuse) the schedule and set the two phases.
          const scheduleKey = buildScheduleIdempotencyKey({
            subscriptionId: live.id,
            targetOfferKey: to.offerKey,
            currentPeriodEndEpoch: live.currentPeriodEndEpoch,
          });
          let scheduleId = live.scheduleId;
          let phaseStart = live.currentPeriodStartEpoch;
          if (scheduleId) {
            const existing = await stripe.subscriptionSchedules.retrieve(scheduleId);
            phaseStart = existing.current_phase?.start_date ?? existing.phases[0]?.start_date ?? phaseStart;
          } else {
            const created = await stripe.subscriptionSchedules.create(
              { from_subscription: live.id },
              { idempotencyKey: `${scheduleKey}:create` },
            );
            scheduleId = created.id;
            phaseStart = created.phases[0]?.start_date ?? phaseStart;
          }
          if (phaseStart === null) return json(409, { error: 'no_current_period_start' });
          const phases = buildScheduledChangePhases({
            currentPriceId: live.priceId,
            currentPhaseStartEpoch: phaseStart,
            currentPeriodEndEpoch: live.currentPeriodEndEpoch,
            targetPriceId: target.priceId,
            targetOfferKey: to.offerKey,
          });
          await stripe.subscriptionSchedules.update(
            scheduleId,
            phases as unknown as Stripe.SubscriptionScheduleUpdateParams,
            { idempotencyKey: `${scheduleKey}:phases` },
          );
          const current = await stripe.subscriptions.retrieve(live.id);
          const refreshed = extractLiveSubscription(current as unknown as Record<string, unknown>);
          const synced = await syncCache(current.livemode);
          console.log(`manage-subscription: scheduled ${to.offerKey} on ${live.id}`);
          return json(200, {
            ok: true,
            action: 'confirm_change',
            kind: 'scheduled',
            targetOfferKey: to.offerKey,
            effectiveAt: new Date(live.currentPeriodEndEpoch * 1000).toISOString(),
            subscription: toStateReply(refreshed),
            synced,
          });
        }

        // Immediate, prorated change — preview and confirm use the SAME params.
        if (request.action === 'preview_change') {
          const prorationTimestamp = nowEpoch;
          const preview = await stripe.invoices.createPreview(
            buildPreviewParams({
              customerId,
              subscriptionId: live.id,
              itemId: live.itemId,
              targetPriceId: target.priceId,
              prorationTimestamp,
              resetBillingCycle: change.resetBillingCycle,
            }) as unknown as Stripe.InvoiceCreatePreviewParams,
          );
          const summary = summarizeInvoicePreview(preview as unknown as Record<string, unknown>);
          const nextRenewalEpoch = change.resetBillingCycle
            ? summary.nextRenewalEpoch
            : live.currentPeriodEndEpoch;
          return json(200, {
            ok: true,
            kind: 'immediate',
            targetOfferKey: to.offerKey,
            prorationTimestamp,
            amountDueTodayCents: summary.amountDueCents,
            currency: summary.currency,
            prorationCents: summary.prorationCents,
            taxCents: summary.taxCents,
            appliedBalanceCents: summary.appliedBalanceCents,
            nextRenewalAt: nextRenewalEpoch === null ? null : new Date(nextRenewalEpoch * 1000).toISOString(),
            nextAmountCents: target.amountCents,
            resetBillingCycle: change.resetBillingCycle,
          });
        }

        const stamp = decideConfirmTimestamp(request.prorationTimestamp, nowEpoch);
        if (!stamp.ok) return json(409, { error: stamp.reason });
        const prorationTimestamp = request.prorationTimestamp as number;
        const updated = await stripe.subscriptions.update(
          live.id,
          buildImmediateChangeParams({
            itemId: live.itemId,
            targetPriceId: target.priceId,
            targetOfferKey: to.offerKey,
            prorationTimestamp,
            resetBillingCycle: change.resetBillingCycle,
          }) as unknown as Stripe.SubscriptionUpdateParams,
          {
            idempotencyKey: buildChangeIdempotencyKey({
              subscriptionId: live.id,
              targetOfferKey: to.offerKey,
              prorationTimestamp,
            }),
          },
        );
        const state = toStateReply(extractLiveSubscription(updated as unknown as Record<string, unknown>));
        const synced = await syncCache(updated.livemode);
        console.log(`manage-subscription: immediate change to ${to.offerKey} on ${live.id}`);
        return json(200, {
          ok: true,
          action: 'confirm_change',
          kind: 'immediate',
          targetOfferKey: to.offerKey,
          subscription: state,
          synced,
        });
      }

      // ── cancel a scheduled (period-end) change ────────────────────────────
      case 'cancel_scheduled_change': {
        if (!live.scheduleId) return json(409, { error: 'no_scheduled_change' });
        await stripe.subscriptionSchedules.release(live.scheduleId);
        const current = await stripe.subscriptions.retrieve(live.id);
        const refreshed = extractLiveSubscription(current as unknown as Record<string, unknown>);
        const synced = await syncCache(current.livemode);
        console.log(`manage-subscription: released schedule on ${live.id}`);
        return json(200, {
          ok: true,
          action: 'cancel_scheduled_change',
          subscription: toStateReply(refreshed),
          synced,
        });
      }
    }
  } catch (error) {
    const kind = classifyStripeError(error);
    console.log(`manage-subscription: ${request.action} failed (${kind})`);
    if (kind === 'payment_failed') return json(402, { error: 'payment_failed' });
    if (kind === 'requires_action') return json(402, { error: 'requires_action' });
    return json(502, { error: 'stripe_failed' });
  }
  return json(400, { error: 'unknown_action' });
});
