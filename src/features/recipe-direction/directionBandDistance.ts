/**
 * SHARED DIRECTION NEAREST — the distance authority.
 *
 * When an exact Direction band cannot be reached, the surface reports NEAREST.
 * "Nearest" has to MEAN something: the best executable legal candidate closest
 * to the band the user actually asked for. Before this module existed there was
 * no explicit representation of that distance anywhere in the selection path.
 * Candidates were ranked only by `Σ_metrics (beyond_band / halfWidth)` summed
 * across every technical metric, and the search was a greedy hill-climb that
 * accepted strictly-improving moves and never backtracked — so NEAREST was
 * simply wherever the climb happened to stop.
 *
 * Measured consequences on Protein (2026-08-23, starter draft, OPTIMAL):
 *
 *   −11 °C, Sweetness +2, band [16,17] → delivered POD 14.7201 (distance 1.2799)
 *     while Sweetness +1 demonstrably reaches 15.5571 (distance 0.4429 from the
 *     SAME [16,17] band). A strictly closer legal candidate provably existed.
 *
 *   −13 °C, Sweetness −1, band [13,14] → delivered POD 14.9812, i.e. the engine
 *     moved POD UP and AWAY from a downward target, while Sweetness −2 reaches
 *     13.9272 — INSIDE [13,14]. Not merely non-nearest: ACHIEVED was available.
 *
 * Distance is to the BAND, never to a band centre (owner contract): a candidate
 * anywhere inside the requested band has fully satisfied the request, so every
 * in-band candidate scores 0 and is separated only by the existing technical
 * tie-breaks.
 */
import {
  calculateRecipe,
  type RecipeDirectionTargets,
  type RecipeInput,
  type RecipeResult,
  type TargetRange,
} from '@/engine';
import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

/** One requested Direction band, resolved from the plan of the REQUESTED input. */
export interface RequestedDirectionBand {
  axis: keyof RecipeDirectionTargets;
  metric: string;
  band: TargetRange;
}

/**
 * §5 — distance from a delivered value to a requested band.
 * Below the band → how far below. Above → how far above. Inside → exactly 0.
 */
export function bandDistance(value: number, band: TargetRange): number {
  if (value < band.min) return band.min - value;
  if (value > band.max) return value - band.max;
  return 0;
}

/** The bands a given input is ASKING for — only axes the profile actually supports. */
export function requestedDirectionBands(input: RecipeInput): RequestedDirectionBand[] {
  if (input.goals?.direction_targets_active !== true) return [];
  return buildRecipeDirectionPlan(input)
    .axes.flatMap((axis) =>
      axis.status === 'working' && axis.targetBand !== null && axis.metric !== null
        ? [{ axis: axis.axis, metric: axis.metric, band: axis.targetBand }]
        : [],
    );
}

const indicatorValue = (result: RecipeResult, metric: string): number | null => {
  const indicator = result.indicators.find((entry) => entry.key === metric);
  return indicator === undefined || indicator.value === null || Number.isNaN(indicator.value)
    ? null
    : indicator.value;
};

export interface DirectionDistanceMeasure {
  /** Number of requested axes whose delivered value is outside its band. */
  missedAxes: number;
  /** Σ distance over every requested axis. Ranking currency for NEAREST. */
  total: number;
  perAxis: readonly { axis: keyof RecipeDirectionTargets; metric: string; value: number | null; band: TargetRange; distance: number }[];
}

/**
 * Measure a CANDIDATE against the bands of the REQUESTED input.
 *
 * The two inputs are deliberately separate. A candidate produced while aiming
 * at a neighbouring band is still a legitimate answer to the original request —
 * it is simply another way of generating a candidate — but it must always be
 * SCORED against what the user actually asked for.
 */
export function directionDistance(
  candidate: RecipeInput,
  requestedBands: readonly RequestedDirectionBand[],
  candidateResult: RecipeResult = calculateRecipe(candidate),
): DirectionDistanceMeasure {
  const perAxis = requestedBands.map((requested) => {
    const value = indicatorValue(candidateResult, requested.metric);
    return {
      axis: requested.axis,
      metric: requested.metric,
      value,
      band: requested.band,
      // An unmeasurable axis cannot be claimed as satisfied.
      distance: value === null ? Number.POSITIVE_INFINITY : bandDistance(value, requested.band),
    };
  });
  return {
    missedAxes: perAxis.filter((entry) => entry.distance > 0).length,
    total: perAxis.reduce((sum, entry) => sum + entry.distance, 0),
    perAxis,
  };
}

/** Ranking epsilon — below this two candidates are equally near and the existing
 * technical/quality tie-breaks decide, exactly as they did before. */
export const DIRECTION_DISTANCE_EPS = 1e-6;

/**
 * §4 ordering, applied only AFTER hard safety, Main/Multi-Main, locks and
 * executability have already been satisfied by the caller: fewer missed axes
 * wins, then smaller total distance. `null` when the two are indistinguishable,
 * so the caller keeps its own deterministic tie-break.
 */
export function compareDirectionDistance(
  a: DirectionDistanceMeasure,
  b: DirectionDistanceMeasure,
): number | null {
  if (a.missedAxes !== b.missedAxes) return a.missedAxes - b.missedAxes;
  if (Math.abs(a.total - b.total) > DIRECTION_DISTANCE_EPS) return a.total - b.total;
  return null;
}
