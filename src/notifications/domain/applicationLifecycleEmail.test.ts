/// <reference types="node" />
/**
 * C-APP-08 — the partner lifecycle email, verified STATICALLY.
 *
 * The migration is written and deliberately NOT applied: staging and production
 * share one Supabase project, so applying it changes production's database and
 * needs an explicit owner decision. Its behaviour is exercised on the isolated
 * Growth QA branch; these contract tests keep the shape that makes that
 * behaviour hold from being edited away.
 *
 * The traps they guard are real ones this codebase has already hit:
 *   * a subject_key that is not in the closed taxonomy
 *   * an area outside the vocabulary email_jobs enforces, which makes the row
 *     silently REFUSED and leaves a real event with no mail
 *   * an idempotency key that either double-sends on replay or silences a
 *     genuine second transition
 *   * a second mailer growing beside the canonical enqueue
 *   * an environment or a link chosen by the client (reworked 2026-09-17)
 *   * a mail that describes something that did not happen (reworked 2026-09-17)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_SUBJECTS, buildCustomerSubject } from './emailSubject';

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

/** Comments explain the old behaviour by name; only executable SQL is judged. */
const executable = migration.replace(/--[^\n]*/g, '');

/**
 * Subject keys reach the enqueue through `v_subject_key`. Reading only one
 * literal form once found ONE key and made this file look like it was checking
 * five — a reminder that an extractor is itself something to verify.
 */
const subjectKeysUsed = [
  ...executable.matchAll(/(?:p_subject_key|v_subject_key) := '([A-Za-z]+)'/g),
].map((m) => m[1] as string);

