/// <reference types="node" />
/**
 * J-REF-17, package 6 — a referrer cannot read the referred person's identifiers.
 *
 * A contract over a migration that is READY but NOT APPLIED. Staging and
 * production share one database, so the owner applies it. These tests are what
 * make it safe to hand over:
 *   - it revokes exactly one privilege on exactly two tables, and nothing else;
 *   - nothing the app runs loses access, because every reader of those tables
 *     that a signed-in user can reach is SECURITY DEFINER;
 *   - the rollback restores exactly the grant that is live today.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname;
const VERSION = '20260917120000_referral_tables_revoke_direct_read';
const TABLES = ['referral_rewards', 'user_referral_attributions'] as const;
const TABLE_REF = /\b(?:referral_rewards|user_referral_attributions)\b/;

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
/** Executable statements only: comments removed, whitespace collapsed. */
const statements = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const MIGRATION = read(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK = read(`supabase/rollbacks/${VERSION}.rollback.sql`);
const ORIGIN = read('supabase/migrations/20260902100000_refer_a_friend_pro_bonus.sql');

const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();

describe('the change', () => {
  it('revokes only the direct SELECT of authenticated, on the two relationship tables', () => {
    expect(statements(MIGRATION)).toEqual(
      TABLES.map((table) => `revoke select on public.${table} from authenticated`),
    );
  });

  it('reads, writes and deletes no data, and drops no policy', () => {
    const executable = statements(MIGRATION).join(';');
    expect(executable).not.toMatch(/\b(?:insert|update|delete|truncate|alter|drop|create|grant)\b/i);
  });

  it('the rollback restores exactly the grant the original migration made', () => {
    const restored = TABLES.map((table) => `grant select on public.${table} to authenticated`);
    expect(statements(ROLLBACK)).toEqual(restored);
    for (const grant of restored) expect(statements(ORIGIN)).toContain(grant);
  });

  it('leaves the own-row policies in place', () => {
    for (const policy of ['referral_rewards_select_own', 'user_referral_attributions_select_own']) {
      expect(ORIGIN).toContain(`create policy ${policy}`);
      expect(MIGRATION).not.toContain(policy);
    }
  });
});

describe('nothing the app runs loses access', () => {
  /** The latest definition of every function, in migration order. */
  const latest = new Map<string, { header: string; body: string }>();
  /** Whether `authenticated` may execute a function, replayed in migration order. */
  const executable = new Map<string, boolean>();
  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of sql.matchAll(
      /create (?:or replace )?function\s+public\.(\w+)\s*\([^]*?\)\s*(returns[^]*?)\bas\s+(\$\w*\$)([^]*?)\3/gi,
    )) {
      latest.set(match[1]!, { header: match[2]!, body: match[4]! });
    }
    for (const match of sql.matchAll(/\b(grant|revoke)\s+[^;]*?on function public\.(\w+)[^;]*?(?:to|from)\s+([^;]*);/gi)) {
      if (/\bauthenticated\b/.test(match[3]!)) {
        executable.set(match[2]!, match[1]!.toLowerCase() === 'grant');
      }
    }
  }

  it('every reader a signed-in user can call is SECURITY DEFINER', () => {
    const readers = [...latest].filter(([, fn]) => TABLE_REF.test(fn.body));
    expect(readers.map(([name]) => name)).toEqual(
      expect.arrayContaining(['gellatti_my_referral_dashboard_v1', 'gellatti_claim_referral_code_v1']),
    );
    const invokerReachable = readers
      .filter(([name]) => executable.get(name) === true)
      .filter(([, fn]) => !/security definer/i.test(fn.header))
      .map(([name]) => name);
    expect(invokerReachable).toEqual([]);
  });

  it('no view and no policy on another table reads them', () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
      for (const view of sql.matchAll(/create (?:or replace )?(?:materialized )?view\s+[^;]*;/gi)) {
        expect(view[0], file).not.toMatch(TABLE_REF);
      }
      for (const policy of sql.matchAll(/create policy\s+\w+\s+on\s+public\.(\w+)[^;]*;/gi)) {
        if ((TABLES as readonly string[]).includes(policy[1]!)) continue;
        expect(policy[0], file).not.toMatch(TABLE_REF);
      }
    }
  });

  it('no client code and no edge function reads the tables directly', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const direct = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions'))]
      .filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /from\(\s*['"`](?:referral_rewards|user_referral_attributions)['"`]\s*\)|\/rest\/v1\/(?:referral_rewards|user_referral_attributions)/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => file.replace(ROOT, ''));
    expect(direct).toEqual([]);
  });
});
