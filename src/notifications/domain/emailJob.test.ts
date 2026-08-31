import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_ATTEMPTS,
  EmailDomainError,
  IllegalEmailTransitionError,
  InvalidRecipientError,
  LEGAL_EMAIL_TRANSITIONS,
  TERMINAL_EMAIL_STATUSES,
  assertValidRecipient,
  backoffDelayMs,
  beginSending,
  buildIdempotencyKey,
  cancelEmailJob,
  createEmailJob,
  isDelivered,
  isLegalTransition,
  isRetryDue,
  isValidRecipient,
  markFailed,
  markSent,
  normalizeRecipient,
  requiresAdminAttention,
  type EmailJob,
  type EmailJobStatus,
} from './emailJob';
import { buildEmailMetadata, buildOperationalSubject } from './emailSubject';

const T0 = Date.UTC(2026, 7, 31, 10, 0, 0);
const MIN = 60_000;

function job(overrides: Partial<Parameters<typeof createEmailJob>[0]> = {}): EmailJob {
  return createEmailJob({
    jobId: 'job-1',
    subjectKey: 'partnerApplicationNew',
    subject: buildOperationalSubject({ key: 'partnerApplicationNew', environment: 'production' }),
    recipient: 'info@gellatti.com',
    entityId: 'app-42',
    environment: 'production',
    metadata: buildEmailMetadata({
      key: 'partnerApplicationNew',
      entityId: 'app-42',
      environment: 'production',
    }),
    createdAtUtcMs: T0,
    ...overrides,
  });
}

describe('EJ1 — the domain never depends on a provider', () => {
  it('contains no vendor reference in CODE (comments may name the adapter)', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./emailJob.ts', import.meta.url), 'utf8'),
    );
    // Strip block and line comments: the header legitimately quotes the owner's
    // architecture ("→ EmailProvider → Resend adapter"), which is documentation.
    // What EJ1 forbids is a real dependency, so only executable code is scanned.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const vendor of ['resend', 'sendgrid', 'postmark', 'mailgun', 'nodemailer']) {
      expect(code.toLowerCase().includes(vendor), vendor).toBe(false);
    }
  });

  it('imports nothing outside its own domain folder', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./emailJob.ts', import.meta.url), 'utf8'),
    );
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const specifier of imports) {
      expect(specifier.startsWith('./'), specifier).toBe(true);
    }
  });
});

describe('EJ2 — one business event, one email', () => {
  it('derives the same key for the same event', () => {
    const args = {
      subjectKey: 'partnerApplicationNew' as const,
      entityId: 'app-42',
      recipient: 'info@gellatti.com',
      environment: 'production' as const,
    };
    expect(buildIdempotencyKey(args)).toBe(buildIdempotencyKey(args));
  });

  it('is insensitive to recipient casing and padding', () => {
    const base = {
      subjectKey: 'partnerApplicationNew' as const,
      entityId: 'app-42',
      environment: 'production' as const,
    };
    expect(buildIdempotencyKey({ ...base, recipient: '  INFO@Gellatti.com ' })).toBe(
      buildIdempotencyKey({ ...base, recipient: 'info@gellatti.com' }),
    );
  });

  it('separates environments so a staging replay cannot collide with production', () => {
    const base = {
      subjectKey: 'partnerApplicationNew' as const,
      entityId: 'app-42',
      recipient: 'info@gellatti.com',
    };
    expect(buildIdempotencyKey({ ...base, environment: 'staging' })).not.toBe(
      buildIdempotencyKey({ ...base, environment: 'production' }),
    );
  });

  it('separates different events and different entities', () => {
    const base = {
      entityId: 'app-42',
      recipient: 'info@gellatti.com',
      environment: 'production' as const,
    };
    expect(buildIdempotencyKey({ ...base, subjectKey: 'partnerApplicationNew' })).not.toBe(
      buildIdempotencyKey({ ...base, subjectKey: 'partnerApplicationApproved' }),
    );
    expect(
      buildIdempotencyKey({ ...base, subjectKey: 'partnerApplicationNew', entityId: 'app-43' }),
    ).not.toBe(buildIdempotencyKey({ ...base, subjectKey: 'partnerApplicationNew' }));
  });

  it('a created job carries its key', () => {
    expect(job().idempotencyKey).toBe('production:partnerApplicationNew:app-42:info@gellatti.com');
  });
});

