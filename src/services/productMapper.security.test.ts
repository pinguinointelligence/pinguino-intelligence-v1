/// <reference types="node" />
/**
 * Mapper orchestrator security / scope guard (Slice D4).
 *
 * matchAndSaveProduct is the EXPLICIT single-product run: it composes the products
 * service + the read-only ingredients service + the pure matcher + the D3 write-back.
 * It must stay an explicit, boundary-respecting orchestrator: no auto-run, no raw DB,
 * no write to the locked reference base, no engine / AI / billing, and no
 * products.status / promotion automation. Static source-text guard (comment-stripped),
 * so the header may document the boundary without tripping a literal scan. No live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const SOURCE = read('services', 'productMapper.ts');
const CODE = stripComments(SOURCE);

describe('Mapper orchestrator — explicit single-product entry (D4)', () => {
  it('exports exactly the explicit matchAndSaveProduct(productId) entry', () => {
    expect(/export async function matchAndSaveProduct\(\s*productId: string\s*\)/.test(SOURCE)).toBe(true);
  });

  it('composes the two services + the pure matcher (its only dependencies)', () => {
    expect(CODE.includes("from '@/services/products'")).toBe(true);
    expect(CODE.includes("from '@/services/ingredients'")).toBe(true);
    expect(CODE.includes("from '@/data/products/productMatcher'")).toBe(true);
    expect(CODE.includes('matchProduct(')).toBe(true);
  });
});

describe('Mapper orchestrator — boundaries (D4)', () => {
  it('makes no raw DB / Supabase access (works through services only)', () => {
    expect(/supabase/i.test(CODE)).toBe(false);
    expect(/@\/lib\/supabase/.test(CODE)).toBe(false);
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
  });

  it('imports no engine, no AI, no billing vendor', () => {
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });

  it('never writes the locked reference base (no executable mapper_basement, no npac_value)', () => {
    expect(/mapper_basement/i.test(CODE)).toBe(false);
    expect(/npac_value/i.test(CODE)).toBe(false);
  });

  it('reads the reference base ONLY through the read-only listEngineApprovedIngredients()', () => {
    expect(CODE.includes('listEngineApprovedIngredients(')).toBe(true);
    expect(CODE.includes('listActiveIngredients')).toBe(false);
    expect(CODE.includes('getIngredientById')).toBe(false);
  });

  it('writes the product ONLY through saveProductMatchResult (no status / promotion / raw update)', () => {
    expect(CODE.includes('saveProductMatchResult(')).toBe(true);
    expect(/\.status\b/.test(CODE)).toBe(false);
    expect(/\bstatus\s*:/.test(CODE)).toBe(false);
    expect(/promote/i.test(CODE)).toBe(false);
    expect(/pi_verified|'rejected'/.test(CODE)).toBe(false);
    expect(CODE.includes('updateProduct(')).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
  });

  it('has no auto-run / scheduled / background trigger (runs only when explicitly called)', () => {
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|background|subscribe)\b/i.test(CODE)).toBe(false);
  });
});
