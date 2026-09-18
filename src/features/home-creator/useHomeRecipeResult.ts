/**
 * GELLATTI HOME — the live engine result and Score for the shared recipe (§51, §59).
 *
 * §59: "show the current Score live using the existing authority. No new score
 * calculation." So this hook does exactly what the Pro workbench header does —
 * `buildRecipeInput(recipeStore state)` → `calculateRecipe` → `monitorScoreView` —
 * and nothing else. HOME and PRO therefore read the SAME number from the SAME code.
 *
 * Served 2026-09-18 it had drifted: PRO had moved to the technical fit (bands, the
 * chosen Direction, Protein) while HOME still read `recipeMatchScore`, which is now a
 * QA/diagnostic recorder only — the same saved recipe said 9/10 in HOME and 10 in PRO.
 */
import { useMemo } from 'react';
import { calculateRecipe, type RecipeResult } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { recipeTechnicalFit, type TechnicalFitPresentation } from '@/features/recipe-score';
import { useRecipeStore } from '@/stores/recipeStore';

export interface HomeRecipeResult {
  readonly result: RecipeResult | null;
  readonly score: TechnicalFitPresentation;
}

export function useHomeRecipeResult(enabled: boolean): HomeRecipeResult {
  // Subscribing to the whole store is deliberate: the result depends on items, grams,
  // batch, temperature and Direction together, and a partial subscription would show
  // a Score that lags the recipe the user is looking at.
  const state = useRecipeStore();

  return useMemo(() => {
    // §18/§51: before the first recipe exists there is no Score at all — not a zero,
    // not a placeholder. `recipeTechnicalFit(null)` is the honest no-data presentation.
    if (!enabled || state.items.length === 0) {
      return { result: null, score: recipeTechnicalFit(null) };
    }
    try {
      const input = buildRecipeInput(state);
      const result = calculateRecipe(input);
      return { result, score: monitorScoreView(result, input).match };
    } catch {
      // An un-formulatable draft shows no Score rather than a fabricated one.
      return { result: null, score: recipeTechnicalFit(null) };
    }
  }, [enabled, state]);
}
