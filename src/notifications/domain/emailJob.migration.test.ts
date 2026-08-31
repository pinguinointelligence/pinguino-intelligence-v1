/// <reference types="node" />
/**
 * Email jobs migration guard (20260831201500).
 *
 * Proven statically against the SQL text (comment-stripped). No live DB.
 * Drift between src/notifications/domain/emailJob.ts and the SQL breaks this
 * test — the TS module and the database must enforce the SAME owner rules.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_ATTEMPTS, LEGAL_EMAIL_TRANSITIONS } from './emailJob';
import { OPERATIONAL_SUBJECTS } from './emailSubject';

/**
 * THREE-WAY PARITY (owner ruling §2, 2026-08-31): when a new email domain is
 * introduced, the canonical TS vocabulary, the SQL accepted vocabulary and the
 * subject taxonomy must all change together. So all three are read
 * independently and compared — a two-way check would let the third drift.
 *
 *  1. `EmailArea`          — the DECLARED vocabulary. A type, so it cannot be
 *                            enumerated at runtime; parsed from source, the
 *                            same way the SQL CHECK is.
 *  2. OPERATIONAL_SUBJECTS — the SUBJECT TAXONOMY actually in use, and the
 *                            table `buildEmailMetadata()` reads to stamp
 *                            `metadata.area`.
 *  3. the SQL CHECK        — what the database will ACCEPT.
 */
const EMAIL_SUBJECT_SOURCE = readFileSync(
  join(resolve(__dirname), 'emailSubject.ts'),
  'utf8',
);

/** 1. the declared union, parsed from the type itself. */
const DECLARED_AREAS = (() => {
  const union = /export type EmailArea\s*=\s*([^;]+);/.exec(EMAIL_SUBJECT_SOURCE)?.[1] ?? '';
  return [...union.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
})();

/** 2. the areas the subject taxonomy actually uses. */
const TAXONOMY_AREAS = [
  ...new Set(Object.values(OPERATIONAL_SUBJECTS).map((spec) => spec.area as string)),
].sort();


const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831201500_email_jobs.sql'),
  'utf8',
);
const SQL = MIGRATION.replace(/--.*$/gm, '');

const TABLE = /create table if not exists public\.email_jobs[\s\S]*?\n\);/.exec(SQL)?.[0] ?? '';
const CLAIM =
  /create or replace function public\.gellatti_claim_email_jobs_v1[\s\S]*?\$\$;/.exec(SQL)?.[0] ??
  '';
const MARK_SENT =
  /create or replace function public\.gellatti_mark_email_sent_v1[\s\S]*?\$\$;/.exec(SQL)?.[0] ??
  '';
const MARK_FAILED =
  /create or replace function public\.gellatti_mark_email_failed_v1[\s\S]*?\$\$;/.exec(SQL)?.[0] ??
  '';
const ENQUEUE =
  /create or replace function public\.gellatti_enqueue_email_v1[\s\S]*?\$\$;/.exec(SQL)?.[0] ?? '';

describe('EJ3 — a false `sent` is impossible at the database layer', () => {
  it('constrains sent to require BOTH a provider message id and a sent_at', () => {
    expect(TABLE).toContain('email_jobs_sent_requires_evidence');
    const c =
      /constraint email_jobs_sent_requires_evidence check \([\s\S]*?\)\n?\s*\)/.exec(TABLE)?.[0] ??
      '';
    expect(c).toContain('provider_message_id is not null');
    expect(c).toContain("btrim(provider_message_id) <> ''");
    expect(c).toContain('sent_at is not null');
  });

  it('states the constraint as an equivalence, so evidence without the status is refused too', () => {
    expect(TABLE).toMatch(/\(status = 'sent'\) =/);
  });

  it('forbids success evidence on any unsent row', () => {
    expect(TABLE).toContain('email_jobs_unsent_has_no_evidence');
    const c = /constraint email_jobs_unsent_has_no_evidence check \([^)]*\)/.exec(TABLE)?.[0] ?? '';
    expect(c).toContain('provider_message_id is null and sent_at is null');
  });

  it('the settle function refuses a blank provider message id explicitly', () => {
    expect(MARK_SENT).toContain('email_sent_requires_provider_message_id');
    expect(MARK_SENT).toMatch(
      /p_provider_message_id is null or btrim\(p_provider_message_id\) = ''/,
    );
  });

  it('a failure clears any success evidence', () => {
    expect(MARK_FAILED).toContain('provider_message_id = null');
    expect(MARK_FAILED).toContain('sent_at = null');
  });
});

