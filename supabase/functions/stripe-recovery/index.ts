/**
 * stripe-recovery — Edge Function (Deno). The worker the webhook always assumed.
 *
 * `stripe-webhook` answers Stripe 200 the moment a delivery is durably stored,
 * then applies its effects. When an effect cannot run yet — the paid invoice
 * arrived before its subscription, the month's tier snapshot does not exist yet,
 * a refund landed before the commission was booked — the row is left `received`
 * with the reason in `last_error` "for the retry worker". There was no retry
 * worker, so those events stopped there and the money they described was never
 * booked, reversed or restored.
 *
 * Two modes, both operator-only:
 *
 *   retry      re-apply durably received deliveries whose dependency was
 *              missing, with backoff, until they succeed or the window ends.
 *              The payload is the one Stripe signed and this project stored;
 *              nothing is re-fetched from an unverified source.
 *
 *   reconcile  read the money back from Stripe for commission entries and apply
 *              the reversals or reinstatements the ledger is missing. This is
 *              the repair for deliveries that were ANSWERED before the entry
 *              existed: Stripe will not send those again, and the adjustments
 *              carry the same keys as the live path, so nothing can double.
 *
 * Authorisation: the service role key this function already holds, compared in
 * constant time, exactly as email-dispatch does — `verify_jwt` admits the public
 * anon key and is not access control. The scheduled tick presents that key from
 * Vault (`gellatti_edge_dispatch_key`).
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION (optional),
 * plus the auto-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  applyEventEffects,
  reconcileEntryMoney,
  type DbClient,
  type StripeList,
  type StripeResource,
} from '../stripe-webhook/dispatch.ts';

const DEFAULT_LIMIT = 50;
/**
 * How long a missing dependency may keep an event alive. A month's tier
 * snapshot is written by a nightly job, so a renewal paid just after the Madrid
 * month turns over waits hours, not minutes — a five-attempt budget would throw
 * that commission away. After the window the row is a dead letter: visible,
 * escalated, never silently dropped.
 */
const RETRY_WINDOW_HOURS = 72;
const MAX_BACKOFF_SECONDS = 1800;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Length-then-XOR compare, so a caller cannot probe the key byte by byte. */
const secretEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
};

/** Exponential, capped: 1, 2, 4, 8, 16 minutes, then every 30. Mirrored in SQL by the tick. */
export const backoffSeconds = (attempts: number): number =>
  Math.min(60 * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_SECONDS);

