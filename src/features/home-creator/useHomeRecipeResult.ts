/**
 * GELLATTI HOME — the live engine result and Score for the shared recipe (§51, §59).
 *
 * §59: "show the current Score live using the existing authority. No new score
 * calculation." So this hook does exactly what the Pro workbench's own panels do —
 * `buildRecipeInput(recipeStore state)` → `calculateRecipe` → `recipeMatchScore` —
 * and nothing else. HOME and PRO therefore read the SAME number from the SAME code;
 * there is no second opinion to drift.
 */
import { useMemo } from 'react';
import { calculateRecipe, type RecipeResult } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeMatchScore, type RecipeMatchScorePresentation } from '@/features/recipe-score';
import { useRecipeStore } from '@/stores/recipeStore';

export interface HomeRecipeResult {
  readonly result: RecipeResult | null;
  readonly score: RecipeMatchScorePresentation;
}

export function useHomeRecipeResult(enabled: boolean): HomeRecipeResult {
  // Subscribing to the whole store is deliberate: the result depends on items, grams,
  // batch, temperature and Direction together, and a partial subscription would show
  // a Score that lags the recipe the user is looking at.
  const state = useRecipeStore();

  return useMemo(() => {
    // §18/§51: before the first recipe exists there is no Score at all — not a zero,
    // not a placeholder. `recipeMatchScore(null)` is the honest no-data presentation.
    if (!enabled || state.items.length === 0) {
      return { result: null, score: recipeMatchScore(null) };
    }
    try {
      const result = calculateRecipe(buildRecipeInput(state));
      return { result, score: recipeMatchScore(result.scores) };
    } catch {
      // An un-formulatable draft shows no Score rather than a fabricated one.
      return { result: null, score: recipeMatchScore(null) };
    }
  }, [enabled, state]);
}
