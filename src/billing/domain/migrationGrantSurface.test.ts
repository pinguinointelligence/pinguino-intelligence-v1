/**
 * GRANT SURFACE CONTRACT — every new public table this workstream creates must
 * explicitly revoke the grants it inherits.
 *
 * WHY THIS EXISTS. The Supabase project carries ALTER DEFAULT PRIVILEGES on
 * schema `public`, set by both `postgres` and `supabase_admin`, granting
 * `arwdDxtm` (ALL) on every NEW table to `anon`, `authenticated` and
 * `service_role`. Verified live against staging:
 *
 *   partner_rate_profiles -> anon=arwdDxtm, authenticated=arwdDxtm
 *   commission_entries, commission_rules, partners, partner_codes,
 *   partner_tier_snapshots -> identical
 *
 * The consequence is counter-intuitive and is exactly what this contract
 * guards: **writing no GRANT does not produce a table with no grants.** A
 * migration that carefully omits insert/update/delete still ships a table any
 * signed-in user can write, because the privilege arrives from the default ACL
 * rather than from the migration.
 *
 * `20260831200500_partner_rate_profiles.sql` made that mistake with a comment
 * directly above it asserting the opposite ("Intentionally NO insert/update/
 * delete grants"). It was caught by probing live privileges after the apply,
 * not by reading the file — a reviewer reading the SQL would agree with the
 * comment.
 *
 * RLS contained it, and continues to. This contract is defence in depth: RLS
 * should be the second barrier on a money table, not the only one.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations');

/** Migrations owned by this workstream. */
const WORKSTREAM = /^202608312(0|1|2|3)\d{4}_/;

/**
 * Already applied to staging, so it CANNOT carry the revoke: editing an applied
 * migration is the repo/DB divergence this workstream's preflight exists to
 * prevent. Its correction is forward-only, in
 * 20260831200600_partner_rate_profiles_grant_surface.sql, which the last test
 * in this file asserts exists and is correct.
 */
const CORRECTED_FORWARD = new Set(['partner_rate_profiles']);

interface Created {
  readonly file: string;
  readonly table: string;
  readonly sql: string;
}

function createdTables(): readonly Created[] {
  const out: Created[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => WORKSTREAM.test(f)).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const bodyOnly = sql.replace(/--.*$/gm, '');
    for (const m of bodyOnly.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)) {
      out.push({ file, table: m[1], sql: bodyOnly });
    }
  }
  return out;
}

describe('inherited grant surface', () => {
  const created = createdTables();

  it('finds the tables this workstream creates', () => {
    // A silent zero here would make every assertion below vacuous.
    expect(created.length).toBeGreaterThanOrEqual(7);
  });

  it.each(
    created
      .filter((c) => !CORRECTED_FORWARD.has(c.table))
      .map((c) => [c.file, c.table, c.sql] as const),
  )(
    '%s: revokes the default-privilege grants on %s',
    (_file, table, sql) => {
      const revoke = new RegExp(
        `revoke all on public\\.${table} from [^;]*anon[^;]*authenticated`,
      );
      expect(sql).toMatch(revoke);
    },
  );

  it.each(created.map((c) => [c.file, c.table, c.sql] as const))(
    '%s: never grants a write on %s to anon or authenticated',
    (_file, table, sql) => {
      for (const m of sql.matchAll(
        new RegExp(`grant ([a-z, ]+) on public\\.${table} to ([a-z_, ]+)`, 'g'),
      )) {
        const privileges = m[1];
        const grantees = m[2];
        if (!/anon|authenticated/.test(grantees)) continue;
        expect(privileges, `${table} -> ${grantees}`).not.toMatch(
          /insert|update|delete|truncate|all/,
        );
      }
    },
  );

  it('enables RLS on every table it creates, so the revoke is not the only barrier', () => {
    for (const { table, sql } of created) {
      expect(sql, table).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      );
    }
  });

  it('records that the already-applied table is corrected by a forward migration', () => {
    // 20260831200500 is applied and must not be edited; the fix is forward-only.
    const applied = readFileSync(
      join(MIGRATIONS, '20260831200500_partner_rate_profiles.sql'),
      'utf8',
    );
    expect(applied).not.toMatch(/revoke all on public\.partner_rate_profiles/);

    const fix = readFileSync(
      join(MIGRATIONS, '20260831200600_partner_rate_profiles_grant_surface.sql'),
      'utf8',
    );
    expect(fix).toMatch(/revoke all on public\.partner_rate_profiles from anon, authenticated/);
    // Least privilege by PROVEN need, not by guess: the only consumer is
    // stripe-webhook/dispatch.ts on service_role, through the SECURITY DEFINER
    // resolver, which needs no table grant. Nothing in src/ reads this table.
    // So the fix grants NOTHING back, and 200500's speculative
    // `grant select ... to authenticated` is removed rather than re-issued.
    expect(fix.replace(/--.*$/gm, '')).not.toMatch(/grant[^;]*on public\.partner_rate_profiles/);
    // It must not quietly widen the pre-existing money tables.
    for (const other of ['commission_entries', 'commission_rules', 'partners', 'partner_codes']) {
      expect(fix.replace(/--.*$/gm, ''), other).not.toMatch(
        new RegExp(`(revoke|grant)[^;]*public\\.${other}`),
      );
    }
  });
});
