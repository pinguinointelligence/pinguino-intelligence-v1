/**
 * v0.95 no-NPAC hotfix — regression for an external-reference fruit gelato.
 *
 * Each ingredient is built from the verified external-reference profiles with a
 * legacy `npac_value = 0` deliberately set (the PI Base bug condition). The
 * engine MUST ignore the stale ingredient-level NPAC and derive recipe NPAC from
 * `pac_value`, reproducing the external reference (NPAC ≈ 40.92, not 0).
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from './index';
import type { EngineIngredient, RecipeInput, RecipeItem } from './types';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  RASPBERRIES,
  SALT,
  SKIMMED_MILK_POWDER,
  SUCROSE,
  TARA_GUM,
  type ReferenceIngredient,
} from './__fixtures__/externalReference/referenceProfiles';

let seq = 0;
/** Build a recipe line from a verified profile, forcing the legacy npac bug. */
const line = (ref: ReferenceIngredient, grams: number): RecipeItem => {
  seq += 1;
  const ingredient: EngineIngredient = {
    id: `ing-${seq}`,
    name: ref.ingredient_name,
    category: 'other',
    composition: ref.composition,
    pod_value: ref.pod_value,
    pac_value: ref.pac_value, // freezing-power source of truth
    npac_value: 0, // ← PI Base bug condition: stale ingredient NPAC must be IGNORED
    de_value: null,
    cost_per_kg: null,
    confidence_score: 95,
    source_type: 'verified_db',
    is_verified: true,
  };
  return { id: `line-${seq}`, ingredient, planned_grams: grams, actual_grams: null, lock_type: 'unlocked' };
};

const input: RecipeInput = {
  items: [
    line(RASPBERRIES, 419.4),
    line(MILK_3_5, 119.3),
    line(CREAM_30, 270.9),
    line(SKIMMED_MILK_POWDER, 82.9),
    line(SUCROSE, 43.1),
    line(DEXTROSE, 61.9),
    line(TARA_GUM, 1.08),
    line(SALT, 1.66),
  ],
  mode: 'classic',
  category: 'fruit_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000.24,
  machine_capacity_grams: null,
};

describe('no-NPAC hotfix — external reference fruit gelato', () => {
  const result = calculateRecipe(input);

  it('does not collapse freezing power: NPAC ≈ 40.92, not 0', () => {
    expect(result.npac_points).not.toBeNull();
    expect(result.npac_points!).toBeGreaterThan(40); // the bug produced ~0
    expect(result.npac_points!).toBeCloseTo(40.92, 1);
  });

  it('POD stays close to the external reference (≈ 12.13)', () => {
    expect(result.pod_points!).toBeCloseTo(12.13, 1);
  });

  it('water / solids / fat / lactose match the external reference', () => {
    expect(result.percentages.water_percent).toBeCloseTo(65.49, 1);
    expect(result.percentages.solids_percent).toBeCloseTo(34.51, 1);
    expect(result.percentages.fat_percent).toBeCloseTo(8.74, 1);
    expect(result.percentages.lactose_percent).toBeCloseTo(5.65, 1);
  });

  it('sandiness matches the external reference (≈ 8.63)', () => {
    const sandiness = result.indicators.find((i) => i.key === 'lactose_sandiness_risk')?.value ?? null;
    expect(sandiness).not.toBeNull();
    expect(sandiness!).toBeCloseTo(8.63, 1);
  });

  it('still computes a real ice fraction with the fixed NPAC', () => {
    // Ice fraction comes from the engine's OWN seeded anchors (unchanged by this
    // hotfix), so it is its own calibrated value (~46) and is intentionally NOT
    // pinned to the external tool's 51.73. The point: it is a real, finite number
    // in a plausible gelato range now that NPAC no longer collapses to 0.
    expect(result.ice_fraction_percent).not.toBeNull();
    expect(result.ice_fraction_percent!).toBeGreaterThan(30);
    expect(result.ice_fraction_percent!).toBeLessThan(70);
  });
});
