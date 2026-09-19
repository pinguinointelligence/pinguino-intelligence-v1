/**
 * OD-29 (Owner 19.09.2026) — the ONE answer HOME and PRO get when a Direction target is
 * genuinely out of reach.
 *
 * The product already refuses honestly: `directionFallback` searches one selector step
 * toward zero and `ProRecalcPanel` says „Nie da się osiągnąć poziomu X. Najbliższy
 * możliwy poziom to Y.” for both surfaces. Two things were missing, and both are decided
 * here rather than in a screen:
 *
 *  1. WHY. „Zobacz, co blokuje” may not be a shrug. The blocking facts already exist —
 *     the Main-envelope verdicts a failed preview carries (`blockingViolations`) and the
 *     customer's own exact gram locks (`relaxableCustomerLocks`) — so this module reads
 *     those authorities instead of inventing a second diagnosis.
 *  2. WHOSE TARGET IT IS. A level the customer chose may never be changed for them; a
 *     level nobody chose is the system's own default and may be met at its nearest
 *     feasible value, said out loud afterwards. That is `targetOrigin`, and it decides
 *     `requiresConsent` — not the surface.
 *
 * PURE. No store, no React, no copy: HOME and PRO render the same object their own way.
 *
 * Deliberately NOT here: any judgement about whether a particular refusal is CORRECT.
 * A false infeasible is a solver bug and must be fixed as one (see OD-28, under audit);
 * this module would happily explain a wrong refusal, which is exactly why it must never
 * be used to make one look reasonable.
 */