describe('the idempotent claim is duplicate-execution safe', () => {
  it('uses FOR UPDATE SKIP LOCKED so concurrent schedulers claim disjoint sets', () => {
    expect(CLAIM).toContain('for update skip locked');
  });

  it('moves the row to sending and increments attempts in the same statement', () => {
    expect(CLAIM).toContain("set status = 'sending'");
    expect(CLAIM).toContain('attempts = j.attempts + 1');
  });

  it('claims only due, non-exhausted jobs', () => {
    expect(CLAIM).toContain("status in ('queued', 'failed')");
    expect(CLAIM).toContain('attempts < max_attempts');
    expect(CLAIM).toContain('next_attempt_at is null or next_attempt_at <= p_now');
  });

  it('settling requires the job to still be claimed, so a double-settle is refused', () => {
    expect(MARK_SENT).toContain("status = 'sending'");
    expect(MARK_SENT).toContain('email_job_not_claimed_or_already_settled');
    expect(MARK_FAILED).toContain("status = 'sending'");
    expect(MARK_FAILED).toContain('email_job_not_claimed_or_already_settled');
  });
});

describe('EJ2 — enqueue is idempotent', () => {
  it('the key is unique', () => {
    expect(TABLE).toContain('idempotency_key text not null unique');
  });

  it('a replay returns the existing job instead of raising or double-sending', () => {
    expect(ENQUEUE).toContain('on conflict (idempotency_key) do nothing');
    expect(ENQUEUE).toContain("'deduplicated'");
  });

  it('normalises the recipient the same way the TS module does', () => {
    expect(ENQUEUE).toContain('lower(btrim(p_recipient))');
  });
});

describe('EJ4 — the lifecycle matches the TS state machine', () => {
  it('the status CHECK lists exactly the TS statuses', () => {
    const declared = Object.keys(LEGAL_EMAIL_TRANSITIONS);
    const check =
      /status text not null default 'queued'\s*\n?\s*check \(status in \(([^)]*)\)\)/.exec(TABLE);
    expect(check).not.toBeNull();
    const quoted = [...(check?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(declared));
  });

  it('defaults to queued', () => {
    expect(TABLE).toContain("status text not null default 'queued'");
  });

  it('only a queued or failed job may carry a scheduled retry', () => {
    expect(TABLE).toContain('email_jobs_retry_only_when_failed');
    const c = /constraint email_jobs_retry_only_when_failed check \([^)]*\)/.exec(TABLE)?.[0] ?? '';
    expect(c).toContain("status in ('queued', 'failed')");
  });
});

describe('EJ5/EJ6 — failure handling matches the TS module', () => {
  it('abandons on a permanent failure or an exhausted budget', () => {
    expect(MARK_FAILED).toContain(
      "v_terminal := (p_failure_kind = 'permanent') or (v_job.attempts >= v_job.max_attempts)",
    );
    expect(MARK_FAILED).toContain("case when v_terminal then 'abandoned' else 'failed' end");
  });

  it('uses the same exponential shape as backoffDelayMs()', () => {
    expect(MARK_FAILED).toContain('power(2, greatest(v_job.attempts - 1, 0))');
  });

  it('schedules no retry for a terminal job', () => {
    expect(MARK_FAILED).toContain('when v_terminal then null');
  });

  it('shares the default attempt budget with the TS module', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
    expect(TABLE).toMatch(
      new RegExp(`max_attempts integer not null default ${DEFAULT_MAX_ATTEMPTS}`),
    );
  });

  it('accepts only the two TS failure kinds', () => {
    expect(TABLE).toContain("check (last_failure_kind in ('retryable', 'permanent'))");
    expect(MARK_FAILED).toContain('unsupported_email_failure_kind');
  });
});

