/**
 * Phase 3 — recipe-calculation SAFETY for a "My Products" ingredient.
 *
 * Proves that selecting a confirmed product in a recipe is calculation-equivalent to selecting
 * its linked reference (the product borrows the reference's clean profile), that NO raw
 * product text reaches the engine, and that the handoff never mutates the product row's
 * pac/pod (they stay null — engine values are resolved in-memory at handoff time).
 */
import { describe, expect, it } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import type { ProductRow } from './productRow';
import { buildProductEngineLibrary } from './productEngineLibrary';

const refRow = (over: Partial<IngredientRow> = {}): IngredientRow =>
  ({
    ingredient_id: 'PI-ING-000180', ingredient_name_internal: 'cream-30', ingredient_name_display: 'Cream 30% UHT',
    ingredient_category: 'dairy', water_percent: 64.42, total_solids_percent: 35.58, fat_percent: 30, protein_percent: 2.3,
    carbohydrate_percent: 3.2, total_sugars_percent: 3.2, lactose_percent: 3.2, salt_percent: 0.08,
    pac_value: 3.668, pod_value: 0.512, de_value: null, cost_per_kg: 4, data_confidence_percent: 90,
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

const recipeWith = (ingredient: EngineIngredient): RecipeInput => ({
  items: [
    { id: 'milk', ingredient: ingredientRowToEngineIngredient(refRow({ ingredient_id: 'PI-ING-MILK', ingredient_name_display: 'Whole Milk', fat_percent: 3.5, water_percent: 87.5, total_solids_percent: 12.5, pac_value: 4.8, pod_value: 4.8 })), planned_grams: 700, actual_grams: null, lock_type: 'unlocked' },
    { id: 'sel', ingredient, planned_grams: 300, actual_grams: null, lock_type: 'unlocked' },
  ],
  mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 1000, machine_capacity_grams: null,
});

describe('My Products recipe-calculation safety', () => {
  it('a selected product calculates identically to its linked reference (recipe math unchanged)', () => {
    const productIng = buildProductEngineLibrary({ products: [product()], referenceById: refById }).ingredients[0]!;
    const referenceIng = ingredientRowToEngineIngredient(refRow());

    const fromProduct = calculateRecipe(recipeWith(productIng));
    const fromReference = calculateRecipe(recipeWith(referenceIng));

    expect(Number.isFinite(fromProduct.pac_points)).toBe(true);
    expect(fromProduct.pac_points ?? NaN).toBeCloseTo(fromReference.pac_points ?? NaN, 9);
    expect(fromProduct.pod_points ?? NaN).toBeCloseTo(fromReference.pod_points ?? NaN, 9);
    expect(fromProduct.percentages.water_percent).toBeCloseTo(fromReference.percentages.water_percent, 9);
    expect(fromProduct.totals.solids_g).toBeCloseTo(fromReference.totals.solids_g, 9);
  });

  it('PAC/POD are resolved at handoff (from the reference), never copied onto the product row', () => {
    const p = product();
    const ing = buildProductEngineLibrary({ products: [p], referenceById: refById }).ingredients[0]!;
    expect(ing.pac_value).toBe(3.668); // resolved, reference-linked
    expect(ing.pod_value).toBe(0.512);
    expect(ing.is_verified).toBe(false);
    expect(p.pac_value).toBeNull(); // product row untouched (pure handoff)
    expect(p.pod_value).toBeNull();
  });

  it('no raw product text (OCR / catalog / source notes) reaches the engine ingredient or result', () => {
    const noisy = product({ detected_text: 'INGREDIENTES: nata, estabilizante E-407, aroma' });
    const ing = buildProductEngineLibrary({ products: [noisy], referenceById: refById }).ingredients[0]!;
    expect(JSON.stringify(ing)).not.toMatch(/E-407|estabilizante|INGREDIENTES/);
    const result = calculateRecipe(recipeWith(ing));
    expect(JSON.stringify(result)).not.toMatch(/E-407|estabilizante|INGREDIENTES/);
  });

  it('a red-flagged product still calculates correctly but is flagged in provenance (warning, not corrupted math)', () => {
    const flagged = product({ id: 'f', product_code: 'PR-ING-000032', product_name_display: 'Chocolate 0% azúcares edulcorante maltitol' });
    const lib = buildProductEngineLibrary({ products: [flagged], referenceById: refById });
    const ing = lib.ingredients[0]!;
    // red flag is metadata — the recipe math is identical to the clean reference
    const fromFlagged = calculateRecipe(recipeWith(ing));
    const fromReference = calculateRecipe(recipeWith(ingredientRowToEngineIngredient(refRow())));
    expect(fromFlagged.pac_points ?? NaN).toBeCloseTo(fromReference.pac_points ?? NaN, 9);
    // ...but provenance warns the caller to gate it
    const prov = lib.provenance.get('PR-ING-000032')!;
    expect(prov.blocked_by_red_flags).toBe(true);
    expect(prov.warnings.length).toBeGreaterThan(0);
  });

  it('rejected / null / draft products never enter the Studio library', () => {
    const products = [
      product({ id: 'r', product_code: 'PR-R', mapper_status: 'rejected', matched_basement_id: null }),
      product({ id: 'n', product_code: 'PR-N', mapper_status: null, status: 'draft' }),
      product({ id: 'd', product_code: 'PR-D', mapper_status: 'matched', status: 'draft' }),
    ];
    expect(buildProductEngineLibrary({ products, referenceById: refById }).ingredients).toHaveLength(0);
  });
});
