/**
 * Deterministic fixture for pure label/export unit tests.
 *
 * No customer route imports this module. The production Labels workspace reads
 * immutable completed-run snapshots; this fixture only keeps the lower-level
 * CSV and ingredient-statement tests deterministic.
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
