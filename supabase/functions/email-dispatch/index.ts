/**
 * email-dispatch — Edge Function (Deno). ***NOT DEPLOYED BY CLAUDE.***
 *
 * The execution layer for the persisted email lane:
 *   claim (idempotent) → provider → settle sent/failed → retry → Admin visible
 *
 * OWNER AUTHORITY (2026-08-31 §1–§3):
 *  - Canonical identity `Gellatti <info@gellatti.com>`, Reply-To the same.
 *  - Provider-agnostic: this file is the ONLY place that knows the vendor. The
 *    domain (src/notifications/domain) and the database know nothing about it.
 *  - **A missing credential may block delivery; it must never produce a false
 *    `sent`.** With no API key the worker records a RETRYABLE failure with a
 *    truthful reason and sends nothing — the job stays visible and delivers
 *    itself once the key exists.
 *
 * Invariants (test-pinned via logic.ts + source scans):
 *  - claiming is `for update skip locked`, so two concurrent invocations claim
 *    disjoint sets and a duplicate schedule can never double-send;
 *  - a job is settled ONLY through the two SECURITY DEFINER settle functions,
 *    which require the row to still be claimed;
 *  - `sent` is written only with a provider message id — the DB CHECK refuses
 *    anything else;
 *  - the worker is invoked by the scheduler with the service role; there is no
 *    client-callable path.
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

  const providerName = Deno.env.get('EMAIL_PROVIDER_NAME') ?? 'resend';
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const batchSize = Number.parseInt(Deno.env.get('EMAIL_DISPATCH_BATCH_SIZE') ?? '10', 10);

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
    // 2. PROVIDER — or a truthful refusal when no credential exists.
    const outcome =
      apiKey.trim() === ''
        ? missingCredentialOutcome(providerName)
        : await sendViaProvider(job, apiKey, providerName);

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
    credentialConfigured: apiKey.trim() !== '',
  });
});
