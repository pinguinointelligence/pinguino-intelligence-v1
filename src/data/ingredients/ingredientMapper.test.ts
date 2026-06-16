import { describe, expect, it } from 'vitest';
import { ingredientRowToEngineIngredient } from './ingredientMapper';
import type { IngredientRow } from './ingredientRow';

/** A complete row with every numeric unknown as null (the honest default). */
const baseRow: IngredientRow = {
  ingredient_id: 'PI-ING-TEST',
  ingredient_name_internal: 'test_internal',
  ingredient_name_display: 'Test Display',
  brand: '',
  supplier: '',
  country: '',
  ean_code: '',
  ingredient_category: 'other',
  ingredient_subcategory: '',
  approved_for_pinguino_base: true,
  approved_for_minus_11_engine: true,
  verification_status: 'verified',
  verification_source: 'pinguino_internal_confirmed_dataset_v0_94',
  verification_date: '2026-06-16',
  data_confidence_percent: null,
  water_percent: null,
  total_solids_percent: null,
  fat_percent: null,
  saturated_fat_percent: null,
  milk_fat_percent: null,
  non_fat_milk_solids_percent: null,
  protein_percent: null,
  aerating_protein_percent: null,
  carbohydrate_percent: null,
  total_sugars_percent: null,
  sucrose_percent: null,
  dextrose_percent: null,
  glucose_percent: null,
  fructose_percent: null,
  lactose_percent: null,
  polyol_percent: null,
  fiber_percent: null,
  salt_percent: null,
  alcohol_percent: null,
  ash_percent: null,
  acidity_percent: null,
  brix: null,
  dry_matter_percent: null,
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  sweetness_factor: null,
  freezing_factor: null,
  stabilizer_activity: null,
  recommended_dosage_percent_min: null,
  recommended_dosage_percent_max: null,
  kcal_per_100g: null,
  cost_per_kg: null,
  currency: 'EUR',
  allergens: '',
  vegan: 'unknown',
  dairy_free: 'unknown',
  gluten_free: 'unknown',
  contains_alcohol: 'unknown',
  storage_type: 'unknown',
  shelf_life_days: null,
  usage_notes: '',
  engine_notes: '',
  source_url: '',
  screenshot_reference: '',
  last_reviewed_by: 'PINGUINO team',
  last_reviewed_at: '2026-06-16',
  dataset_version: 'v0.94',
  is_active: true,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: '2026-06-16T00:00:00Z',
};

const makeRow = (overrides: Partial<IngredientRow>): IngredientRow => ({ ...baseRow, ...overrides });

describe('ingredientRowToEngineIngredient', () => {
  it('maps a fully-populated row correctly', () => {
    const eng = ingredientRowToEngineIngredient(
      makeRow({
        ingredient_id: 'PI-ING-000001',
        ingredient_name_display: 'Advocaat Liqueur 15%',
        ingredient_name_internal: 'advocaat_liqueur_15_percent',
        ingredient_category: 'alcohol',
        data_confidence_percent: 98,
        water_percent: 49.87,
        total_solids_percent: 39.13,
        fat_percent: 12,
        saturated_fat_percent: 0,
        protein_percent: 5,
        carbohydrate_percent: 22,
        total_sugars_percent: 22,
        sucrose_percent: 22,
        alcohol_percent: 11,
        pod_value: 22,
        pac_value: 104.161,
        npac_value: 0,
        de_value: null,
        cost_per_kg: 14,
        vegan: 'false',
      }),
    );

    expect(eng.id).toBe('PI-ING-000001');
    expect(eng.name).toBe('Advocaat Liqueur 15%');
    expect(eng.category).toBe('alcohol');
    // renamed composition fields
    expect(eng.composition.solids_percent).toBe(39.13); // total_solids_percent
    expect(eng.composition.sugar_percent).toBe(22); // total_sugars_percent
    expect(eng.composition.fat_percent).toBe(12);
    expect(eng.composition.saturated_fat_percent).toBe(0); // a verified zero, present
    expect(eng.composition.alcohol_percent).toBe(11);
    // stored engine values preserved (verified zero stays 0; blank stays null)
    expect(eng.pod_value).toBe(22);
    expect(eng.pac_value).toBe(104.161);
    expect(eng.npac_value).toBe(0);
    expect(eng.de_value).toBeNull();
    expect(eng.cost_per_kg).toBe(14);
    // provenance
    expect(eng.confidence_score).toBe(98);
    expect(eng.source_type).toBe('verified_db');
    expect(eng.is_verified).toBe(true);
    expect(eng.flags?.is_animal_origin).toBe(true); // vegan = false
  });

  it('handles unknowns honestly', () => {
    const eng = ingredientRowToEngineIngredient(
      makeRow({ ingredient_category: 'base_mix', verification_status: 'needs_review' }),
    );
    // required composition numbers coerced to 0 at the engine seam
    expect(eng.composition.water_percent).toBe(0);
    expect(eng.composition.fat_percent).toBe(0);
    expect(eng.composition.kcal_per_100g).toBe(0);
    // optional saturated fat stays ABSENT (never invented as 0)
    expect(eng.composition.saturated_fat_percent).toBeUndefined();
    // nullable engine/cost values preserved as null
    expect(eng.pod_value).toBeNull();
    expect(eng.pac_value).toBeNull();
    expect(eng.npac_value).toBeNull();
    expect(eng.cost_per_kg).toBeNull();
    // null confidence → 0; non-verified status → false
    expect(eng.confidence_score).toBe(0);
    expect(eng.is_verified).toBe(false);
    // base_mix falls back to other
    expect(eng.category).toBe('other');
  });

  it('falls back to the internal name when display is blank', () => {
    const eng = ingredientRowToEngineIngredient(
      makeRow({ ingredient_name_display: '   ', ingredient_name_internal: 'fallback_name' }),
    );
    expect(eng.name).toBe('fallback_name');
  });

  it('derives dairy/stabilizer hints from the mapped category', () => {
    expect(ingredientRowToEngineIngredient(makeRow({ ingredient_category: 'dairy' })).flags?.is_dairy).toBe(true);
    expect(ingredientRowToEngineIngredient(makeRow({ ingredient_category: 'emulsifier' })).flags?.is_stabilizer).toBe(true);
  });
});
