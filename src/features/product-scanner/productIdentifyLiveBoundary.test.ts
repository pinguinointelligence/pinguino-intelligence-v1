/**
 * The identification boundary must stay a boundary.
 *
 * `product-identify-live` exists because the deep profiler was the wrong tool for a live
 * sweep. The pressure to "just add one more field" to it will be constant — a nutrient
 * here, an ingredient there — and each addition would quietly rebuild the expensive thing
 * it was created to avoid. These contracts are what stop that happening by accident.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FUNCTION = readFileSync('supabase/functions/product-identify-live/index.ts', 'utf8');
const between = (start: string, end: string) =>
  FUNCTION.slice(FUNCTION.indexOf(start), FUNCTION.indexOf(end));

describe('it identifies, and does not profile', () => {
  it('has no field in which a nutrient, ingredient or allergen could be returned', () => {
    const schema = between('const IDENTIFY_SCHEMA', 'const SYSTEM_PROMPT');
    expect(schema).not.toMatch(/nutrition|allergen|ingredient|kcal|protein|fat|sugar/i);
  });

  it('never asks the model for a product id', () => {
    // The schema is the enforcement: a model cannot return a field that does not exist.
    const properties = between('properties: {', '} as const');
    expect(properties).not.toMatch(/['"]?(productId|id|sku|catalogId)['"]?\s*:/);
  });

  it('takes the canonical identity only from the catalogue', () => {
    expect(FUNCTION).toContain('search_products_v1');
    // And only when the catalogue gave ONE unambiguous answer.
    expect(FUNCTION).toContain('rows.length === 1 ? rows[0] : null');
  });
});

describe('it cannot run up a bill', () => {
  it('spends at most one model call per request', () => {
    expect(FUNCTION).toContain('MAX_VISION_CALLS_PER_REQUEST = 1');
  });

  it('tries free local evidence before paying for anything', () => {
    const barcodeAt = FUNCTION.indexOf('if (barcode) {');
    const modelAt = FUNCTION.indexOf('api.openai.com');
    expect(barcodeAt).toBeGreaterThan(0);
    expect(barcodeAt).toBeLessThan(modelAt);
  });

  it('gives the model no tools, so it cannot browse or call anything', () => {
    expect(FUNCTION).not.toMatch(/\btools\s*:/);
  });

  it('refuses anything bigger than a selected still', () => {
    expect(FUNCTION).toContain('MAX_FRAME_BYTES');
    expect(FUNCTION).toContain('identify_frame_too_large');
  });
});

describe('it reaches no further than its caller', () => {
  it('requires a signed-in caller', () => {
    expect(FUNCTION).toContain('identify_requires_sign_in');
  });

  it("runs catalogue reads under the CALLER's token, not a service role", () => {
    // A service-role client here would silently bypass RLS for every read below.
    expect(FUNCTION).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(FUNCTION).toContain('global: { headers: { Authorization: authorization } }');
  });
});
