/**
 * DEV-only sample recipes for the Optimization Preview (Spine Slice 9).
 *
 * Pure, deterministic `RecipeInput` fixtures + their normalized intents, chosen
 * to exercise each Integration/Optimizer decision path through the REAL Base
 * Engine (`calculateRecipe`) and the REAL correction solver. NO product DB, NO
 * Mapper products, no external DB — just literature-value compositions run through
 * the engine. These are used ONLY by the DEV preview runner/page.
 */
import type {
  IngredientComponentProfile,
  ProductCategory,
  RecipeInput,
  RecipeItem,
} from '@/engine';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent, type ProductProfile, type ServingTemperatureC } from '@/spine';

const ZERO: IngredientComponentProfile = {
  water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0,
  sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0, fructose_percent: 0,
  lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
};

const comp = (over: Partial<IngredientComponentProfile>): IngredientComponentProfile => ({ ...ZERO, ...over });

const MILK = comp({ water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 });
const CREAM35 = comp({ water_percent: 58.9, solids_percent: 41.1, fat_percent: 35, protein_percent: 2.2, carbohydrate_percent: 3.1, sugar_percent: 3.1, lactose_percent: 3.1, salt_percent: 0.1, kcal_per_100g: 337 });
const SMP = comp({ water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 });
const SUCROSE = comp({ solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 });
const DEXTROSE = comp({ water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 });
const INULIN = comp({ water_percent: 5, solids_percent: 95, carbohydrate_percent: 95, fiber_percent: 90, kcal_per_100g: 150 });
const TARA = comp({ water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 });
const STRAWBERRY = comp({ water_percent: 90.8, solids_percent: 9.2, protein_percent: 0.7, carbohydrate_percent: 7.7, sugar_percent: 4.9, fructose_percent: 2.5, glucose_percent: 2.4, fiber_percent: 2, salt_percent: 0.01, kcal_per_100g: 33 });
const DARK_CHOC = comp({ water_percent: 1, solids_percent: 99, fat_percent: 42, protein_percent: 8, carbohydrate_percent: 46, sugar_percent: 29, sucrose_percent: 29, fiber_percent: 11, kcal_per_100g: 600 });
const WATER = comp({ water_percent: 100 });

