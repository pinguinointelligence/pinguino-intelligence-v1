/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
} from './branchRecalculationPreview';
import { solveBatchRescueSteps } from './batchRescueStepSolver';
import { studioIntentFromRecipe } from './optimizationPreviewRunner';
import { regulatorTargetOverride } from './solverTargetInjection';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type BatchRescueScenario,
  type StockShortageScenario,
} from './branchRecalculationFixtures';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '..', '..', '..');

const scenario = <T extends { id: string }>(id: string): T =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === id)! as unknown as T;

const rescue = (id: string) => {
  const s = scenario<BatchRescueScenario>(id);
  return previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
};
const shortage = (id: string) => {
  const s = scenario<StockShortageScenario>(id);
  return previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
};

describe('IF9 exact preview — add-only rescue solve, verified or nothing', () => {
  it('too-hard rescue: single-shot honestly rejected, multi-step walk produces a VERIFIED partial improvement', () => {
    const r = rescue('rescue-too-hard-12');
    expect(r.routeDecision).toBe('rescue_with_tradeoff');
    expect(r.trace.solverInvoked).toBe(true);
    expect(r.trace.targetOverrideActive).toBe(true);
    // Slice 19 failure mode stays visible: the single-shot solve was rejected by
    // the solver's own Golden-Middle verification (per-batch model overshoots on
    // the per-water NPAC basis)…
    expect(r.singleShotReason).toBe('solver_found_no_safe_add_only_correction');
    // …and the Slice 20 multi-step walk found ONE verified add-only step, then
    // honestly stopped when no further step verified — partial, never forced.
    expect(r.exactStatus).toBe('partial_improvement');
    expect(r.exactStatusReason).toBe('multi_step_partial_residual_gates_remain');
    expect(r.multiStep).not.toBeNull();
    const m = r.multiStep!;
    expect(m.status).toBe('partial_improvement');
    expect(m.stopReason).toBe('no_improving_step');
    expect(m.steps).toHaveLength(1);
    expect(m.steps[0]!.fraction).toBe(0.25); // the SMALLEST verified fraction
    expect(m.steps[0]!.regulatorDecision).toBe('tradeoff');
    expect(m.steps[0]!.actions).toEqual([
      { type: 'add', ingredient: 'Sucrose', grams: expect.closeTo(74.4, 0) as unknown as number },
    ]);
    // the verified step moves npac toward the −12 regulator band [42,50]
    expect(r.beforeMetrics!.npac).toBeCloseTo(25.33, 1);
    expect(r.afterMetrics!.npac).toBeCloseTo(35.54, 1);
    expect(r.rerun!.decision).toBe('tradeoff'); // overall verification, no regression
    expect(r.warnings).toContain('not_fully_rescued_residual_gates_remain');
  });

  it('exact grams appear ONLY on verified statuses (calculated / partial_improvement), always add-only positives', () => {
    for (const s of BRANCH_RECALCULATION_SCENARIOS.filter((x): x is BatchRescueScenario => x.kind === 'batch_rescue')) {
      const r = previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
      if (r.exactStatus !== 'calculated' && r.exactStatus !== 'partial_improvement') {
        expect(r.exactActions).toEqual([]);
        expect(r.proposedRecipeSnapshot).toBeNull();
      } else {
        expect(r.exactActions.length).toBeGreaterThan(0);
        for (const a of r.exactActions) {
          expect(a.type).toBe('add'); // never reduce/remove
          expect(a.grams).toBeGreaterThan(0); // never negative
        }
        expect(['optimized', 'tradeoff']).toContain(r.rerun!.decision);
      }
    }
  });

  it('frozen batch without reprocessing never calculates fake grams', () => {
    const r = rescue('rescue-frozen-no-reprocess');
    expect(r.routeDecision).toBe('reprocess_required');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('reprocess_required_no_addition_grams');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
    expect(r.trace.solverInvoked).toBe(false);
  });

  it('food-safety concern is unsafe — the solver is never invoked', () => {
    const r = rescue('rescue-food-safety');
    expect(r.routeDecision).toBe('discard_or_rebatch');
    expect(r.exactStatus).toBe('unsafe');
    expect(r.exactActions).toEqual([]);
    expect(r.trace.solverInvoked).toBe(false);
  });

  it('outstanding physical measurements (icy) block the exact solve', () => {
    const r = rescue('rescue-icy');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('physical_measurements_required_first');
    expect(r.exactActions).toEqual([]);
  });

  it('temperature adjustment is non-compositional — no grams, the action is the answer', () => {
    const r = rescue('rescue-temp-mismatch');
    expect(r.routeDecision).toBe('rescue_possible');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('non_compositional_action');
  });

  it('missing batch size blocks before anything is calculated', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const r = previewBatchRescueRecalculation({
      rescueIntent: { ...s.rescueIntent, batchSizeG: null },
      actualRecipe: s.actualRecipe,
    });
    expect(r.exactStatus).toBe('blocked_missing_data');
    expect(r.exactActions).toEqual([]);
  });

  it('an observation contradicting the measured direction is refused BEFORE any solve (no grams ever)', () => {
    // too_soft reported, but the batch's npac is measured BELOW the −12 band
    // (i.e. actually too hard): solving the metric would move it OPPOSITE to the
    // declared rescue direction — nothing is solved, the operator re-measures.
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const r = previewBatchRescueRecalculation({
      rescueIntent: { ...s.rescueIntent, observation: { problem: 'too_soft' } },
      actualRecipe: s.actualRecipe,
    });
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('observation_contradicts_measured_direction');
    expect(r.trace.solverInvoked).toBe(false); // refused before the solver ran
    expect(r.warnings).toContain('re_measure_batch_observation_vs_metrics_mismatch');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
    expect(r.multiStep).toBeNull();
  });

  it('multi-step is attempted ONLY after an eligible single-shot failure (never on safety/physical blocks)', () => {
    for (const id of ['rescue-food-safety', 'rescue-frozen-no-reprocess', 'rescue-icy', 'rescue-temp-mismatch']) {
      const r = rescue(id);
      expect(r.multiStep).toBeNull();
      expect(r.singleShotReason).toBeNull();
    }
  });

  it('multi-step honors an explicit step budget and reports partial honestly (maxSteps: 1)', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const override = regulatorTargetOverride('standard_gelato', -12);
    const m = solveBatchRescueSteps({
      recipe: s.actualRecipe,
      intent: {
        ...studioIntentFromRecipe(s.actualRecipe),
        productProfile: 'standard_gelato',
        servingTemperatureC: -12,
      },
      engineMetric: 'npac',
      direction: 'increase',
      metricsKey: 'npac',
      trueBand: override.bands.npac!,
      overrideBands: override.bands,
      maxSteps: 1,
    });
    expect(m.steps.length).toBeLessThanOrEqual(1);
    expect(m.status).toBe('partial_improvement');
    expect(m.finalRerun!.decision).toBe('tradeoff');
  });

  it('the multi-step walk refuses a direction-mismatched request (defense in depth)', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const override = regulatorTargetOverride('standard_gelato', -12);
    const m = solveBatchRescueSteps({
      recipe: s.actualRecipe, // npac BELOW band — needs increase
      intent: {
        ...studioIntentFromRecipe(s.actualRecipe),
        productProfile: 'standard_gelato',
        servingTemperatureC: -12,
      },
      engineMetric: 'npac',
      direction: 'decrease', // contradicts the data
      metricsKey: 'npac',
      trueBand: override.bands.npac!,
      overrideBands: override.bands,
    });
    expect(m.status).toBe('verification_failed');
    expect(m.steps).toEqual([]);
    expect(m.cumulativeActions).toEqual([]);
    expect(m.warnings).toContain('direction_mismatch_walk_refused');
  });

  it('cumulative additions equal the exact sum of the verified steps', () => {
    const r = rescue('rescue-too-hard-12');
    const m = r.multiStep!;
    const stepSum = m.steps.reduce((sum, st) => sum + st.actions.reduce((x, a) => x + a.grams, 0), 0);
    const cumulativeSum = m.cumulativeActions.reduce((x, a) => x + a.grams, 0);
    expect(cumulativeSum).toBeCloseTo(stepSum, 9);
    expect(r.exactActions.reduce((x, a) => x + a.grams, 0)).toBeCloseTo(stepSum, 9);
  });

  it('never mutates the actual recipe or the rescue intent', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const recipeSnapshot = JSON.stringify(s.actualRecipe);
    const intentSnapshot = JSON.stringify(s.rescueIntent);
    previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
    expect(JSON.stringify(s.actualRecipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(s.rescueIntent)).toBe(intentSnapshot);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(rescue('rescue-too-hard-12'))).toBe(JSON.stringify(rescue('rescue-too-hard-12')));
  });
});

