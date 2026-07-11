/**
 * DEV-only fixtures for the IF9/IF10 exact-recalculation preview (Slice 19).
 * Pure, deterministic scenarios over the existing engine-input fixtures — used
 * ONLY by the DEV preview page and tests. No product DB, no Mapper, no writes.
 */
import type { IngredientComponentProfile, RecipeInput, RecipeItem } from '@/engine';
import type { BatchRescueIntent, StockShortageIntent } from '@/spine';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';
import { raspberrySubstituteContract } from './verifiedSubstituteFixtures';
import type { VerifiedSubstituteContract } from './verifiedSubstituteContract';

const gelatoRecipe = (): RecipeInput => findOptimizationPreviewFixture('gelato-tradeoff')!.recipe;
const sorbetRecipe = (): RecipeInput => findOptimizationPreviewFixture('sorbet-ready')!.recipe;

/* ── dairy-free too-soft fixtures (profile-safety regression, Slice 25) ───── */

const ZERO: IngredientComponentProfile = {
  water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0,
  sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0, fructose_percent: 0,
  lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
};
const comp = (over: Partial<IngredientComponentProfile>): IngredientComponentProfile => ({ ...ZERO, ...over });
const OAT_DRINK = comp({ water_percent: 90, solids_percent: 10, fat_percent: 1.5, protein_percent: 1, carbohydrate_percent: 7, sugar_percent: 4, kcal_per_100g: 45 });
const COCONUT_CREAM = comp({ water_percent: 68, solids_percent: 32, fat_percent: 24, protein_percent: 2, carbohydrate_percent: 5, sugar_percent: 3, kcal_per_100g: 230 });
const SUCROSE = comp({ solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 });
const DEXTROSE = comp({ water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 });
const INULIN = comp({ water_percent: 5, solids_percent: 95, carbohydrate_percent: 95, fiber_percent: 90, kcal_per_100g: 150 });
const TARA = comp({ water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 });

