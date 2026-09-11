/// <reference types="node" />
/**
 * D-CODE-07 — an administrator can disable a compromised code or alias.
 *
 * It was already built, end to end; the checklist row still said "surface in
 * admin UI". The admin list shows every code a partner ever held — aliases
 * included, because it filters on nothing but the partner — and each one has a
 * Wyłącz / Włącz button. The RPC behind it is Partner-admin only, refuses
 * without a reason, records who disabled what and why, and writes an audit row.
 * Verified read-only on 2026-09-10: live definition = repo (normalised md5
 * 64af49ae4a275d0c399fa52ca66e4229).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const flat = (text: string) => text.replace(/\s+/g, ' ');

const SECTION = flat(read('./AdminPartnersSection.tsx'));
const SERVICE = flat(read('../../services/adminControl.ts'));

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const sqlOf = (file: string) => readFileSync(new URL(file, MIGRATIONS), 'utf8');

const RPC = (() => {
  const opener = 'create or replace function public.gellatti_admin_partner_code_action_v1(';
  let found: string | undefined;
  for (const file of files) {
    const sql = sqlOf(file);
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    // Include the grant statements that follow the body.
    const end = sql.indexOf('to authenticated;', open);
    found = flat(sql.slice(start, end < 0 ? sql.indexOf(tag, open) + tag.length : end));
  }
  if (!found) throw new Error('no migration defines the admin code action');
  return found;
})();

describe('D-CODE-07 — the admin panel offers it for every code, aliases included', () => {
  it('each listed code has a disable / re-enable button', () => {
    expect(SECTION).toContain("kind: code.status === 'blocked' ? 'code-enable' : 'code-disable',");
    expect(SECTION).toContain("{code.status === 'blocked' ? 'Włącz' : 'Wyłącz'}");
  });

  it('the button calls the admin RPC with the operator’s reason', () => {
    expect(SECTION).toContain(
      "return setPartnerCodeStatus( input.codeId, input.kind === 'code-disable' ? 'DISABLE' : 'REACTIVATE', reason, );",
    );
    expect(SERVICE).toContain(
      "supabase.rpc('gellatti_admin_partner_code_action_v1', { p_code_id: codeId, p_action: action, p_reason: reason, });",
    );
  });

  it('the admin list includes every code of the partner — it filters on nothing else', () => {
    const lists = files
      .map((file) =>
        /'codes',coalesce\(\(select jsonb_agg\(to_jsonb\(c\) order by c\.created_at\) from public\.partner_codes c where c\.partner_id=([^)]*)\)/.exec(
          sqlOf(file),
        ),
      )
      .filter((match): match is RegExpExecArray => match !== null);
    expect(lists.length).toBeGreaterThan(0);
    for (const match of lists) expect(match[1]).not.toMatch(/status/);
  });
});

describe('D-CODE-07 — the RPC is safe to hand to an operator', () => {
  it('Partner administrators only, checked first', () => {
    expect(RPC).toContain("if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then");
    expect(RPC.indexOf('gellatti_admin_has_permission_v1')).toBeLessThan(
      RPC.indexOf('update public.'),
    );
  });

  it('refuses without a reason', () => {
    expect(RPC).toContain(
      "if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;",
    );
  });

  it('disabling records the state, the reason, who and when', () => {
    expect(RPC).toContain(
      "update public.partner_codes set status='blocked',disabled_reason=p_reason, disabled_by_admin_user_id=v_admin,disabled_at=statement_timestamp() where id=p_code_id;",
    );
  });

  it('every action writes an audit row', () => {
    expect(RPC).toContain("'partner_code.'||lower(p_action),'partner_codes',p_code_id::text,");
  });

  it('is not executable by anonymous callers', () => {
    expect(RPC).toContain(
      'revoke all on function public.gellatti_admin_partner_code_action_v1(uuid,text,text) from public,anon;',
    );
  });
});
