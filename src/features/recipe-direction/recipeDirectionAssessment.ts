import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTargets,
  type RecipeInput,
  type RecipeResult,
  type TargetMetric,
} from '@/engine';
import type { TenPointScore } from '@/features/recipe-score/recipeMatchScore';

import { buildRecipeDirectionPlan } from './recipeDirectionTargets';
import { sorbetProjectionRole } from './sorbetDirectionRoles';

const EXACT_CENTER_EPSILON = 1e-9;

export interface RecipeDirectionResidual {
  axis: keyof RecipeDirectionTargets;
  metric: TargetMetric;
  reached: boolean;
  side: 'below' | 'inside' | 'above';
  value?: number;
  targetCenter?: number | null;
  absoluteDistance?: number;
  /** Sorbet-only physical resolution of one legal, mass-neutral 1 g exchange. */
  practicalTolerance?: number;
  acceptance?: 'exact' | 'whole_gram_quantization' | 'missed';
}

const plannedSum = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

/**
 * Sorbet's executable Direction resolution is the metric movement caused by
 * one mass-neutral 1 g exchange between its projection roles. This is measured
 * with the Engine around the delivered whole-gram recipe; no POD/NPAC formula
 * or arbitrary display epsilon is copied into the product layer.
 *
 * The maximum legal adjacent movement is the conservative quantization cell:
 * a residual no larger than one executable lattice edge is physically achieved
 * at whole-gram resolution. Anything farther away remains missed.
 */
function sorbetOneGramAcceptance(
  input: RecipeInput,
  result: RecipeResult,
  metrics: readonly TargetMetric[],
): ReadonlyMap<TargetMetric, number> {
  if (
    input.category !== 'sorbet' ||
    input.goals?.direction_targets_active !== true ||
    !Number.isInteger(input.target_batch_grams) ||
    Math.abs(plannedSum(input) - input.target_batch_grams) > EXACT_CENTER_EPSILON ||
    input.items.some((item) => !Number.isInteger(item.planned_grams) || item.planned_grams <= 0)
  ) {
    return new Map();
  }
  const movable = input.items.filter(
    (item) =>
      sorbetProjectionRole(item) !== null &&
      item.lock_type === 'unlocked' &&
      item.actual_grams === null,
  );
  if (movable.length < 2) return new Map();

  const baseline = new Map(result.indicators.map((indicator) => [indicator.key, indicator.value]));
  const tolerance = new Map<TargetMetric, number>(metrics.map((metric) => [metric, 0]));
  for (const donor of movable) {
    if (donor.planned_grams <= 1) continue;
    for (const receiver of movable) {
      if (receiver.id === donor.id) continue;
      const neighbour: RecipeInput = {
        ...input,
        items: input.items.map((item) =>
          item.id === donor.id
            ? { ...item, planned_grams: item.planned_grams - 1 }
            : item.id === receiver.id
              ? { ...item, planned_grams: item.planned_grams + 1 }
              : item,
        ),
      };
      const neighbourResult = calculateRecipe(neighbour);
      if (detectViolations(neighbourResult).length > 0) continue;
      if (neighbourResult.warnings.some((warning) => warning.severity === 'critical')) continue;
      const neighbourValues = new Map(
        neighbourResult.indicators.map((indicator) => [indicator.key, indicator.value]),
      );
      for (const metric of metrics) {
        const before = baseline.get(metric);
        const after = neighbourValues.get(metric);
        if (before === null || before === undefined || after === null || after === undefined)
          continue;
        tolerance.set(metric, Math.max(tolerance.get(metric) ?? 0, Math.abs(after - before)));
      }
    }
  }
  return tolerance;
}

export interface RecipeDirectionAssessment {
  active: boolean;
  reached: boolean;
  supportedAxisCount: number;
  reachedAxisCount: number;
  score: TenPointScore | null;
  residuals: RecipeDirectionResidual[];
  blockedAxes: Array<{
    axis: keyof RecipeDirectionTargets;
    reason: string;
  }>;
}

/**
 * Product-layer target fit only. Native Engine bands remain the sole safety
 * authority; this function merely asks whether the already-computed result is
 * inside the immutable Sweetness/Softness preference zones selected by the
 * owner. No Engine constants or Mapper values are changed.
 */
export function assessRecipeDirection(
  input: RecipeInput,
  result: RecipeResult,
): RecipeDirectionAssessment {
  const plan = buildRecipeDirectionPlan(input);
  const active = input.goals?.direction_targets_active === true;
  const indicators = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));
  const residuals: RecipeDirectionResidual[] = [];
  const workingMetrics = plan.axes.flatMap((axis) =>
    axis.status === 'working' && axis.metric !== null ? [axis.metric] : [],
  );
  const practicalTolerance = sorbetOneGramAcceptance(input, result, workingMetrics);

  if (active) {
    for (const axis of plan.axes) {
      if (axis.status !== 'working' || axis.metric === null || axis.targetBand === null) continue;
      const value = indicators.get(axis.metric)?.value;
      if (value === null || value === undefined || !Number.isFinite(value)) continue;
      const absoluteDistance =
        axis.targetCenter === null
          ? value < axis.targetBand.min
            ? axis.targetBand.min - value
            : value > axis.targetBand.max
              ? value - axis.targetBand.max
              : 0
          : Math.abs(value - axis.targetCenter);
      const exactCenterReached =
        axis.targetCenter !== null && absoluteDistance <= EXACT_CENTER_EPSILON;
      const axisPracticalTolerance =
        axis.targetCenter === null ? 0 : (practicalTolerance.get(axis.metric) ?? 0);
      const practicalCenterReached =
        axis.targetCenter !== null &&
        axisPracticalTolerance > EXACT_CENTER_EPSILON &&
        absoluteDistance <= axisPracticalTolerance + EXACT_CENTER_EPSILON;
      const centerReached = exactCenterReached || practicalCenterReached;
      const side = centerReached
        ? 'inside'
        : value < axis.targetBand.min
          ? 'below'
          : value > axis.targetBand.max
            ? 'above'
            : 'inside';
      residuals.push({
        axis: axis.axis,
        metric: axis.metric,
        reached: axis.targetCenter === null ? side === 'inside' : centerReached,
        side,
        value,
        targetCenter: axis.targetCenter,
        absoluteDistance,
        ...(axis.targetCenter === null
          ? {}
          : {
              practicalTolerance: axisPracticalTolerance,
              acceptance: exactCenterReached
                ? ('exact' as const)
                : practicalCenterReached
                  ? ('whole_gram_quantization' as const)
                  : ('missed' as const),
            }),
      });
    }
  }

  const reachedAxisCount = residuals.filter((residual) => residual.reached).length;
  const supportedAxisCount = residuals.length;
  const missedAxisCount = supportedAxisCount - reachedAxisCount;
  const score =
    !active || supportedAxisCount === 0
      ? null
      : (Math.max(1, 10 - missedAxisCount) as TenPointScore);

  return {
    active,
    reached: active && supportedAxisCount > 0 && missedAxisCount === 0,
    supportedAxisCount,
    reachedAxisCount,
    score,
    residuals,
    blockedAxes: active
      ? plan.axes
          .filter((axis) => axis.status !== 'working')
          .map((axis) => ({ axis: axis.axis, reason: axis.reason ?? 'Brak kalibracji.' }))
      : [],
  };
}
