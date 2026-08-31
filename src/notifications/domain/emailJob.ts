/**
 * Module — emailJob: the persisted email job lifecycle and the provider port.
 *
 * OWNER AUTHORITY (2026-08-31 correction §3):
 *   business event → canonical persisted email job → idempotency → EmailProvider → Resend adapter
 *
 * LOCKED RULES implemented here (cited as EJ1..EJ8 in code):
 *  EJ1 The business/domain layer NEVER depends on a provider. `EmailProvider`
 *      is a port; Resend is one adapter behind it. Nothing in this file
 *      mentions a vendor.
 *  EJ2 A business event produces at most ONE email. The idempotency key is
 *      derived deterministically from (subjectKey, entityId, recipient), so a
 *      replayed event collides with the existing job instead of sending twice.
 *  EJ3 **Never silently mark unsent mail as sent.** `sent` is reachable ONLY
 *      from `sending`, and ONLY with a provider message id as evidence.
 *  EJ4 Legal transitions only; anything else throws a typed error:
 *        queued  → sending | cancelled
 *        sending → sent | failed
 *        failed  → sending (retry, while attempts remain) | abandoned
 *      `sent`, `cancelled` and `abandoned` are terminal.
 *  EJ5 A provider failure is classified as retryable or permanent. A permanent
 *      failure (bad address, rejected content) goes straight to `abandoned` —
 *      retrying it would just burn attempts and hide the real problem.
 *  EJ6 Retries are bounded (default 5 attempts) with deterministic exponential
 *      backoff. No ambient clock: the caller supplies the instant.
 *  EJ7 Every terminal-but-unsuccessful job stays visible with its last error,
 *      so Admin can see failed and pending jobs (owner §3).
 *  EJ8 Recipients are normalised and validated before a job is ever created —
 *      an invalid address must fail loudly at creation, not silently at send.
 *
 * Pure + deterministic. No IO, no Date.now(), no provider import.
 */

import type { EmailEnvironment, EmailMetadata, OperationalSubjectKey } from './emailSubject';

/** Milliseconds since the Unix epoch, UTC. Always an input, never read from a clock. */
export type UtcMs = number;

export class EmailDomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EmailDomainError';
    this.code = code;
  }
}

export class IllegalEmailTransitionError extends EmailDomainError {
  constructor(from: EmailJobStatus, to: EmailJobStatus) {
    super('illegal_email_transition', `illegal email job transition ${from} → ${to}`);
    this.name = 'IllegalEmailTransitionError';
  }
}

export class InvalidRecipientError extends EmailDomainError {
  constructor(value: string) {
    super('invalid_recipient', `invalid recipient address: '${value}'`);
    this.name = 'InvalidRecipientError';
  }
}

/** EJ4: the job lifecycle. */
export type EmailJobStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'abandoned' | 'cancelled';

/** EJ4: terminal states — a job here will never change again. */
export const TERMINAL_EMAIL_STATUSES: ReadonlySet<EmailJobStatus> = new Set<EmailJobStatus>([
  'sent',
  'abandoned',
  'cancelled',
]);

/** EJ5: why a send failed, and therefore whether retrying can help. */
export type EmailFailureKind = 'retryable' | 'permanent';

export interface EmailFailure {
  readonly kind: EmailFailureKind;
  /** Provider-independent description, safe to show an admin. */
  readonly message: string;
  /** Optional provider error code, for diagnostics only. */
  readonly providerCode?: string;
}

/** EJ6: bounded retries. */
export const DEFAULT_MAX_ATTEMPTS = 5 as const;
export const DEFAULT_BASE_BACKOFF_MS = 60_000 as const; // 1 minute

