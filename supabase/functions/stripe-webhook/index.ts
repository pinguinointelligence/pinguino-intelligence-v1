/**
 * stripe-webhook (v2, billing platform) — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * Source-only in this slice: deployment requires owner approval, the track D
 * migration that creates `stripe_webhook_events`, and the Nicolas webhook
 * endpoint setup (handoff §9, events exactly per
 * docs/billing-partner/WEBHOOK_MATRIX.md). Deploy with JWT verification
 * disabled — Stripe cannot send a JWT; the Stripe SIGNATURE is the
 * authentication.
 *
 * Architecture (test-pinned via handlers.ts + source scans):
 *  1. SIGNATURE FIRST — verify the Stripe signature over the RAW body before
 *     any DB access; unsigned/invalid → 400, nothing written.
 *  2. DELIBERATE MATRIX — only events in WEBHOOK_EVENT_INTENTS are durable;
 *     anything else is acknowledged (200) without a write so a mistaken
 *     dashboard subscription can never grow unbounded state.
 *  3. INSERT-FIRST DURABILITY — the event is inserted into
 *     stripe_webhook_events (unique event key, state 'received')
 *     BEFORE any handling. A unique-violation means a redelivery of an
 *     already-recorded event → 200 immediately (idempotent receipt).
 *  4. 2xx AFTER DURABLE RECEIPT — once the row exists, this function returns
 *     200 even if downstream handling fails: the row's state machine
 *     (received → processing → processed | failed → retryable, see
 *     handlers.ts) drives retries via the background worker, NOT via Stripe
 *     redelivery storms.
 *  5. Local effects are applied inline by ./dispatch.ts using the pure
 *     decisions (./effects.ts mappers + per-intent idempotency keys backed
 *     by the 0014–0021 unique constraints). A dispatch failure transitions
 *     the row processing → failed → retryable (decideFailureFollowup) for
 *     the retry worker — it never breaks the 2xx contract. Intents whose
 *     target tables do not exist in the migrations are explicit
 *     `skipped_no_contract` no-ops recorded on the processed row.
 *
 * Required env (names only, never values): STRIPE_WEBHOOK_SECRET,
 * STRIPE_SECRET_KEY, STRIPE_API_VERSION, plus the auto-injected
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decideFailureFollowup, routeWebhookEvent } from './handlers.ts';
import { applyEventEffects, type DbClient, type StripeList, type StripeResource } from './dispatch.ts';

/** First API version with InvoicePayment; version strings compare by their date prefix. */
const BASIL_API_VERSION_DATE = '2025-03-31';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const signingSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!signingSecret || !stripeKey) return json(500, { error: 'webhook_not_configured' });

  // 1. Authenticate the request: a valid Stripe signature over the RAW body.
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json(400, { error: 'missing_signature' });
  const rawBody = await req.text();

  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  // The reversal writers find an invoice through InvoicePayment, which exists
  // from 2025-03-31.basil on. An older pinned version would not fail — it would
  // silently skip every refund and dispute reversal — so it is refused before
  // anything is received, and Stripe keeps redelivering until it is fixed.
  if (apiVersion < BASIL_API_VERSION_DATE) {
    console.log('stripe-webhook: STRIPE_API_VERSION predates InvoicePayment (Basil); refusing');
    return json(500, { error: 'webhook_not_configured' });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  /* TWO DESTINATIONS, ONE URL. Stripe delivers events about the platform and
     events about a connected account through different destinations, each with
     its OWN signing secret. The Connect secret has been named in the docs since
     the lane was designed and referenced nowhere, so a connected account's
     `account.updated` could never be verified here — which is the delivery that
     turns `payouts_enabled` on. Both secrets are accepted, tried in order, and
     the signature still decides: an event that matches neither is refused. */
  const connectSigningSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? '';
  let event: Stripe.Event | null = null;
  for (const secret of [signingSecret, connectSigningSecret]) {
    if (!secret) continue;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret, undefined, cryptoProvider);
      break;
    } catch {
      event = null;
    }
  }
  if (!event) return json(400, { error: 'invalid_signature' });

  /* WHOSE EVENT IS THIS? Stripe sets `account` on an event about a connected
     account. It decides the durable scope (0021 knows 'platform' and 'connect')
     and, just as importantly, the account every re-read must use: an object of a
     connected account does not exist in the platform's context. */
  const eventAccount = typeof event.account === 'string' ? event.account : null;
  const requestOptions = eventAccount ? { stripeAccount: eventAccount } : undefined;

  // 2. Deliberate matrix only — anything else is acknowledged, never stored.
  const handlerIntent = routeWebhookEvent(event.type);
  console.log(`stripe-webhook: ${event.type} -> ${handlerIntent?.kind ?? 'unsupported'}`);
  if (!handlerIntent) return json(200, { received: true, route: 'acknowledge_unsupported' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 3. Insert-first durability: the raw event lands in stripe_webhook_events
  //    (0021: unique (account_scope, livemode, event_id)) BEFORE any handling.
  //    `ignoreDuplicates` makes redelivery a clean no-op (unique key wins the
  //    race). event.created / the object id / the routed intent live inside
  //    the verified payload — 0021 deliberately stores the raw event only.
  const { data: inserted, error: insertError } = await admin
    .from('stripe_webhook_events')
    .upsert(
      {
        account_scope: eventAccount ? 'connect' : 'platform',
        livemode: event.livemode,
        event_id: event.id,
        event_type: event.type,
        payload: JSON.parse(rawBody) as Record<string, unknown>,
        state: 'received',
      },
      { onConflict: 'account_scope,livemode,event_id', ignoreDuplicates: true },
    )
    .select('event_id');
  if (insertError) {
    // Not durable yet — non-2xx so Stripe redelivers.
    console.log(`stripe-webhook: durable insert failed for ${event.id}`);
    return json(500, { error: 'durable_receipt_failed' });
  }
  const duplicate = !inserted || inserted.length === 0;
  if (duplicate) {
    // Already durably received earlier — idempotent acknowledge.
    return json(200, { received: true, duplicate: true });
  }

  // 4. Durable receipt achieved — the response is 200 from here on, no
  //    matter what the dispatcher does; retries are the state machine's job
  //    (received → processing → processed | failed → retryable, guarded
  //    state-conditional updates so a concurrent worker can never regress a
  //    row). The per-intent table writers live in ./dispatch.ts; their
  //    failures transition the row to failed/retryable instead of breaking
  //    the 2xx contract.
  const { error: claimError } = await admin
    .from('stripe_webhook_events')
    .update({ state: 'processing' })
    .eq('event_id', event.id)
    .eq('state', 'received');
  if (!claimError) {
    // Refetch-current for requiresRefetch intents: payload snapshots may be
    // out of order; the refetched object is always the current truth.
    const refetch = async (resource: StripeResource, id: string): Promise<Record<string, unknown>> => {
      switch (resource) {
        case 'subscription':
          return (await stripe.subscriptions.retrieve(id, requestOptions)) as unknown as Record<string, unknown>;
        case 'invoice':
          return (await stripe.invoices.retrieve(id, requestOptions)) as unknown as Record<string, unknown>;
        case 'charge':
          return (await stripe.charges.retrieve(id, requestOptions)) as unknown as Record<string, unknown>;
        case 'refund':
          return (await stripe.refunds.retrieve(id, requestOptions)) as unknown as Record<string, unknown>;
        case 'dispute':
          return (await stripe.disputes.retrieve(id, requestOptions)) as unknown as Record<string, unknown>;
        case 'account':
          // An account is always read from the platform: it IS the connected account.
          return (await stripe.accounts.retrieve(id)) as unknown as Record<string, unknown>;
      }
    };

    // Every page, always: auto-pagination follows has_more to the end.
    const listAll = async (list: StripeList, filter: string): Promise<Record<string, unknown>[]> => {
      const items: Record<string, unknown>[] = [];
      switch (list) {
        case 'invoice_payments_by_invoice':
          for await (const payment of stripe.invoicePayments.list({ invoice: filter, limit: 100 }, requestOptions)) {
            items.push(payment as unknown as Record<string, unknown>);
          }
          return items;
        case 'invoice_payments_by_payment_intent':
          for await (const payment of stripe.invoicePayments.list({
            payment: { type: 'payment_intent', payment_intent: filter },
            limit: 100,
          }, requestOptions)) {
            items.push(payment as unknown as Record<string, unknown>);
          }
          return items;
        case 'refunds_by_charge':
          for await (const refund of stripe.refunds.list({ charge: filter, limit: 100 }, requestOptions)) {
            items.push(refund as unknown as Record<string, unknown>);
          }
          return items;
        case 'refunds_by_payment_intent':
          for await (const refund of stripe.refunds.list({ payment_intent: filter, limit: 100 }, requestOptions)) {
            items.push(refund as unknown as Record<string, unknown>);
          }
          return items;
        case 'disputes_by_payment_intent':
          for await (const dispute of stripe.disputes.list({ payment_intent: filter, limit: 100 }, requestOptions)) {
            items.push(dispute as unknown as Record<string, unknown>);
          }
          return items;
      }
    };

    let note: string | null = null;
    let failureMessage: string | null = null;
    let terminalFailure = false;
    try {
      const result = await applyEventEffects(
        { db: admin as unknown as DbClient, refetch, listAll },
        {
          id: event.id,
          type: event.type,
          created: event.created,
          livemode: event.livemode,
          object: event.data.object as unknown as Record<string, unknown>,
        },
      );
      note = result.note;
    } catch (dispatchError) {
      failureMessage =
        dispatchError instanceof Error ? dispatchError.message : 'dispatch_failed';
      // A conflict is a fact about the data, not a transient condition, so it
      // must stay `failed` for a human instead of cycling back to `received`.
      terminalFailure =
        dispatchError instanceof Error && dispatchError.name === 'EffectConflictError';
    }

    if (failureMessage === null) {
      const { error: doneError } = await admin
        .from('stripe_webhook_events')
        .update({
          state: 'processed',
          processed_at: new Date().toISOString(),
          // The processing note (e.g. skipped_no_contract:<reason>) rides in
          // last_error — 0021's only free-text column; null on a clean apply.
          last_error: note,
        })
        .eq('event_id', event.id)
        .eq('state', 'processing');
      if (doneError) {
        console.log(`stripe-webhook: ${event.id} left in processing (retry worker owns it)`);
      }
    } else {
      // Guarded processing → failed (+ attempt accounting), then
      // failed → retryable while the attempt budget lasts.
      console.log(`stripe-webhook: ${event.id} dispatch failed (state machine owns the retry)`);
      const { data: attemptRow } = await admin
        .from('stripe_webhook_events')
        .select('attempts')
        .eq('event_id', event.id)
        .maybeSingle();
      const attempts = (attemptRow?.attempts ?? 0) + 1;
      const { error: failError } = await admin
        .from('stripe_webhook_events')
        .update({ state: 'failed', attempts, last_error: failureMessage })
        .eq('event_id', event.id)
        .eq('state', 'processing');
      if (!failError && !terminalFailure && decideFailureFollowup(attempts) === 'retryable') {
        await admin
          .from('stripe_webhook_events')
          // The durable schema models a retryable event as `received`; there
          // is intentionally no unsupported `retryable` state value.
          .update({ state: 'received' })
          .eq('event_id', event.id)
          .eq('state', 'failed');
      }
    }
  } else {
    console.log(`stripe-webhook: ${event.id} stays received (retry worker owns it)`);
  }

  return json(200, { received: true, route: handlerIntent.kind });
});