interface StoredEvent {
  id: string;
  event_id: string;
  event_type: string;
  state: string;
  attempts: number;
  last_error: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  updated_at: string;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: 'server_not_configured' });
  if (!stripeKey) return json(500, { error: 'billing_not_configured' });

  const presented = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secretEquals(presented, serviceRoleKey)) return json(403, { error: 'forbidden' });

  let body: { mode?: string; limit?: number; entryIds?: string[]; sinceHours?: number };
  try {
    body = request.headers.get('content-length') === '0' ? {} : await request.json();
  } catch {
    body = {};
  }
  const mode = body.mode ?? 'retry';
  const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT), 1), 200);

  const stripe = new Stripe(stripeKey, {
    apiVersion: (Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil') as Stripe.LatestApiVersion,
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const refetch = async (resource: StripeResource, id: string): Promise<Record<string, unknown>> => {
    switch (resource) {
      case 'subscription':
        return (await stripe.subscriptions.retrieve(id)) as unknown as Record<string, unknown>;
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

  const listAll = async (list: StripeList, filter: string): Promise<Record<string, unknown>[]> => {
    const items: Record<string, unknown>[] = [];
    switch (list) {
      case 'invoice_payments_by_invoice':
        for await (const payment of stripe.invoicePayments.list({ invoice: filter, limit: 100 })) {
          items.push(payment as unknown as Record<string, unknown>);
        }
        return items;
      case 'invoice_payments_by_payment_intent':
        for await (const payment of stripe.invoicePayments.list({
          payment: { type: 'payment_intent', payment_intent: filter },
          limit: 100,
        })) {
          items.push(payment as unknown as Record<string, unknown>);
        }
        return items;
      case 'refunds_by_charge':
        for await (const refund of stripe.refunds.list({ charge: filter, limit: 100 })) {
          items.push(refund as unknown as Record<string, unknown>);
        }
        return items;
      case 'refunds_by_payment_intent':
        for await (const refund of stripe.refunds.list({ payment_intent: filter, limit: 100 })) {
          items.push(refund as unknown as Record<string, unknown>);
        }
        return items;
      case 'disputes_by_payment_intent':
        for await (const dispute of stripe.disputes.list({ payment_intent: filter, limit: 100 })) {
          items.push(dispute as unknown as Record<string, unknown>);
        }
        return items;
    }
  };

  const deps = { db: admin as unknown as DbClient, refetch, listAll };

  if (mode === 'retry') {
    const { data: rows, error } = await admin
      .from('stripe_webhook_events')
      .select('id, event_id, event_type, state, attempts, last_error, payload, received_at, updated_at')
      .in('state', ['received', 'failed'])
      .gt('attempts', 0)
      .order('received_at', { ascending: true })
      .limit(limit);
    if (error) return json(500, { error: 'claim_failed', detail: error.message });

    const now = Date.now();
    let retried = 0;
    let processed = 0;
    let deferred = 0;
    let deadLettered = 0;
    const results: Record<string, string>[] = [];

    for (const row of (rows ?? []) as unknown as StoredEvent[]) {
      const due = Date.parse(row.updated_at) + backoffSeconds(row.attempts) * 1000 <= now;
      if (!due) continue;
      const expired = Date.parse(row.received_at) + RETRY_WINDOW_HOURS * 3600 * 1000 <= now;
      if (expired) {
        await admin
          .from('stripe_webhook_events')
          .update({ state: 'dead_letter', last_error: `escalated_after_${RETRY_WINDOW_HOURS}h:${row.last_error ?? ''}` })
          .eq('id', row.id)
          .eq('state', row.state);
        deadLettered += 1;
        results.push({ event: row.event_id, outcome: 'dead_letter' });
        continue;
      }

      // Claim: only one worker may own a row, and only from the state we read.
      const { data: claimed, error: claimError } = await admin
        .from('stripe_webhook_events')
        .update({ state: 'processing' })
        .eq('id', row.id)
        .eq('state', row.state)
        .select('id')
        .maybeSingle();
      if (claimError || !claimed) continue;
      retried += 1;

      const payload = row.payload ?? {};
      const data = (payload.data ?? {}) as Record<string, unknown>;
      const object = (data.object ?? {}) as Record<string, unknown>;
      try {
        const result = await applyEventEffects(deps, {
          id: row.event_id,
          type: row.event_type,
          created: Number(payload.created ?? 0),
          livemode: Boolean(payload.livemode ?? false),
          object,
        });
        await admin
          .from('stripe_webhook_events')
          .update({ state: 'processed', processed_at: new Date().toISOString(), last_error: result.note })
          .eq('id', row.id)
          .eq('state', 'processing');
        processed += 1;
        results.push({ event: row.event_id, outcome: 'processed', note: result.note ?? '' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'dispatch_failed';
        const terminal = error instanceof Error && error.name === 'EffectConflictError';
        await admin
          .from('stripe_webhook_events')
          .update({
            state: terminal ? 'failed' : 'received',
            attempts: row.attempts + 1,
            last_error: message,
          })
          .eq('id', row.id)
          .eq('state', 'processing');
        deferred += 1;
        results.push({ event: row.event_id, outcome: terminal ? 'failed' : 'deferred', note: message });
      }
    }
    return json(200, { mode, claimed: retried, processed, deferred, deadLettered, results });
  }

  if (mode === 'reconcile') {
    const sinceHours = Math.min(Math.max(Number(body.sinceHours ?? 24 * 30), 1), 24 * 365);
    let query = admin
      .from('commission_entries')
      .select('id, stripe_invoice_id, stripe_payment_intent_id, status, earned_at')
      .in('status', ['held', 'eligible', 'paid', 'reversed'])
      .gte('earned_at', new Date(Date.now() - sinceHours * 3600 * 1000).toISOString())
      .order('earned_at', { ascending: false })
      .limit(limit);
    if (Array.isArray(body.entryIds) && body.entryIds.length > 0) {
      query = admin
        .from('commission_entries')
        .select('id, stripe_invoice_id, stripe_payment_intent_id, status, earned_at')
        .in('id', body.entryIds)
        .limit(limit);
    }
    const { data: entries, error } = await query;
    if (error) return json(500, { error: 'entry_scan_failed', detail: error.message });

    const results: Record<string, unknown>[] = [];
    let repaired = 0;
    for (const entry of (entries ?? []) as unknown as Record<string, string>[]) {
      try {
        const outcome = await reconcileEntryMoney(
          deps,
          {
            invoiceId: entry.stripe_invoice_id ?? null,
            paymentIntentId: entry.stripe_payment_intent_id ?? null,
          },
          'reconciled_by_recovery_worker',
        );
        if (outcome.applied.length > 0) repaired += 1;
        results.push({ entry: entry.id, applied: outcome.applied, skipped: outcome.skipped });
      } catch (error) {
        results.push({ entry: entry.id, error: error instanceof Error ? error.message : 'reconcile_failed' });
      }
    }
    return json(200, { mode, scanned: (entries ?? []).length, repaired, results });
  }

  return json(400, { error: 'unknown_mode' });
});
