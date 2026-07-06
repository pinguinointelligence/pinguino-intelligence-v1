/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateProductIntelligence } from './productIntelligenceSimulation';
import type { ProductRow } from './productRow';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

/* Small realistic fixtures (test values, NOT calibration data). */
const product = (over: Partial<ProductRow>): ProductRow =>
  ({
    product_code: 'PR-TEST',
    product_name_display: null,
    product_name_internal: null,
    product_category: 'dairy',
    fat_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    protein_percent: null,
    salt_percent: null,
    polyol_percent: null,
    pac_value: null,
    pod_value: null,
    ean_code: null,
    barcode: null,
    mapper_status: null,
    matched_basement_id: null,
    status: 'draft',
    detected_text: null,
    allergens: null,
    source_type: 'mercadona',
    ...over,
  }) as unknown as ProductRow;

const ref = (over: Partial<IngredientRow>): IngredientRow =>
  ({
    ingredient_id: 'PI-TEST',
    ingredient_name_display: 'ref',
    ingredient_name_internal: 'ref',
    ingredient_category: 'dairy',
    ingredient_subcategory: '',
    fat_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    protein_percent: null,
    salt_percent: null,
    pac_value: null,
    pod_value: null,
    verification_status: 'verified',
    ...over,
  }) as unknown as IngredientRow;

const MILK_15 = ref({ ingredient_id: 'PI-MILK-15', ingredient_name_display: 'Milk 1.5% — Standard', fat_percent: 1.6, carbohydrate_percent: 4.8, total_sugars_percent: 4.7, protein_percent: 3.5, salt_percent: 0.11, pac_value: 5.34, pod_value: 0.75 });
const MILK_35 = ref({ ingredient_id: 'PI-MILK-35', ingredient_name_display: 'Milk 3,5% — Standard', fat_percent: 3.5, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3, salt_percent: 0.1, pac_value: 5.28, pod_value: 0.75 });
const YOGURT = ref({ ingredient_id: 'PI-YOG', ingredient_name_display: 'Yogurt 5% — Standard', fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1, pac_value: 6.1, pod_value: 0.8 });
const CREAM = ref({ ingredient_id: 'PI-CREAM', ingredient_name_display: 'Cream 30% — Standard', fat_percent: 30, carbohydrate_percent: 3.2, total_sugars_percent: 3.2, protein_percent: 2.3, salt_percent: 0.08, pac_value: 3.6, pod_value: 0.5 });

const BASEMENT = [MILK_15, MILK_35, YOGURT, CREAM];

const SKIM = product({ product_code: 'PR-SKIM', product_name_display: 'Leche desnatada', fat_percent: 0.3, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, protein_percent: 3.2, salt_percent: 0.13 });
const LACTOSE_FREE = product({ product_code: 'PR-SL', product_name_display: 'Leche sin lactosa', fat_percent: 1.55, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.2, salt_percent: 0.13 });
const MATCHED_CREAM = product({ product_code: 'PR-NATA', product_name_display: 'Nata 30%', mapper_status: 'matched', matched_basement_id: 'PI-CREAM', status: 'pi_generated', fat_percent: 30, carbohydrate_percent: 3.2, total_sugars_percent: 3.2, protein_percent: 2.3, salt_percent: 0.08 });
const SWEETENER = product({ product_code: 'PR-SW', product_name_display: 'Edulcorante eritritol', product_category: 'sugar', fat_percent: 0, carbohydrate_percent: 100, total_sugars_percent: 0, protein_percent: 0, salt_percent: 0 });

