/**
 * Pure mapping: a completed intake → a recipe-store seed for the PI Pro handoff
 * to Advanced Studio (Step 6A.1). No engine math — it only selects a starting
 * preset and the goal fields (category / mode / batch / temperature).
 *
 * Honesty rule: the temperature is ALWAYS the active −11°C Engine temperature,
 * regardless of the selected serving profile. No future-engine behavior is faked.
 */
import type { ProductCategory, ProductMode, RecipeInput } from '@/engine';
import { findPreset, type PresetId } from '@/data/demoPresets';
import { ACTIVE_ENGINE } from '@/data/engines';
import { findProductProfile, type ProductProfileId } from '@/data/productProfiles';
import type { IntakeState } from './conversation';

/** Closest curated starting recipe per product direction (reused, not invented). */
const SEED_PRESET: Record<ProductProfileId, PresetId> = {
  gelato: 'milk-base',
  protein: 'milk-base',
  sorbet: 'raspberry-premium',
  granita: 'raspberry-premium',
  vegan: 'raspberry-premium',
};

/** Dairy lines (stable preset line ids) dropped so a vegan handoff starts vegan-safe. */
const VEGAN_DROP_LINE_IDS: readonly string[] = [
  'raspberry-premium:milk_3_5',
  'raspberry-premium:cream_30',
  'raspberry-premium:smp',
];

export interface RecipeSeed {
  presetId: PresetId;
  category: ProductCategory;
  mode: ProductMode;
  /** Always the active −11°C Engine temperature in 6A.1. */
  temperatureC: number;
  batchGrams: number;
  /** Lines to remove after loading the preset (vegan-safe start). */
  removeLineIds: readonly string[];
}

export function intakeToRecipe(state: IntakeState): RecipeSeed | null {
  if (state.productProfileId === null) return null;
  const profile = findProductProfile(state.productProfileId);
  return {
    presetId: SEED_PRESET[profile.id],
    category: profile.engineCategory,
    mode: profile.defaultMode,
    // TODO(future-engines): when a future temperature engine is connected, derive
    // this from the selected serving profile's engine instead of pinning −11.
    temperatureC: ACTIVE_ENGINE.target_temperature_c ?? -11,
    batchGrams: state.batchGrams,
    removeLineIds: profile.vegan ? VEGAN_DROP_LINE_IDS : [],
  };
}

/**
 * Resolve a seed into the engine's `RecipeInput` (pure) — the SAME recipe the
 * Pro handoff loads into the store, so demo hints describe what the user would
 * actually unlock. Items come from the curated preset (minus vegan-dropped
 * lines); goals mirror buildRecipeInput. Temperature stays on the −11°C Engine.
 */
export function seedToRecipeInput(seed: RecipeSeed): RecipeInput | null {
  const preset = findPreset(seed.presetId);
  if (!preset) return null;
  const items = preset.items
    .filter((item) => !seed.removeLineIds.includes(item.id))
    .map((item) => ({ ...item }));
  return {
    items,
    mode: seed.mode,
    category: seed.category,
    target_temperature_c: seed.temperatureC,
    target_batch_grams: seed.batchGrams,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: preset.flavor_intensity,
      cost_priority: preset.cost_priority,
    },
  };
}

/** Convenience: a completed intake → the engine `RecipeInput` (or null if no
 * product type chosen yet). Used by the redacted demo hints (6A.2). */
export function intakeToRecipeInput(state: IntakeState): RecipeInput | null {
  const seed = intakeToRecipe(state);
  return seed ? seedToRecipeInput(seed) : null;
}