const item = (
  id: string,
  category: RecipeItem['ingredient']['category'],
  composition: IngredientComponentProfile,
  grams: number,
): RecipeItem => ({
  id,
  ingredient: {
    id: `ing-${id}`, name: id, category, composition,
    pod_value: null, pac_value: null, npac_value: null, de_value: null,
    cost_per_kg: 1, confidence_score: 90, source_type: 'manual', is_verified: false,
  },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const recipe = (items: RecipeItem[], category: ProductCategory, temperatureC: number): RecipeInput => ({
  items,
  mode: 'classic',
  category,
  target_temperature_c: temperatureC,
  target_batch_grams: items.reduce((s, i) => s + i.planned_grams, 0),
  machine_capacity_grams: null,
});

const intent = (over: Partial<NormalizedRecipeIntent>): NormalizedRecipeIntent => ({
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -11,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: { vegan: false, lactoseFree: false, glutenFree: false, allergenAware: false, noAddedSugar: false, lowSugar: false, alcohol: false },
  constraints: { excludedIngredientIds: [], lockedIngredientIds: [], heroIngredientIds: [], batchSizeG: null, machineCapacityG: null },
  source: 'user_input',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
  ...over,
});

export interface OptimizationPreviewFixture {
  id: string;
  label: string;
  /** What decision path this fixture is meant to exercise (documentation + DEV display). */
  intendedDecision: 'tradeoff' | 'impossible' | 'advisory' | 'ready_or_warning' | 'blocked';
  intent: NormalizedRecipeIntent;
  recipe: RecipeInput;
}

const P = (p: ProductProfile) => p;
const T = (t: ServingTemperatureC) => t;

export const OPTIMIZATION_PREVIEW_FIXTURES: readonly OptimizationPreviewFixture[] = [
  {
    id: 'gelato-tradeoff',
    label: 'Standard Gelato · POD too low (correctable) · −11°C',
    intendedDecision: 'tradeoff',
    intent: intent({ productProfile: P('standard_gelato'), servingTemperatureC: T(-11), flavorGroup: 'vanilla' }),
    recipe: recipe(
      [item('milk', 'dairy', MILK, 740), item('cream', 'dairy', CREAM35, 130), item('smp', 'dairy', SMP, 35), item('sucrose', 'sugar', SUCROSE, 60), item('dextrose', 'sugar', DEXTROSE, 30), item('tara', 'stabilizer', TARA, 5)],
      'milk_gelato', -11,
    ),
  },
  {
    id: 'gelato-impossible',
    label: 'Standard Gelato · fat far too high (no temperature-layer lever) · −11°C',
    intendedDecision: 'impossible',
    intent: intent({ productProfile: P('standard_gelato'), servingTemperatureC: T(-11), flavorGroup: 'vanilla' }),
    recipe: recipe(
      // Cream-heavy: fat above the [5,12] band (no Standard-Gelato fat correction goal), while SMP
      // keeps protein/lactose in band and moderate sugar keeps NPAC/POD in band — so only no-lever
      // gates fail and the optimizer has no correction direction.
      [item('milk', 'dairy', MILK, 430), item('cream', 'dairy', CREAM35, 360), item('smp', 'dairy', SMP, 40), item('sucrose', 'sugar', SUCROSE, 110), item('dextrose', 'sugar', DEXTROSE, 45), item('tara', 'stabilizer', TARA, 10)],
      'milk_gelato', -11,
    ),
  },
  {
    id: 'chocolate-advisory',
    label: 'Chocolate Gelato · cocoa dilutes protein share (advisory) · −13°C',
    intendedDecision: 'advisory',
    intent: intent({ productProfile: P('chocolate_gelato'), servingTemperatureC: T(-13), flavorGroup: 'chocolate' }),
    recipe: recipe(
      // Cocoa solids dilute the dairy protein share BELOW the visible benchmark — the chocolate
      // regulator treats that as ADVISORY (never a standard-gelato hard fail).
      [item('milk', 'dairy', MILK, 520), item('cream', 'dairy', CREAM35, 120), item('smp', 'dairy', SMP, 35), item('sucrose', 'sugar', SUCROSE, 95), item('dextrose', 'sugar', DEXTROSE, 65), item('inulin', 'other', INULIN, 43), item('chocolate', 'chocolate_cocoa', DARK_CHOC, 120), item('tara', 'stabilizer', TARA, 2)],
      'chocolate_gelato', -13,
    ),
  },
  {
    id: 'sorbet-ready',
    label: 'Strawberry Sorbet · clean −11°C reference',
    intendedDecision: 'ready_or_warning',
    intent: intent({ productProfile: P('sorbet'), servingTemperatureC: T(-11), flavorGroup: 'fruit' }),
    recipe: recipe(
      [item('sucrose', 'sugar', SUCROSE, 103.8), item('dextrose', 'sugar', DEXTROSE, 59), item('inulin', 'other', INULIN, 55.4), item('tara', 'stabilizer', TARA, 0.8), item('water', 'water', WATER, 181), item('strawberry', 'fruit', STRAWBERRY, 600)],
      'sorbet', -11,
    ),
  },
  {
    id: 'granita-blocked',
    label: 'Granita · unsupported profile (blocked, never remapped)',
    intendedDecision: 'blocked',
    intent: intent({ productProfile: 'granita' as unknown as ProductProfile, servingTemperatureC: T(-11) }),
    recipe: recipe(
      [item('sucrose', 'sugar', SUCROSE, 180), item('water', 'water', WATER, 620), item('strawberry', 'fruit', STRAWBERRY, 200)],
      'sorbet', -11,
    ),
  },
];

export const findOptimizationPreviewFixture = (id: string): OptimizationPreviewFixture | null =>
  OPTIMIZATION_PREVIEW_FIXTURES.find((f) => f.id === id) ?? null;
