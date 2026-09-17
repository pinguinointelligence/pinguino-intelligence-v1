/// <reference types="node" />
/**
 * P-LEAD-06 and A-IA-07 — the franchise enquiry RPC, as the database runs it.
 *
 * Both migrations were applied by hand and verified live:
 *   20260906200629  franchise_inquiries.source_route + the route allowlist (A-IA-07)
 *   20260910032351  the admin e-mail to info@gellatti.com (P-LEAD-06)
 * and one correction is written, NOT applied, waiting for owner approval:
 *   20260917180000  the environment decided on the server, request values
 *                   escaped (Growth QA, 2026-09-17)
 *
 * Nothing in the suite pinned either one. The client side is pinned
 * (`leadEnquiry.test.tsx`, `franchiseOrigin.test.ts`), but a later
 * `create or replace` of `gellatti_submit_franchise_inquiry_v1` could drop the
 * e-mail, the route or the lead's safety net, and every test would stay green.
 *
 * The contracts read the LATEST definition, found by content rather than by
 * filename: several applied migrations are still due to be renamed to the
 * version they were recorded under (DB-DRIFT-01), and a rename must not quietly
 * point this file at nothing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FRANCHISE_CONCEPT_BY_ROUTE,
  FRANCHISE_CONCEPT_ORDER,
  FRANCHISE_SOURCE_ROUTES,
} from './franchiseConcepts';
import { OPERATIONAL_SUBJECTS, buildSubjectPrefix } from '@/notifications/domain/emailSubject';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FUNCTION = 'gellatti_submit_franchise_inquiry_v1';
const OPENER = `create or replace function public.${FUNCTION}(`;

const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, MIGRATIONS), 'utf8');

const definitionIn = (sql: string): string => {
  const start = sql.indexOf(OPENER);
  const close = sql.indexOf('$function$;', start);
  if (start < 0 || close < 0) throw new Error(`${FUNCTION} is not defined here`);
  return sql.slice(start, close + '$function$;'.length);
};

const definitions = files.filter((file) => read(file).includes(OPENER));
const latestFile = definitions.at(-1)!;
/** Comments removed and whitespace collapsed, so a reflow cannot fail a contract. */
const LATEST = definitionIn(read(latestFile))
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ');

const quotedList = (pattern: RegExp): string[] => {
  const match = LATEST.match(pattern);
  if (!match) throw new Error(`pattern not found: ${pattern}`);
  return [...match[1]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
};

describe('the file under contract', () => {
  it('is the latest definition, and it still carries both applied changes', () => {
    // If a newer migration redefines the RPC, it becomes the latest definition,
    // and every contract below then judges the new one.
    expect(definitions.length).toBeGreaterThanOrEqual(3);
    expect(LATEST).toContain('source_route');
    expect(LATEST).toContain('gellatti_enqueue_email_v1');
  });
});

describe('A-IA-07 — the route an enquiry started on is stored', () => {
  const columnMigration = files.find((file) => file.startsWith('20260906200629_'));

  it('adds franchise_inquiries.source_route as nullable text', () => {
    expect(columnMigration).toBeDefined();
    const sql = read(columnMigration!).replace(/\s+/g, ' ');
    expect(sql).toContain('alter table public.franchise_inquiries add column if not exists source_route text;');
    // Pre-existing rows and direct visits legitimately have no route.
    expect(sql).not.toMatch(/source_route text not null/);
  });

  it('writes the route into the row the RPC inserts', () => {
    expect(LATEST).toMatch(
      /insert into public\.franchise_inquiries\( user_id, concept, full_name, email, phone, city, country, note, source_route \)/,
    );
    expect(LATEST).toContain("v_source text := btrim(coalesce(p_inquiry->>'sourceRoute', ''));");
  });

  it('accepts exactly the routes the client may send', () => {
    // A route the client sends but the RPC does not list is silently stored as
    // null, which is how an enquiry quietly loses where it came from.
    const allowed = quotedList(/if v_source not in \(([^)]*)\) then/);
    expect([...allowed].sort()).toEqual([...FRANCHISE_SOURCE_ROUTES].sort());
    for (const route of Object.keys(FRANCHISE_CONCEPT_BY_ROUTE)) {
      expect(allowed).toContain(route);
    }
  });

  it('turns an unknown route into no route, never into a refused enquiry', () => {
    expect(LATEST).toContain('if v_source not in');
    expect(LATEST).toMatch(/then v_source := null; end if;/);
    expect(LATEST).not.toMatch(/raise exception '[^']*(route|source)[^']*'/);
  });

  it('accepts exactly the four approved concepts', () => {
    const concepts = quotedList(/if v_concept not in \(([^)]*)\) then/);
    expect([...concepts].sort()).toEqual([...FRANCHISE_CONCEPT_ORDER].sort());
  });
});