/** The persisted job. Financial-ledger discipline: history is appended, not rewritten. */
export interface EmailJob {
  readonly jobId: string;
  /** EJ2: deterministic — a replay collides with this. */
  readonly idempotencyKey: string;
  readonly subjectKey: OperationalSubjectKey;
  readonly subject: string;
  readonly recipient: string;
  readonly environment: EmailEnvironment;
  readonly metadata: EmailMetadata;
  readonly status: EmailJobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAtUtcMs: UtcMs;
  readonly updatedAtUtcMs: UtcMs;
  /** Earliest instant a retry may be attempted (EJ6). */
  readonly nextAttemptAtUtcMs: UtcMs | null;
  /** EJ3: present if and only if status === 'sent'. */
  readonly providerMessageId: string | null;
  /** EJ7: the last failure stays visible for Admin. */
  readonly lastFailure: EmailFailure | null;
  readonly sentAtUtcMs: UtcMs | null;
}

/**
 * EJ1: the provider port. An adapter implements this; the domain never imports
 * one. Returning a discriminated result rather than throwing keeps failure
 * classification (EJ5) explicit at the boundary.
 */
export interface EmailSendRequest {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly metadata: EmailMetadata;
  /** Passed through so the provider can deduplicate too, where supported. */
  readonly idempotencyKey: string;
}

export type EmailSendResult =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly failure: EmailFailure };

