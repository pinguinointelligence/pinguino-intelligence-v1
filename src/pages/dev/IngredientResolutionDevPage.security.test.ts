/// <reference types="node" />
/**
 * Static boundary guard for the DEV-only Ingredient Resolution harness. Proves: DEV-only route
 * + NotFound fallback, no nav, drives only the pure resolution core + its in-memory adapter,
 * and PERSISTS NOTHING — no write verb, no mapper_basement, no pac/pod or status write, no
 * DB / engine / AI / billing.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..', '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (...p: string[]) => stripComments(readFileSync(join(...p), 'utf8'));

const PAGE = read(HERE, 'IngredientResolutionDevPage.tsx');
const ROUTER = read(SRC, 'app', 'router.tsx');

describe('IngredientResolutionDevPage — DEV-only', () => {
  it('guards on import.meta.env.DEV and falls back to NotFound', () => {
    expect(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)/.test(PAGE)).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });
  it('registers /dev/ingredient-resolution ONLY under import.meta.env.DEV', () => {
    expect(/import\.meta\.env\.DEV\s*&&[\s\S]*?\/dev\/ingredient-resolution/.test(ROUTER)).toBe(true);
    expect(/path="\/dev\/ingredient-resolution"/.test(ROUTER)).toBe(true);
  });
});

describe('IngredientResolutionDevPage — pure core only, persists nothing', () => {
  it('drives only the pure resolution feature + its in-memory adapter', () => {
    expect(PAGE.includes('@/features/ingredient-resolution')).toBe(true);
    expect(PAGE.includes('InMemoryIngredientResolution')).toBe(true);
  });
  it('never calls any write/persist service', () => {
    expect(
      /setProductLifecycleStatus|matchAndSaveProduct|saveProductMatchResult|saveProductMapperReview|updateProduct\(|createProduct|importProductCatalog|applyProductEnrichment/.test(PAGE),
    ).toBe(false);
  });
  it('never writes pac/pod, status, or npac', () => {
    expect(/pac_value\s*=|pod_value\s*=|npac_value/.test(PAGE)).toBe(false);
    expect(/\.status\s*=/.test(PAGE)).toBe(false);
  });
});

describe('IngredientResolutionDevPage — no DB / engine / nav', () => {
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
