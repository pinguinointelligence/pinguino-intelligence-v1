/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only Product Intelligence preview page. Proves: DEV-only
 * route + NotFound fallback, no nav, READS only (listMyProducts + listEngineApprovedIngredients),
 * runs the PURE simulation, and PERSISTS NOTHING — no write verb, no mapper_basement, no pac/pod
 * or status write, no engine/AI/billing.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'ProductIntelligencePreviewPage.tsx');
const ROUTER = read(SRC, 'app', 'router.tsx');

describe('ProductIntelligencePreviewPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers /dev/product-intelligence-preview ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/product-intelligence-preview/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/product-intelligence-preview"/.test(ROUTER)).toBe(true);
  });
});

describe('ProductIntelligencePreviewPage — reads only, persists nothing', () => {
  it('reads via the two read services and runs the pure simulation', () => {
    expect(PAGE.includes('listMyProducts(')).toBe(true);
    expect(PAGE.includes('listEngineApprovedIngredients(')).toBe(true);
    expect(PAGE.includes('simulateProductIntelligence(')).toBe(true);
  });
  it('never calls any write/persist service', () => {
    expect(
      /setProductLifecycleStatus|matchAndSaveProduct|saveProductMatchResult|saveProductMapperReview|updateProduct\(|createProduct|importProductCatalog|applyProductEnrichment/.test(PAGE),
    ).toBe(false);
  });
  it('never writes pac/pod, status, or npac', () => {
    // no assignment to pac_value/pod_value/status columns; the words appear only as read-only display fields
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|npac_value/.test(PAGE)).toBe(false);
    expect(/\.status\s*=/.test(PAGE)).toBe(false);
  });
});

describe('ProductIntelligencePreviewPage — no DB / engine / nav', () => {
  it('no Supabase / privileged key / locked base / raw DB verbs', () => {
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/@\/lib\/supabase/.test(PAGE)).toBe(false);
    expect(/service[_-]?role/i.test(PAGE)).toBe(false);
    expect(/mapper_basement/i.test(PAGE)).toBe(false);
    for (const v of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(PAGE.includes(v), v).toBe(false);
    }
  });
  it('no engine/AI/billing, no nav', () => {
    expect(/@\/engine/.test(PAGE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(PAGE)).toBe(false);
    expect(/navConfig|NAV_ITEMS/.test(PAGE)).toBe(false);
  });
});
