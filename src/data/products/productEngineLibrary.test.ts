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

describe('buildProductEngineLibrary — class-derived PI Calculated (owner-approved 000014 only)', () => {
  const dairyRef = (over: Partial<IngredientRow>): IngredientRow =>
    ({
      ingredient_id: 'PI-X', ingredient_name_internal: 'x', ingredient_name_display: 'x', ingredient_category: 'dairy',
      water_percent: 88, total_solids_percent: 12, fat_percent: null, protein_percent: null, carbohydrate_percent: null,
      total_sugars_percent: null, lactose_percent: 4.7, salt_percent: null, pac_value: null, pod_value: null,
      de_value: null, cost_per_kg: null, data_confidence_percent: 90, verification_status: 'verified', vegan: 'false',
      saturated_fat_percent: null, ...over,
    }) as IngredientRow;

  const YOGURT_5 = dairyRef({ ingredient_id: 'PI-ING-000297', ingredient_name_display: 'Yogurt 5% — Standard', fat_percent: 5, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 3.6, salt_percent: 0.2, pac_value: 6.17, pod_value: 0.8 });
  const MILK_15 = dairyRef({ ingredient_id: 'PI-ING-000234', ingredient_name_display: 'Milk 1.5% — Standard', fat_percent: 1.6, carbohydrate_percent: 4.8, total_sugars_percent: 4.7, protein_percent: 3.5, salt_percent: 0.11, pac_value: 5.34, pod_value: 0.75 });
  const MILK_35 = dairyRef({ ingredient_id: 'PI-ING-000236', ingredient_name_display: 'Milk 3,5% — Standard', fat_percent: 3.5, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3, salt_percent: 0.1, pac_value: 5.28, pod_value: 0.75 });
  const dairyById = new Map([YOGURT_5, MILK_15, MILK_35].map((r) => [r.ingredient_id, r]));

  const yogurt = (over: Partial<ProductRow> = {}): ProductRow =>
    ({
      id: 'y1', product_code: 'PR-ING-000014', product_name_display: 'Yogur natural Hacendado pack 6', product_category: 'dairy',
      fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1,
      mapper_status: null, matched_basement_id: null, status: 'pi_calculated', pac_value: null, pod_value: null, detected_text: null,
      ...over,
    }) as ProductRow;

  it('activates ONLY PR-ING-000014 as a class-derived PI Calculated engine ingredient', () => {
    const lib = buildProductEngineLibrary({ products: [yogurt()], referenceById: dairyById });
    expect(lib.ingredients).toHaveLength(1);
    const ing = lib.ingredients[0]!;
    expect(ing.id).toBe('PR-ING-000014');
    expect(ing.pac_value).toBe(6.17); // resolver's class-derived value (from Yogurt 5% anchor)
    expect(ing.pod_value).toBe(0.8);
    expect(ing.is_verified).toBe(false);
    const prov = lib.provenance.get('PR-ING-000014');
    expect(prov?.class_derived).toBe(true);
    expect(prov?.provenance_note).toBe('PI Calculated · class-derived · not independently measured');
    expect(prov?.status_label).toBe('PI Calculated');
  });

  it('uses resolver values EPHEMERALLY — the product row pac/pod are never read or mutated', () => {
    const p = yogurt();
    const lib = buildProductEngineLibrary({ products: [p], referenceById: dairyById });
    expect(p.pac_value).toBeNull(); // input row untouched
    expect(p.pod_value).toBeNull();
    expect(lib.ingredients[0]!.pac_value).toBe(6.17); // value comes from the resolver, not the product row
  });

  it('does NOT activate an approved code whose status is not yet pi_calculated (draft)', () => {
    const lib = buildProductEngineLibrary({ products: [yogurt({ status: 'draft' })], referenceById: dairyById });
    expect(lib.ingredients).toHaveLength(0);
  });

  it('leaves the non-approved candidates (skim milk / kefir) preview-only, even at pi_calculated status', () => {
    const skim = yogurt({ id: 's', product_code: 'PR-ING-000004', product_name_display: 'Leche desnatada', fat_percent: 0.3, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, protein_percent: 3.2, salt_percent: 0.13, status: 'pi_calculated' });
    const kefir = yogurt({ id: 'k', product_code: 'PR-ING-000022', product_name_display: 'Kéfir natural', fat_percent: 4.2, carbohydrate_percent: 5.1, total_sugars_percent: 2.3, protein_percent: 3.9, salt_percent: 0.08, status: 'pi_calculated' });
    const lib = buildProductEngineLibrary({ products: [skim, kefir], referenceById: dairyById });
    expect(lib.ingredients.map((i) => i.id)).not.toContain('PR-ING-000004');
    expect(lib.ingredients.map((i) => i.id)).not.toContain('PR-ING-000022');
    expect(lib.ingredients).toHaveLength(0);
  });

  it('activates 000014 but never 000004/000022 in a mixed batch', () => {
    const skim = yogurt({ id: 's', product_code: 'PR-ING-000004', product_name_display: 'Leche desnatada', fat_percent: 0.3, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, protein_percent: 3.2, salt_percent: 0.13 });
    const kefir = yogurt({ id: 'k', product_code: 'PR-ING-000022', product_name_display: 'Kéfir natural', fat_percent: 4.2, carbohydrate_percent: 5.1, total_sugars_percent: 2.3, protein_percent: 3.9, salt_percent: 0.08 });
    const lib = buildProductEngineLibrary({ products: [yogurt(), skim, kefir], referenceById: dairyById });
    expect(lib.ingredients.map((i) => i.id)).toEqual(['PR-ING-000014']);
  });
});

describe('APPROVED_PI_CALCULATED_CODES — owner approval is 000014 only', () => {
  it('lists exactly PR-ING-000014', async () => {
    const { APPROVED_PI_CALCULATED_CODES } = await import('./productActivationPlan');
    expect([...APPROVED_PI_CALCULATED_CODES]).toEqual(['PR-ING-000014']);
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