describe('EJ7 — Admin visibility', () => {
  it('exposes an admin listing that defaults to everything not yet delivered', () => {
    const fn =
      /create or replace function public\.gellatti_admin_email_jobs_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain("j.status in ('queued', 'sending', 'failed', 'abandoned')");
  });

  it('checks an admin authority explicitly', () => {
    // Was `expect(fn).toContain('gellatti_admin_has_permission_v1')`. The gate
    // moved to an explicit super_admin check (owner ruling 2026-08-31) because
    // no canonical cross-domain operational permission exists and the PARTNER
    // gate leaked every other business area's recipients. See EJ10 below for
    // the full contract.
    const fn =
      /create or replace function public\.gellatti_admin_email_jobs_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).toContain("a.role = 'super_admin'");
    expect(fn).toContain('administrator_required');
  });

  it('returns the failure detail an operator needs', () => {
    const fn =
      /create or replace function public\.gellatti_admin_email_jobs_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    for (const column of [
      'last_failure_kind',
      'last_failure_message',
      'attempts',
      'next_attempt_at',
    ]) {
      expect(fn, column).toContain(column);
    }
  });

  it('does NOT return message bodies', () => {
    const fn =
      /create or replace function public\.gellatti_admin_email_jobs_v1[\s\S]*?\$\$;/.exec(
        SQL,
      )?.[0] ?? '';
    expect(fn).not.toContain('body_html');
    expect(fn).not.toContain('body_text');
  });

  it('indexes the rows an operator queries', () => {
    expect(SQL).toContain('email_jobs_attention_idx');
    expect(SQL).toContain("where status in ('failed', 'abandoned')");
  });
});

describe('rendering is frozen at enqueue', () => {
  it('stores the rendered subject and both bodies', () => {
    for (const column of [
      'subject text not null',
      'body_html text not null',
      'body_text text not null',
    ]) {
      expect(TABLE, column).toContain(column);
    }
  });

  it('records the environment, so staging mail is distinguishable', () => {
    expect(TABLE).toContain("check (environment in ('production', 'staging', 'development'))");
  });
});

