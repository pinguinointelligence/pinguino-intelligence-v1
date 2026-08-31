/**
 * AUDIT ACTOR TYPE CONTRACT.
 *
 * `audit_log.actor_type` carries a CHECK constraint. A migration that passes a
 * value outside it does NOT fail at apply time — a function body is parsed, not
 * executed — so the break surfaces the first time a real customer performs the
 * action. The apply is green, the constraint is green, and the feature is dead.
 *
 * That is exactly what happened. `20260831201000`, applied as registered
 * version `20260831154203`, passed `'customer'` from
 * `gellatti_submit_partner_application_v1`, and every partner application
 * submission on staging began failing on the audit write — both branches, new
 * submission and resubmit. The original `20260829190000` had `'user'` and was
 * correct, so the regression belonged to this workstream.
 * `20260831201100` is the forward-only correction.
 *
 * TWO RULES THIS FILE FOLLOWS, both learned from that incident:
 *
 *  1. The legal set is PARSED from the migration that declares the constraint,
 *     never retyped here. If the constraint ever gains or loses a value, this
 *     contract follows it instead of asserting a stale list.
 *
 *  2. It resolves the LATEST definition of each function — the last migration
 *     in version order that declares it — rather than scanning every historical
 *     file. Applied history is append-only and still contains the superseded
 *     `'customer'`; grepping all files naively would either fail forever or
 *     force an exemption list that hides real regressions.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations');

const ALL_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .sort(); // filename version order == declaration order

/** Rule 1: the canonical set, parsed from the migration that declares it. */
function legalActorTypes(): readonly string[] {
  for (const file of ALL_MIGRATIONS) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '');
    const m = /check\s*\(\s*actor_type\s+in\s*\(([^)]*)\)/i.exec(sql);
    if (m) return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  return [];
}

const LEGAL = legalActorTypes();

/** Rule 2: the last declaration of a function wins, exactly as Postgres sees it. */
function latestDefinition(fn: string): { file: string; body: string } | null {
  let latest: { file: string; body: string } | null = null;
  for (const file of ALL_MIGRATIONS) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const re = new RegExp(`create or replace function public\\.${fn}\\b[\\s\\S]*?\\n\\$\\$;`, 'g');
    const hits = [...sql.matchAll(re)];
    if (hits.length > 0) latest = { file, body: hits[hits.length - 1][0] };
  }
  return latest;
}

/** actor_type is the 7th of eight arguments to the audit helper. */
function actorTypesIn(body: string): readonly string[] {
  const code = body.replace(/--.*$/gm, '');
  const found: string[] = [];
  for (const call of code.matchAll(/gellatti_write_audit_v1\s*\(([\s\S]*?)\)\s*;/g)) {
    for (const lit of call[0].matchAll(/'([a-z_]+)'\s*,\s*[^,()]*?::text\s*\)/g)) found.push(lit[1]);
  }
  return found;
}

/** Every function in the partner application lane that writes an audit row. */
const APPLICATION_LANE = [
  'gellatti_submit_partner_application_v1',
  'gellatti_admin_partner_application_action_v1',
] as const;

describe('audit actor_type stays inside the CHECK constraint', () => {
  it('parses the canonical set rather than hardcoding it', () => {
    expect(LEGAL).toEqual(['system', 'admin', 'user', 'webhook']);
  });

  for (const fn of APPLICATION_LANE) {
    it(`${fn} resolves to a latest definition`, () => {
      expect(latestDefinition(fn), `${fn} not declared by any migration`).not.toBeNull();
    });

    it(`${fn}'s LATEST definition writes only legal actor types`, () => {
      const latest = latestDefinition(fn);
      expect(latest).not.toBeNull();
      const actors = actorTypesIn((latest as { body: string }).body);
      // A silent zero would make the assertion vacuous.
      expect(actors.length, `${fn} writes no audit row`).toBeGreaterThan(0);
      for (const actor of actors) {
        expect(LEGAL, `${fn} (latest: ${(latest as { file: string }).file}) writes '${actor}'`).toContain(
          actor,
        );
      }
    });
  }

  it('the submit function is now resolved from the fix, not the regression', () => {
    const latest = latestDefinition('gellatti_submit_partner_application_v1');
    expect(latest?.file).toBe('20260831201100_partner_application_audit_actor_fix.sql');
    expect(actorTypesIn(latest?.body ?? '')).toEqual(['user', 'user']);
  });

  it('applied history is left intact and still carries the superseded value', () => {
    // Proof that the "latest wins" resolution is doing real work rather than
    // passing because the bad value was edited away. 20260831201000 is applied
    // and must never be rewritten.
    const applied = readFileSync(
      join(MIGRATIONS, '20260831201000_partner_application_more_information.sql'),
      'utf8',
    );
    expect(applied).toContain("'customer'");
  });
});