import type { RecipeDirectionTargets, RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import type { BuildPreviewResult } from './applyPipeline';
import type { DirectionFallbackReport } from './directionFallback';
import { lockConflictBlockers, relaxableCustomerLocks } from './lockRelaxation';
import {
  directionTargetNeedsConsent,
  DEFAULT_DIRECTION_TARGET_ORIGINS,
  type DirectionTargetOrigin,
  type DirectionTargetOrigins,
} from '@/features/recipe-direction/directionTargetOrigin';

export {
  directionTargetNeedsConsent,
  DEFAULT_DIRECTION_TARGET_ORIGINS,
  LEGACY_DIRECTION_TARGET_ORIGINS,
  normalizeDirectionTargetOrigins,
  type DirectionTargetOrigin,
  type DirectionTargetOrigins,
} from '@/features/recipe-direction/directionTargetOrigin';

/** The same refusal shape `lockRelaxation` reads — one definition, not a parallel one. */
type PreviewFailure = Exclude<BuildPreviewResult, { ok: true }>;

/** The four adjustable axes, named as the profile store names them. */
export type DirectionAxisId = keyof RecipeDirectionTargets;

export const DIRECTION_AXES: readonly DirectionAxisId[] = [
  'sweetness',
  'softness',
  'creaminess',
  'flavor',
];

/**
 * Why the target could not be reached. Every code is a fact some existing authority
 * already states — none is inferred from the shape of a failure.
 */
export type DirectionBlockerCode =
  /** The customer pinned an exact amount and that pin is what the search cannot move. */
  | 'explicit_quantity_lock'
  /** The Main group cannot go lower without leaving its own floor. */
  | 'main_below_floor'
  /** The Main group is already at its hard ceiling. */
  | 'main_above_hard_limit'
  /** The liquid dairy carrier would fall under its floor. */
  | 'liquid_dairy_carrier_below_floor'
  /** Product data itself refuses the composition the target would need. */
  | 'product_behavior_blocked'
  /** The search ran and found nothing, with no constraint it can point at. */
  | 'search_exhausted';

export interface DirectionBlockingConstraint {
  code: DirectionBlockerCode;
  /** The line this blocker belongs to, when it belongs to one. */
  lineId: string | null;
  ingredientName: string | null;
  /** Measured share of the batch, when the verdict stated one. */
  actualPercent: number | null;
  /** The boundary that was crossed, when the verdict stated one. */
  limitPercent: number | null;
  /** The customer's pinned amount, for a quantity lock. */
  grams: number | null;
}

/**
 * What the product may offer. Anything that would undo a choice the customer made is
 * marked `requiresConsent` — it is never applied to make a number work.
 */
export type DirectionResolutionKind =
  | 'accept_nearest'
  | 'release_quantity_lock'
  | 'review_main_group'
  | 'review_product_data';

export interface DirectionResolution {
  kind: DirectionResolutionKind;
  lineId: string | null;
  ingredientName: string | null;
  /** True when taking this path changes something the customer decided on purpose. */
  requiresConsent: boolean;
}

export interface DirectionAxisFeasibility {
  axis: DirectionAxisId;
  requestedValue: number;
  nearestFeasibleValue: number | null;
  targetOrigin: DirectionTargetOrigin;
}

export interface DirectionFeasibility {
  /** False only when the search actually failed to reach the requested targets. */
  feasible: boolean;
  requestedTargets: RecipeDirectionTargets;
  /** The best the search could actually reach; null when it reached nothing at all. */
  nearestFeasibleTargets: RecipeDirectionTargets | null;
  /** Only the axes whose value had to move — the ones worth speaking about. */
  unreachableAxes: readonly DirectionAxisFeasibility[];
  targetOrigins: DirectionTargetOrigins;
  /**
   * True when at least one unreachable axis carries a level the CUSTOMER chose. The
   * nearest value may then be applied only after they say so; a purely system-default
   * miss is applied and reported afterwards, without a question in the way.
   */
  requiresConsent: boolean;
  reasonCodes: readonly DirectionBlockerCode[];
  blockingConstraints: readonly DirectionBlockingConstraint[];
  suggestedActions: readonly DirectionResolution[];
}

const sameValue = (left: number | undefined, right: number | undefined): boolean => left === right;

function unreachableAxesOf(
  requested: RecipeDirectionTargets,
  nearest: RecipeDirectionTargets | null,
  origins: DirectionTargetOrigins,
): DirectionAxisFeasibility[] {
  const axes: DirectionAxisFeasibility[] = [];
  for (const axis of DIRECTION_AXES) {
    const requestedValue = requested[axis];
    const nearestValue = nearest ? nearest[axis] : null;
    if (nearest !== null && sameValue(requestedValue, nearest[axis])) continue;
    axes.push({
      axis,
      requestedValue,
      nearestFeasibleValue: nearestValue,
      targetOrigin: origins[axis],
    });
  }
  return axes;
}

/**
 * The blocking facts, read from the authorities that already produced them.
 *
 * `lockConflictBlockers` reads the Main-envelope verdict's own sentence, so the numbers
 * here are the verdict's numbers. The customer's pinned amounts come from
 * `relaxableCustomerLocks`, the same list the lock-relaxation flow offers to release.
 */
function blockingConstraintsOf(
  failure: PreviewFailure | null,
  recipe: RecipeInput,
  constraints: ConstraintSet,
): DirectionBlockingConstraint[] {
  if (failure === null) return [];
  const nameByLineId = new Map(recipe.items.map((item) => [item.id, item.ingredient.name]));
  const blocking: DirectionBlockingConstraint[] = [];

  for (const blocker of lockConflictBlockers(failure)) {
    blocking.push({
      code: blocker.code,
      lineId: null,
      ingredientName: null,
      actualPercent: blocker.actualPercent,
      limitPercent: blocker.limitPercent,
      grams: null,
    });
  }

  if (failure.code === 'product_behavior_invalid') {
    blocking.push({
      code: 'product_behavior_blocked',
      lineId: null,
      ingredientName: null,
      actualPercent: null,
      limitPercent: null,
      grams: null,
    });
  }

  /* The refusal names its own dominant held constraint — „the conflict”. That single
     named line is the truth to show; the full list of pinned amounts is a fallback for
     refusals that carry no name, and never a guess dressed as a cause. */
  if (failure.code === 'impossible_under_constraints' && failure.conflict) {
    blocking.push({
      code: 'explicit_quantity_lock',
      lineId: failure.conflict.lineId,
      ingredientName: nameByLineId.get(failure.conflict.lineId) ?? failure.conflict.ingredientName,
      actualPercent: null,
      limitPercent: null,
      grams: failure.conflict.grams,
    });
  } else if (blocking.length > 0) {
    for (const lock of relaxableCustomerLocks(recipe, constraints)) {
      blocking.push({
        code: 'explicit_quantity_lock',
        lineId: lock.lineId,
        ingredientName: nameByLineId.get(lock.lineId) ?? lock.ingredientName,
        actualPercent: null,
        limitPercent: null,
        grams: lock.grams,
      });
    }
  }

  return blocking;
}

function resolutionsOf(
  blocking: readonly DirectionBlockingConstraint[],
  hasNearest: boolean,
  requiresConsent: boolean,
): DirectionResolution[] {
  const resolutions: DirectionResolution[] = [];
  if (hasNearest) {
    resolutions.push({
      kind: 'accept_nearest',
      lineId: null,
      ingredientName: null,
      // Accepting a different level than the customer asked for is their call.
      requiresConsent,
    });
  }
  for (const blocker of blocking) {
    if (blocker.code === 'explicit_quantity_lock') {
      resolutions.push({
        kind: 'release_quantity_lock',
        lineId: blocker.lineId,
        ingredientName: blocker.ingredientName,
        // Releasing a lock undoes an explicit decision: never silently.
        requiresConsent: true,
      });
      continue;
    }
    if (blocker.code === 'main_below_floor' || blocker.code === 'main_above_hard_limit') {
      resolutions.push({
        kind: 'review_main_group',
        lineId: null,
        ingredientName: null,
        // Main/Crown is the customer's composition decision.
        requiresConsent: true,
      });
      continue;
    }
    if (blocker.code === 'product_behavior_blocked') {
      resolutions.push({
        kind: 'review_product_data',
        lineId: null,
        ingredientName: null,
        requiresConsent: false,
      });
    }
  }
  return resolutions.filter(
    (resolution, index) =>
      resolutions.findIndex(
        (candidate) => candidate.kind === resolution.kind && candidate.lineId === resolution.lineId,
      ) === index,
  );
}

/**
 * The whole contract, assembled once for both surfaces.
 *
 * `report === null` means no Direction search ran, which is not an infeasibility: the
 * answer is `feasible: true` with nothing to say.
 */
export function directionFeasibility(input: {
  report: DirectionFallbackReport | null;
  failure: PreviewFailure | null;
  recipe: RecipeInput;
  constraints: ConstraintSet;
  origins?: DirectionTargetOrigins;
}): DirectionFeasibility {
  const origins = input.origins ?? DEFAULT_DIRECTION_TARGET_ORIGINS;
  const report = input.report;

  if (report === null) {
    return {
      feasible: true,
      requestedTargets: {} as RecipeDirectionTargets,
      nearestFeasibleTargets: null,
      unreachableAxes: [],
      targetOrigins: origins,
      requiresConsent: false,
      reasonCodes: [],
      blockingConstraints: [],
      suggestedActions: [],
    };
  }

  const best = report.best;
  const reachedRequested = best !== null && best.targetReached;
  const nearestFeasibleTargets = best?.preview ? best.targets : null;
  const unreachableAxes = reachedRequested
    ? []
    : unreachableAxesOf(report.requestedTargets, nearestFeasibleTargets, origins);

  if (reachedRequested || unreachableAxes.length === 0) {
    return {
      feasible: reachedRequested,
      requestedTargets: report.requestedTargets,
      nearestFeasibleTargets,
      unreachableAxes: [],
      targetOrigins: origins,
      requiresConsent: false,
      reasonCodes: [],
      blockingConstraints: [],
      suggestedActions: [],
    };
  }

  const blockingConstraints = blockingConstraintsOf(input.failure, input.recipe, input.constraints);
  /* „Nothing to point at” is itself the honest answer — never a fabricated cause. */
  const reasonCodes: DirectionBlockerCode[] =
    blockingConstraints.length > 0
      ? [...new Set(blockingConstraints.map((blocker) => blocker.code))]
      : ['search_exhausted'];
  const requiresConsent = unreachableAxes.some((axis) =>
    directionTargetNeedsConsent(axis.targetOrigin),
  );

  return {
    feasible: false,
    requestedTargets: report.requestedTargets,
    nearestFeasibleTargets,
    unreachableAxes,
    targetOrigins: origins,
    requiresConsent,
    reasonCodes,
    blockingConstraints,
    suggestedActions: resolutionsOf(
      blockingConstraints,
      nearestFeasibleTargets !== null,
      requiresConsent,
    ),
  };
}
