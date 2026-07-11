/**
 * Sample recipe context for the standalone Labels & Exports page.
 *
 * The /label destination has no live recipe of its own, so it renders against a
 * fixed, balanced sample. We build it here in the data layer (data → data only;
 * no features/* imports) by mapping the default preset into the engine's
 * RecipeInput and calling `calculateRecipe` — the SAME public entry the Studio
 * uses. The engine owns every number; this module only assembles the input.
 */
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';

/** DEFAULT_PRESET → RecipeInput (goals mapped as in features/studio/buildRecipeInput). */
const SAMPLE_INPUT: RecipeInput = {
  items: DEFAULT_PRESET.items,
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: DEFAULT_PRESET.machine_capacity_grams,
  goals: {
    flavor_intensity: DEFAULT_PRESET.flavor_intensity,
    cost_priority: DEFAULT_PRESET.cost_priority,
  },
};

/** A balanced sample recipe result — the label page's read-only recipe context. */
export const SAMPLE_LABEL_RESULT: RecipeResult = calculateRecipe(SAMPLE_INPUT);
