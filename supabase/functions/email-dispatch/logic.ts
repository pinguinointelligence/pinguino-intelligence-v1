/**
 * email-dispatch — pure logic (Deno + vitest importable).
 *
 * The provider-independent half of the email worker: how a provider response is
 * classified, and what the sender identity is. Kept out of index.ts so it can be
 * tested without Deno, a network or a credential.
 *
 * OWNER AUTHORITY (2026-08-31):
 *   Canonical identity — www.gellatti.com, `Gellatti <info@gellatti.com>`,
 *   Reply-To info@gellatti.com.
 *   "A missing Resend credential is allowed to block actual external delivery,
 *    but must never produce a false `sent`."
 */

/** Owner-frozen sender identity. */
export const GELLATTI_FROM = 'Gellatti <info@gellatti.com>' as const;
export const GELLATTI_REPLY_TO = 'info@gellatti.com' as const;
export const GELLATTI_SITE = 'https://www.gellatti.com' as const;

export type FailureKind = 'retryable' | 'permanent';

export interface ProviderOutcome {
  readonly ok: boolean;
  readonly providerMessageId?: string;
  readonly failureKind?: FailureKind;
  readonly failureMessage?: string;
  readonly failureCode?: string;
}

/**
 * Classify an HTTP status from the provider.
 *
 * The split matters because a permanent failure abandons the job immediately
 * rather than burning five attempts behind a backoff:
 *  - 401/403 — bad or missing credential. RETRYABLE on purpose: the mail itself
 *    is fine and will send once the credential is fixed. Abandoning here would
 *    silently discard real mail because of an operator configuration error.
 *  - 422/400  — the provider rejected THIS message (bad address, bad content).
 *    Retrying cannot help.
 *  - 429, 5xx, network — transient.
 */
export function classifyProviderStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return 'retryable';
  if (status === 404) return 'permanent';
  if (status >= 400 && status < 500) return status === 429 ? 'retryable' : 'permanent';
  return 'retryable';
}

/**
 * Turn a provider response body into an outcome.
 *
 * A 2xx with NO message id is treated as a FAILURE, not a success. This is the
 * owner's rule made concrete: without the provider's own identifier we have no
 * evidence the mail was accepted, and "sent" without evidence is exactly the
 * false success that is forbidden.
 */
export function interpretProviderResponse(status: number, body: unknown): ProviderOutcome {
  const record = (body ?? {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id === '') {
      return {
        ok: false,
        failureKind: 'retryable',
        failureMessage: 'provider accepted the request but returned no message id',
        failureCode: 'missing_message_id',
      };
    }
    return { ok: true, providerMessageId: id };
  }
  const message =
    typeof record.message === 'string'
      ? record.message
      : typeof record.error === 'string'
        ? record.error
        : `provider responded ${status}`;
  return {
    ok: false,
    failureKind: classifyProviderStatus(status),
    failureMessage: message,
    failureCode: typeof record.name === 'string' ? record.name : String(status),
  };
}

/**
 * The outcome to record when no credential is configured.
 *
 * RETRYABLE, never a send and never a `sent`. The job stays visible in Admin
 * with a truthful reason, and delivers itself once the credential exists.
 */
export function missingCredentialOutcome(providerName: string): ProviderOutcome {
  return {
    ok: false,
    failureKind: 'retryable',
    failureMessage: `${providerName} credential is not configured; nothing was sent`,
    failureCode: 'missing_credential',
  };
}

export interface EmailJobRow {
  readonly id: string;
  readonly subject: string;
  readonly recipient: string;
  readonly body_html: string;
  readonly body_text: string;
  readonly metadata: Record<string, unknown> | null;
  readonly environment: string;
}

/** The provider-shaped payload. Metadata is additional routing, never the only route. */
export function buildProviderPayload(job: EmailJobRow): Record<string, unknown> {
  return {
    from: GELLATTI_FROM,
    to: [job.recipient],
    reply_to: GELLATTI_REPLY_TO,
    subject: job.subject,
    html: job.body_html,
    text: job.body_text,
    headers: {
      // ES3: additional metadata. Filtering must never DEPEND on these.
      'X-Gellatti-Area': String(job.metadata?.area ?? ''),
      'X-Gellatti-Event': String(job.metadata?.event ?? ''),
      'X-Gellatti-Entity-Id': String(job.metadata?.entity_id ?? ''),
      'X-Gellatti-Environment': job.environment,
      // The provider's own dedupe hook, where supported.
      'X-Entity-Ref-ID': job.id,
    },
  };
}