const fixtureItem = (
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

/** Sorbet −11 with +120 g sucrose: npac ≈ 52.3 above the [35,40] band — a real
 * too-soft sorbet whose only legal exact levers are NON-dairy (water/inulin). */
const softSorbetRecipe = (): RecipeInput => {
  const base = sorbetRecipe();
  return {
    ...base,
    items: base.items.map((i) =>
      i.id === 'sucrose' ? { ...i, planned_grams: i.planned_grams + 120 } : i,
    ),
    target_batch_grams: base.target_batch_grams + 120,
  };
};

/** Vegan gelato −11, oversugared: npac ≈ 58.9 above the [35,52] band — a real
 * too-soft vegan batch; dairy is forbidden, water is the verified rescue lever. */
const softVeganRecipe = (): RecipeInput => ({
  items: [
    fixtureItem('oat', 'other', OAT_DRINK, 480),
    fixtureItem('coconut', 'other', COCONUT_CREAM, 180),
    fixtureItem('sucrose', 'sugar', SUCROSE, 150),
    fixtureItem('dextrose', 'sugar', DEXTROSE, 105),
    fixtureItem('inulin', 'other', INULIN, 60),
    fixtureItem('tara', 'stabilizer', TARA, 5),
  ],
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -11,
  target_batch_grams: 980,
  machine_capacity_grams: null,
});

const baseConstraints = {
  canReprocess: true,
  liquidAdditionPossible: true,
  dryAdditionPossible: true,
  batchAlreadyFrozen: false,
} as const;

export interface BatchRescueScenario {
  id: string;
  label: string;
  kind: 'batch_rescue';
  rescueIntent: BatchRescueIntent;
  actualRecipe: RecipeInput;
}

export interface StockShortageScenario {
  id: string;
  label: string;
  kind: 'stock_shortage';
  shortageIntent: StockShortageIntent;
  plannedRecipe: RecipeInput;
}

export interface VerifiedSubstituteScenario {
  id: string;
  label: string;
  kind: 'verified_substitute';
  shortageIntent: StockShortageIntent;
  plannedRecipe: RecipeInput;
  /** LAZY on purpose: a top-level call here would drag the fixture module into
   * the production bundle (rolldown cannot prove cross-module calls pure). */
  contract: () => VerifiedSubstituteContract;
}

export type BranchRecalculationScenario =
  | BatchRescueScenario
  | StockShortageScenario
  | VerifiedSubstituteScenario;

/** Standard Gelato batch served at −12: npac 40 sits below the regulator −12 band
 * [42,50], so the too_hard rescue has a REAL solvable violation (via Slice 14). */
const rescueRecipeAtMinus12 = (): RecipeInput => ({ ...gelatoRecipe(), target_temperature_c: -12 });

export const BRANCH_RECALCULATION_SCENARIOS: readonly BranchRecalculationScenario[] = [
  {
    id: 'rescue-too-hard-12',
    label: 'IF9 · Standard Gelato −12 · too hard (unfrozen) → real solver attempt, engine verdict honest',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -12,
      batchSizeG: 1000,
      observation: { problem: 'too_hard' },
      constraints: { ...baseConstraints },
    },
    actualRecipe: rescueRecipeAtMinus12(),
  },
  {
    id: 'rescue-too-hard-11',
    label: 'IF9 · Standard Gelato −11 · too hard → single-shot lands but OVERSHOOTS band → honest partial + lever attempt',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -11,
      batchSizeG: 1000,
      observation: { problem: 'too_hard' },
      constraints: { ...baseConstraints },
    },
    actualRecipe: gelatoRecipe(),
  },
  {
    id: 'rescue-frozen-no-reprocess',
    label: 'IF9 · frozen batch, reprocessing unavailable → no fake grams',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -12,
      batchSizeG: 1000,
      observation: { problem: 'too_hard' },
      constraints: { ...baseConstraints, batchAlreadyFrozen: true, canReprocess: false },
    },
    actualRecipe: rescueRecipeAtMinus12(),
  },
  {
    id: 'rescue-food-safety',
    label: 'IF9 · contamination concern → discard, never calculated',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -12,
      batchSizeG: 1000,
      observation: { problem: 'too_hard', foodSafetyConcern: true },
      constraints: { ...baseConstraints },
    },
    actualRecipe: rescueRecipeAtMinus12(),
  },
  {
    id: 'rescue-temp-mismatch',
    label: 'IF9 · serving temperature mismatch → guidance only (non-compositional)',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -12,
      batchSizeG: 1000,
      observation: { problem: 'serving_temperature_mismatch', observedServingTemperatureC: -15 },
      constraints: { ...baseConstraints },
    },
    actualRecipe: rescueRecipeAtMinus12(),
  },
  {
    id: 'rescue-icy',
    label: 'IF9 · icy batch → physical measurements required first',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'standard_gelato',
      intendedServingTemperatureC: -12,
      batchSizeG: 1000,
      observation: { problem: 'icy' },
      constraints: { ...baseConstraints },
    },
    actualRecipe: rescueRecipeAtMinus12(),
  },
  {
    id: 'rescue-sorbet-too-soft',
    label: 'IF9 · Sorbet −11 · too soft → NON-dairy add-only rescue (dairy is forbidden, never offered)',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'sorbet',
      intendedServingTemperatureC: -11,
      batchSizeG: 1120,
      observation: { problem: 'too_soft' },
      constraints: { ...baseConstraints },
    },
    actualRecipe: softSorbetRecipe(),
  },
  {
    id: 'rescue-vegan-too-soft',
    label: 'IF9 · Vegan −11 · too soft → verified NON-dairy water rescue (dairy is forbidden, never offered)',
    kind: 'batch_rescue',
    rescueIntent: {
      productProfile: 'vegan_gelato',
      intendedServingTemperatureC: -11,
      batchSizeG: 980,
      observation: { problem: 'too_soft' },
      constraints: { ...baseConstraints },
    },
    actualRecipe: softVeganRecipe(),
  },
  {
    id: 'shortage-scale-down',
    label: 'IF10 · strawberry short (72%) → verified scaled-batch preview',
    kind: 'stock_shortage',
    shortageIntent: {
      productProfile: 'sorbet',
      batchSizeG: 1000,
      observation: {
        shortages: [
          { lineId: 'strawberry', ingredientName: 'Strawberry', correctionFamily: 'fruit', requiredG: 600, availableG: 432 },
        ],
      },
      constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: false },
    },
    plannedRecipe: sorbetRecipe(),
  },
  {
    id: 'shortage-dairy-substitute',
    label: 'IF10 · dairy substitute offered to sorbet → unsafe, blocked',
    kind: 'stock_shortage',
    shortageIntent: {
      productProfile: 'sorbet',
      batchSizeG: 1000,
      observation: {
        shortages: [
          {
            lineId: 'strawberry',
            ingredientName: 'Strawberry',
            correctionFamily: 'fruit',
            requiredG: 600,
            availableG: 0,
            substitute: { ingredientName: 'Cream 30%', available: true, hasVerifiedIngredientData: true, correctionFamily: 'cream', isDairy: true },
          },
        ],
      },
      constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false },
    },
    plannedRecipe: sorbetRecipe(),
  },
  {
    id: 'shortage-verified-substitute',
    label: 'IF10 · strawberry short (240/600) + VERIFIED raspberry substitute → exact swap preview',
    kind: 'verified_substitute',
    shortageIntent: {
      productProfile: 'sorbet',
      batchSizeG: 1000,
      observation: {
        shortages: [
          { lineId: 'strawberry', ingredientName: 'Strawberry', correctionFamily: 'fruit', requiredG: 600, availableG: 240 },
        ],
      },
      constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false },
    },
    plannedRecipe: sorbetRecipe(),
    contract: raspberrySubstituteContract, // reference, not a call — see the type note
  },
  {
    id: 'shortage-missing-quantities',
    label: 'IF10 · unknown stock quantity → blocked, measure first',
    kind: 'stock_shortage',
    shortageIntent: {
      productProfile: 'sorbet',
      batchSizeG: 1000,
      observation: {
        shortages: [
          { lineId: 'strawberry', ingredientName: 'Strawberry', correctionFamily: 'fruit', requiredG: 600, availableG: null },
        ],
      },
      constraints: { canScaleBatchDown: true, canReformulate: true, purchaseOrWaitPossible: true },
    },
    plannedRecipe: sorbetRecipe(),
  },
];
