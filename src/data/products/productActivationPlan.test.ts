/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_PI_CALCULATED_CODES,
  CLASS_DERIVED_PROVENANCE_LABEL,
  buildClassDerivedEngineIngredient,
  planClassDerivedActivation,
  planClassDerivedActivations,
} from './productActivationPlan';
import { resolveProductIntelligence } from './productIntelligenceResolver';
import type { ProductRow } from './productRow';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

const product = (over: Partial<ProductRow>): ProductRow =>
  ({
    id: 'id-test',
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
    water_percent: 88,
    total_solids_percent: 12,
    fat_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    protein_percent: null,
    salt_percent: null,
    sucrose_percent: null,
    lactose_percent: 4.7,
    pac_value: null,
    pod_value: null,
    de_value: null,
    cost_per_kg: null,
    data_confidence_percent: 90,
    saturated_fat_percent: null,
    vegan: 'false',
    verification_status: 'verified',
    ...over,
  }) as unknown as IngredientRow;

const MILK_15 = ref({ ingredient_id: 'PI-MILK-15', ingredient_name_display: 'Milk 1.5% — Standard', fat_percent: 1.6, carbohydrate_percent: 4.8, total_sugars_percent: 4.7, protein_percent: 3.5, salt_percent: 0.11, pac_value: 5.34, pod_value: 0.75 });
const MILK_35 = ref({ ingredient_id: 'PI-MILK-35', ingredient_name_display: 'Milk 3,5% — Standard', fat_percent: 3.5, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3, salt_percent: 0.1, pac_value: 5.28, pod_value: 0.75 });
const YOGURT = ref({ ingredient_id: 'PI-YOG', ingredient_name_display: 'Yogurt 5% — Standard', fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1, pac_value: 6.1, pod_value: 0.8 });
const CREAM = ref({ ingredient_id: 'PI-CREAM', ingredient_name_display: 'Cream 30% — Standard', fat_percent: 30, carbohydrate_percent: 3.2, total_sugars_percent: 3.2, protein_percent: 2.3, salt_percent: 0.08, pac_value: 3.6, pod_value: 0.5 });

const BASEMENT = [MILK_15, MILK_35, YOGURT, CREAM];
const referenceById = new Map(BASEMENT.map((r) => [r.ingredient_id, r]));

const SKIM = product({ id: 'id-skim', product_code: 'PR-SKIM', product_name_display: 'Leche desnatada', fat_percent: 0.3, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, protein_percent: 3.2, salt_percent: 0.13 });

const skimResolution = () =>
  resolveProductIntelligence({ product: SKIM, candidateReferences: [MILK_15, MILK_35], matchedReference: null });

describe('APPROVED_PI_CALCULATED_CODES — empty gate by default', () => {
  it('is empty — nothing is approved until an owner populates it', () => {
    expect([...APPROVED_PI_CALCULATED_CODES]).toEqual([]);
  });
});

describe('buildClassDerivedEngineIngredient', () => {
  it('borrows composition from the basis anchor but overrides pac/pod and identity', () => {
    const ing = buildClassDerivedEngineIngredient({
      product: { product_code: 'PR-SKIM', product_name_display: 'Leche desnatada' },
      compositionBasis: MILK_15,
      derived: { pac_value: 5.19, pod_value: 0.71 },
    });
    expect(ing.id).toBe('PR-SKIM'); // product identity, not the reference's
    expect(ing.name).toBe('Leche desnatada');
    expect(ing.pac_value).toBe(5.19); // class-derived, overridden
    expect(ing.pod_value).toBe(0.71);
    expect(ing.composition.fat_percent).toBe(1.6); // borrowed from MILK_15
    expect(ing.composition.lactose_percent).toBe(4.7);
    expect(ing.is_verified).toBe(false); // never claims independent measurement
    expect(ing.source_type).toBe('external_db');
    expect(ing.confidence_score).toBe(0);
  });
});

