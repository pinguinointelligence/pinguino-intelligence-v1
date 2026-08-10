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
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { applyEffectiveCustomerPrices } from '@/features/pro-core/effectiveRecipePricing';
import { buildRecipeInput, recipeContext } from './buildRecipeInput';
import type { RecipeExecutionContext } from './buildRecipeInput';

export interface StudioResult {
  result: RecipeResult;
  corrections: CorrectionResult;
  input: RecipeInput;
}

export function useStudioResult(context: RecipeExecutionContext = 'planning'): StudioResult {
  const mode = useRecipeStore((state) => state.mode);
  const formulation_strategy = useRecipeStore((state) => state.formulation_strategy);
  const category = useRecipeStore((state) => state.category);
  const target_temperature_c = useRecipeStore((state) => state.target_temperature_c);
  const target_batch_grams = useRecipeStore((state) => state.target_batch_grams);
  const machine_capacity_grams = useRecipeStore((state) => state.machine_capacity_grams);
  const machine_capacity_source = useRecipeStore((state) => state.machine_capacity_source);
  const flavor_intensity = useRecipeStore((state) => state.flavor_intensity);
  const cost_priority = useRecipeStore((state) => state.cost_priority);
  const target_protein_percent = useRecipeStore((state) => state.target_protein_percent);
  const direction_targets = useRecipeStore((state) => state.direction_targets);
  const direction_targets_active = useRecipeStore((state) => state.direction_targets_active);
  const items = useRecipeStore((state) => state.items);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const { exactCorrectionGrams } = useAccess();

  const input = useMemo(() => {
    const canonical = buildRecipeInput(
      {
        mode,
        formulation_strategy,
        category,
        target_temperature_c,
        target_batch_grams,
        machine_capacity_grams,
        machine_capacity_source,
        flavor_intensity,
        cost_priority,
        target_protein_percent,
        direction_targets,
        direction_targets_active,
        items,
      },
      context,
    );
    return applyEffectiveCustomerPrices(canonical, customerPrices);
  }, [
    mode,
    formulation_strategy,
    category,
    target_temperature_c,
    target_batch_grams,
    machine_capacity_grams,
    machine_capacity_source,
    flavor_intensity,
    cost_priority,
    target_protein_percent,
    direction_targets,
    direction_targets_active,
    items,
    context,
    customerPrices,
  ]);

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
