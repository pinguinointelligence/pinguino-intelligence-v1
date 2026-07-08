/**
 * The single engine call site for the Studio. Derives the deterministic
 * `RecipeResult` and a `CorrectionResult` from the recipe store, memoized so
 * panels are pure readers. Demo sessions redact corrections at source.
 */
import { useMemo } from 'react';
import { useAccess } from '@/access/useAccess';
import {
  calculateRecipe,
  proposeCorrections,
  type CorrectionResult,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput, recipeContext } from './buildRecipeInput';

export interface StudioResult {
  result: RecipeResult;
  corrections: CorrectionResult;
  /** The live engine input — consumed read-only by the DEV optimization preview. */
  input: RecipeInput;
}

export function useStudioResult(): StudioResult {
  const mode = useRecipeStore((state) => state.mode);
  const category = useRecipeStore((state) => state.category);
  const target_temperature_c = useRecipeStore((state) => state.target_temperature_c);
  const target_batch_grams = useRecipeStore((state) => state.target_batch_grams);
  const machine_capacity_grams = useRecipeStore((state) => state.machine_capacity_grams);
  const flavor_intensity = useRecipeStore((state) => state.flavor_intensity);
  const cost_priority = useRecipeStore((state) => state.cost_priority);
  const items = useRecipeStore((state) => state.items);
  const { exactCorrectionGrams } = useAccess();

  const input = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c,
        target_batch_grams,
        machine_capacity_grams,
        flavor_intensity,
        cost_priority,
        items,
      }),
    [
      mode,
      category,
      target_temperature_c,
      target_batch_grams,
      machine_capacity_grams,
      flavor_intensity,
      cost_priority,
      items,
    ],
  );

  const result = useMemo(() => calculateRecipe(input), [input]);

  const corrections = useMemo(
    () =>
      proposeCorrections({
        input,
        context: recipeContext(input),
        redact: !exactCorrectionGrams,
      }),
    [input, exactCorrectionGrams],
  );

  return { result, corrections, input };
}
