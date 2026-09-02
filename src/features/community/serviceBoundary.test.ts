/// <reference types="node" />
/**
 * Post-wiring boundary guard (§16, §48, §57).
 *
 * The RLS and demo-safety rules were proven on staging BEFORE the UI existed.
 * Wiring „Użyj tej receptury", „Stwórz moją wersję" and the make trigger added
 * new client code, and the risk that introduces is not a broken policy — it is
 * a NEW PATH that goes around one. So this file asserts, over the real source,
 * that no such path was created:
 *
 *   1. only `src/services/**` may touch the Supabase client at all;
 *   2. every formulation read goes through an entitlement-gated RPC — the
 *      client never selects `recipe_versions` or `recipe_input` itself;
 *   3. the client never writes a counter, a lineage row, an attribution or a
 *      make — those are RPC-only;
 *   4. nothing client-side sends a partner id, a publication id for a make, or
 *      an entitlement claim.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const rel = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, '/');
const ALL = walk(SRC).map((file) => ({ file: rel(file), text: readFileSync(file, 'utf8') }));

/** Community feature + page sources (not tests). */
const FEATURE = ALL.filter(
  ({ file }) =>
    (file.startsWith('features/community/') || file.startsWith('pages/community/')) &&
    !file.includes('.test.'),
);

const SERVICE = ALL.find(({ file }) => file === 'services/community.ts')!;

