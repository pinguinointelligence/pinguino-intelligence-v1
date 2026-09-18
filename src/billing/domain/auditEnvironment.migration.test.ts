/**
 * The audit trail's environment is decided on the SERVER (20260918090000).
 *
 * Staging and production share one Supabase project, so `audit_log.diff` was the
 * only place that said which app an action came from — and it said `staging` for
 * all of them, including production, because the writer merged a literal. These
 * assertions pin the fix in the same shape the mail paths use: the closed
 * `app_origins` map through `gellatti_request_app_origin_v1`, matched exactly,
 * never a parameter, a body value or a substring.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

/** Executable text only: a header that QUOTES the defect must not count as it. */
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '');

const MIGRATION_RAW = read('supabase', 'migrations', '20260918090000_audit_environment_server_decided.sql');
const MIGRATION = strip(MIGRATION_RAW);
const ROLLBACK = strip(read('supabase', 'rollbacks', '20260918090000_audit_environment_server_decided.rollback.sql'));
const ORIGINAL = strip(read('supabase', 'migrations', '20260826120000_admin_partner_controlled_catalog.sql'));

const SIGNATURE = 'public.gellatti_write_audit_v1(\n  p_action text,';

describe('the audit environment comes from the server', () => {
  it('no longer hard-codes staging', () => {
    expect(ORIGINAL).toContain("jsonb_build_object('environment','staging')"); // the defect it replaces
    expect(MIGRATION).not.toContain("jsonb_build_object('environment','staging')");
  });

  it('asks the closed-map resolver, and reads nothing else', () => {
    expect(MIGRATION).toContain('public.gellatti_request_app_origin_v1()');
    expect(MIGRATION).not.toMatch(/\bilike\b/i);
    expect(MIGRATION).not.toMatch(/\blike '%/i);
    expect(MIGRATION).not.toMatch(/p_diff\s*->>\s*'environment'/);
  });

  it('applies the server answer LAST, so a caller cannot override it', () => {
    const merge = MIGRATION.indexOf("coalesce(p_diff,'{}'::jsonb) || jsonb_build_object(");
    const environment = MIGRATION.indexOf("'environment',   coalesce(v_app ->> 'environment', 'staging')");
    expect(merge).toBeGreaterThan(-1);
    expect(environment).toBeGreaterThan(merge);
  });

  it('records whether the origin was actually matched', () => {
    /* A cron, webhook or service-role write has no browser Origin. Without this
       flag "staging" would mean both "it was staging" and "nobody asked". */
    expect(MIGRATION).toContain("'originMatched', coalesce((v_app ->> 'matched')::boolean, false)");
  });

  it('never loses an audit row because the origin could not be resolved', () => {
    expect(MIGRATION).toContain('exception when others then');
    expect(MIGRATION).toContain('v_app := null;');
  });

  it('keeps the signature, the search_path and the grants', () => {
    expect(MIGRATION).toContain(SIGNATURE);
    expect(MIGRATION).toContain('set search_path = pg_catalog, public');
    expect(MIGRATION).toContain('revoke all on function public.gellatti_write_audit_v1(');
  });

  it('refuses to apply without the mail foundation, and defines none of it itself', () => {
    expect(MIGRATION_RAW).toContain("raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';");
    expect(MIGRATION).not.toContain('create table');
    expect(MIGRATION).not.toContain('create or replace function public.gellatti_request_app_origin_v1');
  });

  it('touches no audit row', () => {
    for (const forbidden of [/\bupdate\s+public\.audit_log/i, /\bdelete\s+from\s+public\.audit_log/i, /\btruncate\b/i]) {
      expect(MIGRATION).not.toMatch(forbidden);
      expect(ROLLBACK).not.toMatch(forbidden);
    }
  });

  it('the rollback restores the previous body, hard-coded staging and all', () => {
    expect(ROLLBACK).toContain("coalesce(p_diff,'{}'::jsonb) || jsonb_build_object('environment','staging')");
    expect(ROLLBACK).not.toContain('gellatti_request_app_origin_v1');
    expect(ROLLBACK).toContain('revoke all on function public.gellatti_write_audit_v1(');
  });
});
