/// <reference types="node" />
/**
 * DB-ACL-02 / DB-ACL-03 — least privilege on the financial tables (package 1).
 *
 * A contract over a migration that is READY but NOT APPLIED. Staging and
 * production share one database, so the owner applies it. Until 2026-09-17 it
 * had no test and no rollback. These tests make it safe to hand over:
 *   - it changes table grants and nothing else;
 *   - `authenticated` gets SELECT back on exactly the tables whose own-row
 *     policies need it, and no other;
 *   - nothing the app runs loses access: the browser never reads these tables,
 *     the edge functions use the service-role client, and every function that
 *     reads them and that a client role can call is SECURITY DEFINER;
 *   - the rollback restores exactly the grants that are live today.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname;
const VERSION = '20260910120000_financial_tables_least_privilege';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const TABLES = [
  'commission_entries',
  'commission_rules',
  'commission_adjustments',
  'partner_payouts',
  'referral_attributions',
  'partner_benefit_uses',
  'partner_tier_snapshots',
] as const;
const REGRANTED = [
  'commission_entries',
  'commission_adjustments',
  'partner_payouts',
  'referral_attributions',
  'partner_tier_snapshots',
] as const;
const TABLE_REF = new RegExp(`\\b(?:${TABLES.join('|')})\\b`);

/** Executable statements only: comments removed, whitespace collapsed, transaction lines dropped. */
const statements = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement && !/^(?:begin|commit)$/i.test(statement));

const list = (tables: readonly string[]) => tables.map((table) => `public.${table}`).join(', ');

const MIGRATION = read(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK = read(`supabase/rollbacks/${VERSION}.rollback.sql`);
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const allSql = migrationFiles.map((file) => ({
  file,
  sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, ''),
}));

describe('the change', () => {
  it('revokes everything from anon and authenticated, then gives authenticated SELECT on five tables', () => {
    expect(statements(MIGRATION)).toEqual([
      `revoke all on table ${list(TABLES)} from anon, authenticated`,
      `grant select on table ${list(REGRANTED)} to authenticated`,
    ]);
  });

  it('touches no data, function, policy, trigger or default privilege', () => {
    const executable = statements(MIGRATION).join(';');
    expect(executable).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|drop|create|function|policy|default privileges)\b/i,
    );
  });

  it('gives SELECT back exactly where an own-row SELECT policy exists', () => {
    const withPolicy = TABLES.filter((table) =>
      allSql.some(({ sql }) => new RegExp(`create policy\\s+\\w+\\s+on\\s+public\\.${table}\\s+for select`, 'i').test(sql)),
    );
    expect([...withPolicy].sort()).toEqual([...REGRANTED].sort());
  });

  it('the rollback restores exactly the grants that are live today', () => {
    expect(statements(ROLLBACK)).toEqual([`grant all on table ${list(TABLES)} to anon, authenticated`]);
    expect(ROLLBACK).toMatch(/^begin;$/m);
    expect(ROLLBACK).toMatch(/^commit;$/m);
  });
});

