/// <reference types="node" />
/**
 * email-dispatch worker guard — pure logic + source invariants.
 *
 * The worker's logic is imported directly (it is provider-independent and has no
 * Deno dependency); index.ts is asserted by source scan, the same convention the
 * Stripe edge functions use.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GELLATTI_FROM,
  GELLATTI_REPLY_TO,
  GELLATTI_SITE,
  buildProviderPayload,
  classifyProviderStatus,
  interpretProviderResponse,
  missingCredentialOutcome,
  type EmailJobRow,
} from '../../../supabase/functions/email-dispatch/logic.ts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const INDEX = readFileSync(
  join(REPO, 'supabase', 'functions', 'email-dispatch', 'index.ts'),
  'utf8',
);

const job: EmailJobRow = {
  id: 'job-1',
  subject: '[GELLATTI][PARTNER][APPLICATION][NEW] GelatoConAnna · Italy',
  recipient: 'info@gellatti.com',
  body_html: '<p>hi</p>',
  body_text: 'hi',
  metadata: {
    area: 'PARTNER',
    event: 'APPLICATION',
    entity_id: 'app-42',
    environment: 'production',
  },
  environment: 'production',
};

describe('canonical identity is frozen', () => {
  it('sends as the owner-specified identity', () => {
    expect(GELLATTI_FROM).toBe('Gellatti <info@gellatti.com>');
    expect(GELLATTI_REPLY_TO).toBe('info@gellatti.com');
    expect(GELLATTI_SITE).toBe('https://www.gellatti.com');
  });

  it('every outgoing payload carries From and Reply-To', () => {
    const payload = buildProviderPayload(job);
    expect(payload.from).toBe(GELLATTI_FROM);
    expect(payload.reply_to).toBe(GELLATTI_REPLY_TO);
  });

  it('sends the subject verbatim, taxonomy intact', () => {
    expect(buildProviderPayload(job).subject).toBe(job.subject);
  });
});

describe('a missing credential blocks delivery but never fakes success', () => {
  it('produces a retryable failure with a truthful reason', () => {
    const outcome = missingCredentialOutcome('resend');
    expect(outcome.ok).toBe(false);
    expect(outcome.failureKind).toBe('retryable');
    expect(outcome.failureCode).toBe('missing_credential');
    expect(outcome.failureMessage).toContain('nothing was sent');
  });

  it('is retryable, not permanent — the mail is fine, the configuration is not', () => {
    // Abandoning here would silently discard real mail because of an operator
    // mistake; it must deliver itself once the key exists.
    expect(missingCredentialOutcome('resend').failureKind).toBe('retryable');
  });

  it('the worker refuses to CLAIM anything while the key is absent', () => {
    /* The ORDERING is the whole protection, not the refusal message.
       Claiming first spends one attempt per pass, and
       `gellatti_mark_email_failed_v1` abandons a job once
       `attempts >= max_attempts` — so a scheduled dispatcher running against a
       missing key would have destroyed real customer mail in five passes
       (`abandoned`, `next_attempt_at = null`) rather than holding it. The
       guard must therefore sit BEFORE the claim, not inside the send loop. */
    const guard = INDEX.indexOf("if (apiKey.trim() === '')");
    const claim = INDEX.indexOf('gellatti_claim_email_jobs_v1');
    expect(guard).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(claim);
    expect(INDEX).toContain("skipped: 'missing_credential'");
  });
});

describe('a 2xx without a message id is a FAILURE, not a success', () => {
  it('refuses to treat an id-less acceptance as sent', () => {
    const outcome = interpretProviderResponse(200, {});
    expect(outcome.ok).toBe(false);
    expect(outcome.failureCode).toBe('missing_message_id');
    expect(outcome.failureKind).toBe('retryable');
  });

  it('also refuses a blank or non-string id', () => {
    expect(interpretProviderResponse(200, { id: '   ' }).ok).toBe(false);
    expect(interpretProviderResponse(200, { id: 42 }).ok).toBe(false);
    expect(interpretProviderResponse(201, { id: null }).ok).toBe(false);
  });

  it('accepts a real id', () => {
    const outcome = interpretProviderResponse(200, { id: 'msg_abc123' });
    expect(outcome.ok).toBe(true);
    expect(outcome.providerMessageId).toBe('msg_abc123');
  });

  it('trims the id', () => {
    expect(interpretProviderResponse(200, { id: '  msg_x  ' }).providerMessageId).toBe('msg_x');
  });
});

