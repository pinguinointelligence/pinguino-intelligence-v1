/**
 * email-dispatch — Edge Function (Deno).
 *
 * The execution layer for the persisted email lane:
 *   claim (idempotent) → provider → settle sent/failed → retry → Admin visible
 *
 * OWNER AUTHORITY (2026-08-31 §1–§3):
 *  - Canonical identity `Gellatti <info@gellatti.com>`, Reply-To the same.
 *  - Provider-agnostic: this file is the ONLY place that knows the vendor. The
 *    domain (src/notifications/domain) and the database know nothing about it.
 *  - **A missing credential may block delivery; it must never produce a false
 *    `sent`.** With no API key the worker claims NOTHING and returns
 *    `skipped: 'missing_credential'` — the queue is left exactly as it was and
 *    delivers itself once the key exists.
 *
 *    That guard replaced an earlier shape that claimed the batch and settled
 *    every job as a RETRYABLE failure. It looked equivalent and was not:
 *    `gellatti_mark_email_failed_v1` abandons a job at
 *    `attempts >= max_attempts`, so once this worker was actually scheduled,
 *    five passes with no key would have destroyed real customer mail rather
 *    than holding it. Not spending an attempt is what makes the promise above
 *    true.
 *
 * Invariants (test-pinned via logic.ts + source scans):
 *  - claiming is `for update skip locked`, so two concurrent invocations claim
 *    disjoint sets and a duplicate schedule can never double-send;
 *  - a job is settled ONLY through the two SECURITY DEFINER settle functions,
 *    which require the row to still be claimed;
 *  - `sent` is written only with a provider message id — the DB CHECK refuses
 *    anything else;
 *  - the worker is invoked by the scheduler (`gellatti-email-dispatch`, see
 *    the email dispatch scheduler migration) and authorises that caller
 *    ITSELF, by the service role key. `verify_jwt` alone admits the public
 *    anon key, so it never made this operator-only.
 *
 * Required env (names only): RESEND_API_KEY (optional — absence is handled),
 * EMAIL_PROVIDER_NAME (optional, default 'resend'), EMAIL_DISPATCH_BATCH_SIZE
 * (optional, default 10), plus auto-injected SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildProviderPayload,
  interpretProviderResponse,
  missingCredentialOutcome,
  type EmailJobRow,
  type ProviderOutcome,
} from './logic.ts';

const PROVIDER_ENDPOINT = 'https://api.resend.com/emails';

/** Length-then-XOR compare, so a caller cannot probe the key byte by byte. */
const secretEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function sendViaProvider(
  job: EmailJobRow,
  apiKey: string,
  providerName: string,
): Promise<ProviderOutcome> {
  try {
    const response = await fetch(PROVIDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // The provider's idempotency hook, so a retry after an ambiguous
        // outcome does not deliver twice on their side either.
        'Idempotency-Key': job.id,
      },
      body: JSON.stringify(buildProviderPayload(job)),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return interpretProviderResponse(response.status, parsed);
  } catch (error) {
    // Network-level failure: we do not know whether the provider received it.
    // Retryable, and the provider-side Idempotency-Key above protects against a
    // duplicate delivery when we try again.
    return {
      ok: false,
      failureKind: 'retryable',
      failureMessage: `${providerName} request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      failureCode: 'network_error',
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'server_not_configured' });
  }

  /* CALLER AUTHORISATION — `verify_jwt` is NOT access control here.
     The anon key is a valid project JWT and ships inside the public frontend
     bundle, so before this check ANY visitor could drive the worker: verified
     2026-09-03, an unauthenticated request carrying only the published anon key
     returned HTTP 200. The docblock's "there is no client-callable path" was
     simply untrue.

     The worker is operator-only, so it requires the service role key it is
     already given — no new secret to provision, and the scheduler presents
     exactly this from Vault. Backoff already bounds what an early trigger can
     do, but an endpoint that drives outbound mail should not be reachable from
     a browser at all. */
  const presented = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secretEquals(presented, serviceRoleKey)) {
    return json(403, { error: 'forbidden' });
  }

  const providerName = Deno.env.get('EMAIL_PROVIDER_NAME') ?? 'resend';
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const batchSize = Number.parseInt(Deno.env.get('EMAIL_DISPATCH_BATCH_SIZE') ?? '10', 10);

  /* A MISSING CREDENTIAL IS A PRECONDITION, NOT A PER-JOB FAILURE — so nothing
     is claimed and no attempt is spent.

     The previous shape claimed the batch first and then settled every job as
     `retryable`, which reads as harmless and is not:
     `gellatti_mark_email_failed_v1` abandons a job once `attempts >=
     max_attempts`, so five scheduled passes with no key would have burned
     through `max_attempts = 5` and left real customer mail `abandoned` with
     `next_attempt_at = null` — unreachable forever, destroyed by the very
     retry loop meant to protect it.

     Refusing to claim is what makes "it delivers itself once the key exists"
     actually true, and it is also what keeps a scheduled dispatcher from
     hammering the queue while an operator is still adding the secret. */
  if (apiKey.trim() === '') {
    const refusal = missingCredentialOutcome(providerName);
    return json(200, {
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 'missing_credential',
      provider: providerName,
      credentialConfigured: false,
      detail: refusal.failureMessage,
    });
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. IDEMPOTENT CLAIM. Concurrent invocations get disjoint sets.
  const { data: claimed, error: claimError } = await db.rpc('gellatti_claim_email_jobs_v1', {
    p_limit: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 10,
  });
  if (claimError) {
    return json(500, { error: 'claim_failed', detail: claimError.message });
  }

  const jobs = (claimed ?? []) as EmailJobRow[];
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    // 2. PROVIDER. The credential is guaranteed present by the guard above.
    const outcome = await sendViaProvider(job, apiKey, providerName);

    // 3. SETTLE. `sent` requires the provider's message id; the DB constraint
    //    refuses anything else, so a false success cannot be written from here.
    if (outcome.ok && outcome.providerMessageId) {
      const { error } = await db.rpc('gellatti_mark_email_sent_v1', {
        p_id: job.id,
        p_provider_message_id: outcome.providerMessageId,
        p_provider_name: providerName,
      });
      if (error) {
        failed += 1;
      } else {
        sent += 1;
      }
    } else {
      await db.rpc('gellatti_mark_email_failed_v1', {
        p_id: job.id,
        p_failure_kind: outcome.failureKind ?? 'retryable',
        p_failure_message: outcome.failureMessage ?? 'unknown provider failure',
        p_failure_code: outcome.failureCode ?? null,
      });
      failed += 1;
    }
  }

  return json(200, {
    claimed: jobs.length,
    sent,
    failed,
    provider: providerName,
    credentialConfigured: true,
  });
});
