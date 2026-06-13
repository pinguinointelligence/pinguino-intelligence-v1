/**
 * Pure seam between the recipe store and the engine. Turns the store's
 * input-only state into the engine's `RecipeInput` contract and derives the
 * correction context. No recipe math — the engine owns all numbers.
 */
import type { CorrectionContext, RecipeInput } from '@/engine';
import type { RecipeState } from '@/stores/recipeStore';

/** The input-only subset of the recipe store (no action methods). */
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
>;

export function buildRecipeInput(state: RecipeInputState): RecipeInput {
  return {
    items: state.items,
    mode: state.mode,
    category: state.category,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: state.machine_capacity_grams,
    goals: {
      flavor_intensity: state.flavor_intensity,
      cost_priority: state.cost_priority,
    },
  };
}

/** Actual-batch context the moment any line records a real poured amount
 * (spec §15 — rescue becomes add-only). */
export function recipeContext(input: RecipeInput): CorrectionContext {
  return input.items.some((item) => item.actual_grams !== null) ? 'actual_batch' : 'planning';
}
