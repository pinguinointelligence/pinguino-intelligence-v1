/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only Mapper status control page. Proves: DEV-only route +
 * NotFound fallback, no nav, READS for display, the ONLY write is setProductLifecycleStatus
 * (status + review audit), never sets pac/pod or PI Verified automatically, no matching, no
 * mapper_basement, no raw DB verbs, no engine.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'MapperStatusPage.tsx');
const VIEW = read(HERE, 'mapperStatusView.tsx');
const ALL = `${PAGE}\n${VIEW}`;
const ROUTER = read(SRC, 'app', 'router.tsx');

describe('MapperStatusPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers /dev/mapper-status ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/mapper-status/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/mapper-status"/.test(ROUTER)).toBe(true);
  });
});

describe('MapperStatusPage — write scope', () => {
  it('its only product write is setProductLifecycleStatus (narrow status write)', () => {
    expect(PAGE.includes("from '@/services/productStatusWrite'")).toBe(true);
    expect(PAGE.includes('setProductLifecycleStatus(')).toBe(true);
    expect(
      /matchAndSaveProduct|saveProductMatchResult|saveProductMapperReview|updateProduct\(|createProduct|importProductCatalog|runMatch/.test(ALL),
    ).toBe(false);
  });
  it('reads products + reference base, decides via the pure productStatusDecision', () => {
    expect(PAGE.includes('listMyProducts(')).toBe(true);
    expect(PAGE.includes('listEngineApprovedIngredients(')).toBe(true);
    expect(PAGE.includes("from '@/data/products/productStatusDecision'")).toBe(true);
  });
  it('PI Verified is reviewer-gated (re-decided with reviewerApproval), never auto-applied', () => {
    expect(PAGE.includes('reviewerApproval')).toBe(true); // the verify path re-decides with approval
    expect(/recommended_status === 'pi_verified'/.test(PAGE)).toBe(true); // only persisted when the policy yields it
    expect(/red.?flag/i.test(VIEW)).toBe(true); // the view shows red flags block PI Verified
  });
  it('never writes pac/pod or npac', () => {
    expect(/pac_value|pod_value|npac_value/.test(ALL)).toBe(false);
  });
});

describe('MapperStatusPage — no DB / engine / nav / auto-run', () => {
  it('no Supabase / privileged key / locked base / raw DB verbs', () => {
    expect(/supabase/i.test(ALL)).toBe(false);
    expect(/@\/lib\/supabase/.test(ALL)).toBe(false);
    expect(/service[_-]?role/i.test(ALL)).toBe(false);
    expect(/mapper_basement/i.test(ALL)).toBe(false);
    for (const v of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ALL.includes(v), v).toBe(false);
    }
  });
  it('no engine/AI/billing, no nav, no mount-time auto-run', () => {
    expect(/@\/engine/.test(ALL)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(ALL)).toBe(false);
    expect(/navConfig|NAV_ITEMS/.test(ALL)).toBe(false);
    expect(/useEffect/.test(ALL)).toBe(false);
  });
});