describe('EJ3 — never silently mark unsent mail as sent', () => {
  it('sent is reachable only from sending', () => {
    expect(() => markSent(job(), 'msg-1', T0)).toThrow(IllegalEmailTransitionError);
    const failed = markFailed(
      beginSending(job(), T0),
      { kind: 'retryable', message: 'timeout' },
      T0,
    );
    expect(() => markSent(failed, 'msg-1', T0)).toThrow(IllegalEmailTransitionError);
  });

  it('refuses to mark sent without a provider message id', () => {
    const sending = beginSending(job(), T0);
    expect(() => markSent(sending, '', T0)).toThrow(EmailDomainError);
    expect(() => markSent(sending, '   ', T0)).toThrow(/provider message id/);
  });

  it('records the evidence when it does mark sent', () => {
    const sent = markSent(beginSending(job(), T0), 'msg-abc', T0 + 1000);
    expect(sent.status).toBe('sent');
    expect(sent.providerMessageId).toBe('msg-abc');
    expect(sent.sentAtUtcMs).toBe(T0 + 1000);
    expect(sent.lastFailure).toBeNull();
  });

  it('isDelivered requires BOTH the status and the evidence', () => {
    const sent = markSent(beginSending(job(), T0), 'msg-abc', T0);
    expect(isDelivered(sent)).toBe(true);
    // a hand-forged row with the status but no evidence must not read as delivered
    const forged = { ...sent, providerMessageId: null } as EmailJob;
    expect(isDelivered(forged)).toBe(false);
    expect(isDelivered({ ...sent, providerMessageId: '' } as EmailJob)).toBe(false);
  });

  it('no other state reads as delivered', () => {
    expect(isDelivered(job())).toBe(false);
    expect(isDelivered(beginSending(job(), T0))).toBe(false);
  });
});

describe('EJ4 — legal transitions only', () => {
  const ALL: EmailJobStatus[] = ['queued', 'sending', 'sent', 'failed', 'abandoned', 'cancelled'];

  it('declares exactly the owner-specified graph', () => {
    expect(LEGAL_EMAIL_TRANSITIONS.queued).toEqual(['sending', 'cancelled']);
    expect(LEGAL_EMAIL_TRANSITIONS.sending).toEqual(['sent', 'failed']);
    expect(LEGAL_EMAIL_TRANSITIONS.failed).toEqual(['sending', 'abandoned']);
  });

  it('terminal states have no outgoing edges', () => {
    for (const status of TERMINAL_EMAIL_STATUSES) {
      expect(LEGAL_EMAIL_TRANSITIONS[status], status).toEqual([]);
      for (const to of ALL) expect(isLegalTransition(status, to), `${status}→${to}`).toBe(false);
    }
  });

  it('sent, abandoned and cancelled are the terminal set', () => {
    expect(TERMINAL_EMAIL_STATUSES).toEqual(new Set(['sent', 'abandoned', 'cancelled']));
  });

  it('rejects every transition outside the graph', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const legal = LEGAL_EMAIL_TRANSITIONS[from].includes(to);
        expect(isLegalTransition(from, to), `${from}→${to}`).toBe(legal);
      }
    }
  });

  it('cannot cancel a job already in flight', () => {
    expect(() => cancelEmailJob(beginSending(job(), T0), T0)).toThrow(IllegalEmailTransitionError);
  });

  it('can cancel a queued job', () => {
    expect(cancelEmailJob(job(), T0).status).toBe('cancelled');
  });
});

