/**
 * HARD vs SOFT violation classification by BAND PROVENANCE (owner P0 Phase 8,
 * NIGHTLY, Agent A). PURE — reads the engine's own indicator provenance flags;
 * no band value is touched or invented (science freeze).
 *
 * Binding rule: a violation measured against a PROVISIONAL band — a
 * `category_fallback` cell (an unseeded profile scored with milk_gelato
 * bands), a `temperature_fallback` cell (nearest-temperature band) or an
 * `estimated` band — may inform diagnostics, score and guidance, but must
 * NEVER alone hard-reject a formulation or classify it unsafe. Violations on
 * NATIVE approved bands stay hard: the beat-the-null gate for unconstrained
 * proposals on native-band profiles is absolute (the 8 × 125 g rule).
 */
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';

export interface ViolationBandClassification {
  /** Metrics out of range on NATIVE approved bands (hard — never softened). */
  hardMetrics: string[];
  /** Metrics out of range only on provisional/fallback bands (soft). */
  softMetrics: string[];
  /** Provenance of the profile's band cell as the engine reports it. */
  bandSource: 'native' | 'category_fallback';
  temperatureFallback: boolean;
}

/** Classify the CURRENT recipe's out-of-band metrics by band provenance. */
export function classifyViolationBands(input: RecipeInput): ViolationBandClassification {
  const result = calculateRecipe(input);
  const violations = detectViolations(result);
  const indicatorByKey = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));

  const hard = new Set<string>();
  const soft = new Set<string>();
  for (const violation of violations) {
    const indicator = indicatorByKey.get(violation.metric);
    const provisional =
      indicator?.category_fallback === true ||
      indicator?.temperature_fallback === true ||
      indicator?.band_status === 'estimated';
    if (provisional) soft.add(violation.metric);
    else hard.add(violation.metric);
  }

  const categoryFallback = result.indicators.some((i) => i.category_fallback === true);
  const temperatureFallback = result.indicators.some((i) => i.temperature_fallback === true);

  return {
    hardMetrics: [...hard],
    softMetrics: [...soft],
    bandSource: categoryFallback ? 'category_fallback' : 'native',
    temperatureFallback,
  };
}
