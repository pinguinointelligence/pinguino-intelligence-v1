/**
 * PINGÜINO PI Recipe Monitor — REAL recalculation runner (the sanctioned seam).
 *
 * This is the ONLY PI-Monitor file that touches the engine/solver, and it does so
 * ONLY through the existing optimization feature runner `previewOptimization`
 * (which itself wires the real Base Engine + correction solver + Temperature
 * Regulator rerun through the spine routers). PI Monitor writes NO new solver and
 * re-hardcodes NO bands — it adapts the sanctioned `OptimizationPreviewView` onto
 * the minimal `PiRecalculationRunnerResult`. Pure preview: nothing is saved or
 * persisted; the corrected snapshot is opaque and only ever used for a LOCAL apply.
 */
import type { RecipeInput } from '@/engine';
import {
  previewOptimization,
  studioIntentFromRecipe,
} from '@/features/optimization/optimizationPreviewRunner';
import type { NormalizedRecipeIntent } from '@/spine';
import type {
  PiAxisMetricValues,
  PiRecalculationRunner,
  PiRecalculationRunnerResult,
} from './piMonitorContracts';

const toAxisMetrics = (m: {
  pod: number;
  iceFraction: number;
  fat?: number;
  solids: number;
}): PiAxisMetricValues => ({ pod: m.pod, iceFraction: m.iceFraction, fat: m.fat, solids: m.solids });

/**
 * The real recalculation runner: delegates the whole recalculation to
 * `previewOptimization` and adapts its verdict + rerun regression info. The
 * caller passes a `recipeDraft` that is a real `RecipeInput`.
 */
export const realPiRecalculationRunner: PiRecalculationRunner = ({ intent, recipeDraft }) => {
  const recipe = recipeDraft as RecipeInput;
  const view = previewOptimization({ recipe, intent });
  const result: PiRecalculationRunnerResult = {
    category: recipe.category,
    servingTemperatureC: view.servingTemperatureC,
    beforeMetrics: toAxisMetrics(view.beforeMetrics),
    afterMetrics: view.afterMetrics ? toAxisMetrics(view.afterMetrics) : null,
    decision: view.finalDecision,
    rerunState: view.rerunState,
    rerunNewFailures: view.rerun?.newFailures ?? [],
    rerunWorsenedFailures: view.rerun?.worsenedFailures ?? [],
    proposedAdjustments: view.proposedAdjustments.map((a) => ({
      type: a.type,
      ingredient: a.ingredient,
      grams: a.grams,
    })),
    correctedRecipeSnapshot: view.engineSeededSolve.correctedRecipeSnapshot,
    warnings: [...view.warnings],
    hardBlockers: [...view.hardBlockers],
  };
  return result;
};

/** Build the base intent for a live recipe (delegates to the optimization feature). */
export function piBaseIntentFromRecipe(recipe: RecipeInput): NormalizedRecipeIntent {
  return studioIntentFromRecipe(recipe);
}