describe('simulateProductIntelligence — batch classification (preview only)', () => {
  it('classifies every product and never persists (returns a plain result object)', () => {
    const result = simulateProductIntelligence({ products: [SKIM, LACTOSE_FREE, MATCHED_CREAM, SWEETENER], basement: BASEMENT });
    expect(result.rows).toHaveLength(4);
    expect(result.summary.total).toBe(4);
    // pure structural check: the result exposes no write/patch shape
    expect(Object.keys(result)).toEqual(['rows', 'summary']);
  });

  it('a null/draft product is classified without any status change (current status reported unchanged)', () => {
    const { rows } = simulateProductIntelligence({ products: [SKIM], basement: BASEMENT });
    const row = rows[0]!;
    expect(row.current_mapper_status).toBeNull();
    expect(row.current_status).toBe('draft'); // reported unchanged
    expect(row.outcome).toBe('pi_calculated'); // advisory only
    expect(row.recommended_status).toBe('pi_calculated');
    expect(row.derived_pac).not.toBeNull(); // ephemeral, preview-only
    expect(row.engine_ready).toBe(true);
  });

  it('a matched product remains reference_linked and engine-ready', () => {
    const { rows } = simulateProductIntelligence({ products: [MATCHED_CREAM], basement: BASEMENT });
    expect(rows[0]!.outcome).toBe('reference_linked');
    expect(rows[0]!.value_basis).toBe('reference_linked');
    expect(rows[0]!.engine_ready).toBe(true);
    expect(rows[0]!.basis_reference_ids).toEqual(['PI-CREAM']);
  });

  it('a hard-blocked product stays blocked with no derived values', () => {
    const { rows } = simulateProductIntelligence({ products: [LACTOSE_FREE, SWEETENER], basement: BASEMENT });
    for (const row of rows) {
      expect(row.outcome).toBe('blocked');
      expect(row.engine_ready).toBe(false);
      expect(row.derived_pac).toBeNull();
      expect(row.blocked_reason).not.toBeNull();
    }
  });

  it('summary counts match the per-row outcomes', () => {
    const { rows, summary } = simulateProductIntelligence({
      products: [SKIM, LACTOSE_FREE, MATCHED_CREAM, SWEETENER],
      basement: BASEMENT,
    });
    expect(summary.reference_linked).toBe(rows.filter((r) => r.outcome === 'reference_linked').length);
    expect(summary.pi_calculated).toBe(rows.filter((r) => r.outcome === 'pi_calculated').length);
    expect(summary.blocked).toBe(rows.filter((r) => r.outcome === 'blocked').length);
    expect(summary.reference_linked).toBe(1);
    expect(summary.pi_calculated).toBe(1);
    expect(summary.blocked).toBe(2);
    expect(summary.newly_pi_calculated).toBe(1); // SKIM is not currently matched
    expect(summary.engine_ready).toBe(2); // matched cream + skim
  });

  it('rows are sorted by product_code and carry a next_action', () => {
    const { rows } = simulateProductIntelligence({ products: [SWEETENER, MATCHED_CREAM, SKIM], basement: BASEMENT });
    expect(rows.map((r) => r.product_code)).toEqual(['PR-NATA', 'PR-SKIM', 'PR-SW']);
    for (const row of rows) expect(row.next_action.length).toBeGreaterThan(0);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const products = [SKIM, MATCHED_CREAM];
    const snapshot = JSON.stringify({ products, basement: BASEMENT });
    const a = simulateProductIntelligence({ products, basement: BASEMENT });
    const b = simulateProductIntelligence({ products, basement: BASEMENT });
    expect(a).toEqual(b);
    expect(JSON.stringify({ products, basement: BASEMENT })).toBe(snapshot);
  });
});

describe('simulateProductIntelligence — boundary (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MODULE = strip(readFileSync(join(SRC, 'data', 'products', 'productIntelligenceSimulation.ts'), 'utf8'));

  it('has no DB client, service import, write verb, or IO', () => {
    expect(/supabase|service_role/i.test(MODULE)).toBe(false);
    expect(/@\/services\//.test(MODULE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MODULE.includes(verb), verb).toBe(false);
    }
    expect(/fetch\s*\(|localStorage/.test(MODULE)).toBe(false);
    expect(/Math\.random|Date\.now|new Date\(/.test(MODULE)).toBe(false);
    expect(/npac/i.test(MODULE)).toBe(false);
  });
});
