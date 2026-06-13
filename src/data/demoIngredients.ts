/**
 * Local demo / reference ingredient catalog for the Studio demo (Step 5A).
 *
 * DEMO / REFERENCE VALUES — literature compositions, confidence < 100, NOT
 * database truth and NOT external-reference calibration data. The verified
 * ingredient database arrives in Phase 2. Costs are reference estimates used
 * only so the cost panel has something to show.
 *
 * Reference costs are EUR/kg estimates (business-pending). Compositions are
 * the same literature values used across the engine QA layer, defined
 * independently here so app code never imports test fixtures.
 */
import type { EngineIngredient, IngredientComponentProfile } from '@/engine';

const ZERO: IngredientComponentProfile = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const demo = (
  id: string,
  name: string,
  category: EngineIngredient['category'],
  composition: Partial<IngredientComponentProfile>,
  cost_per_kg: number,
  flags?: EngineIngredient['flags'],
): EngineIngredient => ({
  id,
  name,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  cost_per_kg, // reference estimate — demo only
  confidence_score: 85, // demo/reference, not verified
  source_type: 'manual',
  is_verified: false,
  flags,
});

export const DEMO_INGREDIENTS: readonly EngineIngredient[] = [
  demo('milk_3_5', 'Milk 3.5 %', 'dairy', { water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 }, 0.9, { is_dairy: true, is_animal_origin: true }),
  demo('cream_30', 'Cream 30 %', 'dairy', { water_percent: 63.4, solids_percent: 36.6, fat_percent: 30, protein_percent: 2.3, carbohydrate_percent: 3.3, sugar_percent: 3.3, lactose_percent: 3.3, salt_percent: 0.1, kcal_per_100g: 292 }, 4, { is_dairy: true, is_animal_origin: true }),
  demo('sucrose', 'Sucrose', 'sugar', { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 }, 1.1),
  demo('dextrose', 'Dextrose', 'sugar', { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 }, 1.6),
  demo('smp', 'Skimmed milk powder', 'dairy', { water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 }, 7, { is_dairy: true, is_animal_origin: true }),
  demo('inulin', 'Inulin', 'stabilizer', { water_percent: 5, solids_percent: 95, carbohydrate_percent: 90, fiber_percent: 90, kcal_per_100g: 190 }, 9, { is_stabilizer: true }),
  demo('salt', 'Salt', 'other', { solids_percent: 100, salt_percent: 100 }, 0.5),
  demo('tara_gum', 'Tara gum', 'stabilizer', { water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 }, 18, { is_stabilizer: true }),
  demo('raspberry', 'Raspberry', 'fruit', { water_percent: 86, solids_percent: 14, fat_percent: 0.3, protein_percent: 1.2, carbohydrate_percent: 11, sugar_percent: 4.4, fructose_percent: 2.4, glucose_percent: 2, fiber_percent: 6.5, kcal_per_100g: 43 }, 6),
  demo('banana', 'Banana', 'fruit', { water_percent: 74.9, solids_percent: 25.1, fat_percent: 0.3, protein_percent: 1.1, carbohydrate_percent: 22.8, sugar_percent: 12.2, sucrose_percent: 2.4, glucose_percent: 5, fructose_percent: 4.8, fiber_percent: 2.6, kcal_per_100g: 89 }, 2),
  demo('cocoa_2224', 'Cocoa 22/24', 'chocolate_cocoa', { water_percent: 3, solids_percent: 97, fat_percent: 23, protein_percent: 20, carbohydrate_percent: 12, sugar_percent: 0.5, fiber_percent: 30, salt_percent: 0.1, kcal_per_100g: 400 }, 12),
  demo('dark_chocolate_70', 'Dark chocolate 70 %', 'chocolate_cocoa', { water_percent: 1, solids_percent: 99, fat_percent: 42, protein_percent: 7.5, carbohydrate_percent: 38, sugar_percent: 28, sucrose_percent: 28, fiber_percent: 10, kcal_per_100g: 580 }, 14),
  demo('pistachio_paste', 'Pistachio paste', 'nut_paste', { water_percent: 1, solids_percent: 99, fat_percent: 45.3, protein_percent: 20.2, carbohydrate_percent: 27, sugar_percent: 7.7, sucrose_percent: 7, fiber_percent: 10, kcal_per_100g: 562 }, 40, { is_flavor_booster: true }),
  demo('whiskey_40', 'Whiskey 40 % vol', 'alcohol', { water_percent: 60, alcohol_percent: 40, kcal_per_100g: 280 }, 25, { is_flavor_booster: true }),
];

export const findDemoIngredient = (id: string): EngineIngredient | undefined =>
  DEMO_INGREDIENTS.find((ingredient) => ingredient.id === id);