describe('planClassDerivedActivation — single product', () => {
  it('plans a class-derived PI Calculated product; product pac/pod stay NULL', () => {
    const result = planClassDerivedActivation({ product: SKIM, resolution: skimResolution(), referenceById });
    expect(result.planned).toBe(true);
    if (!result.planned) return;
    const plan = result.plan;
    expect(plan.rule_id).toBe('milk_fat_series_v1');
    expect(plan.composition_basis_reference_id).toBe('PI-MILK-15'); // nearest fat to 0.3
    expect(plan.engine_ingredient.pac_value).toBe(plan.derived_pac);
    expect(plan.engine_ingredient.pod_value).toBe(plan.derived_pod);
    expect(plan.derived_pac).toBeGreaterThan(0);
    expect(plan.provenance_label).toBe(CLASS_DERIVED_PROVENANCE_LABEL);
    // PROOF: the product row's own engine columns are never set by the plan
    expect(plan.product_pac_after).toBeNull();
    expect(plan.product_pod_after).toBeNull();
  });

  it('is NOT approved by default (empty allowlist)', () => {
    const result = planClassDerivedActivation({ product: SKIM, resolution: skimResolution(), referenceById });
    if (!result.planned) throw new Error('expected a plan');
    expect(result.plan.approved).toBe(false);
  });

  it('is approved ONLY when the code is in the supplied allowlist', () => {
    const result = planClassDerivedActivation({
      product: SKIM,
      resolution: skimResolution(),
      referenceById,
      approvedCodes: new Set(['PR-SKIM']),
    });
    if (!result.planned) throw new Error('expected a plan');
    expect(result.plan.approved).toBe(true);
  });

  it('the status-update PLAN targets only pi_calculated via the guarded service, with a review note', () => {
    const result = planClassDerivedActivation({ product: SKIM, resolution: skimResolution(), referenceById });
    if (!result.planned) throw new Error('expected a plan');
    const su = result.plan.status_update;
    expect(su.target_status).toBe('pi_calculated');
    expect(su.service).toBe('setProductLifecycleStatus');
    expect(su.product_id).toBe('id-skim');
    expect(su.review_notes).toMatch(/PI Calculated \(class-derived\)/);
    expect(su.review_notes).toMatch(/rule=milk_fat_series_v1/);
    expect(su.review_notes).toMatch(/confidence=low/);
    expect(su.review_notes).toMatch(/composition_basis=PI-MILK-15/);
    expect(su.review_notes).toMatch(/pacpod_basis=PI-MILK-15\/PI-MILK-35/);
    expect(su.review_notes).toMatch(/ephemeral — not written to product/);
  });

  it('refuses to plan a non-class-derived resolution (blocked / reference_linked / product_measured)', () => {
    const lactoseFree = product({ product_name_display: 'Leche sin lactosa', fat_percent: 1.55, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.2, salt_percent: 0.13 });
    const blocked = resolveProductIntelligence({ product: lactoseFree, candidateReferences: [MILK_15, MILK_35], matchedReference: null });
    expect(planClassDerivedActivation({ product: lactoseFree, resolution: blocked, referenceById }).planned).toBe(false);

    const measured = product({ product_name_display: 'Leche desnatada', fat_percent: 0.3, pac_value: 31, pod_value: 25 });
    const own = resolveProductIntelligence({ product: measured, candidateReferences: [MILK_15, MILK_35], matchedReference: null });
    expect(own.value_basis).toBe('product_measured');
    expect(planClassDerivedActivation({ product: measured, resolution: own, referenceById }).planned).toBe(false);
  });
});

describe('planClassDerivedActivations — batch', () => {
  const YOGURT_PRODUCT = product({ id: 'id-yog', product_code: 'PR-YOG', product_name_display: 'Yogur natural', fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1 });
  const SWEETENER = product({ id: 'id-sw', product_code: 'PR-SW', product_name_display: 'Edulcorante eritritol', product_category: 'sugar', fat_percent: 0, carbohydrate_percent: 100, total_sugars_percent: 0, protein_percent: 0, salt_percent: 0 });

  it('plans every class-derived candidate; approvedPlans is EMPTY under the default gate', () => {
    const batch = planClassDerivedActivations({ products: [SKIM, YOGURT_PRODUCT, SWEETENER], basement: BASEMENT });
    expect(batch.plans.map((p) => p.product_code).sort()).toEqual(['PR-SKIM', 'PR-YOG']); // sweetener blocked
    expect(batch.approvedPlans).toEqual([]); // nothing approved by default
    expect(batch.approvedCodes).toEqual([]);
    for (const p of batch.plans) {
      expect(p.approved).toBe(false);
      expect(p.product_pac_after).toBeNull();
    }
  });

  it('with an explicit allowlist, only the listed codes are activatable', () => {
    const batch = planClassDerivedActivations({
      products: [SKIM, YOGURT_PRODUCT, SWEETENER],
      basement: BASEMENT,
      approvedCodes: new Set(['PR-YOG']),
    });
    expect(batch.approvedPlans.map((p) => p.product_code)).toEqual(['PR-YOG']);
    expect(batch.plans.find((p) => p.product_code === 'PR-SKIM')!.approved).toBe(false);
  });

  it('is deterministic and does not mutate inputs', () => {
    const products = [SKIM, YOGURT_PRODUCT];
    const snapshot = JSON.stringify({ products, basement: BASEMENT });
    const a = planClassDerivedActivations({ products, basement: BASEMENT });
    const b = planClassDerivedActivations({ products, basement: BASEMENT });
    expect(a).toEqual(b);
    expect(JSON.stringify({ products, basement: BASEMENT })).toBe(snapshot);
  });
});

describe('productActivationPlan — boundary (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MODULE = strip(readFileSync(join(SRC, 'data', 'products', 'productActivationPlan.ts'), 'utf8'));

  it('has no DB client, service import, write verb, or IO — it only PLANS', () => {
    expect(/supabase|service_role/i.test(MODULE)).toBe(false);
    expect(/@\/services\//.test(MODULE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MODULE.includes(verb), verb).toBe(false);
    }
    expect(/fetch\s*\(|localStorage/.test(MODULE)).toBe(false);
    expect(/npac/i.test(MODULE)).toBe(false);
  });

  it('references setProductLifecycleStatus only as a PLAN string, never imports/calls it', () => {
    expect(/from '@\/services\/productStatusWrite'/.test(MODULE)).toBe(false); // not imported
    expect(/setProductLifecycleStatus\(/.test(MODULE)).toBe(false); // not called
    expect(MODULE.includes("'setProductLifecycleStatus'")).toBe(true); // the plan names it as a string
  });
});
