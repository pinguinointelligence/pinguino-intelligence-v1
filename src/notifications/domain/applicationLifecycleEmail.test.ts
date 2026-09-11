/// <reference types="node" />
/**
 * C-APP-08 — the application lifecycle email, verified STATICALLY.
 *
 * The migration is written and deliberately NOT applied: staging and production
 * share one Supabase project, so applying it changes production's database and
 * needs an explicit owner decision. That makes these contract tests the only
 * evidence available today, so they check the things that would actually go
 * wrong rather than restating the file.
 *
 * The traps they guard are real ones this codebase has already hit:
 *   * a subject_key that is not in the closed taxonomy
 *   * an area outside the vocabulary email_jobs enforces, which makes the row
 *     silently REFUSED and leaves a real event with no mail
 *   * an idempotency key that either double-sends on replay or silences a
 *     genuine second transition
 *   * a second mailer growing beside the canonical enqueue
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_SUBJECTS } from './emailSubject';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260910180000_partner_application_lifecycle_email.sql',
    import.meta.url,
  ),
  'utf8',
);

const rollback = readFileSync(
  new URL(
    '../../../supabase/rollbacks/20260910180000_partner_application_lifecycle_email.rollback.sql',
    import.meta.url,
  ),
  'utf8',
);

/**
 * Subject keys reach the enqueue two ways: four are chosen in the CASE and
 * assigned to `v_subject_key`, one is passed as a literal. Reading only the
 * literal form found ONE key and made this file look like it was checking five
 * — a reminder that an extractor is itself something to verify.
 */
const subjectKeysUsed = [
  ...migration.matchAll(/(?:p_subject_key|v_subject_key) := '([A-Za-z]+)'/g),
].map((m) => m[1] as string);

describe('C-APP-08 uses the existing email system, not a new one', () => {
  it('every subject_key exists in the closed taxonomy', () => {
    expect(subjectKeysUsed.length).toBeGreaterThan(0);
    for (const key of subjectKeysUsed) {
      expect(Object.keys(OPERATIONAL_SUBJECTS), `${key} is not a taxonomy subject`).toContain(key);
    }
  });

  it('covers the five states the checklist row names', () => {
    expect(new Set(subjectKeysUsed)).toEqual(
      new Set([
        'partnerApplicationNew',
        'partnerApplicationMoreInfo',
        'partnerApplicationApproved',
        'partnerApplicationRejected',
        'partnerConnectActionRequired',
      ]),
    );
  });

  it('enqueues only through the canonical RPC — no second mailer', () => {
    expect(migration).toContain('gellatti_enqueue_email_v1');
    // A direct insert would bypass idempotency, recipient normalisation and
    // next_attempt_at.
    expect(migration).not.toMatch(/insert\s+into\s+public\.email_jobs/i);
  });

  it('every enqueue passes an area the vocabulary allows, and an event', () => {
    const areas = [...migration.matchAll(/'area',\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    // Two enqueue call sites (application status + connect), five subjects.
    const enqueueSites = [...migration.matchAll(/gellatti_enqueue_email_v1\(/g)].length;
    expect(areas.length).toBe(enqueueSites);
    for (const area of areas) {
      // email_jobs_metadata_area_event_check refuses anything else, silently.
      expect([
        'PARTNER',
        'MACHINE',
        'MOBILE',
        'TRAILER',
        'FRANCHISE',
        'REFERRAL',
        'SHOP',
      ]).toContain(area);
    }
    expect([...migration.matchAll(/'event',/g)].length).toBe(enqueueSites);
    // environment is NOT NULL; omitting it is the other silent-refusal trap.
    expect([...migration.matchAll(/p_environment :=/g)].length).toBe(enqueueSites);
  });
});

describe('C-APP-08 behaves correctly on replay and on repeat transitions', () => {
  it('the idempotency key is derived from the row, never from now()', () => {
    // now() would produce a fresh key on every replay and double-send.
    expect(migration).toMatch(/extract\(epoch from coalesce\(new\.updated_at, new\.created_at\)\)/);
    expect(migration).not.toMatch(/idempotency_key[\s\S]{0,120}statement_timestamp\(\)/);
  });

  it('the key carries the status, so a second real request still sends', () => {
    // request info → resubmit → request info again is a DIFFERENT transition.
    expect(migration).toMatch(
      /'partner-application:' \|\| new\.id::text \|\| ':' \|\| new\.status/,
    );
  });

  it('does nothing when an update did not change the status', () => {
    expect(migration).toMatch(/new\.status is not distinct from old\.status[\s\S]{0,40}return new/);
  });
});

describe('C-APP-08 cannot damage the decision it reports', () => {
  it('every enqueue is wrapped so a queue failure cannot roll back a decision', () => {
    const wrapped = [...migration.matchAll(/exception when others then\s*\n\s*raise warning/g)];
    expect(wrapped.length).toBeGreaterThanOrEqual(2);
  });

  it('a missing recipient warns and returns instead of raising', () => {
    expect(migration).toMatch(/v_email is null[\s\S]{0,160}return new/);
  });

  it('an unknown status returns without inventing a subject', () => {
    // draft / under_review / suspended / terminated have no taxonomy subject.
    expect(migration).toMatch(/else\s*\n[\s\S]{0,220}return new;\s*\n\s*end case/);
  });
});

describe('C-APP-08 is reversible', () => {
  it('the rollback drops both the trigger and its function', () => {
    expect(rollback).toContain('drop trigger if exists partner_application_lifecycle_email');
    expect(rollback).toContain(
      'drop function if exists public.gellatti_partner_application_email_v1',
    );
  });

  it('the rollback does NOT reintroduce the answer-dropping bug', () => {
    // Reverting this migration must not silently undo 20260910044111.
    for (const key of ['audienceSize', 'termsAccepted', 'consent']) {
      expect(rollback, `${key} must survive the rollback`).toContain(key);
    }
    expect(rollback).toMatch(/p_application->>'description',\s*\n?\s*p_application->>'note'/);
  });

  it('the rollback removes the origin key the trigger needed, and nothing more', () => {
    expect(rollback).not.toMatch(/'origin',\s*nullif/);
  });
});