describe('failure classification decides whether retrying can help', () => {
  it('treats a bad or missing credential as RETRYABLE', () => {
    // 401/403 means the operator must fix configuration; the message is valid.
    expect(classifyProviderStatus(401)).toBe('retryable');
    expect(classifyProviderStatus(403)).toBe('retryable');
  });

  it('treats a rejected message as PERMANENT', () => {
    expect(classifyProviderStatus(400)).toBe('permanent');
    expect(classifyProviderStatus(422)).toBe('permanent');
    expect(classifyProviderStatus(404)).toBe('permanent');
  });

  it('treats rate limiting and server errors as RETRYABLE', () => {
    expect(classifyProviderStatus(429)).toBe('retryable');
    expect(classifyProviderStatus(500)).toBe('retryable');
    expect(classifyProviderStatus(502)).toBe('retryable');
    expect(classifyProviderStatus(503)).toBe('retryable');
  });

  it('carries the provider message through for Admin', () => {
    const outcome = interpretProviderResponse(422, {
      message: 'Invalid `to` field',
      name: 'validation_error',
    });
    expect(outcome.failureMessage).toBe('Invalid `to` field');
    expect(outcome.failureCode).toBe('validation_error');
    expect(outcome.failureKind).toBe('permanent');
  });

  it('falls back to a readable message when the body has none', () => {
    expect(interpretProviderResponse(503, null).failureMessage).toContain('503');
  });
});

describe('metadata is additional, never the routing authority', () => {
  it('attaches the four documented fields as headers', () => {
    const headers = buildProviderPayload(job).headers as Record<string, string>;
    expect(headers['X-Gellatti-Area']).toBe('PARTNER');
    expect(headers['X-Gellatti-Event']).toBe('APPLICATION');
    expect(headers['X-Gellatti-Entity-Id']).toBe('app-42');
    expect(headers['X-Gellatti-Environment']).toBe('production');
  });

  it('survives absent metadata without throwing', () => {
    const payload = buildProviderPayload({ ...job, metadata: null });
    expect((payload.headers as Record<string, string>)['X-Gellatti-Area']).toBe('');
    // the subject still identifies the message on its own
    expect(payload.subject).toContain('[PARTNER]');
  });
});

describe('worker invariants (source scan of index.ts)', () => {
  it('claims through the idempotent claim function', () => {
    expect(INDEX).toContain('gellatti_claim_email_jobs_v1');
  });

  it('settles only through the two settle functions', () => {
    expect(INDEX).toContain('gellatti_mark_email_sent_v1');
    expect(INDEX).toContain('gellatti_mark_email_failed_v1');
  });

  it('never writes the email_jobs table directly', () => {
    expect(INDEX).not.toMatch(/\.from\(\s*['"]email_jobs['"]\s*\)/);
  });

  it('marks sent only when an id is present', () => {
    expect(INDEX).toContain('outcome.ok && outcome.providerMessageId');
  });

  it('sends a provider idempotency key so an ambiguous retry cannot double-deliver', () => {
    expect(INDEX).toContain("'Idempotency-Key': job.id");
  });

  it('treats a network error as retryable rather than losing the mail', () => {
    expect(INDEX).toContain("failureCode: 'network_error'");
    expect(INDEX).toMatch(
      /failureKind: 'retryable',\s*\n\s*failureMessage: `\$\{providerName\} request failed/,
    );
  });

  it('uses the service role and is not client-callable', () => {
    expect(INDEX).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(INDEX).toContain('persistSession: false');
  });

  it('reports whether a credential was configured, so a silent no-op is visible', () => {
    expect(INDEX).toContain('credentialConfigured');
  });

  it('is the ONLY place that names the vendor endpoint', () => {
    expect(INDEX).toContain('https://api.resend.com/emails');
  });
});
