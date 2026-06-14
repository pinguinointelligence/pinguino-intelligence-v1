/**
 * Verified external reference ingredient profiles (spec §16) — the SINGLE SOURCE
 * OF TRUTH shared by every active reference fixture so that each recipe uses
 * byte-identical verified inputs (no re-transcription, no drift).
 *
 * Provenance: every number is the product owner's verified reference data,
 * transcribed VERBATIM from the external reference tool's per-100 g screens.
 * Nothing here is invented.
 *
 * Stored-value mapping (documented modeling decision, spec §8): the reference's
 * per-ingredient `pac_value` is its NET anti-freezing power, so it is stored into
 * the engine's net NPAC slot (`npac_value = pac_value`); the `pac_value` slot
 * keeps the same number so a recipe PAC read is also available. This mapping is
 * validated by the calibration reports — under per_water_mass the recipe NPAC
 * reproduces the reference's displayed value exactly (milk base 40.74,
 * raspberry premium 41.15).
 */
import type { IngredientComponentProfile } from '../../types';
import type { FixtureRecipeLine } from '../schema';

/** A verified per-100 g profile plus its stored per-ingredient engine values. */
export interface ReferenceIngredient {
  ingredient_name: string;
  composition: IngredientComponentProfile;
  pod_value: number;
  pac_value: number;
  /** = pac_value (net NPAC mapping — see file header). */
  npac_value: number;
}

/** Build a fixture recipe line: a shared verified profile + a per-recipe weight. */
export function referenceLine(ref: ReferenceIngredient, grams: number): FixtureRecipeLine {
  return {
    ingredient_name: ref.ingredient_name,
    grams,
    composition: ref.composition,
    pod_value: ref.pod_value,
    pac_value: ref.pac_value,
    npac_value: ref.npac_value,
  };
}

export const MILK_3_5: ReferenceIngredient = {
  ingredient_name: 'Milk 3.5%',
  pod_value: 0.75,
  pac_value: 5.29,
  npac_value: 5.29,
  composition: {
    kcal_per_100g: 60,
    water_percent: 88.7,
    solids_percent: 11.3,
    fat_percent: 3.5,
    saturated_fat_percent: 2,
    carbohydrate_percent: 4.7,
    sugar_percent: 4.7,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 4.7,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 3,
    salt_percent: 0.1,
    alcohol_percent: 0,
  },
};

export const CREAM_30: ReferenceIngredient = {
  ingredient_name: 'Cream 30%',
  pod_value: 0.51,
  pac_value: 3.67,
  npac_value: 3.67,
  composition: {
    kcal_per_100g: 292,
    water_percent: 64.42,
    solids_percent: 35.58,
    fat_percent: 30,
    saturated_fat_percent: 20,
    carbohydrate_percent: 3.2,
    sugar_percent: 3.2,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 3.2,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 2.3,
    salt_percent: 0.08,
    alcohol_percent: 0,
  },
};

export const SKIMMED_MILK_POWDER: ReferenceIngredient = {
  ingredient_name: 'Skimmed milk powder',
  pod_value: 8.16,
  pac_value: 58.02,
  npac_value: 58.02,
  composition: {
    kcal_per_100g: 362,
    water_percent: 10.32,
    solids_percent: 89.68,
    fat_percent: 0.8,
    saturated_fat_percent: 0.54,
    carbohydrate_percent: 51.98,
    sugar_percent: 51,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 51,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 35.7,
    salt_percent: 1.2,
    alcohol_percent: 0,
  },
};

export const SUCROSE: ReferenceIngredient = {
  ingredient_name: 'Sucrose',
  pod_value: 100,
  pac_value: 100,
  npac_value: 100,
  composition: {
    kcal_per_100g: 400,
    water_percent: 0,
    solids_percent: 100,
    fat_percent: 0,
    saturated_fat_percent: 0,
    carbohydrate_percent: 100,
    sugar_percent: 100,
    sucrose_percent: 100,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
  },
};

export const DEXTROSE: ReferenceIngredient = {
  ingredient_name: 'Dextrose',
  pod_value: 70.84,
  pac_value: 174.8,
  npac_value: 174.8,
  composition: {
    kcal_per_100g: 368,
    water_percent: 8,
    solids_percent: 92,
    fat_percent: 0,
    saturated_fat_percent: 0,
    carbohydrate_percent: 92,
    sugar_percent: 92,
    sucrose_percent: 0,
    glucose_percent: 92,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
  },
};

export const TARA_GUM: ReferenceIngredient = {
  ingredient_name: 'Tara gum',
  pod_value: 0,
  pac_value: 0,
  npac_value: 0,
  composition: {
    kcal_per_100g: 180,
    water_percent: 9.5,
    solids_percent: 90.5,
    fat_percent: 0.5,
    saturated_fat_percent: 0,
    carbohydrate_percent: 1.5,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 86.5,
    protein_percent: 2,
    salt_percent: 0,
    alcohol_percent: 0,
  },
};

export const SALT: ReferenceIngredient = {
  ingredient_name: 'Salt',
  pod_value: 0,
  pac_value: 585,
  npac_value: 585,
  composition: {
    kcal_per_100g: 0,
    water_percent: 0,
    solids_percent: 100,
    fat_percent: 0,
    saturated_fat_percent: 0,
    carbohydrate_percent: 0,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 0,
    salt_percent: 90,
    alcohol_percent: 0,
  },
};

export const RASPBERRIES: ReferenceIngredient = {
  ingredient_name: 'Raspberries',
  pod_value: 6.05,
  pac_value: 10.18,
  npac_value: 10.18,
  composition: {
    kcal_per_100g: 43,
    water_percent: 86.097,
    solids_percent: 13.903,
    fat_percent: 0.3,
    saturated_fat_percent: 0.3,
    carbohydrate_percent: 5.3,
    sugar_percent: 4.9,
    sucrose_percent: 1.0,
    glucose_percent: 1.7,
    dextrose_percent: 0,
    fructose_percent: 2.2,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 6.7,
    protein_percent: 1.3,
    salt_percent: 0.303,
    alcohol_percent: 0,
  },
};
