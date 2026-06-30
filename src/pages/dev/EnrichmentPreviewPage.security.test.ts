/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'EnrichmentPreviewPage.tsx'), 'utf8'));
const SVC = strip(readFileSync(join(SRC, 'services', 'openFoodFacts.ts'), 'utf8'));
const ALL = `${PAGE}\n${SVC}`;

describe('enrichment page — boundaries', () => {
  it('is DEV-only (NotFoundPage in production)', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('does no raw table writes itself — the only write is the reviewed applyProductEnrichment service', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(PAGE.includes('applyProductEnrichment')).toBe(true);
    // never the broad/identity/status write paths
    expect(/updateProduct\b|createProduct|saveProductMatchResult|setProductLifecycleStatus/.test(PAGE)).toBe(false);
  });

  it('never references pac/pod or the locked reference base, and no npac', () => {
    expect(/pac_value|pod_value/i.test(ALL)).toBe(false);
    expect(/mapper_basement/i.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
  });

  it('uses no API key / secret / auth header', () => {
    expect(/api[_-]?key|secret|service_role|authorization/i.test(ALL)).toBe(false);
  });

  it('reads via the keyless OFF fetch + listMyProducts only', () => {
    expect(SVC.includes('fetchOpenFoodFactsProduct')).toBe(true);
    expect(PAGE.includes('fetchOpenFoodFactsProduct')).toBe(true);
    expect(PAGE.includes('listMyProducts')).toBe(true);
  });
});