describe('EJ5 — permanent failures are not retried', () => {
  it('abandons immediately on a permanent failure, even with attempts left', () => {
    const sending = beginSending(job(), T0);
    const result = markFailed(
      sending,
      { kind: 'permanent', message: 'mailbox does not exist' },
      T0,
    );
    expect(result.status).toBe('abandoned');
    expect(result.nextAttemptAtUtcMs).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('schedules a retry on a retryable failure', () => {
    const result = markFailed(
      beginSending(job(), T0),
      { kind: 'retryable', message: 'upstream timeout' },
      T0,
    );
    expect(result.status).toBe('failed');
    expect(result.nextAttemptAtUtcMs).toBe(T0 + MIN);
  });

  it('keeps the failure visible either way', () => {
    const permanent = markFailed(
      beginSending(job(), T0),
      { kind: 'permanent', message: 'rejected', providerCode: 'bounce' },
      T0,
    );
    expect(permanent.lastFailure).toEqual({
      kind: 'permanent',
      message: 'rejected',
      providerCode: 'bounce',
    });
  });

  it('a failure never leaves stale success evidence behind', () => {
    const sending = beginSending(job(), T0);
    const failed = markFailed(sending, { kind: 'retryable', message: 'x' }, T0);
    expect(failed.providerMessageId).toBeNull();
    expect(failed.sentAtUtcMs).toBeNull();
  });
});

describe('EJ6 — bounded retries with deterministic backoff', () => {
  it('doubles from the base', () => {
    expect(backoffDelayMs(1)).toBe(MIN);
    expect(backoffDelayMs(2)).toBe(2 * MIN);
    expect(backoffDelayMs(3)).toBe(4 * MIN);
    expect(backoffDelayMs(4)).toBe(8 * MIN);
  });

  it('is deterministic — no jitter, no clock', () => {
    expect(backoffDelayMs(3)).toBe(backoffDelayMs(3));
  });

  it('abandons once the attempt budget is spent', () => {
    let current = job({ maxAttempts: 2 });
    current = markFailed(beginSending(current, T0), { kind: 'retryable', message: 'a' }, T0);
    expect(current.status).toBe('failed');
    current = markFailed(
      beginSending(current, T0 + MIN),
      { kind: 'retryable', message: 'b' },
      T0 + MIN,
    );
    expect(current.attempts).toBe(2);
    expect(current.status).toBe('abandoned');
    expect(current.nextAttemptAtUtcMs).toBeNull();
  });

  it('a retry is due only after the backoff has elapsed', () => {
    const failed = markFailed(beginSending(job(), T0), { kind: 'retryable', message: 'x' }, T0);
    expect(isRetryDue(failed, T0)).toBe(false);
    expect(isRetryDue(failed, T0 + MIN - 1)).toBe(false);
    expect(isRetryDue(failed, T0 + MIN)).toBe(true);
  });

  it('a terminal job is never due for retry', () => {
    const abandoned = markFailed(beginSending(job(), T0), { kind: 'permanent', message: 'x' }, T0);
    expect(isRetryDue(abandoned, T0 + 10 * MIN)).toBe(false);
    const sent = markSent(beginSending(job(), T0), 'm', T0);
    expect(isRetryDue(sent, T0 + 10 * MIN)).toBe(false);
  });

  it('a full retryable lifecycle ends abandoned after exactly maxAttempts sends', () => {
    let current = job();
    let now = T0;
    for (let i = 0; i < DEFAULT_MAX_ATTEMPTS; i += 1) {
      current = beginSending(current, now);
      current = markFailed(current, { kind: 'retryable', message: `fail ${i}` }, now);
      now += backoffDelayMs(current.attempts);
    }
    expect(current.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(current.status).toBe('abandoned');
  });
});

describe('EJ7 — Admin visibility', () => {
  it('flags failed and abandoned jobs', () => {
    const failed = markFailed(beginSending(job(), T0), { kind: 'retryable', message: 'x' }, T0);
    const abandoned = markFailed(beginSending(job(), T0), { kind: 'permanent', message: 'y' }, T0);
    expect(requiresAdminAttention(failed)).toBe(true);
    expect(requiresAdminAttention(abandoned)).toBe(true);
  });

  it('does not flag healthy jobs', () => {
    expect(requiresAdminAttention(job())).toBe(false);
    expect(requiresAdminAttention(beginSending(job(), T0))).toBe(false);
    expect(requiresAdminAttention(markSent(beginSending(job(), T0), 'm', T0))).toBe(false);
    expect(requiresAdminAttention(cancelEmailJob(job(), T0))).toBe(false);
  });
});

describe('EJ8 — recipient validation happens at creation', () => {
  it('accepts ordinary addresses', () => {
    for (const value of ['info@gellatti.com', 'a.b+c@sub.example.co.uk', 'x@y.io']) {
      expect(isValidRecipient(value), value).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    for (const value of [
      '',
      'no-at-sign',
      'a@b',
      '@example.com',
      'a@@b.com',
      'a@.com',
      'a@b..com',
    ]) {
      expect(isValidRecipient(value), value).toBe(false);
    }
  });

  it('rejects addresses carrying whitespace or header syntax', () => {
    for (const value of [
      'a b@example.com',
      'a@example.com\r\nBcc: x@y.z',
      '<a@example.com>',
      'a@example.com, b@example.com',
      'a@example.com;b@example.com',
    ]) {
      expect(isValidRecipient(value), value).toBe(false);
    }
  });

  it('normalises case and padding', () => {
    expect(normalizeRecipient('  INFO@Gellatti.COM  ')).toBe('info@gellatti.com');
    expect(job({ recipient: '  INFO@Gellatti.COM ' }).recipient).toBe('info@gellatti.com');
  });

  it('throws at creation rather than failing silently at send', () => {
    expect(() => job({ recipient: 'not-an-address' })).toThrow(InvalidRecipientError);
    expect(() => assertValidRecipient('a@example.com\nBcc: evil@x.z')).toThrow(
      InvalidRecipientError,
    );
  });
});

describe('job creation defaults', () => {
  it('starts queued, unsent, immediately eligible', () => {
    const created = job();
    expect(created.status).toBe('queued');
    expect(created.attempts).toBe(0);
    expect(created.providerMessageId).toBeNull();
    expect(created.sentAtUtcMs).toBeNull();
    expect(created.lastFailure).toBeNull();
    expect(created.nextAttemptAtUtcMs).toBe(T0);
  });

  it('is frozen, and transitions never mutate the input', () => {
    const created = job();
    expect(Object.isFrozen(created)).toBe(true);
    beginSending(created, T0 + 5);
    expect(created.status).toBe('queued');
    expect(created.attempts).toBe(0);
  });

  it('honours a custom attempt budget', () => {
    expect(job({ maxAttempts: 2 }).maxAttempts).toBe(2);
  });
});
