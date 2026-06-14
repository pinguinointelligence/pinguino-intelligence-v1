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
import { computeRecipeCosts } from '../cost';
import { estimateIceFraction } from '../iceFraction';
import { computeRecipeNpac } from '../pac';
import { computeRecipePod } from '../pod';
import { computeLactoseSandinessRisk } from '../statuses';
import type { EngineIngredient, ProductCategory } from '../types';
import type { ActiveRecipeFixture } from './schema';

export interface CalibrationDelta {
  engine: number | null;
  expected: number | null;
  delta: number | null;
  within_tolerance: boolean | null;
}

/** Component-percentage gate (spec §6 definitions) — verified BEFORE any
 * POD/NPAC delta is trusted: if the engine reproduces the reference's component
 * split, identical inputs are confirmed and the freezing-power deltas are
 * meaningful. Every field is reported even when no reference value exists. */
export interface ComponentComparison {
  water: CalibrationDelta;
  total_solids: CalibrationDelta;
  fat: CalibrationDelta;
  lactose: CalibrationDelta;
  aerating_protein: CalibrationDelta;
  protein_in_solids: CalibrationDelta;
  lactose_sandiness_risk: CalibrationDelta;
}

export interface CalibrationComparison {
  fixture: string;
  tolerance: number;
  pod: CalibrationDelta;
  npac_per_total_mass: CalibrationDelta;
  npac_per_water_mass: CalibrationDelta;
  /** Ice fraction from the canonical per_total_mass NPAC. */
  ice_fraction: CalibrationDelta;
  /** Ice fraction recomputed from the per_water_mass NPAC candidate (report aid). */
  ice_fraction_from_per_water_mass: CalibrationDelta;
  /** Which NPAC normalization basis lands closer to the expected value. */
  closer_npac_basis: 'per_total_mass' | 'per_water_mass' | 'equal' | null;
  /** Component-% gate (see ComponentComparison). */
  components: ComponentComparison;
  /** True when every component delta that HAS an expected value is within
   * tolerance (a vacuously-true `true` when no component expectations exist). */
  composition_match: boolean;
  /** Cost deltas — INFORMATIONAL only. Engine cost is null when per-ingredient
   * costs are unknown; cost never blocks calibration (per the reference's cost note). */
  cost_per_kg: CalibrationDelta;
  cost_per_serving_80g: CalibrationDelta;
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
  // Precedence: explicit option → self-describing fixture field → seeded default.
  const category = options.category ?? fixture.category ?? 'milk_gelato';
  const temperature_c = options.temperature_c ?? fixture.temperature_c ?? -11;

  const items = fixture.input.map((fixtureLine, index) => {
    const ingredient: EngineIngredient = {
      id: `fixture-${index}-${fixtureLine.ingredient_name}`,
      name: fixtureLine.ingredient_name,
      category: 'other',
      composition: fixtureLine.composition,
      // Stored, verified-first values when the reference supplies them (spec §7–§8) —
      // otherwise null so the engine derives from the typed sugar breakdown.
      pod_value: fixtureLine.pod_value ?? null,
      pac_value: fixtureLine.pac_value ?? null,
      npac_value: fixtureLine.npac_value ?? null,
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

  const { items: effectiveItems, total_batch_g, totals, percentages } = computeComposition(items);
  const hasMass = total_batch_g > 0;
  const pod = hasMass ? computeRecipePod(effectiveItems, total_batch_g) : null;
  // Report BOTH bases EXPLICITLY so the comparison is independent of the config
  // default (which is now per_water_mass): per_total_mass must be named outright,
  // otherwise it would inherit the default + no water_g → 0 and misreport.
  const npacTotal = hasMass
    ? computeRecipeNpac(effectiveItems, total_batch_g, { normalization: 'per_total_mass' })
    : null;
  const npacWater = hasMass
    ? computeRecipeNpac(effectiveItems, total_batch_g, {
        normalization: 'per_water_mass',
        water_g: totals.water_g,
      })
    : null;
  // Ice fraction under each NPAC basis — reported, not judged.
  const iceFromTotal =
    npacTotal !== null
      ? estimateIceFraction({ npac: npacTotal, temperature_c, category })
      : null;
  const iceFromWater =
    npacWater !== null
      ? estimateIceFraction({ npac: npacWater, temperature_c, category })
      : null;

  // Component-% gate (display reads of the composition stage — no formula here).
  const proteinInSolids =
    hasMass && totals.solids_g > 0 ? (totals.protein_g / totals.solids_g) * 100 : null;
  const sandiness = hasMass
    ? computeLactoseSandinessRisk(totals.lactose_g, totals.water_g)
    : null;
  const components: ComponentComparison = {
    water: delta(hasMass ? percentages.water_percent : null, fixture.expected.water, fixture.tolerance),
    total_solids: delta(
      hasMass ? percentages.solids_percent : null,
      fixture.expected.total_solids,
      fixture.tolerance,
    ),
    fat: delta(hasMass ? percentages.fat_percent : null, fixture.expected.fat, fixture.tolerance),
    lactose: delta(
      hasMass ? percentages.lactose_percent : null,
      fixture.expected.lactose,
      fixture.tolerance,
    ),
    aerating_protein: delta(
      hasMass ? percentages.protein_percent : null,
      fixture.expected.aerating_protein,
      fixture.tolerance,
    ),
    protein_in_solids: delta(
      proteinInSolids,
      fixture.expected.protein_in_solids,
      fixture.tolerance,
    ),
    lactose_sandiness_risk: delta(
      sandiness,
      fixture.expected.lactose_sandiness_risk,
      fixture.tolerance,
    ),
  };
  // composition_match: every component that HAS a reference value is within tolerance.
  const composition_match = Object.values(components).every(
    (d) => d.within_tolerance === null || d.within_tolerance === true,
  );

  // Cost — informational only. Per-ingredient costs are null here, so the engine
  // cost is the honest "incomplete" (null) state; it never blocks calibration.
  const costs = hasMass ? computeRecipeCosts(effectiveItems, total_batch_g) : null;

  const podDelta = delta(pod, fixture.expected.pod, fixture.tolerance);
  const npacTotalDelta = delta(npacTotal, fixture.expected.npac, fixture.tolerance);
  const npacWaterDelta = delta(npacWater, fixture.expected.npac, fixture.tolerance);
  const iceDelta = delta(iceFromTotal, fixture.expected.ice_fraction, fixture.tolerance);
  const iceWaterDelta = delta(iceFromWater, fixture.expected.ice_fraction, fixture.tolerance);
  const costPerKgDelta = delta(
    costs?.cost_per_kg ?? null,
    fixture.expected.cost_per_kg,
    fixture.tolerance,
  );
  const costPerServingDelta = delta(
    costs?.cost_per_serving_80g ?? null,
    fixture.expected.cost_per_serving_80g,
    fixture.tolerance,
  );

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
    ice_fraction_from_per_water_mass: iceWaterDelta,
    closer_npac_basis: closer,
    components,
    composition_match,
    cost_per_kg: costPerKgDelta,
    cost_per_serving_80g: costPerServingDelta,
  };
}
