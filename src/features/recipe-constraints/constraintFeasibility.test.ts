/**
 * §18 feasibility analysis (spec §25.1): every emitted number is verified on
 * BOTH sides by independent re-evaluation in the tests themselves; conflicts
 * return a GROUP; the honest §18.5 fallback appears instead of guessed
 * numbers; the evaluation budget is hard-capped.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  analyzeConstraintFeasibility,
  CONVERGENCE_GRAMS,
  EVALUATION_BUDGET_CAP,
} from './constraintFeasibility';
import {
  alcoholAndSugarHeavyJimBeam,
  overSweetStarter,
  starterLine,
  starterMilkBase,
  withGrams,
  withGramsKeepBatch,
} from './constraintFixtures';
import type { ConstraintSet } from './constraintTypes';

const SUCROSE = starterLine('sucrose');
const DEXTROSE = starterLine('dextrose');

const isCleanIndependently = (input: RecipeInput, lineId: string, grams: number): boolean => {
  const result = calculateRecipe({
    ...input,
    items: input.items.map((item) =>
      item.id === lineId ? { ...item, planned_grams: grams } : item,
    ),
  });
  return (
    detectViolations(result).length === 0 &&
    !result.warnings.some((warning) => warning.severity === 'critical')
  );
};

describe('analyzeConstraintFeasibility — outcomes', () => {
  it('clean starter under a lock → feasible / alreadyInBand with one evaluation', () => {
    const input = starterMilkBase();
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: { [SUCROSE]: { mode: 'locked', grams: 130 } },
    });
    expect(analysis.status).toBe('feasible');
    if (analysis.status !== 'feasible') return;
    expect(analysis.alreadyInBand).toBe(true);
    expect(analysis.viaSolverProposal).toBe(false);
    expect(analysis.evaluationsUsed).toBe(1);
  });

  it('violations fixable by solver ADDS while both locks hold → feasible / viaSolverProposal', () => {
    const base = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const analysis = analyzeConstraintFeasibility(base, {
      byLineId: {
        [SUCROSE]: { mode: 'locked', grams: 160 },
        [DEXTROSE]: { mode: 'locked', grams: 40 },
      },
    });
    expect(analysis.status).toBe('feasible');
    if (analysis.status !== 'feasible') return;
    expect(analysis.alreadyInBand).toBe(false);
    expect(analysis.viaSolverProposal).toBe(true);
    expect(analysis.violationsBefore.length).toBeGreaterThan(0);
  });

  it('§18.2 canonical: over-locked sucrose → verified MAX bound, both sides re-checked', () => {
    const input = overSweetStarter(220);
    const set: ConstraintSet = { byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } } };
    const analysis = analyzeConstraintFeasibility(input, set);
    expect(analysis.status).toBe('infeasible_with_bound');
    if (analysis.status !== 'infeasible_with_bound') return;

    const { bound, conflict } = analysis;
    expect(bound.lineId).toBe(SUCROSE);
    expect(bound.boundType).toBe('max');
    expect(bound.grams).toBeLessThan(220);
    expect(bound.grams).toBeGreaterThan(0);
    // convergence: the verified-violating neighbour sits within the window
    expect(Math.abs(bound.verifiedViolatingAtGrams - bound.verifiedCleanAtGrams)).toBeLessThanOrEqual(
      CONVERGENCE_GRAMS,
    );
    // INDEPENDENT engine re-verification of both sides (the §18.3 hard rule)
    expect(isCleanIndependently(input, SUCROSE, bound.verifiedCleanAtGrams)).toBe(true);
    expect(isCleanIndependently(input, SUCROSE, bound.verifiedViolatingAtGrams)).toBe(false);
    // the actionable display number is itself verified clean
    expect(bound.displayGramsVerified).toBe(true);
    expect(isCleanIndependently(input, SUCROSE, bound.displayGrams)).toBe(true);
    expect(bound.displayGrams).toBeLessThanOrEqual(bound.grams);

    // §18.2 action shape: [set exact grams and recalc] [unlock]
    expect(conflict.reasonCode).toBe('single_lock_boundary');
    expect(conflict.suggestedActions[0]).toEqual({
      type: 'set_max',
      lineId: SUCROSE,
      grams: bound.displayGrams,
    });
    expect(conflict.suggestedActions[1]).toEqual({ type: 'unlock', lineId: SUCROSE });
  });

  it('under-locked sucrose with batch headroom → verified MIN bound', () => {
    const input = withGramsKeepBatch(starterMilkBase(), SUCROSE, 90); // target stays 1000
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: { [SUCROSE]: { mode: 'locked', grams: 90 } },
    });
    expect(analysis.status).toBe('infeasible_with_bound');
    if (analysis.status !== 'infeasible_with_bound') return;
    expect(analysis.bound.boundType).toBe('min');
    expect(analysis.bound.grams).toBeGreaterThan(90);
    // the recommendation never exceeds the batch headroom (target 1000)
    expect(analysis.bound.grams).toBeLessThanOrEqual(130);
    expect(isCleanIndependently(input, SUCROSE, analysis.bound.verifiedCleanAtGrams)).toBe(true);
    expect(isCleanIndependently(input, SUCROSE, analysis.bound.verifiedViolatingAtGrams)).toBe(
      false,
    );
    expect(analysis.conflict.suggestedActions[0]).toEqual({
      type: 'set_min',
      lineId: SUCROSE,
      grams: analysis.bound.displayGrams,
    });
  });

  it('range constraint: the bound respects [minGrams, maxGrams]', () => {
    const input = overSweetStarter(150);
    const set: ConstraintSet = {
      byLineId: { [SUCROSE]: { mode: 'range', minGrams: 100, maxGrams: 160 } },
    };
    const analysis = analyzeConstraintFeasibility(input, set);
    expect(analysis.status).toBe('infeasible_with_bound');
    if (analysis.status !== 'infeasible_with_bound') return;
    expect(analysis.bound.boundType).toBe('max');
    expect(analysis.bound.grams).toBeGreaterThanOrEqual(100);
    expect(analysis.bound.grams).toBeLessThanOrEqual(160);
    expect(analysis.bound.displayGrams).toBeGreaterThanOrEqual(100);
    expect(isCleanIndependently(input, SUCROSE, analysis.bound.displayGrams)).toBe(true);
  });

  it('multi-lock conflict returns the GROUP, never one arbitrary line (§18.4)', () => {
    // Two narrow ranges pin both sugars above the clean window; machine
    // capacity blocks the add-based escape; released, the real solver fully
    // fixes by reducing sucrose — so the GROUP is reported with per-line
    // unlock options and the solver's own verified change set as evidence.
    const base: RecipeInput = { ...overSweetStarter(150), machine_capacity_grams: 1050 };
    const analysis = analyzeConstraintFeasibility(base, {
      byLineId: {
        [SUCROSE]: { mode: 'range', minGrams: 149, maxGrams: 152 },
        [DEXTROSE]: { mode: 'range', minGrams: 29, maxGrams: 31 },
      },
    });
    expect(analysis.status).toBe('conflict_group');
    if (analysis.status !== 'conflict_group') return;
    expect(analysis.conflict.reasonCode).toBe('locks_jointly_block');
    expect([...analysis.conflict.lineIds].sort()).toEqual([DEXTROSE, SUCROSE].sort());
    // one unlock option per group member — nobody is singled out
    const unlockTargets = analysis.conflict.suggestedActions
      .filter((action) => action.type === 'unlock')
      .map((action) => (action.type === 'unlock' ? action.lineId : ''));
    expect(unlockTargets.sort()).toEqual([DEXTROSE, SUCROSE].sort());
    // evidence comes verbatim from a real verified solver proposal
    const multiple = analysis.conflict.suggestedActions.find(
      (action) => action.type === 'multiple_changes',
    );
    expect(multiple).toBeDefined();
    if (multiple?.type !== 'multiple_changes') return;
    expect(multiple.changes.length).toBeGreaterThan(0);
    expect(multiple.changes[0]?.type).toBe('reduce');
    expect(multiple.changes[0]?.ingredientName).toBe('Sucrose');
  });

  it('locked sum above the batch → immediate conflict with the computed minimum (0 evaluations)', () => {
    const input = starterMilkBase(); // batch 1000
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: {
        [starterLine('milk_3_5')]: { mode: 'locked', grams: 800 },
        [SUCROSE]: { mode: 'locked', grams: 300 },
      },
    });
    expect(analysis.status).toBe('conflict_group');
    if (analysis.status !== 'conflict_group') return;
    expect(analysis.conflict.reasonCode).toBe('locked_sum_exceeds_batch');
    expect(analysis.evaluationsUsed).toBe(0);
    expect(analysis.conflict.suggestedActions[0]).toEqual({
      type: 'change_batch',
      minimumBatchGrams: 1100,
    });
  });

  it('not solvable even released → the honest §18.5 fallback, no guessed numbers', () => {
    const input = alcoholAndSugarHeavyJimBeam();
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: {
        'jim-beam:whiskey_40': { mode: 'locked', grams: 300 },
        'jim-beam:sucrose': { mode: 'locked', grams: 300 },
      },
    });
    expect(analysis.status).toBe('no_reliable_bound');
    if (analysis.status !== 'no_reliable_bound') return;
    expect(analysis.reasonCode).toBe('not_solvable_by_constraint_changes');
    expect([...analysis.lineIds].sort()).toEqual(['jim-beam:sucrose', 'jim-beam:whiskey_40']);
  });

  it('budget too small to verify anything → honest budget fallback', () => {
    const input = overSweetStarter(220);
    const analysis = analyzeConstraintFeasibility(
      input,
      { byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } } },
      { maxEvaluations: 5 },
    );
    expect(analysis.status).toBe('no_reliable_bound');
    if (analysis.status !== 'no_reliable_bound') return;
    expect(analysis.reasonCode).toBe('evaluation_budget_exhausted');
    expect(analysis.evaluationsUsed).toBeLessThanOrEqual(5);
  });

  it('violations but no lockable constraints → no_constraints_to_analyze', () => {
    const input = overSweetStarter(220);
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: { [SUCROSE]: { mode: 'ai' } },
    });
    expect(analysis.status).toBe('no_reliable_bound');
    if (analysis.status !== 'no_reliable_bound') return;
    expect(analysis.reasonCode).toBe('no_constraints_to_analyze');
    expect(analysis.lineIds).toEqual([]);
  });

  it('structurally invalid constraints → invalid_constraints, zero evaluations', () => {
    const input = starterMilkBase();
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: { [SUCROSE]: { mode: 'range', minGrams: 50, maxGrams: 40 } },
    });
    expect(analysis.status).toBe('invalid_constraints');
    if (analysis.status !== 'invalid_constraints') return;
    expect(analysis.issues[0]?.code).toBe('range_min_above_max');
    expect(analysis.evaluationsUsed).toBe(0);
  });
});

describe('analyzeConstraintFeasibility — hard rules', () => {
  it('never exceeds the evaluation budget cap in any scenario', () => {
    const scenarios: Array<[RecipeInput, ConstraintSet]> = [
      [starterMilkBase(), { byLineId: { [SUCROSE]: { mode: 'locked', grams: 130 } } }],
      [overSweetStarter(220), { byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } } }],
      [
        withGrams(overSweetStarter(220), DEXTROSE, 90),
        {
          byLineId: {
            [SUCROSE]: { mode: 'locked', grams: 220 },
            [DEXTROSE]: { mode: 'locked', grams: 90 },
          },
        },
      ],
      [
        alcoholAndSugarHeavyJimBeam(),
        {
          byLineId: {
            'jim-beam:whiskey_40': { mode: 'locked', grams: 300 },
            'jim-beam:sucrose': { mode: 'locked', grams: 300 },
          },
        },
      ],
      [
        { ...overSweetStarter(150), machine_capacity_grams: 1050 },
        {
          byLineId: {
            [SUCROSE]: { mode: 'range', minGrams: 149, maxGrams: 152 },
            [DEXTROSE]: { mode: 'range', minGrams: 29, maxGrams: 31 },
          },
        },
      ],
    ];
    for (const [input, set] of scenarios) {
      const analysis = analyzeConstraintFeasibility(input, set);
      expect(analysis.evaluationsUsed).toBeLessThanOrEqual(EVALUATION_BUDGET_CAP);
    }
  });

  it('is deterministic: identical input ⇒ identical analysis', () => {
    const run = () =>
      analyzeConstraintFeasibility(overSweetStarter(220), {
        byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } },
      });
    expect(run()).toEqual(run());
  });

  it('never mutates the recipe input or the constraint set', () => {
    const input = overSweetStarter(220);
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    const set: ConstraintSet = { byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } } };
    const setSnapshot = JSON.parse(JSON.stringify(set)) as unknown;
    analyzeConstraintFeasibility(input, set);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(set))).toEqual(setSnapshot);
  });

  it('violation views carry codes only — no band numbers, no raw metric values', () => {
    const analysis = analyzeConstraintFeasibility(overSweetStarter(220), {
      byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } },
    });
    if (analysis.status === 'invalid_constraints') throw new Error('unexpected');
    for (const view of analysis.violationsBefore) {
      expect(Object.keys(view).sort()).toEqual(['direction', 'metric']);
    }
  });
});