describe('IF10 exact preview — deterministic scale-down, verified or nothing', () => {
  it('scale-down produces the verified scaled snapshot with the exact ratio', () => {
    const r = shortage('shortage-scale-down');
    expect(r.routeDecision).toBe('scale_down_possible');
    expect(r.exactStatus).toBe('calculated');
    expect(r.scaleFactor).toBeCloseTo(0.72, 5);
    expect(r.scaleVerified).toBe(true);
    expect(r.proposedRecipeSnapshot).not.toBeNull();
    const scaled = r.proposedRecipeSnapshot as { target_batch_grams: number; items: { planned_grams: number }[] };
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    expect(scaled.target_batch_grams).toBeCloseTo(s.plannedRecipe.target_batch_grams * 0.72, 6);
    expect(scaled.items[0]!.planned_grams).toBeCloseTo(s.plannedRecipe.items[0]!.planned_grams * 0.72, 6);
    // ratio metrics preserved under uniform scaling
    expect(Math.abs(r.afterMetrics!.npac - r.beforeMetrics!.npac)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.afterMetrics!.pod - r.beforeMetrics!.pod)).toBeLessThanOrEqual(0.05);
  });

  it('an unsafe (dairy-into-sorbet) substitute is unsafe — never calculated', () => {
    const r = shortage('shortage-dairy-substitute');
    expect(r.routeDecision).toBe('production_blocked');
    expect(r.exactStatus).toBe('unsafe');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('missing stock quantities block', () => {
    const r = shortage('shortage-missing-quantities');
    expect(r.exactStatus).toBe('blocked_missing_data');
  });

  it('duplicate line ids block (router regression carried through)', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const dup = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          { lineId: 'x', ingredientName: 'A', requiredG: 100, availableG: 50 },
          { lineId: 'x', ingredientName: 'B', requiredG: 100, availableG: 50 },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: dup, plannedRecipe: s.plannedRecipe });
    expect(r.exactStatus).toBe('blocked_missing_data');
    expect(r.exactStatusReason).toBe('duplicate_line_ids');
  });

  it('an unverified substitute never reaches an exact solve', () => {
    const s = scenario<StockShortageScenario>('shortage-dairy-substitute');
    const unverified = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          {
            lineId: 'strawberry',
            ingredientName: 'Strawberry',
            correctionFamily: 'fruit' as const,
            requiredG: 600,
            availableG: 0,
            substitute: { ingredientName: 'Mystery puree', available: true, hasVerifiedIngredientData: false, correctionFamily: 'fruit' as const },
          },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: unverified, plannedRecipe: s.plannedRecipe });
    expect(r.exactStatus).toBe('unsafe'); // substitute_data_not_verified is a safety block
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('a viable substitution is honestly not_attempted (composition not in the v0.1 contract)', () => {
    const s = scenario<StockShortageScenario>('shortage-dairy-substitute');
    const viable = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          {
            lineId: 'strawberry',
            ingredientName: 'Strawberry',
            correctionFamily: 'fruit' as const,
            requiredG: 600,
            availableG: 0,
            substitute: { ingredientName: 'Raspberry puree', available: true, hasVerifiedIngredientData: true, correctionFamily: 'fruit' as const },
          },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: viable, plannedRecipe: s.plannedRecipe });
    expect(r.routeDecision).toBe('substitution_possible');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('substitute_composition_not_in_contract_v01');
    expect(r.exactActions).toEqual([]);
  });

  it('a recipe carrying actual grams is refused — that is IF9 territory', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const withActuals = {
      ...s.plannedRecipe,
      items: s.plannedRecipe.items.map((i, idx) => (idx === 0 ? { ...i, actual_grams: 100 } : i)),
    };
    const r = previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: withActuals });
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('actual_batch_present_use_batch_rescue');
  });

  it('never mutates the planned recipe or the shortage intent', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const recipeSnapshot = JSON.stringify(s.plannedRecipe);
    const intentSnapshot = JSON.stringify(s.shortageIntent);
    previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
    expect(JSON.stringify(s.plannedRecipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(s.shortageIntent)).toBe(intentSnapshot);
  });
});

describe('branchRecalculationPreview — boundary (preview only, no writes anywhere)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = ['branchRecalculationPreview.ts', 'branchRecalculationFixtures.ts', 'batchRescueStepSolver.ts'].map(
    (f) => strip(readFileSync(join(HERE, f), 'utf8')),
  );

  it('engine only via the public barrel; no DB / Mapper / services / inventory', () => {
    for (const src of sources) {
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
      expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role/i.test(src)).toBe(false);
      expect(/writeInventory|updateStock|decrementStock/i.test(src)).toBe(false);
    }
  });

  it('no write verbs, no save path, no product PAC/POD or status writes', () => {
    for (const src of sources) {
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
      expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(src)).toBe(false);
    }
  });

  it('accepted-correction migration is STILL not applied (no such file under supabase/migrations)', () => {
    const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'));
    expect(migrations.some((f) => /accepted_correction/i.test(f))).toBe(false);
    expect(existsSync(join(ROOT, 'docs', 'spine', 'proposals', 'accepted_corrections_table.proposal.sql'))).toBe(true);
  });
});