export interface EmailProvider {
  readonly name: string;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

/**
 * EJ8: deliberately conservative. This is a guard against obviously-broken
 * addresses and header injection, not a full RFC 5322 parser — the provider
 * performs real validation. Rejecting a valid-but-exotic address is a better
 * failure than accepting one containing a newline.
 */
export function normalizeRecipient(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidRecipient(raw: string): boolean {
  const value = normalizeRecipient(raw);
  if (value.length === 0 || value.length > 254) return false;
  if (/[\s<>,;"\\]/.test(value)) return false; // whitespace covers CR/LF injection
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  if (domain.length === 0 || !domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  return true;
}

export function assertValidRecipient(raw: string): string {
  if (!isValidRecipient(raw)) throw new InvalidRecipientError(raw);
  return normalizeRecipient(raw);
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * EJ2: deterministic key. Same business event → same key → the unique index on
 * the jobs table refuses the duplicate. Includes the environment so a staging
 * replay can never collide with a production job in a shared table.
 */
export function buildIdempotencyKey(input: {
  readonly subjectKey: OperationalSubjectKey;
  readonly entityId: string;
  readonly recipient: string;
  readonly environment: EmailEnvironment;
}): string {
  return [
    input.environment,
    input.subjectKey,
    input.entityId,
    normalizeRecipient(input.recipient),
  ].join(':');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** EJ4: the legal transition graph, stated once so tests can assert it directly. */
export const LEGAL_EMAIL_TRANSITIONS: Readonly<Record<EmailJobStatus, readonly EmailJobStatus[]>> =
  Object.freeze({
    queued: Object.freeze(['sending', 'cancelled'] as const),
    sending: Object.freeze(['sent', 'failed'] as const),
    failed: Object.freeze(['sending', 'abandoned'] as const),
    sent: Object.freeze([] as const),
    abandoned: Object.freeze([] as const),
    cancelled: Object.freeze([] as const),
  }) as Readonly<Record<EmailJobStatus, readonly EmailJobStatus[]>>;

export function isLegalTransition(from: EmailJobStatus, to: EmailJobStatus): boolean {
  return LEGAL_EMAIL_TRANSITIONS[from].includes(to);
}

function assertTransition(from: EmailJobStatus, to: EmailJobStatus): void {
  if (!isLegalTransition(from, to)) throw new IllegalEmailTransitionError(from, to);
}

/** Create a queued job. Validates the recipient up front (EJ8). */
export function createEmailJob(input: {
  readonly jobId: string;
  readonly subjectKey: OperationalSubjectKey;
  readonly subject: string;
  readonly recipient: string;
  readonly entityId: string;
  readonly environment: EmailEnvironment;
  readonly metadata: EmailMetadata;
  readonly createdAtUtcMs: UtcMs;
  readonly maxAttempts?: number;
}): EmailJob {
  const recipient = assertValidRecipient(input.recipient);
  return Object.freeze({
    jobId: input.jobId,
    idempotencyKey: buildIdempotencyKey({
      subjectKey: input.subjectKey,
      entityId: input.entityId,
      recipient,
      environment: input.environment,
    }),
    subjectKey: input.subjectKey,
    subject: input.subject,
    recipient,
    environment: input.environment,
    metadata: input.metadata,
    status: 'queued' as const,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    createdAtUtcMs: input.createdAtUtcMs,
    updatedAtUtcMs: input.createdAtUtcMs,
    nextAttemptAtUtcMs: input.createdAtUtcMs,
    providerMessageId: null,
    lastFailure: null,
    sentAtUtcMs: null,
  });
}

/** EJ6: deterministic exponential backoff — 1m, 2m, 4m, 8m … from the base. */
export function backoffDelayMs(attempts: number, baseMs: number = DEFAULT_BASE_BACKOFF_MS): number {
  const exponent = Math.max(0, attempts - 1);
  return baseMs * 2 ** exponent;
}

/** queued|failed → sending. Increments the attempt counter. */
export function beginSending(job: EmailJob, atUtcMs: UtcMs): EmailJob {
  assertTransition(job.status, 'sending');
  return Object.freeze({
    ...job,
    status: 'sending' as const,
    attempts: job.attempts + 1,
    updatedAtUtcMs: atUtcMs,
    nextAttemptAtUtcMs: null,
  });
}

/**
 * EJ3: the ONLY way to reach `sent`, and it requires a provider message id.
 * A blank id is refused — "sent with no evidence" is exactly the silent
 * success the owner forbade.
 */
export function markSent(job: EmailJob, providerMessageId: string, atUtcMs: UtcMs): EmailJob {
  assertTransition(job.status, 'sent');
  if (providerMessageId.trim() === '') {
    throw new EmailDomainError(
      'missing_provider_message_id',
      'cannot mark an email sent without a provider message id',
    );
  }
  return Object.freeze({
    ...job,
    status: 'sent' as const,
    updatedAtUtcMs: atUtcMs,
    nextAttemptAtUtcMs: null,
    providerMessageId,
    sentAtUtcMs: atUtcMs,
    lastFailure: null,
  });
}

/**
 * EJ5/EJ6/EJ7: record a failure. A permanent failure abandons immediately; a
 * retryable one schedules the next attempt unless the budget is spent.
 * The failure is retained either way so Admin can see it.
 */
export function markFailed(
  job: EmailJob,
  failure: EmailFailure,
  atUtcMs: UtcMs,
  baseBackoffMs: number = DEFAULT_BASE_BACKOFF_MS,
): EmailJob {
  assertTransition(job.status, 'failed');
  const exhausted = job.attempts >= job.maxAttempts;
  const permanent = failure.kind === 'permanent';
  const terminal = permanent || exhausted;
  return Object.freeze({
    ...job,
    // EJ5: a permanent failure never waits for a retry that cannot help.
    status: terminal ? ('abandoned' as const) : ('failed' as const),
    updatedAtUtcMs: atUtcMs,
    nextAttemptAtUtcMs: terminal ? null : atUtcMs + backoffDelayMs(job.attempts, baseBackoffMs),
    lastFailure: failure,
    providerMessageId: null,
    sentAtUtcMs: null,
  });
}

/** failed → sending, once the backoff has elapsed. */
export function isRetryDue(job: EmailJob, atUtcMs: UtcMs): boolean {
  if (job.status !== 'failed') return false;
  if (job.attempts >= job.maxAttempts) return false;
  return job.nextAttemptAtUtcMs !== null && atUtcMs >= job.nextAttemptAtUtcMs;
}

/** queued → cancelled, for an event superseded before it was ever sent. */
export function cancelEmailJob(job: EmailJob, atUtcMs: UtcMs): EmailJob {
  assertTransition(job.status, 'cancelled');
  return Object.freeze({ ...job, status: 'cancelled' as const, updatedAtUtcMs: atUtcMs });
}

/** EJ7: what Admin needs to see — anything not successfully delivered. */
export function requiresAdminAttention(job: EmailJob): boolean {
  return job.status === 'failed' || job.status === 'abandoned';
}

/** EJ3: a job counts as delivered only with both the status AND the evidence. */
export function isDelivered(job: EmailJob): boolean {
  return job.status === 'sent' && job.providerMessageId !== null && job.providerMessageId !== '';
}
