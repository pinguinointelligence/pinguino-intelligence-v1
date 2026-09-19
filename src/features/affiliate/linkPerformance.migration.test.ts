/// <reference types="node" />
/**
 * D-LINK-03 — per-campaign performance.
 *
 * A contract over a migration that is READY but NOT APPLIED: staging and
 * production share one database, so the owner applies it. These tests are what
 * make it safe to hand over — they pin that the migration adds four aggregate
 * keys and changes NOTHING else, that "active" is the existing rule rather than
 * a new one, and that the rollback restores exactly what is live today.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const VERSION = '20260910200000_partner_workspace_link_performance';
const MIGRATION = read(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK = read(`supabase/rollbacks/${VERSION}.rollback.sql`);

const definition = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined here`);
  const close = sql.indexOf('$$;', sql.indexOf('$$', start) + 2);
  return sql.slice(start, close + 3);
};

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/**
 * The latest definition of a function in any migration other than this one.
 * Found by CONTENT, not filename: several applied migrations are still due to
 * be renamed to the version they were recorded under, and a rename must not
 * quietly point this contract at nothing.
 */
const latestDefinition = (name: string): string => {
  const opener = `create or replace function public.${name}(`;
  let found: string | undefined;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql') || file.startsWith(VERSION)) continue;
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    if (sql.includes(opener)) found = definition(sql, name);
  }
  if (!found) throw new Error(`no migration defines ${name}`);
  return found;
};

const md5 = (text: string) => createHash('md5').update(text).digest('hex');
const bodyOf = (fn: string) => fn.slice(fn.indexOf('$$') + 2, fn.lastIndexOf('$$;'));
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

const liveWorkspace = latestDefinition('gellatti_partner_workspace_v1');
const nextWorkspace = definition(MIGRATION, 'gellatti_partner_workspace_v1');
const v1 = latestDefinition('gellatti_partner_active_referred_count_v1');
const v2 = definition(MIGRATION, 'gellatti_partner_active_referred_count_v2');

const CODE_ADDITION =
  "      'activeSubscriptions',public.gellatti_partner_active_referred_count_v2(v_partner.id,now(),c.id,null),\n";
const LINK_CLICKS_END =
  "        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text";
const LINK_ADDITION = [
  "      'signups',(select count(*) from public.referral_attributions ra",
  '        join public.referral_clicks rc on rc.id=ra.click_id',
  `${LINK_CLICKS_END}),`,
  "      'paidCustomers',(select count(distinct ra.user_id) from public.referral_attributions ra",
  '        join public.referral_clicks rc on rc.id=ra.click_id',
  LINK_CLICKS_END,
  "          and ra.status='active'),",
  "      'activeSubscriptions',public.gellatti_partner_active_referred_count_v2(v_partner.id,now(),null,l.id)",
  '',
].join('\n');
const NARROWING = [
  '    -- D-LINK-03: narrow to one code or to one campaign link. null narrows',
  '    -- nothing, so (partner, at, null, null) counts exactly what v1 counts.',
  '    and (p_partner_code_id is null or ra.partner_code_id = p_partner_code_id)',
  '    and (p_content_link_id is null or exists (',
  '      select 1 from public.referral_clicks rc',
  '      where rc.id = ra.click_id',
  "        and rc.context->>'contentLinkId' = p_content_link_id::text",
  '    ))',
  '',
].join('\n');

describe('built on exactly what is live (read-only audit, 2026-09-10)', () => {
  // If either of these moves, the migration was generated from something that
  // is no longer the live definition — regenerate it, do not hand-edit.
  it('the workspace function the migration replaces is the live one, byte for byte', () => {
    expect(md5(bodyOf(liveWorkspace))).toBe('7e6742486c1385f3dedacbd21c13d06f');
  });

  it('v1 is the live rule (live prosrc carries no comments, so compare without them)', () => {
    expect(md5(withoutComments(bodyOf(v1)))).toBe('27f9bc2c4bb9d0a00ac628b2070ed088');
  });
});

