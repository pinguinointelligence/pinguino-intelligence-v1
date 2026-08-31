/**
 * AUDIT ACTOR TYPE CONTRACT.
 *
 * `audit_log_actor_type_check` allows exactly four values:
 *
 *     system · admin · user · webhook
 *
 * A migration that passes anything else does not fail at apply time — the
 * function body is only parsed, not executed — so the break surfaces the first
 * time a real customer performs the action.
 *
 * That is exactly what happened. `20260831201000`, applied as registered
 * version 20260831154203, passed `'customer'` from
 * `gellatti_submit_partner_application_v1`, and every partner application
 * submission on staging began failing on the audit write. Both branches were
 * affected — new submission and resubmit — because both call the helper with
 * the same wrong literal. The original `20260829190000` had it right with
 * `'user'`; the regression was introduced by this workstream.
 *
 * The apply is green, the constraint is green, and the feature is broken. Only
 * a live probe or this contract finds it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations');
const WORKSTREAM = /^202608312\d{5}_/;

/** The CHECK constraint's set, read from the live database on 2026-08-31. */
const LEGAL_ACTOR_TYPES = ['system', 'admin', 'user', 'webhook'] as const;

/**
 * `gellatti_write_audit_v1(action, entity_type, entity_id, payload, note,
 *                          correlation_id, actor_type, actor_id)`
 * — actor_type is the 7th argument, i.e. the second-to-last.
 */
function auditActorTypes(sql: string): readonly { call: string; actorType: string }[] {
  const found: { call: string; actorType: string }[] = [];
  const code = sql.replace(/--.*$/gm, '');
  for (const m of code.matchAll(/gellatti_write_audit_v1\s*\(([\s\S]*?)\)\s*;/g)) {
    const call = m[0];
    // the last two quoted-or-expression args; actor_type is the literal one
    const literals = [...call.matchAll(/'([a-z_]+)'\s*,\s*[^,()]*?::text\s*\)/g)];
    for (const lit of literals) found.push({ call, actorType: lit[1] });
  }
  return found;
}

describe('audit actor_type stays inside the CHECK constraint', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => WORKSTREAM.test(f)).sort();

  const calls = files.flatMap((file) => {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    return auditActorTypes(sql).map((c) => ({ file, ...c }));
  });

  it('finds the audit calls it is meant to police', () => {
    // A silent zero would make this suite pass while proving nothing.
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * 20260831201000 is APPLIED and therefore cannot be edited — that is the
   * repo/DB divergence this workstream's preflight exists to prevent. Its
   * correction is forward-only in 20260831201100.
   *
   * So the contract is not "no migration ever passes a bad actor_type"; it is
   * "a bad actor_type in APPLIED history must be superseded by a fix that
   * exists in this repository". A new migration with a bad value and no fix
   * still fails, which is the case worth catching.
   */
  const SUPERSEDED = new Map([
    ['20260831201000_partner_application_more_information.sql', '20260831201100_partner_application_audit_actor_fix.sql'],
  ]);

  it.each(calls.map((c) => [c.file, c.actorType] as const))(
    '%s passes a legal actor_type, not %s',
    (file, actorType) => {
      if (LEGAL_ACTOR_TYPES.includes(actorType as (typeof LEGAL_ACTOR_TYPES)[number])) return;
      const fix = SUPERSEDED.get(file);
      expect(fix, `${file} passes '${actorType}' with no superseding fix`).toBeDefined();
      const fixSql = readFileSync(join(MIGRATIONS, fix as string), 'utf8').replace(/--.*$/gm, '');
      // the fix must re-declare the same function with a legal value
      expect(fixSql).toMatch(/create or replace function public\.gellatti_submit_partner_application_v1/);
      expect(fixSql).not.toContain(`'${actorType}'`);
    },
  );

  it('names the regression so it is not reintroduced', () => {
    const fix = readFileSync(
      join(MIGRATIONS, '20260831201100_partner_application_audit_actor_fix.sql'),
      'utf8',
    );
    const code = fix.replace(/--.*$/gm, '');
    // The fix must pass 'user' twice — new submission and resubmit — and never
    // reintroduce 'customer'.
    expect([...code.matchAll(/'user',\s*v_user::text/g)]).toHaveLength(2);
    expect(code).not.toContain("'customer'");
  });
});
