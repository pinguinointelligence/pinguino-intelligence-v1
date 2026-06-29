/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { prepareProductEngineIngredient } from './productEngineHandoff';

/** Minimal reference row (only the fields the engine mapper reads). */
const refRow = (over: Partial<IngredientRow> = {}): IngredientRow =>
  ({
    ingredient_id: 'PI-ING-000180',
    ingredient_name_internal: 'cream-30',
    ingredient_name_display: 'Cream 30% UHT',
    ingredient_category: 'dairy',
    water_percent: 64.42, total_solids_percent: 35.58, fat_percent: 30, protein_percent: 2.3,
    carbohydrate_percent: 3.2, total_sugars_percent: 3.2, lactose_percent: 3.2, salt_percent: 0.08,
    pac_value: 3.668, pod_value: 0.512, de_value: null, cost_per_kg: null,
    data_confidence_percent: 90, verification_status: 'verified', vegan: 'false',
    saturated_fat_percent: null,
    ...over,
  }) as IngredientRow;

describe('prepareProductEngineIngredient — confirmed match borrows the reference profile', () => {
  it('produces an EngineIngredient with the product identity + reference composition + reference pac/pod', () => {
    const h = prepareProductEngineIngredient(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_code: 'PR-ING-000010', product_name_display: 'Nata para montar' },
      refRow(),
    );
    expect(h.ready).toBe(true);
    expect(h.ingredient?.id).toBe('PR-ING-000010'); // product identity
    expect(h.ingredient?.name).toBe('Nata para montar');
    expect(h.ingredient?.pac_value).toBe(3.668); // reference-linked engine values
    expect(h.ingredient?.pod_value).toBe(0.512);
    expect(h.ingredient?.composition.water_percent).toBe(64.42); // reference's full composition
    expect(h.ingredient?.is_verified).toBe(false); // reference-linked is not independently verified
    expect(h.ingredient?.source_type).toBe('external_db');
    expect(h.provenance).toBe('reference_linked');
    expect(h.not_independently_measured).toBe(true);
    expect(h.warnings.join(' ')).toMatch(/not an independent measurement/i);
  });

  it('emits no npac_value and no raw OCR/catalog text into the engine ingredient', () => {
    const h = prepareProductEngineIngredient(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_code: 'PR-ING-000010', detected_text: 'leche, estabilizante E-407' },
      refRow(),
    );
    expect(h.ingredient).not.toHaveProperty('npac_value');
    expect(h.ingredient).not.toHaveProperty('detected_text');
    expect(h.ingredient).not.toHaveProperty('extracted_json');
    expect(JSON.stringify(h.ingredient)).not.toMatch(/E-407|estabilizante/); // catalog text never leaks
  });
});

describe('prepareProductEngineIngredient — gates + red flags', () => {
  it('does NOT hand off an unmatched / unresolvable product', () => {
    expect(prepareProductEngineIngredient({ mapper_status: 'needs_review', matched_basement_id: 'PI-ING-000180' }, refRow()).ready).toBe(false);
    expect(prepareProductEngineIngredient({ mapper_status: 'matched', matched_basement_id: 'PI-ING-000180' }, null).ready).toBe(false);
  });

  it('a red-flag product is prepared but flagged blocked_by_red_flags with warnings', () => {
    const h = prepareProductEngineIngredient(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_code: 'PR-ING-000031', product_name_display: 'Chocolate 0% azúcares añadidos maltitol' },
      refRow(),
    );
    expect(h.ready).toBe(true);
    expect(h.blocked_by_red_flags).toBe(true);
    expect(h.reason).toMatch(/red flags require review/i);
  });

  it('a product with its OWN measured pac/pod overrides the reference values', () => {
    const h = prepareProductEngineIngredient(
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_code: 'PR-X', pac_value: 9, pod_value: 8 },
      refRow(),
    );
    expect(h.provenance).toBe('product_measured');
    expect(h.ingredient?.pac_value).toBe(9);
    expect(h.ingredient?.source_type).toBe('producer_label');
  });
});

describe('productEngineHandoff — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productEngineHandoff.ts'), 'utf8'));

  it('imports the engine TYPE only (no value import), no Supabase/service/DB write, no npac', () => {
    expect(/import\s+type\b[^;]*from\s+'@\/engine'/.test(MOD)).toBe(true);
    expect(/import\s+\{[^}]*\}\s+from\s+'@\/engine'/.test(MOD)).toBe(false);
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
