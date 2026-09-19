import { describe, expect, it } from 'vitest';
import type { RecipeDirectionTargets, RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import type { DirectionFallbackAttempt, DirectionFallbackReport } from './directionFallback';
import {
  directionFeasibility,
  DEFAULT_DIRECTION_TARGET_ORIGINS,
  type DirectionTargetOrigins,
} from './directionFeasibility';

/*
 * OD-29 (Owner 19.09.2026) — ONE answer for HOME and PRO when a Direction target is
 * genuinely out of reach.
 *
 * Every case below is about the CONTRACT, never about whether a particular refusal is
 * correct: a false infeasible is a solver bug (OD-28, under audit) and this module must
 * not be able to make one look reasonable.
 */
const targets = (patch: Partial<RecipeDirectionTargets> = {}): RecipeDirectionTargets =>
  ({ sweetness: 0, softness: 0, creaminess: 0, flavor: 0, ...patch }) as RecipeDirectionTargets;

const recipe = (): RecipeInput =>
  ({
    category: 'gelato',
    target_batch_grams: 1000,
    items: [
      { id: 'line-milk', ingredient: { name: 'MILK' }, planned_grams: 600 },
      { id: 'line-sugar', ingredient: { name: 'SUCROSE SUGAR' }, planned_grams: 120 },
    ],
  }) as unknown as RecipeInput;

const constraints = (): ConstraintSet => ({ byLineId: {} }) as unknown as ConstraintSet;

const attempt = (
  patch: Partial<DirectionFallbackAttempt> & { targets: RecipeDirectionTargets },
): DirectionFallbackAttempt =>
  ({
    attemptIndex: 0,
    targetReached: false,
    runtimeMs: 1,
    preview: { applied: true } as never,
    originalTargetScore: null,
    preservedOriginallySatisfiedAxes: true,
    ...patch,
  }) as DirectionFallbackAttempt;

const report = (
  requested: RecipeDirectionTargets,
  best: DirectionFallbackAttempt | null,
): DirectionFallbackReport => ({
  profile: 'gelato' as RecipeInput['category'],
  failureKind: 'SEARCH_FAILED',
  requestedTargets: requested,
  attempts: best ? [best] : [],
  best,
  totalRuntimeMs: 2,
});

/** A refusal that names its own dominant held constraint. */
const heldLockFailure = (grams = 42) =>
  ({
    ok: false,
    code: 'impossible_under_constraints',
    conflict: {
      lineId: 'line-sugar',
      ingredientName: 'SUCROSE SUGAR',
      kind: 'locked',
      grams,
    },
    hardViolatedMetrics: [],
    residualViolatedMetrics: [],
    capReached: false,
    blockingViolations: [
      {
        code: 'main_below_floor',
        lineIds: ['line-milk'],
        messagePl: 'ma 24,0%; wymagane minimum to 30,0%',
      },
    ],
  }) as never;

/** A refusal whose only stated cause is the Main envelope. */
const mainFloorFailure = () =>
  ({
    ok: false,
    code: 'no_proposal',
    blockingViolations: [
      {
        code: 'main_below_floor',
        lineIds: ['line-milk'],
        messagePl: 'ma 24,0%; wymagane minimum to 30,0%',
      },
    ],
  }) as never;

const mixedFailure = () =>
  ({
    ok: false,
    code: 'no_proposal',
    blockingViolations: [
      { code: 'main_above_hard_limit', lineIds: ['line-milk'], messagePl: 'twardy limit 45,0%' },
      {
        code: 'liquid_dairy_carrier_below_floor',
        lineIds: ['line-milk'],
        messagePl: 'ma 18,0%; wymagane minimum to 25,0%',
      },
    ],
  }) as never;

const explicit = (patch: Partial<DirectionTargetOrigins>): DirectionTargetOrigins => ({
  ...DEFAULT_DIRECTION_TARGET_ORIGINS,
  ...patch,
});

describe('DIR-FEAS — one genuine-infeasible contract for HOME and PRO', () => {
  it('DIR-FEAS-A user-explicit SWEETNESS: infeasible, nearest stated, nothing changed, consent required', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ sweetness: 'user_explicit' }),
    });
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.unreachableAxes).toEqual([
      {
        axis: 'sweetness',
        requestedValue: -1,
        nearestFeasibleValue: 0,
        targetOrigin: 'user_explicit',
      },
    ]);
    // The requested target is reported as asked — the module changes nothing.
    expect(feasibility.requestedTargets.sweetness).toBe(-1);
    expect(feasibility.requiresConsent).toBe(true);
    expect(feasibility.suggestedActions).toContainEqual({
      kind: 'accept_nearest',
      lineId: null,
      ingredientName: null,
      requiresConsent: true,
    });
  });

  it('DIR-FEAS-B user-explicit HARDNESS behaves identically — no axis is special-cased', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ softness: 2 }), attempt({ targets: targets({ softness: 1 }) })),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ softness: 'user_explicit' }),
    });
    expect(feasibility.unreachableAxes.map((axis) => axis.axis)).toEqual(['softness']);
    expect(feasibility.unreachableAxes[0]!.requestedValue).toBe(2);
    expect(feasibility.unreachableAxes[0]!.nearestFeasibleValue).toBe(1);
    expect(feasibility.requiresConsent).toBe(true);
  });

  it('DIR-FEAS-C a locked ingredient is named as the blocker, with its own amount', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: heldLockFailure(42),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ sweetness: 'user_explicit' }),
    });
    expect(feasibility.reasonCodes).toContain('explicit_quantity_lock');
    expect(feasibility.blockingConstraints).toContainEqual({
      code: 'explicit_quantity_lock',
      lineId: 'line-sugar',
      ingredientName: 'SUCROSE SUGAR',
      actualPercent: null,
      limitPercent: null,
      grams: 42,
    });
    // Releasing someone's lock is never automatic.
    expect(
      feasibility.suggestedActions.find((action) => action.kind === 'release_quantity_lock'),
    ).toMatchObject({ lineId: 'line-sugar', requiresConsent: true });
  });

  it('DIR-FEAS-D a Main-group limit is named with the verdict’s own numbers', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
    });
    expect(feasibility.reasonCodes).toContain('main_below_floor');
    expect(feasibility.blockingConstraints[0]).toMatchObject({
      code: 'main_below_floor',
      actualPercent: 24,
      limitPercent: 30,
    });
    expect(
      feasibility.suggestedActions.find((action) => action.kind === 'review_main_group'),
    ).toMatchObject({ requiresConsent: true });
  });

  it('DIR-FEAS-E several causes are all reported — never one invented winner', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: mixedFailure(),
      recipe: recipe(),
      constraints: constraints(),
    });
    expect([...feasibility.reasonCodes].sort()).toEqual([
      'liquid_dairy_carrier_below_floor',
      'main_above_hard_limit',
    ]);
    expect(feasibility.blockingConstraints).toHaveLength(2);
  });

  it('DIR-FEAS-F a system default nobody chose needs no blocking question', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: DEFAULT_DIRECTION_TARGET_ORIGINS,
    });
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.unreachableAxes[0]!.targetOrigin).toBe('system_default');
    // Nothing was decided by the customer, so nothing waits on them.
    expect(feasibility.requiresConsent).toBe(false);
    expect(
      feasibility.suggestedActions.find((action) => action.kind === 'accept_nearest'),
    ).toMatchObject({ requiresConsent: false });
  });

  it('DIR-FEAS-G one explicit axis among defaults still requires consent', () => {
    const feasibility = directionFeasibility({
      report: report(
        targets({ sweetness: -1, creaminess: 2 }),
        attempt({ targets: targets({ sweetness: 0, creaminess: 1 }) }),
      ),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ creaminess: 'user_explicit' }),
    });
    expect(feasibility.unreachableAxes.map((axis) => axis.axis)).toEqual([
      'sweetness',
      'creaminess',
    ]);
    expect(feasibility.requiresConsent).toBe(true);
  });

  it('DIR-FEAS-H a refusal with nothing to point at says exactly that', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: null,
      recipe: recipe(),
      constraints: constraints(),
    });
    expect(feasibility.reasonCodes).toEqual(['search_exhausted']);
    expect(feasibility.blockingConstraints).toEqual([]);
  });

  it('DIR-FEAS-I a reached target is feasible and says nothing at all', () => {
    const feasibility = directionFeasibility({
      report: report(
        targets({ sweetness: -1 }),
        attempt({ targets: targets({ sweetness: -1 }), targetReached: true }),
      ),
      failure: null,
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ sweetness: 'user_explicit' }),
    });
    expect(feasibility.feasible).toBe(true);
    expect(feasibility.unreachableAxes).toEqual([]);
    expect(feasibility.requiresConsent).toBe(false);
    expect(feasibility.suggestedActions).toEqual([]);
  });

  it('DIR-FEAS-J no Direction search at all is not an infeasibility', () => {
    const feasibility = directionFeasibility({
      report: null,
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
    });
    expect(feasibility.feasible).toBe(true);
    expect(feasibility.reasonCodes).toEqual([]);
    expect(feasibility.suggestedActions).toEqual([]);
  });

  it('DIR-FEAS-K HOME and PRO cannot differ: identical inputs give an identical answer', () => {
    const input = {
      report: report(targets({ sweetness: -1 }), attempt({ targets: targets({ sweetness: 0 }) })),
      failure: heldLockFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ sweetness: 'user_explicit' }),
    };
    // The parity is structural — there is one function, and this is the proof it is pure.
    expect(directionFeasibility(input)).toEqual(directionFeasibility(input));
  });

  it('DIR-FEAS-L a search that reached nothing still reports the request and the blockers', () => {
    const feasibility = directionFeasibility({
      report: report(targets({ sweetness: -2 }), null),
      failure: mainFloorFailure(),
      recipe: recipe(),
      constraints: constraints(),
      origins: explicit({ sweetness: 'user_explicit' }),
    });
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.nearestFeasibleTargets).toBeNull();
    expect(feasibility.unreachableAxes[0]).toMatchObject({
      axis: 'sweetness',
      requestedValue: -2,
      nearestFeasibleValue: null,
    });
    // With no reachable level there is nothing to accept — only causes to show.
    expect(feasibility.suggestedActions.some((action) => action.kind === 'accept_nearest')).toBe(
      false,
    );
    expect(feasibility.reasonCodes).toContain('main_below_floor');
  });
});