describe('security posture', () => {
  it('enables RLS and grants nothing to clients', () => {
    expect(SQL).toContain('alter table public.email_jobs enable row level security');
    expect(/grant (select|insert|update|delete)[^;]*email_jobs\b/i.test(SQL)).toBe(false);
  });

  it('keeps every write function off the client', () => {
    for (const fn of [
      'gellatti_enqueue_email_v1',
      'gellatti_claim_email_jobs_v1',
      'gellatti_mark_email_sent_v1',
      'gellatti_mark_email_failed_v1',
    ]) {
      expect(SQL, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}`));
      expect(new RegExp(`grant execute on function public\\.${fn}`).test(SQL), fn).toBe(false);
    }
  });

  it('only the admin read function is granted, and never to anon', () => {
    expect(SQL).toContain(
      'grant execute on function public.gellatti_admin_email_jobs_v1(text, integer) to authenticated',
    );
    expect(SQL).toContain(
      'revoke all on function public.gellatti_admin_email_jobs_v1(text, integer) from public, anon',
    );
  });

  it('documents a rollback', () => {
    expect(MIGRATION).toContain('ROLLBACK');
  });
});

describe('EJ9 — the business-domain discriminator (owner §1–§3, 2026-08-31)', () => {
  const CODE = SQL.replace(/--.*$/gm, '');

  /** 3. what the database will accept, parsed out of the CHECK. */
  const SQL_AREAS = (() => {
    const check = /email_jobs_metadata_has_domain check \(([\s\S]*?)\n  \)/.exec(CODE)?.[1] ?? '';
    return [...check.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  })();

  it('finds all three vocabularies, so the comparison is not vacuous', () => {
    expect(DECLARED_AREAS.length, 'EmailArea union not parsed').toBeGreaterThan(0);
    expect(TAXONOMY_AREAS.length, 'OPERATIONAL_SUBJECTS empty').toBeGreaterThan(0);
    expect(SQL_AREAS.length, 'SQL CHECK vocabulary not parsed').toBeGreaterThan(0);
  });

  it('DECLARED type vocabulary equals what the database accepts', () => {
    expect(SQL_AREAS).toEqual(DECLARED_AREAS);
  });

  it('SUBJECT TAXONOMY uses no area outside the declared vocabulary', () => {
    for (const area of TAXONOMY_AREAS) expect(DECLARED_AREAS).toContain(area);
  });

  it('SUBJECT TAXONOMY uses no area the database would reject', () => {
    for (const area of TAXONOMY_AREAS) expect(SQL_AREAS).toContain(area);
  });

  it('requires area AND event to be present on every row', () => {
    expect(CODE).toMatch(/metadata \? 'area'/);
    expect(CODE).toMatch(/metadata \? 'event'/);
  });

  it('does NOT add a redundant domain column — it constrains the existing metadata', () => {
    // buildEmailMetadata() already writes {area, event} from the same canonical
    // OPERATIONAL_SUBJECTS spec that composes the subject. A second column would
    // be duplicated state that could disagree with itself.
    const createTable =
      /create table if not exists public\.email_jobs \(([\s\S]*?)\n\);/.exec(CODE)?.[1] ?? '';
    expect(createTable, 'create table block not found').not.toBe('');
    expect(createTable).not.toMatch(/^\s*domain text/m);
    expect(createTable).toMatch(/metadata jsonb not null/);
  });

  it('never derives the domain from the free-text subject', () => {
    expect(CODE).not.toMatch(/subject\s+like/i);
    expect(CODE).not.toMatch(/subject_key\s+like/i);
  });

  it('indexes the discriminator so Admin filtering is not a scan', () => {
    expect(CODE).toMatch(/create index if not exists email_jobs_domain_idx[\s\S]*?metadata->>'area'/);
  });
});

describe('EJ10 — admin email read is super_admin only (owner §1)', () => {
  const CODE = SQL.replace(/--.*$/gm, '');
  const fn =
    /create or replace function public\.gellatti_admin_email_jobs_v1[\s\S]*?\$\$;/.exec(CODE)?.[0] ??
    '';

  it('does not gate on PARTNER, or on any other domain permission', () => {
    expect(fn, 'admin fn not found').not.toBe('');
    for (const permission of ['PARTNER', 'CATALOG', 'SUPPORT', 'FINANCE', 'CONTENT']) {
      expect(fn, `must not gate on ${permission}`).not.toContain(`'${permission}'`);
    }
  });

  it('does not gate on ADMIN_READ, which is broader still', () => {
    // ADMIN_READ resolves to super_admin PLUS all five specialist roles, so it
    // would be strictly worse than the PARTNER gate it replaced.
    expect(fn).not.toContain("'ADMIN_READ'");
  });

  it('requires the super_admin role explicitly and honours revoked_at', () => {
    expect(fn).toMatch(/from public\.admin_users a/);
    expect(fn).toMatch(/a\.role = 'super_admin'/);
    expect(fn).toMatch(/a\.revoked_at is null/);
    expect(fn).toMatch(/raise exception 'administrator_required'/);
  });

  it('still keeps message bodies out of the list surface', () => {
    expect(fn).not.toContain('body_html');
    expect(fn).not.toContain('body_text');
  });

  it('returns the domain and event discriminators for filtering', () => {
    expect(fn).toMatch(/metadata->>'area' as domain/);
    expect(fn).toMatch(/metadata->>'event' as event/);
  });
});