const fn = (name: string): string => {
  const start = executable.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined in the migration`);
  const end = executable.indexOf('$function$;', start);
  return executable.slice(start, end);
};

const MAIL = fn('gellatti_partner_application_email_v1');
const STAMP = fn('gellatti_partner_application_stamp_app_v1');
const RESOLVER = fn('gellatti_request_app_origin_v1');

describe('C-APP-08 uses the existing email system, not a new one', () => {
  it('every subject_key exists in the closed taxonomy', () => {
    expect(subjectKeysUsed.length).toBeGreaterThan(0);
    for (const key of subjectKeysUsed) {
      expect(Object.keys(OPERATIONAL_SUBJECTS), `${key} is not a taxonomy subject`).toContain(key);
    }
  });

  it('covers the four application states and a separate activation', () => {
    expect(new Set(subjectKeysUsed)).toEqual(
      new Set([
        'partnerApplicationNew',
        'partnerApplicationMoreInfo',
        'partnerApplicationApproved',
        'partnerApplicationRejected',
        'partnerActivated',
      ]),
    );
  });

  it('enqueues only through the canonical RPC — no second mailer', () => {
    expect(executable).toContain('gellatti_enqueue_email_v1');
    // A direct insert would bypass idempotency, recipient normalisation and
    // next_attempt_at.
    expect(executable).not.toMatch(/insert\s+into\s+public\.email_jobs/i);
  });

  it('every enqueue passes an area the vocabulary allows, an event and an environment', () => {
    const enqueueSites = [...executable.matchAll(/gellatti_enqueue_email_v1\(/g)].length;
    expect(enqueueSites).toBe(1);
    const areas = [...executable.matchAll(/'area',\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(areas.length).toBe(enqueueSites);
    for (const area of areas) {
      // email_jobs_metadata_area_event_check refuses anything else, silently.
      expect(['PARTNER', 'MACHINE', 'MOBILE', 'TRAILER', 'FRANCHISE', 'REFERRAL', 'SHOP']).toContain(area);
    }
    expect([...executable.matchAll(/'event',/g)].length).toBe(enqueueSites);
    // Every path that reaches the enqueue has set an event.
    expect(MAIL).toContain("v_event := 'partner_activated';");
    expect(MAIL).toContain("v_event := 'application_' || new.status;");
    // environment is NOT NULL; omitting it is the other silent-refusal trap.
    expect([...executable.matchAll(/\bp_environment :=/g)].length).toBe(enqueueSites);
  });
});

describe('C-APP-08 behaves correctly on replay and on repeat transitions', () => {
  it('the idempotency key is derived from the row, never from now()', () => {
    // now() would produce a fresh key on every replay and double-send.
    expect(executable).toMatch(/extract\(epoch from coalesce\(new\.updated_at, new\.created_at\)\)/);
    expect(executable).not.toMatch(/idempotency_key[\s\S]{0,120}statement_timestamp\(\)/);
  });

  it('the key carries the status, so a second real request still sends', () => {
    // request info → resubmit → request info again is a DIFFERENT transition.
    expect(executable).toMatch(/'partner-application:' \|\| new\.id::text \|\| ':' \|\| new\.status/);
  });

  it('does nothing when an update did not change the status', () => {
    expect(MAIL).toMatch(/new\.status is not distinct from old\.status[\s\S]{0,40}return new/);
  });
});

describe('C-APP-08 cannot damage the decision it reports', () => {
  it('the enqueue is wrapped so a queue failure cannot roll back a decision', () => {
    expect(MAIL).toMatch(
      /begin\s*\n\s*perform public\.gellatti_enqueue_email_v1\([\s\S]*?\);\s*\n\s*exception when others then\s*\n\s*raise warning/,
    );
  });

  it('a missing recipient warns and returns instead of raising', () => {
    expect(MAIL).toMatch(/v_email is null[\s\S]{0,160}return new/);
  });

  it('a missing app origin warns and returns instead of sending a wrong link', () => {
    expect(MAIL).toMatch(/v_base_url is null then\s*\n\s*raise warning[\s\S]{0,120}return new/);
  });

  it('an unknown status returns without inventing a subject', () => {
    // draft / under_review / suspended / terminated have no taxonomy subject.
    expect(MAIL).toMatch(/else\s*\n\s*return new;\s*\n\s*end case/);
  });
});

describe('C-APP-08 decides the environment and the links on the server (owner, 2026-09-17)', () => {
  it('reads nothing from the application body', () => {
    expect(executable).not.toMatch(/application_data\s*->>?\s*'origin'/);
    expect(executable).not.toMatch(/ilike/i);
    expect(executable).not.toMatch(/gellatti_submit_partner_application_v1/);
  });

  it('matches the request Origin header exactly against the closed map', () => {
    expect(RESOLVER).toContain("current_setting('request.headers', true)");
    expect(RESOLVER).toMatch(/where o\.origin = v_origin;/);
    expect(RESOLVER).not.toMatch(/like|similar to|~|position\(|strpos\(/i);
  });

  it('an unknown or absent origin is never production', () => {
    expect(RESOLVER).toMatch(
      /if v_result is null then[\s\S]*?jsonb_build_object\('environment', 'staging', 'baseUrl', o\.base_url, 'matched', false\)/,
    );
  });

  it('the map is the three origins shop-digital-document already trusts, and nothing else', () => {
    const rows = [
      ...executable.matchAll(/\('(https:\/\/[a-z0-9.-]+)', '(production|staging)', '(https:\/\/[a-z0-9.-]+)'\)/g),
    ].map((m) => ({ origin: m[1], environment: m[2], base: m[3] }));
    const shop = readFileSync(
      new URL('../../../supabase/functions/shop-digital-document/index.ts', import.meta.url),
      'utf8',
    );
    const shopMap = shop.match(/const APP_ORIGINS[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? '';
    const shopRows = [
      ...shopMap.matchAll(/'(https:\/\/[a-z0-9.-]+)': \{\s*environment: '(production|staging)',\s*base: '(https:\/\/[a-z0-9.-]+)',?\s*\}/g),
    ].map((m) => ({ origin: m[1], environment: m[2], base: m[3] }));
    const byOrigin = (a: { origin?: string }, b: { origin?: string }) =>
      (a.origin ?? '').localeCompare(b.origin ?? '');
    expect(rows).toHaveLength(3);
    expect([...rows].sort(byOrigin)).toEqual([...shopRows].sort(byOrigin));
  });

  it('the map is closed to clients', () => {
    expect(executable).toContain('alter table public.app_origins enable row level security;');
    expect(executable).toContain('revoke all on table public.app_origins from public, anon, authenticated;');
    expect(executable).toContain(
      'revoke all on function public.gellatti_request_app_origin_v1() from public, anon, authenticated;',
    );
  });

  it('every link is built from the map, never from the request', () => {
    expect(MAIL).toContain("v_app_url := v_base_url || '/partner';");
    expect(MAIL).toMatch(/select min\(o\.base_url\) into v_base_url\s*\n\s*from public\.app_origins o/);
    expect(executable).not.toMatch(/https:\/\/[a-z0-9.-]+\/partner/);
  });

  it('the row is stamped by the request that creates it; an admin decision keeps it', () => {
    expect(STAMP).toMatch(/if tg_op = 'INSERT' then\s*\n[\s\S]{0,120}v_app := public\.gellatti_request_app_origin_v1\(\);/);
    expect(STAMP).toMatch(
      /elsif new\.status = 'submitted'\s*\n\s*and old\.status is distinct from 'submitted'\s*\n\s*and auth\.uid\(\) is not distinct from new\.user_id then/,
    );
    expect(STAMP).toMatch(/new\.app_environment := old\.app_environment;\s*\n\s*new\.app_origin_matched := old\.app_origin_matched;/);
    expect(executable).toMatch(/create trigger partner_application_stamp_app\s*\n\s*before insert or update on public\.partner_applications/);
  });

  it('the mail follows the stamp, and only an unstamped row falls back to the request', () => {
    expect(MAIL).toMatch(
      /if new\.app_environment is not null then\s*\n\s*v_environment := new\.app_environment;[\s\S]*?else\s*\n\s*v_environment := public\.gellatti_request_app_origin_v1\(\)->>'environment';/,
    );
  });
});

describe('C-APP-08 says what happened (owner, 2026-09-17)', () => {
  it('sends no payout-setup mail: the Partner does not configure payouts', () => {
    expect(executable).not.toContain('partnerConnectActionRequired');
    expect(executable).not.toMatch(/konfiguracj/i);
    expect(executable).not.toMatch(/stripe_connect_account_id/);
  });

  it('a row created already approved is an activation, not an approved application', () => {
    expect(MAIL).toMatch(
      /if tg_op = 'INSERT' and new\.status = 'approved' then[\s\S]{0,200}v_subject_key := 'partnerActivated';/,
    );
    const activation = MAIL.slice(
      MAIL.indexOf("if tg_op = 'INSERT' and new.status = 'approved' then"),
      MAIL.indexOf('  else\n    case new.status'),
    );
    expect(activation).not.toMatch(/zgłoszeni/i);
  });

  it('"received" goes only to the person who submitted, never to an invitee or an admin write', () => {
    expect(MAIL).toMatch(
      /when 'submitted' then[\s\S]{0,80}if auth\.uid\(\) is distinct from new\.user_id then\s*\n\s*raise warning[\s\S]{0,120}return new;/,
    );
  });
});

describe('C-APP-08 is reversible', () => {
  it('the rollback drops both triggers, their functions, the resolver, the map and the stamp columns', () => {
    for (const statement of [
      'drop trigger if exists partner_application_lifecycle_email on public.partner_applications;',
      'drop function if exists public.gellatti_partner_application_email_v1();',
      'drop trigger if exists partner_application_stamp_app on public.partner_applications;',
      'drop function if exists public.gellatti_partner_application_stamp_app_v1();',
      'drop function if exists public.gellatti_request_app_origin_v1();',
      'drop column if exists app_origin_matched,',
      'drop column if exists app_environment;',
      'drop table if exists public.app_origins;',
    ]) {
      expect(rollback).toContain(statement);
    }
  });

  it('the rollback leaves the submit RPC alone, because the migration no longer changes it', () => {
    expect(rollback.replace(/--[^\n]*/g, '')).not.toMatch(/gellatti_submit_partner_application_v1/);
  });

  it('the rollback touches no decision or status', () => {
    expect(rollback).not.toMatch(/^\s*(update|delete)\b/im);
  });
});

describe('C-APP-08 writes to the person as a customer', () => {
  const subjects = [...executable.matchAll(/p_subject := ([\s\S]*?),\n/g)].map((m) =>
    (m[1] as string).replace(/\s+/g, ' ').trim(),
  );
  const tails = [...executable.matchAll(/v_subject_tail := '([^']*)';/g)].map((m) => m[1] as string);
  const MARK = "case when v_environment = 'production' then '' else '[STAGING] ' end";

  /** What the SQL expression renders for one tail, as the database would. */
  const render = (tail: string, environment: 'production' | 'staging') =>
    `${environment === 'production' ? '' : '[STAGING] '}${tail}`;

  it('sends every subject to the person, never to the internal mailbox', () => {
    expect(subjects).toHaveLength(1);
    expect(executable.match(/p_recipient := v_email,/g)).toHaveLength(1);
  });

  it('uses no bracket taxonomy in a customer subject (ES7)', () => {
    for (const subject of subjects) expect(subject).not.toContain('[GELLATTI]');
    expect(subjects).toEqual([`${MARK} || v_subject_tail`]);
  });

  it('renders exactly what buildCustomerSubject renders, in both environments (ES4)', () => {
    expect(tails).toHaveLength(5);
    for (const tail of tails) {
      for (const environment of ['production', 'staging'] as const) {
        expect(render(tail, environment)).toBe(buildCustomerSubject({ localizedSubject: tail, environment }));
      }
    }
  });

  it('names the signed-in area Partner, as the owner decided (C-APP-13)', () => {
    expect(executable).toContain("'Tryb Partner jest aktywny na Twoim koncie.'");
    expect(executable).toContain('Otwórz panel Partner');
    expect(executable).not.toMatch(/Tryb Affiliate|panel Affiliate/i);
  });
});
