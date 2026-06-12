/**
 * Scoring configuration (spec §12.8; masterplan §4 mode philosophy).
 *
 * ALL values here are CALIBRATION-PENDING estimates and affect SCORES ONLY —
 * never indicator/band truth, never composition/POD/PAC/ice math. Changes bump
 * CONFIG_VERSION (spec §17) and are tuned against MyGelato fixtures and real
 * usage. Overall-score mode weights live in config/modes.ts (score_weights).
 */
import type { IndicatorStatus, ProductMode, TargetMetric } from '../types';

/** Technical-score weights per indicator — Golden Middle aligned (spec §10):
 * freezing stability (ice fraction, NPAC) dominates, then POD and alcohol risk. */
export const TECHNICAL_INDICATOR_WEIGHTS: Record<TargetMetric, number> = {
  ice_fraction: 3,
  npac: 3,
  pod: 2,
  alcohol: 2,
  water: 1.5,
  total_solids: 1.5,
  fat: 1,
  aerating_protein: 1,
  protein_in_solids: 1,
  lactose: 1,
  lactose_sandiness_risk: 1,
};

/** Base score per indicator status (in-band statuses score highest). */
export const STATUS_SCORES: Record<IndicatorStatus, number> = {
  ideal: 100,
  good: 85,
  premium: 100,
  risky: 55,
  too_expensive: 50,
  too_soft: 40,
  too_hard: 40,
  too_sweet: 40,
  too_weak: 40,
  needs_correction: 30,
};

/** Points subtracted per half-width of overshoot beyond the band edge —
 * "distance from target ranges" beyond the coarse status (floor 0). */
export const OUT_OF_BAND_SLOPE = 15;

/** Flavor score base when a main ingredient is marked (lock_type 'main'). */
export const FLAVOR_BASE = 60;

/** Flavor score when no main ingredient is marked (nothing to reward). */
export const NEUTRAL_FLAVOR_SCORE = 70;

/** Flavor points per main-ingredient % — PREMIUM/SIGNATURE reward main-
 * ingredient preservation most strongly (spec §12; monotonic by design). */
export const MODE_FLAVOR_SLOPE: Record<ProductMode, number> = {
  eco: 1.5,
  classic: 2.0,
  premium: 2.5,
  signature: 3.0,
};

/** Flavor-intensity goal modifier applied to the mode slope. */
export const GOAL_INTENSITY_MULTIPLIER: Record<
  'light' | 'balanced' | 'strong' | 'maximum',
  number
> = {
  light: 0.9,
  balanced: 1.0,
  strong: 1.05,
  maximum: 1.1,
};

export interface CostScoreAnchor {
  cost_per_kg: number;
  score: number;
}

/** Cost-score anchors in reference currency per kg (EUR-minded defaults; the
 * engine stays currency-agnostic) — piecewise-linear, clamped at the ends. */
export const COST_SCORE_ANCHORS: readonly CostScoreAnchor[] = [
  { cost_per_kg: 2.5, score: 100 },
  { cost_per_kg: 4, score: 80 },
  { cost_per_kg: 6, score: 55 },
  { cost_per_kg: 10, score: 20 },
];

/** Cost-priority goal modifier applied to the distance from 100:
 * 'low' punishes expensive mixes harder; 'premium' is more forgiving. */
export const COST_PRIORITY_PENALTY: Record<'low' | 'balanced' | 'premium', number> = {
  low: 1.2,
  balanced: 1.0,
  premium: 0.7,
};

/** Stability gate: overall may never exceed technical + this headroom —
 * unstable recipes can never hide behind high flavor or low cost (spec §11
 * SIGNATURE rule: "must remain technically stable"). */
export const STABILITY_HEADROOM = 30;
