/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openFoodFactsUrl, parseOpenFoodFactsProduct } from './openFoodFactsAdapter';

describe('parseOpenFoodFactsProduct', () => {
  it('parses a found product into the nutrition set + public-DB source', () => {
    const off = parseOpenFoodFactsProduct({
      status: 1,
      code: '8410297112010',
      product: {
        product_name: 'Leche entera',
        ingredients_text: 'Leche entera de vaca',
        nutriments: {
          fat_100g: 3.6, 'saturated-fat_100g': 2.4, carbohydrates_100g: 4.7, sugars_100g: 4.7,
          proteins_100g: 3.1, salt_100g: 0.13, 'energy-kcal_100g': 63,
        },
      },
    });
    expect(off.found).toBe(true);
    expect(off.name).toBe('Leche entera');
    expect(off.source).toBe('public_composition_db');
    expect(off.nutrition.fat_percent).toBe(3.6);
    expect(off.nutrition.saturated_fat_percent).toBe(2.4);
    expect(off.nutrition.salt_percent).toBe(0.13);
    expect(off.nutrition.kcal_per_100g).toBe(63);
  });

  it('a not-found product → found:false, all nutrition null (no fake 0)', () => {
    const off = parseOpenFoodFactsProduct({ status: 0, code: '0000000000000' });
    expect(off.found).toBe(false);
    expect(off.nutrition.fat_percent).toBeNull();
    expect(off.name).toBeNull();
  });

  it('missing nutriments stay null, and string numbers coerce', () => {
    const off = parseOpenFoodFactsProduct({ status: 1, code: '1', product: { nutriments: { fat_100g: '9.5' } } });
    expect(off.nutrition.fat_percent).toBe(9.5);
    expect(off.nutrition.protein_percent).toBeNull();
  });

  it('handles a malformed / empty response without throwing', () => {
    expect(parseOpenFoodFactsProduct(undefined).found).toBe(false);
    expect(parseOpenFoodFactsProduct(null).found).toBe(false);
    expect(parseOpenFoodFactsProduct({}).found).toBe(false);
  });

  it('builds a keyless OFF URL with digits only', () => {
    expect(openFoodFactsUrl('  8410-297 112010 ')).toBe('https://world.openfoodfacts.org/api/v2/product/8410297112010.json');
  });
});

describe('openFoodFactsAdapter — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'openFoodFactsAdapter.ts'), 'utf8'));

  it('is pure: no network call, no Supabase / service / DB write / secrets, no npac_value', () => {
    expect(/\bfetch\(|XMLHttpRequest|axios/.test(MOD)).toBe(false); // the URL is built; the caller fetches
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/api[_-]?key|secret|token/i.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
