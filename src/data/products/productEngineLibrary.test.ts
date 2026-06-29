/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from './productRow';
import { buildProductEngineLibrary } from './productEngineLibrary';

const refRow = (over: Partial<IngredientRow> = {}): IngredientRow =>
  ({
    ingredient_id: 'PI-ING-000180', ingredient_name_internal: 'cream-30', ingredient_name_display: 'Cream 30% UHT',
    ingredient_category: 'dairy', water_percent: 64.42, total_solids_percent: 35.58, fat_percent: 30, protein_percent: 2.3,
    carbohydrate_percent: 3.2, total_sugars_percent: 3.2, lactose_percent: 3.2, salt_percent: 0.08,
    pac_value: 3.668, pod_value: 0.512, de_value: null, cost_per_kg: null, data_confidence_percent: 90,
    verification_status: 'verified', vegan: 'false', saturated_fat_percent: null,
    ...over,
  }) as IngredientRow;

const product = (over: Partial<ProductRow> = {}): ProductRow =>
  ({
    id: 'p1', product_code: 'PR-ING-000010', product_name_display: 'Nata para montar',
    mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', status: 'pi_generated',
    pac_value: null, pod_value: null, detected_text: null,
    ...over,
  }) as ProductRow;

const refById = new Map([['PI-ING-000180', refRow()]]);

describe('buildProductEngineLibrary', () => {
  it('includes a matched + pi_generated product as a reference-linked EngineIngredient', () => {
    const lib = buildProductEngineLibrary({ products: [product()], referenceById: refById });
    expect(lib.source).toBe('my_products');
    expect(lib.ingredients).toHaveLength(1);
    const ing = lib.ingredients[0]!;
    expect(ing.id).toBe('PR-ING-000010'); // product identity
    expect(ing.pac_value).toBe(3.668); // reference-linked engine values
    expect(ing.is_verified).toBe(false);
    expect(lib.provenance.get('PR-ING-000010')?.reference_linked).toBe(true);
  });

  it('excludes rejected / null-mapper / draft-status products', () => {
    const products = [
      product({ id: 'r', product_code: 'PR-R', mapper_status: 'rejected', matched_basement_id: null }),
      product({ id: 'n', product_code: 'PR-N', mapper_status: null, status: 'draft' }),
      product({ id: 'd', product_code: 'PR-D', mapper_status: 'matched', status: 'draft' }), // matched but not yet a customer status
    ];
    expect(buildProductEngineLibrary({ products, referenceById: refById }).ingredients).toHaveLength(0);
  });

  it('excludes a matched product whose reference is missing', () => {
    const lib = buildProductEngineLibrary({ products: [product({ matched_basement_id: 'PI-ING-999999' })], referenceById: refById });
    expect(lib.ingredients).toHaveLength(0);
  });

  it('includes a red-flagged product but marks blocked_by_red_flags + warnings', () => {
    const flagged = product({ id: 'f', product_code: 'PR-ING-000031', product_name_display: 'Chocolate 0% azúcares añadidos maltitol', matched_basement_id: 'PI-ING-000180' });
    const lib = buildProductEngineLibrary({ products: [flagged], referenceById: refById });
    expect(lib.ingredients).toHaveLength(1);
    const prov = lib.provenance.get('PR-ING-000031');
    expect(prov?.blocked_by_red_flags).toBe(true);
    expect(prov?.warnings.length).toBeGreaterThan(0);
  });

  it('never leaks raw OCR/catalog text or npac_value into the engine ingredient', () => {
    const withText = product({ detected_text: 'nata, estabilizante E-407' });
    const ing = buildProductEngineLibrary({ products: [withText], referenceById: refById }).ingredients[0]!;
    expect(ing).not.toHaveProperty('detected_text');
    expect(ing).not.toHaveProperty('npac_value');
    expect(JSON.stringify(ing)).not.toMatch(/E-407|estabilizante/);
  });
});

describe('productEngineLibrary — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productEngineLibrary.ts'), 'utf8'));

  it('imports the engine TYPE only, no Supabase/service/DB write, no npac_value', () => {
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
