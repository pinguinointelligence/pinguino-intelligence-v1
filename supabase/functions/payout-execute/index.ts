/**
 * payout-execute — Edge Function (Deno). The step between a built payout batch
 * and money actually leaving the platform.
 *
 * The ledger has had `gellatti_claim_payout_lines_v1` and
 * `gellatti_settle_payout_line_v2` since the payout package was written, and
 * `partner_payouts.stripe_transfer_id` has always been the column that proves a
 * transfer happened. Nothing ever called them: there is no `transfers.create`
 * anywhere in this project, so every batch stopped at `pending` and the QA
 * campaign could only demonstrate a synthetic settlement.
 *
 * WHAT IT DOES, in the order that makes a double payment impossible:
 *   1. claim  — the DB hands out lines one worker at a time (`for update skip
 *      locked`), and refuses a line whose reserved entries are no longer
 *      eligible or whose partner cannot receive money.
 *   2. transfer — `transfers.create` with the line's OWN idempotency key
 *      (month:partner:currency:mode). If this worker died after Stripe accepted
 *      the transfer but before the ledger recorded it, the next run presents the
 *      same key and Stripe returns THE SAME transfer instead of making a second
 *      one. An unknown outcome is never a reason to send again with a new key.
 *   3. settle — `gellatti_settle_payout_line_v2` binds that transfer id to the
 *      line and flips its reserved entries to paid. A failure here leaves the
 *      line claimable again, and step 2 will rebind the same transfer.
 *
 * WHAT IT IS NOT. A Transfer moves money from the platform balance to the
 * connected account. It is NOT the payout from that account to the partner's
 * bank: Stripe makes those on the connected account's own schedule and may
 * aggregate several transfers into one. This function never claims a bank
 * arrival, and it writes no payout-level linkage it cannot prove.
 *
 * Authorisation: the service role key, compared in constant time — `verify_jwt`
 * admits the public anon key and is not access control. Live mode additionally
 * requires the owner release the ledger already enforces
 * (`gellatti_assert_payout_allowed_v1`).
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION (optional),
 * plus the auto-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Length-then-XOR compare, so a caller cannot probe the key byte by byte. */
const secretEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
};

interface ClaimedLine {
  payout_id: string;
  partner_id: string;
  amount_cents: number;
  idempotency_key: string;
  stripe_connect_account_id: string | null;
  livemode: boolean;
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

  let body: { batchId?: string; limit?: number; qaStopAfterTransfer?: boolean };
  try {
    body = request.headers.get('content-length') === '0' ? {} : await request.json();
  } catch {
    body = {};
  }
  if (!body.batchId) return json(400, { error: 'batch_id_required' });
  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 100);

  const stripe = new Stripe(stripeKey, {
    apiVersion: (Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil') as Stripe.LatestApiVersion,
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: batch, error: batchError } = await admin
    .from('payout_batches')
    .select('id, month, currency, livemode, status')
    .eq('id', body.batchId)
    .maybeSingle();
  if (batchError) return json(500, { error: 'batch_lookup_failed', detail: batchError.message });
  if (!batch) return json(404, { error: 'payout_batch_not_found' });

  /* A test-only stop, refused where money is real: it returns right after the
     transfer exists and BEFORE the ledger records it, so the recovery path
     (same key → same transfer → bound on the next run) can be exercised
     deliberately instead of waited for. */
  const stopAfterTransfer = body.qaStopAfterTransfer === true && batch.livemode === false;
  if (body.qaStopAfterTransfer === true && batch.livemode !== false) {
    return json(400, { error: 'qa_stop_refused_in_livemode' });
  }

  const { data: claimed, error: claimError } = await admin.rpc('gellatti_claim_payout_lines_v1', {
    p_batch_id: batch.id,
    p_limit: limit,
  });
  if (claimError) return json(500, { error: 'claim_failed', detail: claimError.message });

  const lines = (claimed ?? []) as unknown as ClaimedLine[];
  const results: Record<string, unknown>[] = [];
  let transferred = 0;
  let settled = 0;
  let failed = 0;

  for (const line of lines) {
    if (!line.stripe_connect_account_id) {
      // The claim already refuses these; this is the belt to its braces.
      await admin.rpc('gellatti_mark_payout_failed_v1', {
        p_payout_id: line.payout_id,
        p_reason: 'no_connect_account',
      });
      failed += 1;
      results.push({ payout: line.payout_id, outcome: 'failed', reason: 'no_connect_account' });
      continue;
    }

    let transferId: string | null = null;
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: line.amount_cents,
          currency: batch.currency ?? 'eur',
          destination: line.stripe_connect_account_id,
          // The batch, the partner and the line, readable from the Stripe side.
          transfer_group: `payout_batch:${batch.id}`,
          metadata: {
            gellatti_payout_id: line.payout_id,
            gellatti_partner_id: line.partner_id,
            gellatti_batch_month: String(batch.month ?? ''),
          },
        },
        // The line's own key: a repeat asks Stripe for the SAME transfer.
        { idempotencyKey: line.idempotency_key },
      );
      transferId = transfer.id;
      transferred += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'transfer_failed';
      await admin.rpc('gellatti_mark_payout_failed_v1', {
        p_payout_id: line.payout_id,
        p_reason: message.slice(0, 200),
      });
      failed += 1;
      results.push({ payout: line.payout_id, outcome: 'failed', reason: message.slice(0, 200) });
      continue;
    }

    if (stopAfterTransfer) {
      results.push({ payout: line.payout_id, outcome: 'transferred_not_settled', transfer: transferId });
      continue;
    }

    const { data: settleResult, error: settleError } = await admin.rpc('gellatti_settle_payout_line_v2', {
      p_payout_id: line.payout_id,
      p_stripe_transfer_id: transferId,
      p_partner_id: line.partner_id,
      p_amount_cents: line.amount_cents,
      p_currency: batch.currency ?? 'eur',
      p_livemode: line.livemode,
    });
    if (settleError) {
      // The money moved; the ledger did not record it. The line stays claimable
      // and the next run presents the same key, so Stripe returns this transfer
      // rather than making another.
      results.push({
        payout: line.payout_id,
        outcome: 'transferred_settle_failed',
        transfer: transferId,
        detail: settleError.message,
      });
      continue;
    }
    settled += 1;
    results.push({ payout: line.payout_id, outcome: 'settled', transfer: transferId, ledger: settleResult });
  }

  return json(200, {
    batch: batch.id,
    month: batch.month,
    livemode: batch.livemode,
    claimed: lines.length,
    transferred,
    settled,
    failed,
    results,
  });
});
