import type { RecipeInput } from '@/engine';
import {
  mapperIngredientForHistoricalVersion,
  PRE_FINAL_2089_COMPOSITION_VERSION,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';

/**
 * Immutable Production version from the served P0 Rescue score incident.
 * Its line identities and grams are version-owned; only this exact version
 * opts into the pre-FINAL composition snapshot.
 */
export const P0_RESCUE_SCORE_VERSION = Object.freeze({
  recipeId: 'p0-production-rescue-score-authority',
  recipeVersionId: 'p0-production-rescue-score-authority-v1',
  recipeVersionNumber: 1,
  recipeName: 'P0 Production Rescue score authority',
});

const P0_RESCUE_SCORE_PLAN = [
  ['milk', 'PI-ING-000236', 613],
  ['cream', 'PI-ING-000180', 176],
  ['smp', 'PI-ING-000270', 48],
  ['sucrose', 'PI-ING-000514', 95],
  ['dextrose', 'PI-ING-000494', 64],
  ['tara', 'PI-ING-000492', 4],
] as const;

export const p0RescueScoreVersionInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    cost_priority: 'balanced',
    flavor_intensity: 'balanced',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    excluded_ingredient_ids: [],
    unavailable_main_ingredient_ids: [],
  },
  items: P0_RESCUE_SCORE_PLAN.map(([id, mapperId, plannedGrams]) => ({
    id,
    ingredient: mapperIngredientForHistoricalVersion(
      PRE_FINAL_2089_COMPOSITION_VERSION,
      mapperId,
    ),
    planned_grams: plannedGrams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
});
