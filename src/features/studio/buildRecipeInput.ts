import type { CorrectionContext, RecipeInput } from '@/engine';
import { normalizeRecipeItemIdentity } from '@/data/ingredients/canonicalIngredientIdentity';
import { canonicalInternalCategory } from '@/features/studio/productType';
import type { RecipeState } from '@/stores/recipeStore';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';

export type RecipeInputState = Pick<
  RecipeState,
  | 'mode'
  | 'category'
  | 'target_temperature_c'
  | 'target_batch_grams'
  | 'machine_capacity_grams'
  | 'flavor_intensity'
  | 'cost_priority'
  | 'items'
> &
  Partial<
    Pick<
      RecipeState,
      | 'machine_capacity_source'
      | 'formulation_strategy'
      | 'direction_targets'
      | 'direction_targets_active'
      | 'excludedIngredientIds'
      | 'unavailableMainIngredientIds'
    >
  >;

export function effectiveMachineCapacityGrams(state: RecipeInputState): number | null {
  if (state.machine_capacity_grams === null) return null;
  if (state.machine_capacity_source == null) return null;
  return state.machine_capacity_grams;
}

export type RecipeExecutionContext = 'planning' | 'actual_batch';

export function buildRecipeInput(
  state: RecipeInputState,
  context: RecipeExecutionContext = 'planning',
): RecipeInput {
  const items = state.items ?? [];
  return {
    items: items.map((item) => ({
      ...normalizeRecipeItemIdentity(item),
      actual_grams: context === 'actual_batch' ? item.actual_grams : null,
    })),
    // Base Engine stays on its neutral historical policy. OPTIMAL/ECO is a
    // product-layer objective and may not mutate scientific scoring/formulas.
    mode: 'classic',
    category: canonicalInternalCategory(state.category, items),
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: effectiveMachineCapacityGrams(state),
    goals: {
      formulation_strategy: normalizeFormulationStrategy(state.formulation_strategy ?? state.mode),
      flavor_intensity: state.flavor_intensity,
      cost_priority: state.cost_priority,
      direction_targets: {
        sweetness: state.direction_targets?.sweetness ?? 0,
        softness: state.direction_targets?.softness ?? 0,
        creaminess: state.direction_targets?.creaminess ?? 0,
        flavor: state.direction_targets?.flavor ?? 0,
      },
      direction_targets_active: state.direction_targets_active ?? false,
      excluded_ingredient_ids: [...(state.excludedIngredientIds ?? [])],
      unavailable_main_ingredient_ids: [...(state.unavailableMainIngredientIds ?? [])],
    },
  };
}

export function recipeContext(input: RecipeInput): CorrectionContext {
  return input.items.some((item) => item.actual_grams !== null) ? 'actual_batch' : 'planning';
}
