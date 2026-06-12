/**
 * Scoring — technical / flavor / cost / overall (spec §12.8; masterplan §4).
 *
 * Scores are derived views over already-computed truth (indicators, items,
 * costs) — they never change indicator statuses or any metric. Every constant
 * lives in config/scoring.ts (calibration-pending); overall-score mode weights
 * come from config/modes.ts.
 *
 * Principles encoded:
 * - Technical: PI indicator statuses weighted Golden-Middle style (freezing
 *   stability and NPAC dominate), refined by distance beyond the band edge.
 * - Flavor: rewards main-ingredient preservation (lock_type 'main'),
 *   monotonically — a high main ingredient is NEVER punished here; stability
 *   concerns live in the technical score. PREMIUM/SIGNATURE slopes are the
 *   steepest (spec §12).
 * - Cost: anchor-interpolated from cost/kg, adjusted by the user's cost
 *   priority; UNKNOWN cost stays null — never a fake score.
 * - Overall: mode-weighted blend (ECO weights cost most, SIGNATURE flavor
 *   most), renormalized when cost is unknown, and capped by the stability
 *   gate: overall ≤ technical + STABILITY_HEADROOM — unstable recipes can
 *   never hide behind high flavor or low cost.
 *
 * Pure, deterministic, non-mutating.
 */
import { MODES } from './config/modes';
import {
  COST_PRIORITY_PENALTY,
  COST_SCORE_ANCHORS,
  FLAVOR_BASE,
  GOAL_INTENSITY_MULTIPLIER,
  MODE_FLAVOR_SLOPE,
  NEUTRAL_FLAVOR_SCORE,
  OUT_OF_BAND_SLOPE,
  STABILITY_HEADROOM,
  STATUS_SCORES,
  TECHNICAL_INDICATOR_WEIGHTS,
} from './config/scoring';
import type {
  EffectiveRecipeItem,
  Indicator,
  IndicatorKey,
  ProductMode,
  RecipeCosts,
  RecipeGoals,
  RecipeScores,
} from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Status base score refined by distance beyond the band edge (floor 0). */
function indicatorScore(indicator: Indicator): number {
  const base = STATUS_SCORES[indicator.status];
  const band = indicator.band;
  const value = indicator.value;
  if (!band || value === null || Number.isNaN(value)) return base;
  if (value >= band.min && value <= band.max) return base;
  const halfWidth = (band.max - band.min) / 2;
  if (halfWidth <= 0) return base;
  const overshoot =
    value > band.max ? (value - band.max) / halfWidth : (band.min - value) / halfWidth;
  return Math.max(0, base - OUT_OF_BAND_SLOPE * overshoot);
}

/** Weighted average of per-indicator scores (Golden-Middle-aligned weights). */
export function computeTechnicalScore(indicators: readonly Indicator[]): number {
  const weights = TECHNICAL_INDICATOR_WEIGHTS as Partial<Record<IndicatorKey, number>>;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const indicator of indicators) {
    const weight = weights[indicator.key];
    if (weight === undefined) continue; // non-technical indicators score elsewhere
    weightedSum += weight * indicatorScore(indicator);
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/** Main-ingredient reward, monotonic, mode-sloped (spec §12 flavor priority). */
export function computeFlavorScore(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
  mode: ProductMode,
  goals?: RecipeGoals,
): number {
  if (totalBatchG <= 0) return NEUTRAL_FLAVOR_SCORE;
  let mainGrams = 0;
  for (const item of items) {
    if (item.lock_type === 'main') mainGrams += item.effective_grams;
  }
  if (mainGrams <= 0) return NEUTRAL_FLAVOR_SCORE; // no main ingredient marked
  const mainPercent = (mainGrams / totalBatchG) * 100;
  const multiplier = GOAL_INTENSITY_MULTIPLIER[goals?.flavor_intensity ?? 'balanced'];
  const rewarded = FLAVOR_BASE + mainPercent * MODE_FLAVOR_SLOPE[mode] * multiplier;
  // floored at the neutral score: MARKING a main ingredient never scores below
  // not marking one — keeps the reward monotonic from the neutral baseline
  return clamp(Math.max(NEUTRAL_FLAVOR_SCORE, rewarded), 0, 100);
}

/** Anchor-interpolated cost score; UNKNOWN cost (null) stays null. */
export function computeCostScore(
  costPerKg: number | null,
  goals?: RecipeGoals,
): number | null {
  if (costPerKg === null || !Number.isFinite(costPerKg) || costPerKg < 0) return null;

  const anchors = COST_SCORE_ANCHORS;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  let base: number;
  if (costPerKg <= first.cost_per_kg) {
    base = first.score;
  } else if (costPerKg >= last.cost_per_kg) {
    base = last.score;
  } else {
    base = last.score;
    for (let i = 1; i < anchors.length; i++) {
      const hi = anchors[i]!;
      if (costPerKg <= hi.cost_per_kg) {
        const lo = anchors[i - 1]!;
        const t = (costPerKg - lo.cost_per_kg) / (hi.cost_per_kg - lo.cost_per_kg);
        base = lo.score + t * (hi.score - lo.score);
        break;
      }
    }
  }

  const penalty = COST_PRIORITY_PENALTY[goals?.cost_priority ?? 'balanced'];
  return clamp(100 - penalty * (100 - base), 0, 100);
}

export interface ScoresInput {
  indicators: readonly Indicator[];
  items: readonly EffectiveRecipeItem[];
  total_batch_g: number;
  mode: ProductMode;
  goals?: RecipeGoals;
  costs: RecipeCosts | null;
}

/**
 * Overall = mode-weighted blend of technical/flavor/cost (config/modes.ts
 * weights), renormalized over technical+flavor when cost is unknown, capped by
 * the stability gate. Null for zero-mass batches.
 */
export function computeScores(input: ScoresInput): RecipeScores | null {
  if (input.total_batch_g <= 0) return null;

  const technical = computeTechnicalScore(input.indicators);
  const flavor = computeFlavorScore(input.items, input.total_batch_g, input.mode, input.goals);
  const cost = computeCostScore(input.costs?.cost_per_kg ?? null, input.goals);

  const weights = MODES[input.mode].score_weights;
  let overall: number;
  if (cost === null) {
    const available = weights.technical + weights.flavor;
    overall = (weights.technical * technical + weights.flavor * flavor) / available;
  } else {
    overall = weights.cost * cost + weights.technical * technical + weights.flavor * flavor;
  }

  // stability gate — unstable recipes never hide behind flavor or cost
  overall = Math.min(overall, technical + STABILITY_HEADROOM);

  return { technical, flavor, cost, overall };
}
