/**
 * Pure mapping: a completed intake → a recipe-store seed for the PI Pro handoff
 * to Advanced Studio (Step 6A.1). No engine math — it only selects a starting
 * preset and the goal fields (category / mode / batch / temperature).
 *
 * Honesty rule: the temperature is ALWAYS the active −11°C Engine temperature,
 * regardless of the selected serving profile. No future-engine behavior is faked.
 */
import type { ProductCategory, ProductMode } from '@/engine';
import type { PresetId } from '@/data/demoPresets';
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
