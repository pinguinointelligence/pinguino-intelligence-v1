/// <reference types="node" />
/**
 * D-CODE-08 — the code-availability RPC answers only about the caller's own
 * partner.
 *
 * READY / WAITING OWNER DB APPROVAL: staging and production share one database,
 * and the owner decided on 2026-09-10 to tighten the RPC but not to apply it
 * yet. There is no isolated Postgres in this environment, so the proof is two
 * parts: contract tests over the migration text, and the chain that shows a
 * legitimate Partner check still passes the guard.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VERSION = '20260910210000_partner_code_claim_refusal_owner_check';
const NAME = 'gellatti_partner_code_claim_refusal_v1';
const root = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const MIGRATION = root(`supabase/migrations/${VERSION}.sql`);
const ROLLBACK = root(`supabase/rollbacks/${VERSION}.rollback.sql`);
const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILES = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const sqlOf = (file: string) => readFileSync(new URL(file, MIGRATIONS), 'utf8');

/** A function definition in `sql`, dollar-quote aware, including its closing `;`. */
const definitionIn = (sql: string, name: string): string | undefined => {
  const start = sql.lastIndexOf(`create or replace function public.${name}(`);
  if (start < 0) return undefined;
  const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
  if (!tag) return undefined;
  const open = sql.indexOf(tag, start) + tag.length;
  return sql.slice(start, sql.indexOf(tag, open) + tag.length + 1);
};

/** The latest definition in any migration other than this one. */
const latestBefore = (name: string): string => {
  let found: string | undefined;
  for (const file of FILES) {
    if (file.startsWith(VERSION)) continue;
    found = definitionIn(sqlOf(file), name) ?? found;
  }
  if (!found) throw new Error(`no earlier migration defines ${name}`);
  return found;
};

const PREVIOUS = latestBefore(NAME);
const NEXT = definitionIn(MIGRATION, NAME) ?? '';

const bodyOf = (fn: string) => {
  const tag = /as (\$[a-z]*\$)/.exec(fn)?.[1] ?? '$$';
  return fn.slice(fn.indexOf(tag) + tag.length, fn.lastIndexOf(tag));
};
const normalisedMd5 = (text: string) =>
  createHash('md5')
    .update(text.replace(/--[^\n]*/g, '').replace(/\s+/g, ' '))
    .digest('hex');
const returned = (fn: string) =>
  [...new Set([...fn.matchAll(/return '([a-z_]+)'/g)].map((match) => match[1] ?? ''))].sort();

const GUARD_START = NEXT.indexOf('  -- Owner check first');
const GUARD = NEXT.slice(
  GUARD_START,
  NEXT.indexOf('  end if;\n\n', GUARD_START) + '  end if;\n\n'.length,
);

describe('handed over, not applied', () => {
  it('says so, and names its rollback', () => {
    expect(MIGRATION).toContain('STATUS: READY / WAITING OWNER DB APPROVAL — production-shared DB');
    expect(MIGRATION).toContain(`ROLLBACK: supabase/rollbacks/${VERSION}.rollback.sql`);
  });

  it('is built from the live body (read-only audit 2026-09-10)', () => {
    expect(normalisedMd5(bodyOf(PREVIOUS))).toBe('069bf0ea25c699163a1cc4cf6b274280');
  });
});

describe('the guard', () => {
  it('is the first statement — nothing is looked up or answered before it', () => {
    expect(GUARD_START).toBeGreaterThan(0);
    expect(NEXT).toContain(
      `begin\n${GUARD}  if length(v_code) < 5 then return 'too_short'; end if;`,
    );
  });

  it("asks exactly one thing: is this partner row the caller's own", () => {
    expect(GUARD).toContain('if auth.uid() is not null and not exists (');
    expect(GUARD).toContain('where p.id = p_partner_id and p.user_id = auth.uid()');
  });

  it('refuses with a privilege error, never with a new answer', () => {
    expect(GUARD).toContain(
      "raise exception 'partner_ownership_required' using errcode = '42501';",
    );
    // The Codes form's copy is pinned to this vocabulary (codeAvailability.test.ts).
    expect(returned(NEXT)).toEqual(returned(PREVIOUS));
  });

  it('nothing else changes: without the guard it is the live definition exactly', () => {
    expect(NEXT.replace(GUARD, '')).toBe(PREVIOUS);
  });

  it('the grants are restated unchanged, and nothing else is in the file', () => {
    const outside = MIGRATION.replace(NEXT, '')
      .replace(/--[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(outside).toBe(
      `revoke all on function public.${NAME}(uuid, text) from public, anon; grant execute on function public.${NAME}(uuid, text) to authenticated;`,
    );
  });
});

describe('a legitimate Partner check still passes the guard', () => {
  it('every partner row has exactly one owner', () => {
    const partners = FILES.map(sqlOf).find((sql) =>
      sql.includes('create table if not exists public.partners ('),
    );
    expect(partners).toBeDefined();
    expect(partners).toContain('user_id uuid not null unique references auth.users (id)');
  });

  it("the workspace hands the form the caller's own partner", () => {
    expect(latestBefore('gellatti_partner_workspace_v1')).toContain(
      'select * into v_partner from public.partners where user_id=auth.uid();',
    );
  });

  it('the only client caller passes that id', () => {
    expect(src('services/partner.ts')).toContain("rpc('gellatti_partner_code_claim_refusal_v1'");
    expect(src('features/affiliate/codeAvailability.ts')).toContain(
      'checkPartnerCodeAvailability(partnerId ?? ',
    );
    expect(src('pages/community/PartnerPage.tsx')).toContain(
      'useCodeAvailability(data.partner?.id, code)',
    );
  });

  it('no SQL calls it on anyone’s behalf — every mention is its own definition or grant', () => {
    const needle = `${NAME}(`;
    for (const file of FILES) {
      const sql = sqlOf(file).replace(/--[^\n]*/g, '');
      for (let at = sql.indexOf(needle); at >= 0; at = sql.indexOf(needle, at + 1)) {
        expect(sql.slice(Math.max(0, at - 'function public.'.length), at), file).toBe(
          'function public.',
        );
      }
    }
  });
});

describe('the rollback', () => {
  it('restores the live definition verbatim with its grants, in one transaction', () => {
    expect(ROLLBACK).toContain(PREVIOUS);
    expect(ROLLBACK).toContain(
      `grant execute on function public.${NAME}(uuid, text) to authenticated;`,
    );
    expect(ROLLBACK).toMatch(/\nbegin;\n[\s\S]*\ncommit;\n$/);
    expect(ROLLBACK).not.toMatch(/\bdrop\b/i);
  });
});
