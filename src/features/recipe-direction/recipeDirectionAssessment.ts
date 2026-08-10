import type { RecipeDirectionTargets, RecipeInput, RecipeResult, TargetMetric } from '@/engine';
import type { TenPointScore } from '@/features/recipe-score/recipeMatchScore';

import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

export interface RecipeDirectionResidual {
  axis: keyof RecipeDirectionTargets;
  metric: TargetMetric;
  reached: boolean;
  side: 'below' | 'inside' | 'above';
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

  if (active) {
    for (const axis of plan.axes) {
      if (axis.status !== 'working' || axis.metric === null || axis.targetBand === null) continue;
      const value = indicators.get(axis.metric)?.value;
      if (value === null || value === undefined || !Number.isFinite(value)) continue;
      const side =
        value < axis.targetBand.min ? 'below' : value > axis.targetBand.max ? 'above' : 'inside';
      residuals.push({
        axis: axis.axis,
        metric: axis.metric,
        reached: side === 'inside',
        side,
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
