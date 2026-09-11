/// <reference types="node" />
/**
 * D-LINK-02 — every partner link resolves to the partner id the database
 * holds, never to one the visitor's URL could supply.
 *
 * The public route carries only slugs. The resolver turns them into rows and
 * insists they belong together: the code to the profile's partner, the
 * campaign link to that partner and that code. The click it records carries
 * the ids from those rows, and the later claim copies the partner id from the
 * recorded click. At no point does a request name a partner id.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RESOLVER = readFileSync(
  new URL('../../../supabase/functions/partner-link-resolve/index.ts', import.meta.url),
  'utf8',
);

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const CLAIM = (() => {
  const opener = 'create or replace function public.gellatti_claim_partner_click_v1(';
  let found: string | undefined;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = sql.slice(start, sql.indexOf(tag, open) + tag.length);
  }
  if (!found) throw new Error('no migration defines the click claim');
  return found;
})();

describe('D-LINK-02 — the resolver derives the partner from rows, not from the request', () => {
  it('reads nothing from the request but slugs, the action and a click id', () => {
    const fields = [...new Set([...RESOLVER.matchAll(/\bbody\.([A-Za-z_]+)/g)].map((m) => m[1]))];
    expect(fields.sort()).toEqual(['action', 'clickId', 'code', 'linkSlug', 'partnerSlug']);
  });

  it('the partner is the active one the approved profile points at', () => {
    expect(RESOLVER).toContain("if (profile.moderation_status !== 'APPROVED')");
    expect(RESOLVER).toContain(
      "admin.from('partners').select('id,status').eq('id', profile.partner_id).eq('status', 'active')",
    );
  });

  it("the code must be that same partner's active code", () => {
    expect(RESOLVER).toContain(
      "admin.from('partner_codes').select('id,partner_id,status,slug').eq('partner_id', profile.partner_id)",
    );
    expect(RESOLVER).toContain(".eq('slug', codeSlug).eq('status', 'active')");
  });

  it('a campaign link must belong to that partner and that code', () => {
    expect(RESOLVER).toContain(".eq('partner_id', partner.id).eq('partner_code_id', code.id)");
    expect(RESOLVER).toContain(".eq('link_slug', linkSlug).eq('status', 'ACTIVE')");
  });

  it('the recorded click carries the ids from those rows', () => {
    expect(RESOLVER).toContain('partner_code_id: code.id, partner_id: partner.id,');
  });
});

describe('D-LINK-02 — the claim copies the partner from the recorded click', () => {
  it('only a click of an active partner can be claimed', () => {
    expect(CLAIM).toContain("join public.partners p on p.id=rc.partner_id and p.status='active'");
  });

  it('the attribution takes the partner id from the click row', () => {
    expect(CLAIM).toContain(
      "v_click.partner_id,v_click.partner_code_id,v_click.id,v_user,'referral_link','pending',",
    );
  });

  it('a partner can never claim their own click', () => {
    expect(CLAIM).toContain(
      'if exists(select 1 from public.partners p where p.id=v_click.partner_id and p.user_id=v_user) then',
    );
    expect(CLAIM).toContain("raise exception 'self_referral';");
  });
});
