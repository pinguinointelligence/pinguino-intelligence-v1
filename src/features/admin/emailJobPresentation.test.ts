import { describe, expect, it } from 'vitest';

import {
  EMAIL_FAILURE_KIND_LABEL,
  EMAIL_JOB_STATUS_COPY,
  emailJobNextAction,
  isTrustworthyDelivery,
  needsAttention,
  subjectIdentifier,
  subjectTaxonomyPath,
} from './emailJobPresentation';
import type { AdminEmailJob, EmailJobStatus } from '@/services/emailJobs';

const STATUSES: EmailJobStatus[] = [
  'queued',
  'sending',
  'sent',
  'failed',
  'abandoned',
  'cancelled',
];

const job = (overrides: Partial<AdminEmailJob> = {}): AdminEmailJob => ({
  id: 'job-1',
  subject_key: 'partnerApplicationNew',
  subject: '[GELLATTI][PARTNER][APPLICATION][NEW] GelatoConAnna · Italy',
  recipient: 'info@gellatti.com',
  environment: 'production',
  status: 'sent',
  attempts: 1,
  max_attempts: 5,
  next_attempt_at: null,
  provider_name: 'resend',
  provider_message_id: 'msg_abc',
  last_failure_kind: null,
  last_failure_message: null,
  last_failure_code: null,
  sent_at: '2026-08-31T10:00:00.000Z',
  created_at: '2026-08-31T09:59:00.000Z',
  ...overrides,
});

describe('Designbook §10/§12 — the message names the state, colour is secondary', () => {
  it('every status has a written label and a written meaning', () => {
    for (const status of STATUSES) {
      const copy = EMAIL_JOB_STATUS_COPY[status];
      expect(copy.label.length, status).toBeGreaterThan(0);
      expect(copy.meaning.length, status).toBeGreaterThan(0);
    }
  });

  it('no customer-facing string names a colour', () => {
    for (const status of STATUSES) {
      const copy = EMAIL_JOB_STATUS_COPY[status];
      const text = `${copy.label} ${copy.meaning}`.toLowerCase();
      for (const colour of [
        'zielon',
        'czerwon',
        'pomarańcz',
        'żółt',
        'green',
        'red',
        'orange',
        'amber',
      ]) {
        expect(text, `${status} names a colour`).not.toContain(colour);
      }
    }
  });

  it('no label leaks the raw contract value', () => {
    for (const status of STATUSES) {
      const copy = EMAIL_JOB_STATUS_COPY[status];
      const text = `${copy.label} ${copy.meaning}`.toLowerCase();
      for (const raw of STATUSES) expect(text, `${status} leaks ${raw}`).not.toContain(raw);
    }
  });

  it('the map is exhaustive and frozen', () => {
    expect(new Set(Object.keys(EMAIL_JOB_STATUS_COPY))).toEqual(new Set(STATUSES));
    expect(Object.isFrozen(EMAIL_JOB_STATUS_COPY)).toBe(true);
  });

  it('only genuinely-delivered reads as success', () => {
    expect(EMAIL_JOB_STATUS_COPY.sent.tone).toBe('good');
    for (const status of STATUSES.filter((s) => s !== 'sent')) {
      expect(EMAIL_JOB_STATUS_COPY[status].tone, status).not.toBe('good');
    }
  });
});

describe('a delivered row must carry the provider’s evidence', () => {
  it('accepts a real message id', () => {
    expect(isTrustworthyDelivery(job())).toBe(true);
  });

  it('refuses `sent` with no id, so a broken invariant surfaces instead of showing green', () => {
    expect(isTrustworthyDelivery(job({ provider_message_id: null }))).toBe(false);
    expect(isTrustworthyDelivery(job({ provider_message_id: '   ' }))).toBe(false);
  });

  it('no unsent state ever reads as delivered', () => {
    for (const status of STATUSES.filter((s) => s !== 'sent')) {
      expect(isTrustworthyDelivery(job({ status })), status).toBe(false);
    }
  });
});

describe('the operator is told what to DO', () => {
  it('names the missing credential explicitly and says nothing was sent', () => {
    const action = emailJobNextAction(
      job({ status: 'failed', last_failure_code: 'missing_credential' }),
    );
    expect(action).toContain('Brak klucza dostawcy');
    expect(action).toContain('nic nie zostało wysłane');
  });

  it('distinguishes a rejected message from an exhausted budget', () => {
    expect(
      emailJobNextAction(job({ status: 'abandoned', last_failure_kind: 'permanent' })),
    ).toContain('odrzucił');
    expect(
      emailJobNextAction(job({ status: 'abandoned', last_failure_kind: 'retryable' })),
    ).toContain('Wyczerpano');
  });

  it('says a retry is automatic when one is scheduled', () => {
    expect(emailJobNextAction(job({ status: 'failed' }))).toContain('automatycznie');
  });

  it('offers no action for a settled row', () => {
    expect(emailJobNextAction(job({ status: 'sent' }))).toBeNull();
    expect(emailJobNextAction(job({ status: 'cancelled' }))).toBeNull();
  });
});

describe('attention filtering', () => {
  it('flags exactly the rows an operator opened the panel to find', () => {
    expect(needsAttention(job({ status: 'failed' }))).toBe(true);
    expect(needsAttention(job({ status: 'abandoned' }))).toBe(true);
    for (const status of ['queued', 'sending', 'sent', 'cancelled'] as const) {
      expect(needsAttention(job({ status })), status).toBe(false);
    }
  });
});

describe('the subject taxonomy is readable without being re-implemented', () => {
  it('reads the area/event/state path out of the subject', () => {
    expect(subjectTaxonomyPath('[GELLATTI][PARTNER][APPLICATION][NEW] GelatoConAnna · Italy')).toBe(
      'PARTNER · APPLICATION · NEW',
    );
  });

  it('drops the brand token, which carries no information in an admin list', () => {
    expect(subjectTaxonomyPath('[GELLATTI][REFERRAL][REWARD]')).toBe('REFERRAL · REWARD');
  });

  it('keeps the staging marker, so a test message is unmistakable', () => {
    expect(subjectTaxonomyPath('[GELLATTI][PARTNER][PAYOUT][READY][STAGING]')).toBe(
      'PARTNER · PAYOUT · READY · STAGING',
    );
  });

  it('returns the human half separately', () => {
    expect(subjectIdentifier('[GELLATTI][PARTNER][APPLICATION][NEW] GelatoConAnna · Italy')).toBe(
      'GelatoConAnna · Italy',
    );
    expect(subjectIdentifier('[GELLATTI][REFERRAL][REWARD]')).toBe('');
  });

  it('survives a customer-facing subject that has no taxonomy at all', () => {
    expect(subjectTaxonomyPath('Twoje zgłoszenie dotarło')).toBe('');
    expect(subjectIdentifier('Twoje zgłoszenie dotarło')).toBe('Twoje zgłoszenie dotarło');
  });
});

describe('failure kinds are labelled, not colour-coded', () => {
  it('labels both kinds in operator language', () => {
    expect(EMAIL_FAILURE_KIND_LABEL.retryable).toBe('Do ponowienia');
    expect(EMAIL_FAILURE_KIND_LABEL.permanent).toBe('Trwały');
  });
});
