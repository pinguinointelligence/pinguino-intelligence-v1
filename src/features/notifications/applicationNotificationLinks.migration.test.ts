/// <reference types="node" />
/**
 * C-APP-09 finding — contract over the writer fix, READY but NOT APPLIED
 * (shared production database; the owner applies it).
 *
 * Pins that the migration changes one literal and nothing else, that it is
 * built from the live definition, and that the rollback restores exactly that.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VERSION = '20260910220000_partner_application_notification_links';
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const MIGRATION = read(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK = read(`supabase/rollbacks/${VERSION}.rollback.sql`);

const NAME = 'gellatti_admin_partner_application_action_v1';
const definition = (sql: string): string => {
  const start = sql.lastIndexOf(`create or replace function public.${NAME}(`);
  if (start < 0) throw new Error(`${NAME} is not defined here`);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3);
};

/** The definition this migration replaces: the latest one in any OTHER migration. */
const PREVIOUS = (() => {
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  let found: string | undefined;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql') || file.startsWith(VERSION)) continue;
    const sql = readFileSync(new URL(file, dir), 'utf8');
    if (sql.includes(`create or replace function public.${NAME}(`)) found = definition(sql);
  }
  if (!found) throw new Error(`no earlier migration defines ${NAME}`);
  return found;
})();
const NEXT = definition(MIGRATION);

const normalisedMd5 = (fn: string) =>
  createHash('md5')
    .update(
      fn
        .slice(fn.indexOf('$$') + 2, fn.lastIndexOf('$$;'))
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' '),
    )
    .digest('hex');

describe('the writer fix is handed over, not applied', () => {
  it('says so and names its rollback', () => {
    expect(MIGRATION).toContain('STATUS: READY / NOT APPLIED — production-shared DB');
    expect(MIGRATION).toContain(`ROLLBACK: supabase/rollbacks/${VERSION}.rollback.sql`);
  });

  it('is built from the live definition (read-only audit 2026-09-10)', () => {
    expect(normalisedMd5(PREVIOUS)).toBe('f718220b7f4d5f10f1e6f7411d2fef19');
  });
});

describe('one literal changes, nothing else', () => {
  it('the retired route is gone from the function', () => {
    expect(NEXT).not.toContain('/work-with-us');
  });

  it('putting the old literal back gives the live definition exactly', () => {
    const reverted = NEXT.replace(/'\/partner',(\s+'partner-application:')/, "'/work-with-us',$1");
    expect(reverted).toBe(PREVIOUS);
  });

  it('outside the function there are only the original revoke and grant', () => {
    const outside = MIGRATION.replace(NEXT, '')
      .replace(/--[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(outside).toBe(
      `revoke all on function public.${NAME}(uuid, text, text) from public, anon; grant execute on function public.${NAME}(uuid, text, text) to authenticated;`,
    );
  });
});

describe('the rollback', () => {
  it('restores the live definition verbatim, in one transaction', () => {
    expect(ROLLBACK).toContain(PREVIOUS);
    expect(ROLLBACK.trim().startsWith('--')).toBe(true);
    expect(ROLLBACK).toMatch(/\nbegin;\n[\s\S]*\ncommit;\n$/);
  });
});