describe('nothing the app runs loses access', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const source = (dir: string) =>
    walk(join(ROOT, dir)).filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));
  const directRead = new RegExp(`from\\(\\s*['"\`](?:${TABLES.join('|')})['"\`]\\s*\\)|/rest/v1/(?:${TABLES.join('|')})\\b`);

  it('the browser bundle never reads or writes the tables directly', () => {
    const readers = source('src')
      .filter((file) => directRead.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(ROOT, ''));
    expect(readers).toEqual([]);
  });

  it('the edge functions that do read them use the service-role client', () => {
    const readers = source('supabase/functions')
      .filter((file) => directRead.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(ROOT, ''))
      .sort();
    expect(readers).toEqual([
      'supabase/functions/create-checkout-session/index.ts',
      'supabase/functions/stripe-recovery/index.ts',
      'supabase/functions/stripe-webhook/dispatch.ts',
    ]);
    // The recovery worker reads the ledger to repair it, and only ever through
    // the service-role client it builds after authorising its caller.
    const recovery = read('supabase/functions/stripe-recovery/index.ts');
    expect(recovery).toMatch(/const serviceRoleKey = Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    expect(recovery).toMatch(/const admin = createClient\(supabaseUrl, serviceRoleKey/);
    for (const call of recovery.matchAll(/(\w+)\s*\.from\(\s*'(\w+)'\s*\)/g)) {
      if ((TABLES as readonly string[]).includes(call[2]!)) expect(call[1]).toBe('admin');
    }
    expect(recovery.indexOf('secretEquals(presented, serviceRoleKey)')).toBeLessThan(
      recovery.indexOf('createClient('),
    );
    const checkout = read('supabase/functions/create-checkout-session/index.ts');
    expect(checkout).toMatch(/const admin = createClient\([\s\S]{0,200}?SUPABASE_SERVICE_ROLE_KEY/);
    for (const call of checkout.matchAll(/(\w+)\s*\.from\(\s*'(\w+)'\s*\)/g)) {
      if ((TABLES as readonly string[]).includes(call[2]!)) expect(call[1]).toBe('admin');
    }
    // dispatch.ts builds no client of its own; index.ts hands it the service-role one.
    expect(read('supabase/functions/stripe-webhook/dispatch.ts')).not.toContain('createClient(');
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(webhook).toMatch(/const admin = createClient\([\s\S]{0,200}?SUPABASE_SERVICE_ROLE_KEY/);
    expect(webhook).toContain('db: admin');
  });

  it('every function that reads them and that a client role can call is SECURITY DEFINER', () => {
    const latest = new Map<string, { header: string; body: string }>();
    // Supabase's default privileges let anon and authenticated execute every
    // new function, so a function counts as callable until it is revoked.
    const callable = new Map<string, boolean>();
    for (const { sql } of allSql) {
      for (const match of sql.matchAll(
        /create (?:or replace )?function\s+public\.(\w+)\s*\([^]*?\)\s*(returns[^]*?)\bas\s+(\$\w*\$)([^]*?)\3/gi,
      )) {
        latest.set(match[1]!, { header: match[2]!, body: match[4]! });
        if (!callable.has(match[1]!)) callable.set(match[1]!, true);
      }
      for (const match of sql.matchAll(/\b(grant|revoke)\s+[^;]*?on function public\.(\w+)[^;]*?(?:to|from)\s+([^;]*);/gi)) {
        if (/\b(?:anon|authenticated|public)\b/.test(match[3]!)) {
          const granted = match[1]!.toLowerCase() === 'grant';
          // A revoke counts when it covers authenticated, the role the app calls with.
          if (granted || /\bauthenticated\b/.test(match[3]!)) callable.set(match[2]!, granted);
        }
      }
    }
    const invokerReaders = [...latest]
      .filter(([, fn]) => TABLE_REF.test(fn.body))
      .filter(([name]) => callable.get(name) !== false)
      .filter(([, fn]) => !/security definer/i.test(fn.header))
      .map(([name]) => name);
    expect(invokerReaders).toEqual([]);
  });

  it('a policy elsewhere that reads one of them only reads a table authenticated keeps', () => {
    const outside: string[] = [];
    for (const { sql } of allSql) {
      for (const policy of sql.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)([^;]*);/gi)) {
        if ((TABLES as readonly string[]).includes(policy[2]!)) continue;
        for (const table of TABLES) {
          if (new RegExp(`\\b${table}\\b`).test(policy[3]!)) {
            outside.push(`${policy[2]}.${policy[1]} -> ${table}`);
            expect(REGRANTED as readonly string[]).toContain(table);
          }
        }
      }
    }
    // Known today: partner_payout_items' own-row policy looks up partner_payouts.
    expect(outside).toContain('partner_payout_items.partner_payout_items_select_own -> partner_payouts');
  });
});
