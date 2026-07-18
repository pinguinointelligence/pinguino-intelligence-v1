/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { solveBatchRescueMultiLever, type MultiLeverRescueInput } from './batchRescueMultiLeverSolver';
import { previewBatchRescueRecalculation } from './branchRecalculationPreview';
import { BRANCH_RECALCULATION_SCENARIOS, type BatchRescueScenario } from './branchRecalculationFixtures';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';
import { studioIntentFromRecipe } from './optimizationPreviewRunner';
import { regulatorTargetOverride } from './solverTargetInjection';

const HERE = import.meta.dirname;

const scenario = (id: string): BatchRescueScenario =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === id)! as BatchRescueScenario;

const rescue = (id: string) => {
  const s = scenario(id);
  return previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
};

const intentFor = (recipe: RecipeInput, profile: 'standard_gelato' | 'sorbet', temp: -11 | -12 | -13) => ({
  ...studioIntentFromRecipe(recipe),
  productProfile: profile,
  servingTemperatureC: temp,
});

/** The stuck −12 state: after the verified single-lever step, npac is the only
 * residual gate and every candidate dies in the per-water dead zone. */
const stuckMinus13 = (): MultiLeverRescueInput => {
  const r = rescue('rescue-too-hard-13');
  const recipe = r.proposedRecipeSnapshot as RecipeInput;
  return {
    recipe,
    overallBeforeMetrics: r.beforeMetrics!,
    intent: intentFor(recipe, 'standard_gelato', -13),
    overrideBands: regulatorTargetOverride('standard_gelato', -13).bands,
  };
};

/** COMPATIBLE residual gates: sorbet diluted with +180 g water → npac low,
 * total_solids low AND water high together. Two DIFFERENT levers close them
 * (dextrose for npac, inulin for solids+water — exact per-total-mass models;
 * nothing worsens, so the regulator cannot reject). */
const dilutedSorbet = (extraWater = 180): MultiLeverRescueInput => {
  const base = findOptimizationPreviewFixture('sorbet-ready')!.recipe;
  const recipe: RecipeInput = {
    ...base,
    items: base.items.map((i) => (i.id === 'water' ? { ...i, planned_grams: i.planned_grams + extraWater } : i)),
    target_batch_grams: base.target_batch_grams + extraWater,
  };
  return {
    recipe,
    intent: intentFor(recipe, 'sorbet', -11),
    overrideBands: regulatorTargetOverride('sorbet', -11).bands,
  };
};