describe('P-LEAD-06 — the admin is e-mailed at info@gellatti.com', () => {
  const spec = OPERATIONAL_SUBJECTS.franchiseInquiryNew;
  const productionPrefix = buildSubjectPrefix(spec, 'production');
  const stagingPrefix = buildSubjectPrefix(spec, 'staging');

  it('queues exactly one e-mail, through the canonical enqueue function', () => {
    expect(LATEST.match(/public\.gellatti_enqueue_email_v1\(/g)).toHaveLength(1);
    // The enqueue function owns idempotency; a direct insert would bypass it.
    expect(LATEST).not.toMatch(/insert into public\.email_jobs/);
    expect(LATEST).toContain("p_recipient := 'info@gellatti.com'");
    expect(LATEST).toContain("p_idempotency_key := 'franchise-inquiry:' || v_id::text");
    expect(LATEST).toContain('p_max_attempts := 5');
  });

  it('uses a subject key from the closed taxonomy, and the same subject the taxonomy builds', () => {
    expect(LATEST).toContain("p_subject_key := 'franchiseInquiryNew'");
    expect(productionPrefix).toBe('[GELLATTI][FRANCHISE][INQUIRY][NEW]');
    expect(LATEST).toContain(`v_subject := '${productionPrefix}'`);
    // The SQL appends the staging token itself; together they must equal what
    // the TypeScript taxonomy builds, or Workspace filters split in two.
    expect(LATEST).toContain("case when v_environment = 'production' then '' else '[STAGING]' end");
    expect(`${productionPrefix}[STAGING]`).toBe(stagingPrefix);
    expect(LATEST).toContain(`'area', '${spec.area}'`);
  });

  it('decides the environment on the server, never from the request body', () => {
    // Staging and production share one database. The live 20260910032351 body
    // read `origin` from the payload and matched `ilike '%gellatti.com%'`, which
    // labelled 'https://gellatti.com.attacker.example' production (QA, as anon).
    expect(LATEST).not.toContain("p_inquiry->>'origin'");
    expect(LATEST).not.toMatch(/ilike/i);
    expect(LATEST).toContain('v_app := public.gellatti_request_app_origin_v1();');
    expect(LATEST).toContain("v_environment := coalesce(v_app->>'environment', 'staging');");
    expect(LATEST).toContain('p_environment := v_environment');
  });

  it('builds the admin link from the closed map, never from the request', () => {
    expect(LATEST).toContain(
      "v_admin_url := coalesce(v_app->>'baseUrl', 'https://staging.pinguinoai.com') || '/admin/franchise';",
    );
    expect(LATEST).not.toContain('https://www.gellatti.com/admin/franchise');
  });

  it('keeps the lead when the origin cannot be resolved', () => {
    // A resolver failure falls back to staging inside its own sub-block; it can
    // never abort the insert the visitor just made.
    expect(LATEST).toMatch(
      /begin v_app := public\.gellatti_request_app_origin_v1\(\); exception when others then v_app := null; end;/,
    );
  });

  it('puts request values into the HTML only escaped', () => {
    // The RPC is granted to anon: a name of '<a href="…">Otwórz w panelu Admin</a>'
    // arrived at info@gellatti.com as a working link (QA, as anon).
    const html = LATEST.slice(LATEST.indexOf('p_body_html :='), LATEST.indexOf('p_body_text :='));
    for (const value of ['v_name', 'v_concept', 'v_source', 'v_email', 'v_admin_url']) {
      expect(html, `${value} must be escaped`).toContain(`public.gellatti_html_escape_v1(${value})`);
      expect(html.replaceAll(`public.gellatti_html_escape_v1(${value})`, '')).not.toMatch(
        new RegExp(`\\b${value}\\b`),
      );
    }
  });

  it('sanitises the subject identifier like emailSubject ES5', () => {
    expect(LATEST).toContain(
      "v_label := left(btrim(regexp_replace(regexp_replace( v_name || ' · ' || v_concept, '[[:cntrl:]]+', ' ', 'g'), '\\s+', ' ', 'g')), 100);",
    );
    expect(LATEST).toMatch(/v_subject := '\[GELLATTI\]\[FRANCHISE\]\[INQUIRY\]\[NEW\]' \|\| case when v_environment = 'production' then '' else '\[STAGING\]' end \|\| ' ' \|\| v_label;/);
  });

  it('the correction refuses to apply without its foundation, and its rollback restores the live body byte-identical', () => {
    const correction = read('20260917180000_franchise_inquiry_server_environment.sql');
    expect(correction).toContain("raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';");
    expect(correction).not.toMatch(/^\s*(grant|revoke)\b/im);
    const rollback = readFileSync(
      new URL('../../../supabase/rollbacks/20260917180000_franchise_inquiry_server_environment.rollback.sql', import.meta.url),
      'utf8',
    );
    expect(definitionIn(rollback)).toBe(definitionIn(read('20260910032351_franchise_inquiry_admin_email.sql')));
  });

  it('keeps the lead when the e-mail cannot be queued', () => {
    const insert = LATEST.indexOf('insert into public.franchise_inquiries(');
    const guard = LATEST.indexOf('begin perform public.gellatti_enqueue_email_v1(');
    expect(insert).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(insert);
    // The enqueue runs in its own sub-block: a failure is a warning, not a
    // rollback of the enquiry the visitor just sent.
    expect(LATEST.slice(guard)).toMatch(
      /exception when others then raise warning 'franchise_inquiry_email_enqueue_failed for %: %', v_id, sqlerrm; end;/,
    );
  });

  it('still raises the in-app admin notification, de-duplicated per enquiry', () => {
    expect(LATEST).toContain("'SUPPORT', 'FRANCHISE_INQUIRY_SUBMITTED', 'franchise_inquiries', v_id::text");
    expect(LATEST).toContain("'franchise-inquiry:' || v_id::text ) on conflict (dedupe_key) do nothing;");
  });
});

describe('the public form keeps working for anonymous visitors', () => {
  it('stays callable by anon and authenticated, with no later revoke', () => {
    const granted = files.filter((file) =>
      new RegExp(`grant execute on function public\\.${FUNCTION}\\(jsonb\\) to anon, authenticated;`).test(read(file)),
    );
    expect(granted.length).toBeGreaterThan(0);
    const revokedLater = files.filter(
      (file) =>
        file > granted[0]! &&
        new RegExp(`revoke [^;]*on function public\\.${FUNCTION}\\(`, 'i').test(read(file)),
    );
    expect(revokedLater).toEqual([]);
    expect(LATEST).toContain('security definer');
    expect(LATEST).toContain("set search_path to 'pg_catalog', 'public'");
  });
});
