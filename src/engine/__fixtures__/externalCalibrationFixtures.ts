/**
 * EXTERNAL CALIBRATION PROTOCOL + runner (spec §8, §16).
 *
 * STATUS: no verified verified external reference values exist in this repository — all 11
 * fixtures in __fixtures__/externalReference/ are name-only placeholders and stay
 * `pending`. NOTHING here invents expected values.
 *
 * ── Activation protocol (what the product owner must supply) ──────────────
 * Recommended first fixture: ONE known-good external reference *recipe* (raspberry or
 * chocolate), providing:
 *   1. the full ingredient list with grams,
 *   2. each ingredient's per-100 g composition as external reference shows it
 *      (water/solids/fat/protein/sugar split/salt/alcohol),
 *   3. the external reference's displayed POD value,
 *   4. the external reference's displayed NPAC (or PAC) value,
 *   5. the serving temperature and, if shown, the ice-fraction estimate,
 *   6. a tolerance (how exact the match must be, e.g. 0.5 points).
 * Entering that data into the fixture file (status → 'active') is a DATA-ONLY
 * change; `runCalibrationComparison` then immediately answers the open spec §8
 * questions: Is POD aligned? Is NPAC aligned — and under which normalization
 * basis (per_total_mass canonical vs per_water_mass candidate)? Is the ice
 * estimate close? Any config adjustment that follows happens ONLY in
 * src/engine/config/ + a CONFIG_VERSION bump (never per-recipe hacks).
 */
import { computeComposition } from '../composition';
import { estimateIceFraction } from '../iceFraction';
import { computeRecipeNpac } from '../pac';
import { computeRecipePod } from '../pod';
import type { EngineIngredient, ProductCategory } from '../types';
import type { ActiveRecipeFixture } from './schema';

export interface CalibrationDelta {
  engine: number | null;
  expected: number | null;
  delta: number | null;
  within_tolerance: boolean | null;
}

export interface CalibrationComparison {
  fixture: string;
  tolerance: number;
  pod: CalibrationDelta;
  npac_per_total_mass: CalibrationDelta;
  npac_per_water_mass: CalibrationDelta;
  ice_fraction: CalibrationDelta;
  /** Which NPAC normalization basis lands closer to the expected value. */
  closer_npac_basis: 'per_total_mass' | 'per_water_mass' | 'equal' | null;
}

export interface CalibrationRunOptions {
  /** Fixture schema does not yet carry category/temperature — defaults match
   * the seeded band; extend the schema when multi-category fixtures arrive. */
  category?: ProductCategory;
  temperature_c?: number;
}

const delta = (
  engine: number | null,
  expected: number | undefined,
  tolerance: number,
): CalibrationDelta => {
  if (expected === undefined || engine === null) {
    return { engine, expected: expected ?? null, delta: null, within_tolerance: null };
  }
  const difference = engine - expected;
  return {
    engine,
    expected,
    delta: difference,
    within_tolerance: Math.abs(difference) <= tolerance,
  };
};

/**
 * Pure calibration runner: computes engine values for an ACTIVE recipe fixture
 * under BOTH NPAC normalization bases and compares them to the fixture's
 * expected values. Draws no conclusion itself — it reports the §8 evidence.
 */
export function runCalibrationComparison(
  fixture: ActiveRecipeFixture,
  options: CalibrationRunOptions = {},
): CalibrationComparison {
  const { category = 'milk_gelato', temperature_c = -11 } = options;

  const items = fixture.input.map((fixtureLine, index) => {
    const ingredient: EngineIngredient = {
      id: `fixture-${index}-${fixtureLine.ingredient_name}`,
      name: fixtureLine.ingredient_name,
      category: 'other',
      composition: fixtureLine.composition,
      pod_value: null,
      pac_value: null,
      npac_value: null,
      de_value: fixtureLine.de_value ?? null,
      cost_per_kg: null,
      confidence_score: 100, // fixture data is externally verified by definition
      source_type: 'verified_db',
      is_verified: true,
    };
    return {
      id: `line-${index}`,
      ingredient,
      planned_grams: fixtureLine.grams,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    };
  });

  const { items: effectiveItems, total_batch_g, totals } = computeComposition(items);
  const pod = total_batch_g > 0 ? computeRecipePod(effectiveItems, total_batch_g) : null;
  const npacTotal = total_batch_g > 0 ? computeRecipeNpac(effectiveItems, total_batch_g) : null;
  const npacWater =
    total_batch_g > 0
      ? computeRecipeNpac(effectiveItems, total_batch_g, {
          normalization: 'per_water_mass',
          water_g: totals.water_g,
        })
      : null;
  const ice =
    npacTotal !== null
      ? estimateIceFraction({ npac: npacTotal, temperature_c, category })
      : null;

  const podDelta = delta(pod, fixture.expected.pod, fixture.tolerance);
  const npacTotalDelta = delta(npacTotal, fixture.expected.npac, fixture.tolerance);
  const npacWaterDelta = delta(npacWater, fixture.expected.npac, fixture.tolerance);
  const iceDelta = delta(ice, fixture.expected.ice_fraction, fixture.tolerance);

  let closer: CalibrationComparison['closer_npac_basis'] = null;
  if (npacTotalDelta.delta !== null && npacWaterDelta.delta !== null) {
    const total = Math.abs(npacTotalDelta.delta);
    const water = Math.abs(npacWaterDelta.delta);
    closer = total < water ? 'per_total_mass' : water < total ? 'per_water_mass' : 'equal';
  }

  return {
    fixture: fixture.name,
    tolerance: fixture.tolerance,
    pod: podDelta,
    npac_per_total_mass: npacTotalDelta,
    npac_per_water_mass: npacWaterDelta,
    ice_fraction: iceDelta,
    closer_npac_basis: closer,
  };
}