describe('solveBatchRescueMultiLever — direct walk semantics', () => {
  it('the stuck −12 npac state finds NO improving candidate — honest, no grams', () => {
    const m = solveBatchRescueMultiLever(stuckMinus13());
    expect(m.status).toBe('verification_failed');
    expect(m.statusReason).toBe('no_improving_candidate_verified');
    expect(m.stopReason).toBe('no_improving_candidate');
    expect(m.steps).toEqual([]);
    expect(m.cumulativeActions).toEqual([]);
    expect(m.finalRecipe).toBeNull();
    expect(m.leversConsidered).toContain('npac');
    expect(m.residualGates).toContain('npac');
  });

  it('COMPATIBLE residual gates step and FULLY RESCUE with two different levers (measured)', () => {
    const probe = solveBatchRescueMultiLever(dilutedSorbet());
    // measured walk: npac via Dextrose (fails 3→2), then solids via Inulin (2→0)
    expect(probe.steps).toHaveLength(2);
    expect(probe.steps[0]!.targetGate).toBe('npac');
    expect(probe.steps[0]!.actions[0]!.ingredient).toBe('Dextrose');
    expect(probe.steps[0]!.hardFailuresBefore).toBe(3);
    expect(probe.steps[0]!.hardFailuresAfter).toBe(2);
    expect(probe.steps[1]!.targetGate).toBe('total_solids');
    expect(probe.steps[1]!.actions[0]!.ingredient).toBe('Inulin');
    expect(probe.steps[1]!.hardFailuresAfter).toBe(0);
    // every accepted step is engine+regulator verified, add-only, positive
    for (const step of probe.steps) {
      expect(['optimized', 'tradeoff']).toContain(step.regulatorDecision);
      for (const a of step.actions) {
        expect(a.type).toBe('add');
        expect(a.grams).toBeGreaterThan(0);
      }
      expect(step.hardFailuresAfter).toBeLessThanOrEqual(step.hardFailuresBefore);
    }
    // the walk reaches full acceptability — every hard rescue gate passes
    expect(probe.status).toBe('calculated');
    expect(probe.finalAcceptable).toBe(true);
    expect(probe.residualGates).toEqual([]);
    expect(probe.stopReason).toBe('target_reached');
    expect(probe.finalRerun!.decision).toBe('optimized'); // unacceptable → acceptable, proven
    // cumulative additions equal the sum of the verified steps
    const stepSum = probe.steps.reduce((s, st) => s + st.actions.reduce((x, a) => x + a.grams, 0), 0);
    expect(probe.cumulativeActions.reduce((x, a) => x + a.grams, 0)).toBeCloseTo(stepSum, 9);
    expect(probe.totalAddedG).toBeCloseTo(stepSum, 9);
  });

  it('an already-acceptable state needs no steps and never claims false failure', () => {
    const base = findOptimizationPreviewFixture('sorbet-ready')!.recipe; // acceptable at −11
    const m = solveBatchRescueMultiLever({
      recipe: base,
      intent: intentFor(base, 'sorbet', -11),
      overrideBands: regulatorTargetOverride('sorbet', -11).bands,
    });
    expect(m.status).toBe('calculated');
    expect(m.statusReason).toBe('already_acceptable_no_steps_needed');
    expect(m.steps).toEqual([]);
    expect(m.finalAcceptable).toBe(true);
  });

  it('the additive burden cap stops the walk (maxAdditionFactor: 0)', () => {
    const m = solveBatchRescueMultiLever({ ...dilutedSorbet(), maxAdditionFactor: 0 });
    expect(m.stopReason).toBe('max_additions_reached');
    expect(m.steps).toEqual([]);
    expect(m.warnings).toContain('additive_burden_cap_reached');
  });

  it('never mutates its inputs and is deterministic', () => {
    const input = dilutedSorbet();
    const recipeSnapshot = JSON.stringify(input.recipe);
    const a = solveBatchRescueMultiLever(input);
    const b = solveBatchRescueMultiLever(input);
    expect(JSON.stringify(input.recipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('IF9 preview — multi-lever wiring (Slice 23)', () => {
  it('−13: the lever attempt is attached and honest; the single-shot partial STANDS unchanged', () => {
    const r = rescue('rescue-too-hard-13');
    expect(r.exactStatus).toBe('partial_improvement');
    expect(r.exactStatusReason).toBe('single_shot_partial_residual_gates_remain');
    expect(r.multiLever).not.toBeNull();
    expect(r.multiLever!.status).toBe('verification_failed');
    expect(r.multiLever!.stopReason).toBe('no_improving_candidate');
    // the residual gates the add-only walk cannot safely close (protein share is
    // not solver-addressable), reported honestly
    expect(r.multiLever!.residualGates).toEqual(['npac', 'pod', 'protein_share_in_solids']);
    // grams are the verified single-shot addition — nothing fabricated on top
    expect(r.exactActions).toEqual([
      { type: 'add', ingredient: 'Dextrose', grams: expect.closeTo(212.3, 0) as unknown as number },
    ]);
  });

  it('−11: unified semantics — a verified single shot that OVERSHOOTS the band is PARTIAL, never calculated', () => {
    const r = rescue('rescue-too-hard-11');
    expect(r.exactStatus).toBe('partial_improvement');
    expect(r.exactStatusReason).toBe('single_shot_partial_residual_gates_remain');
    // real verified grams stay exposed (improvement is genuine)…
    expect(r.exactActions).toEqual([
      { type: 'add', ingredient: 'Dextrose', grams: expect.closeTo(92.6, 0) as unknown as number },
    ]);
    // …but npac landed ABOVE the −11 band [33,43] — no rescued claim
    expect(r.afterMetrics!.npac).toBeGreaterThan(43);
    expect(r.rerun!.decision).toBe('tradeoff');
    expect(r.warnings).toContain('not_fully_rescued_residual_gates_remain');
    // the multi-lever residual search was attempted and stopped honestly
    expect(r.multiLever).not.toBeNull();
    expect(r.multiLever!.status).toBe('verification_failed');
    expect(r.multiLever!.residualGates).toContain('npac');
  });

  it('multi-lever is never attempted on safety/physical blocks', () => {
    for (const id of ['rescue-food-safety', 'rescue-frozen-no-reprocess', 'rescue-icy', 'rescue-temp-mismatch']) {
      const r = rescue(id);
      expect(r.multiLever).toBeNull();
    }
  });
});

describe('batchRescueMultiLeverSolver — boundary (pure, no writes)', () => {
  const src = readFileSync(join(HERE, 'batchRescueMultiLeverSolver.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('engine via the barrel only; no DB / Mapper / inventory / services; no substitution', () => {
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
    expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role/i.test(src)).toBe(false);
    expect(/writeInventory|updateStock|decrementStock/i.test(src)).toBe(false);
    expect(/substitute/i.test(src)).toBe(false); // rescue never substitutes
    for (const verb of ['.insert(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
    expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
  });
});
