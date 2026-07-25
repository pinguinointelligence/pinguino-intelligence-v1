/**
 * Pure seam between the recipe store and the engine. Turns the store's
 * input-only state into the engine's `RecipeInput` contract and derives the
 * correction context. No recipe math — the engine owns all numbers.
 */
import type { CorrectionContext, RecipeInput } from '@/engine';
import { canonicalInternalCategory } from '@/features/studio/productType';
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
> &
  Partial<Pick<RecipeState, 'machine_capacity_source'>>;

/**
 * OWNER CURRENT-DRAFT P0 (Phase 8) — THE MACHINE-CONTEXT GATE.
 *
 * The engine's `machine_capacity_exceeded` warning is science and is untouched;
 * what is repaired is the VALUE that reaches it. A capacity only limits a batch
 * when it has an explicit source — a Home machine selection, or a capacity the
 * user (or a saved recipe) really stated. A number with no provenance — the
 * classic case being one persisted into localStorage by an earlier session and
 * never cleared when the user switched to the professional machine — is inert.
 *
 * Every consumer (Monitor, optimizer, `selectCanonicalDraft`, Save, QA) builds
 * its `RecipeInput` through THIS function, so they can never disagree about
 * the machine context.
 */
export function effectiveMachineCapacityGrams(state: RecipeInputState): number | null {
  if (state.machine_capacity_grams === null) return null;
  // Back-compatible: a state that predates the provenance field (older
  // persisted drafts, fixtures) is treated as unprovenanced — inert.
  if (state.machine_capacity_source == null) return null;
  return state.machine_capacity_grams;
}

/**
 * OWNER FINAL INTEGRATION ADDENDUM — item 1 (canonical families, 2026-07-25).
 *
 * This function is the ONE seam every consumer crosses to reach the engine (Monitor,
 * optimizer, `selectCanonicalDraft`, Save, QA — see the note above), so it is also the
 * one place where the canonical-family rule can be made structural: an UNSEEDED internal
 * category that arrived from a persisted draft, a saved version, a demo preset or a
 * direct `setCategory` write is re-derived from the real ingredients BEFORE it can reach
 * `selectTargetBand`. The engine can therefore never be asked for bands it does not own,
 * and `category_fallback` can never be triggered by a runtime routing choice.
 *
 * No engine value is touched: `canonicalInternalCategory` only PICKS between existing
 * engine categories, and returns an already-native category byte-identical.
 */
export function buildRecipeInput(state: RecipeInputState): RecipeInput {
  return {
    items: state.items,
    mode: state.mode,
    category: canonicalInternalCategory(state.category, state.items),
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: effectiveMachineCapacityGrams(state),
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
