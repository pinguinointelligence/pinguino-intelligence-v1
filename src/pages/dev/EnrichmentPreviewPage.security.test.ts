/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'EnrichmentPreviewPage.tsx'), 'utf8'));
const SVC = strip(readFileSync(join(SRC, 'services', 'openFoodFacts.ts'), 'utf8'));
const ALL = `${PAGE}\n${SVC}`;

describe('enrichment preview — boundaries', () => {
  it('is DEV-only (NotFoundPage in production)', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('never writes products / basement / snapshots (no write verbs, no write service, no supabase)', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ALL.includes(verb), verb).toBe(false);
    }
    expect(/productStatusWrite|productReview|productSnapshots|matchAndSaveProduct|createProduct/.test(ALL)).toBe(false);
    expect(/supabase/i.test(ALL)).toBe(false);
  });

  it('uses no API key / secret / auth header, and no npac', () => {
    expect(/api[_-]?key|secret|token|authorization/i.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
  });

  it('the only data call is the read-only OpenFoodFacts fetch', () => {
    expect(SVC.includes('fetchOpenFoodFactsProduct')).toBe(true);
    expect(PAGE.includes('fetchOpenFoodFactsProduct')).toBe(true);
  });
});