describe('D-LINK-03 migration is handed over, not applied', () => {
  it('says so in its header and names its rollback', () => {
    expect(MIGRATION).toContain('STATUS: READY / NOT APPLIED — production-shared DB');
    expect(MIGRATION).toContain(`ROLLBACK: supabase/rollbacks/${VERSION}.rollback.sql`);
  });

  it('contains nothing but the two functions, one revoke and one grant', () => {
    const outside = MIGRATION.replace(v2, '')
      .replace(nextWorkspace, '')
      .replace(/--[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(outside).toBe(
      'revoke all on function public.gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid) from public, anon, authenticated; ' +
        'grant execute on function public.gellatti_partner_workspace_v1() to authenticated;',
    );
  });
});

describe('the workspace changes by four aggregate keys and nothing else', () => {
  it('is the live definition once the additions are taken out again', () => {
    const reverted = nextWorkspace
      .replace(CODE_ADDITION, '')
      .replace(`${LINK_CLICKS_END}),\n${LINK_ADDITION}`, `${LINK_CLICKS_END})\n`);
    expect(nextWorkspace).not.toBe(liveWorkspace);
    expect(reverted).toBe(liveWorkspace);
  });

  it('adds only counts, never anything that identifies a customer (D-LINK-04)', () => {
    const added = `${CODE_ADDITION}${LINK_ADDITION}`;
    const keys = [...added.matchAll(/^ {6}'([A-Za-z]+)',/gm)].map((match) => match[1]);
    expect([...new Set(keys)].sort()).toEqual(['activeSubscriptions', 'paidCustomers', 'signups']);
    for (const match of added.matchAll(/^ {6}'[A-Za-z]+',(.*)$/gm)) {
      expect(match[1], 'every added value is a count').toMatch(
        /^\(select count\(|^public\.gellatti_partner_active_referred_count_v2\(/,
      );
    }
  });

  it('a link counts only the attributions whose click came through it', () => {
    expect(LINK_ADDITION.match(/rc\.id=ra\.click_id/g)).toHaveLength(2);
    // The same key the link's clickCount has always used — one notion of "this link".
    expect(liveWorkspace).toContain(`${LINK_CLICKS_END})`);
  });
});

describe('"active" is the existing rule, not a new one', () => {
  it('v2 is v1 plus the narrowing — the rest of the body is identical', () => {
    const v1Body = v1.slice(v1.indexOf('$$'));
    const v2Body = v2.slice(v2.indexOf('$$'));
    expect(v2Body).toContain(NARROWING);
    expect(v2Body.replace(NARROWING, '')).toBe(v1Body);
  });

  it('same language, volatility, security and search_path as v1', () => {
    const attributes = (fn: string) => fn.slice(fn.indexOf(') returns'), fn.indexOf('$$'));
    expect(attributes(v2)).toBe(attributes(v1));
  });

  it('null narrows nothing, so v2(partner, at, null, null) is v1', () => {
    expect(NARROWING).toContain('p_partner_code_id is null or');
    expect(NARROWING).toContain('p_content_link_id is null or');
  });

  it('v1 is not redefined — its callers keep exactly the rule they have', () => {
    expect(MIGRATION).not.toMatch(/function public\.gellatti_partner_active_referred_count_v1\(/);
  });

  it('v2 is not callable by clients, like v1', () => {
    expect(MIGRATION).toContain(
      'revoke all on function public.gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid)\n  from public, anon, authenticated;',
    );
  });
});

describe('the rollback', () => {
  it('restores the live workspace definition verbatim, then drops v2', () => {
    const restore = ROLLBACK.indexOf(liveWorkspace);
    const drop = ROLLBACK.indexOf(
      'drop function if exists public.gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid);',
    );
    expect(restore).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(restore);
  });

  it('touches nothing else', () => {
    expect(ROLLBACK).not.toMatch(/drop function[^;]*_v1\b/);
    expect(ROLLBACK.match(/create or replace function/g)).toHaveLength(1);
  });
});
