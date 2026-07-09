/**
 * DEV-only fixtures for the IF9/IF10 exact-recalculation preview (Slice 19).
 * Pure, deterministic scenarios over the existing engine-input fixtures — used
 * ONLY by the DEV preview page and tests. No product DB, no Mapper, no writes.
 */
import type { RecipeInput } from '@/engine';
import type { BatchRescueIntent, StockShortageIntent } from '@/spine';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';

const gelatoRecipe = (): RecipeInput => findOptimizationPreviewFixture('gelato-tradeoff')!.recipe;
const sorbetRecipe = (): RecipeInput => findOptimizationPreviewFixture('sorbet-ready')!.recipe;

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

export type BranchRecalculationScenario = BatchRescueScenario | StockShortageScenario;

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