describe('1 — only the service layer talks to Supabase', () => {
  it('no Community feature or page imports the Supabase client', () => {
    expect(FEATURE.length).toBeGreaterThan(10);
    for (const { file, text } of FEATURE) {
      expect(/@supabase\/supabase-js/.test(text), file).toBe(false);
      expect(/from\s+['"]@\/lib\/supabase/.test(text), file).toBe(false);
    }
  });

  it('the derivation hook reaches the database only through @/services/community', () => {
    const hook = ALL.find(({ file }) => file === 'features/community/useRecipeDerivation.ts')!;
    const imports = hook.text.match(/from\s+['"][^'"]+['"]/g) ?? [];
    const dbish = imports.filter((line) => /supabase|postgres|rpc/i.test(line));
    expect(dbish).toEqual([]);
    expect(hook.text).toContain("from '@/services/community'");
  });
});

describe('2 — every formulation read is an entitlement-gated RPC', () => {
  it('the service never selects recipe_versions or recipe_input from a table', () => {
    expect(/\.from\(\s*['"]recipe_versions['"]/.test(SERVICE.text)).toBe(false);
    expect(/\.from\(\s*['"]saved_recipes['"]/.test(SERVICE.text)).toBe(false);
    expect(/select\([^)]*recipe_input/.test(SERVICE.text)).toBe(false);
  });

  it('the only table access in the service is the three narrow owner-scoped writes', () => {
    const tables = [...SERVICE.text.matchAll(/\.from\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(
      new Set(['recipe_share_links', 'recipe_share_recipients', 'community_reports']),
    );
  });

  it('the rating WRITE has exactly one path (§42)', () => {
    // One writer only. `gellatti_my_rating_v1` is an advisory READ that tells
    // the control whether to render; it cannot create or change a rating.
    const writers = [...SERVICE.text.matchAll(/writeRpc<[^>]*>\(\s*'([a-z0-9_]+)'/g)].map(
      (match) => match[1],
    );
    expect(writers.filter((name) => name?.includes('rate'))).toEqual([
      'gellatti_rate_publication_v1',
    ]);
    expect(SERVICE.text).toContain("readRpc<MyRating>('community.myRating', 'gellatti_my_rating_v1'");
  });

  it('formulation-bearing responses come only from the three gated RPCs', () => {
    for (const rpc of [
      'gellatti_get_publication_full_v1',
      'gellatti_open_share_v1',
      'gellatti_open_received_share_v1',
    ]) {
      expect(SERVICE.text.includes(rpc), rpc).toBe(true);
    }
  });
});

describe('3 — the client never writes a count, a lineage row or an attribution', () => {
  it('no direct write to any server-owned table exists anywhere in the app', () => {
    const serverOwned = [
      'publication_metrics',
      'creator_metrics',
      'ranking_snapshots',
      'recipe_lineage',
      'recipe_usage_events',
      'recipe_make_events',
      'recipe_ratings',
      'referral_attributions',
      'referral_clicks',
      'commission_entries',
      'community_publications',
      'creator_profiles',
    ];
    for (const { file, text } of ALL) {
      if (file.includes('.test.')) continue;
      for (const table of serverOwned) {
        const pattern = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)[\\s\\S]{0,80}?\\.(insert|update|upsert|delete)\\(`);
        expect(pattern.test(text), `${file} writes ${table}`).toBe(false);
      }
    }
  });

  it('makes are recorded from the run id alone — no publication id crosses the wire', () => {
    const production = ALL.find(({ file }) => file === 'services/proCore/supabaseProduction.ts')!;
    const call = /gellatti_record_make_for_run_v1'[\s\S]{0,200}?\}\)/.exec(production.text)?.[0] ?? '';
    expect(call).toContain('p_production_run_id');
    expect(call).not.toMatch(/p_publication_id|p_user_id|p_recipe_id/);
  });
});

describe('4 — nothing client-side asserts identity, entitlement or money', () => {
  it('no Community source sends a partner id', () => {
    for (const { file, text } of [...FEATURE, SERVICE]) {
      expect(/p_partner_id|partner_id\s*:/.test(text), file).toBe(false);
    }
  });

  it('no Community source SENDS an entitlement or an amount', () => {
    // `amount_cents` legitimately appears as a READ type on the partner
    // dashboard payload. What must never happen is the client PUTTING one on
    // the wire, so the check is scoped to argument objects rather than to the
    // word appearing anywhere in the file.
    const argumentObjects = (text: string): string[] => [
      ...text.matchAll(/\.(?:rpc|insert|update|upsert)\(([\s\S]{0,400}?)\n\s*\}?\)/g),
    ].map((match) => match[1] ?? '');

    for (const { file, text } of [...FEATURE, SERVICE]) {
      for (const args of argumentObjects(text)) {
        expect(/entitlement|amount_cents|partner_id|commission/i.test(args), `${file}: ${args.slice(0, 80)}`).toBe(false);
      }
    }
  });

  it('the partner dashboard amount exists only as a read-only number type', () => {
    // Every occurrence in the client is a type annotation on a response
    // shape. Money is computed by the ledger; the client only displays it.
    const occurrences = [...SERVICE.text.matchAll(/amount_cents\s*:\s*[A-Za-z]+/g)].map(
      (match) => match[0],
    );
    expect(occurrences.length).toBeGreaterThan(0);
    for (const occurrence of occurrences) {
      expect(occurrence.replace(/\s+/g, ' '), occurrence).toBe('amount_cents: number');
    }
  });

  it('the derivation hook decides nothing about entitlement — the server answers', () => {
    const hook = ALL.find(({ file }) => file === 'features/community/useRecipeDerivation.ts')!;
    // `not_entitled` may only be produced by reading a server response, never
    // by inspecting local access state.
    expect(hook.text).not.toMatch(/useAccess|capabilitiesFor|isPro\b/);
    expect(hook.text).toContain("reason: 'not_entitled'");
  });

  it('the make trigger never fails a production run', () => {
    const production = ALL.find(({ file }) => file === 'services/proCore/supabaseProduction.ts')!;
    const helper = /async function recordCommunityMake[\s\S]*?\n\}/.exec(production.text)?.[0] ?? '';
    expect(helper).not.toBe('');
    expect(helper).toContain('try {');
    expect(helper).toContain('catch');
    expect(helper).not.toMatch(/\bthrow\b/);
  });
});
