/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEan, productIdentityKey } from './productIdentity';
import type { ProductIdentityInput } from './productIdentity';

const base: ProductIdentityInput = {
  brand: 'Babbi',
  product_name: 'Crumble',
  package_size: '1 kg',
  fat_percent: 30,
  total_sugars_percent: 50,
  protein_percent: 5,
  total_solids_percent: 90,
  source: 'colin',
};

describe('normalizeEan', () => {
  it('strips spaces / dashes / separators (reusing canonicalEan)', () => {
    expect(normalizeEan('0049-000 028911')).toBe('0049000028911');
    expect(normalizeEan('  00 12_34 ')).toBe('001234');
  });

  it('PRESERVES leading zeros (no numeric coercion)', () => {
    expect(normalizeEan('007')).toBe('007');
    expect(normalizeEan('007')).not.toBe(normalizeEan('7'));
  });

  it('returns empty string for null / undefined / no-digit input', () => {
    expect(normalizeEan(null)).toBe('');
    expect(normalizeEan(undefined)).toBe('');
    expect(normalizeEan('--')).toBe('');
  });
});

describe('productIdentityKey', () => {
  it('is deterministic — the same input yields the same key', () => {
    expect(productIdentityKey(base)).toBe(productIdentityKey({ ...base }));
  });

  it('changes when brand / name / package / nutrition / source changes', () => {
    const k = productIdentityKey(base);
    expect(productIdentityKey({ ...base, brand: 'Other' })).not.toBe(k);
    expect(productIdentityKey({ ...base, product_name: 'Other' })).not.toBe(k);
    expect(productIdentityKey({ ...base, package_size: '2 kg' })).not.toBe(k);
    expect(productIdentityKey({ ...base, fat_percent: 31 })).not.toBe(k);
    expect(productIdentityKey({ ...base, total_sugars_percent: 51 })).not.toBe(k);
    expect(productIdentityKey({ ...base, source: 'mercadona' })).not.toBe(k);
  });

  it('keeps a REAL 0 distinct from a missing/null value (no fake zero)', () => {
    const zero = productIdentityKey({ ...base, fat_percent: 0 });
    const missing = productIdentityKey({ ...base, fat_percent: null });
    expect(zero).not.toBe(missing);
    expect(zero).toContain('|0|'); // a real 0 is stored as "0"
    expect(missing).toContain('||'); // a missing value is an empty segment
  });

  it('is null-safe — all-null input does not throw and yields a stable empty key', () => {
    const empty: ProductIdentityInput = {
      brand: null,
      product_name: null,
      package_size: null,
      fat_percent: null,
      total_sugars_percent: null,
      protein_percent: null,
      total_solids_percent: null,
      source: null,
    };
    expect(() => productIdentityKey(empty)).not.toThrow();
    expect(productIdentityKey(empty)).toBe('|||||||'); // 8 empty segments -> 7 separators
  });
});

describe('productIdentity — purity (static source scan)', () => {
  const SRC = readFileSync(join(import.meta.dirname, 'productIdentity.ts'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('imports no DB / service / engine / AI, and carries no npac_value', () => {
    expect(/supabase/i.test(CODE)).toBe(false);
    expect(/@\/services\//.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
    expect(/npac_value/i.test(CODE)).toBe(false);
    // it reuses ONLY the pure matcher helpers
    expect(CODE.includes("from '@/data/products/productMatcher'")).toBe(true);
  });
});
