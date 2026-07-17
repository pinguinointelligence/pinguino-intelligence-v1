/**
 * PINGÜINO Machine Catalog — the Home batch rule (OWNER CORRECTION,
 * 2026-07-17: „UNIWERSALNY MARGINES BEZPIECZEŃSTWA HOME”).
 *
 * The owner WITHDREW fixed per-model gram constants (450/660) and replaced
 * them with ONE configurable, versioned rule:
 *
 *   recommendedBatchGrams =
 *     roundToNearest10(confirmedUsableCapacityMl × homeContainerSafetyFactor)
 *
 * with `homeContainerSafetyFactor = 0.95`. Worked owner examples (test-pinned):
 * 473→450, 480→460, 680→650, 706→670, 1000→950.
 *
 * SOURCE-OF-TRUTH ORDER (owner verbatim):
 *  1. official manufacturer max mix in GRAMS → use `manufacturerMaxMixGrams`
 *     directly. NO ml conversion, NO factor;
 *  2. official working capacity or MAX FILL in ML → apply the 0.95 factor
 *     (this explicit, versioned rule is the ONLY permitted ml→g arithmetic
 *     in the entire product);
 *  2b. re-spin machines (Ninja-class tubs): the manufacturer's PER-TUB figure
 *     is the fill container the user loads, so an UNCONFLICTED vessel figure
 *     is the usable source (owner examples: 473, 480, 706 are tub figures).
 *     A figure under an open source conflict NEVER produces a number;
 *  3. only the total PHYSICAL BOWL volume known (compressor / frozen bowl) →
 *     NO automatic 5% — a 2 l bowl says nothing about the allowed mix, so the
 *     batch honestly stays underivable (needs review);
 *  4. custom machine with user-declared capacity → the device-type rule above
 *     applies, marked `estimated: true`.
 *
 * The result is presented ONLY as „Zalecany wsad PINGÜINO” — never as the
 * manufacturer's official figure. This module never imports the engine; a
 * factor change alters ONLY this recommendation, never engine math for a
 * recipe at the same final grams (default-neutrality pinning).
 */
import type { HomeMachineProfile } from './types';

/** The configurable Home safety factor (owner value 0.95 = 5% margin). */
export const HOME_CONTAINER_SAFETY_FACTOR = 0.95;

/** Version marker for the rule + factor pair (recorded on every derived batch). */
export const HOME_BATCH_RULE_VERSION = '2026-07-17.home-safety-0.95.v1';

/** Owner rounding: to the nearest 10 g (449.35 → 450; 456 → 460; 646 → 650). */
export function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Which source-of-truth rule produced the recommendation. */
export type RecommendedBatchSource =
  | 'manufacturer_max_mix_grams' // rule 1 — grams used directly
  | 'maximum_liquid_mix_ml' // rule 2 — official max liquid mix / MAX FILL × factor
  | 'working_capacity_ml' // rule 2 — official working capacity × factor
  | 'respin_vessel_ml'; // rule 2b — unconflicted re-spin tub figure × factor

export interface RecommendedBatch {
  /** The „Zalecany wsad PINGÜINO” in grams — also the per-container limit. */
  readonly grams: number;
  readonly source: RecommendedBatchSource;
  /** The factor applied, or null when grams were used directly (rule 1). */
  readonly safetyFactorApplied: number | null;
  /** The rule + factor version that produced this number. */
  readonly ruleVersion: string;
  /** True for user-declared (custom) capacity — the value is an ESTIMATE. */
  readonly estimated: boolean;
}

export interface HomeBatchRuleConfig {
  readonly safetyFactor: number;
  readonly ruleVersion: string;
}

export const DEFAULT_HOME_BATCH_RULE: HomeBatchRuleConfig = {
  safetyFactor: HOME_CONTAINER_SAFETY_FACTOR,
  ruleVersion: HOME_BATCH_RULE_VERSION,
};

/** True when the profile's vessel figure sits under an OPEN source conflict. */
export function vesselFigureConflicted(profile: HomeMachineProfile): boolean {
  return (profile.sourceConflicts ?? []).some((c) => c.field === 'vesselCapacityMl');
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Derive the recommended Home batch for a machine profile, or null when NO
 * source-of-truth rule fires (conflicted figures, bowl-volume-only records,
 * program/finished volumes, or nothing stated). Null is honest: the batch
 * stays user-set — a number is never invented.
 */
export function recommendMachineBatch(
  profile: HomeMachineProfile,
  config: HomeBatchRuleConfig = DEFAULT_HOME_BATCH_RULE,
): RecommendedBatch | null {
  const estimated = profile.specificationSource === 'user_declared';
  const factorGrams = (ml: number, source: RecommendedBatchSource): RecommendedBatch => ({
    grams: roundToNearest10(ml * config.safetyFactor),
    source,
    safetyFactorApplied: config.safetyFactor,
    ruleVersion: config.ruleVersion,
    estimated,
  });

  // Rule 1 — official max mix in grams: used directly, never converted.
  const maxMixGrams = positive(profile.capacity.manufacturerMaxMixGrams);
  if (maxMixGrams !== null) {
    return {
      grams: maxMixGrams,
      source: 'manufacturer_max_mix_grams',
      safetyFactorApplied: null,
      ruleVersion: config.ruleVersion,
      estimated,
    };
  }

  // Rule 2 — official max liquid mix / MAX FILL in ml.
  const maxFillMl = positive(profile.capacity.maximumLiquidMixMl);
  if (maxFillMl !== null) return factorGrams(maxFillMl, 'maximum_liquid_mix_ml');

  // Rule 2 — official working capacity in ml.
  const workingMl = positive(profile.capacity.workingCapacityMl);
  if (workingMl !== null) return factorGrams(workingMl, 'working_capacity_ml');

  // Rule 2b — re-spin tubs only: the per-tub figure is the fill container.
  // A CONFLICTED figure never produces a number (owner: keep the conflict in
  // metadata; a catalog decision lands only after model/market confirmation).
  if (profile.technology === 'respin' || profile.technology === 'respin_soft') {
    if (!vesselFigureConflicted(profile)) {
      const vesselMl = positive(profile.capacity.vesselCapacityMl);
      if (vesselMl !== null) return factorGrams(vesselMl, 'respin_vessel_ml');
    }
    return null;
  }

  // Rule 3 — compressor / frozen bowl with only a physical bowl volume (or
  // program/finished volumes): NEVER auto-treated as working capacity.
  return null;
}
