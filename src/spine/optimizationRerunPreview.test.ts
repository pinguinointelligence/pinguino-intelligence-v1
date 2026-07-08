/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPTIMIZATION_RERUN_PREVIEW_VERSION,
  runOptimizationRerunPreview,
  type RerunCorrectionFn,
} from './optimizationRerunPreview';
import { routeRecipeIntegrationFlow, type IntegrationFlowResult } from './integrationFlowRouter';
import { routeOptimizationFlow } from './optimizationFlowRouter';
import { adaptBaseEngineResult, type BaseEngineResultLike } from './baseEngineMetricsAdapter';
import { designRecipe } from './designRecipe';
import {
  findTemperatureRegulatorFixture,
  type TemperatureRegulatorGoldenFixture,
} from './temperatureRegulator';
import type { BaseEngineMetrics } from './evaluateTemperatureRegulator';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type ProductProfile,
} from './types';
// The TEST (not a src/spine/*.ts file) may import the real engine — this proves the seam wires
// the REAL solver + REAL Base Engine rerun without the pure spine module importing them.
import { calculateRecipe } from '@/engine/calculateRecipe';
import { applyAutoFix, proposeAutoFix } from '@/engine/corrections/apply';
import type { IngredientComponentProfile, RecipeInput, RecipeItem } from '@/engine/types';

const intentOf = (over: Partial<NormalizedRecipeIntent> = {}): NormalizedRecipeIntent => ({
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -12,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: { vegan: false, lactoseFree: false, glutenFree: false, allergenAware: false, noAddedSugar: false, lowSugar: false, alcohol: false },
  constraints: { excludedIngredientIds: [], lockedIngredientIds: [], heroIngredientIds: [], batchSizeG: null, machineCapacityG: null },
  source: 'user_input',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
  ...over,
});

const metricsOf = (id: string, stabilizerGrams?: number): BaseEngineMetrics => {
  const fx = findTemperatureRegulatorFixture(id) as TemperatureRegulatorGoldenFixture;
  const e = fx.expected;
  return {
    npac: e.npac!, pod: e.pod!, iceFraction: e.iceFraction!, water: e.water!, solids: e.solids!,
    fat: e.fat, lactose: e.lactose, lactoseSanding: e.lactoseSanding,
    aeratingProtein: e.aeratingProtein, proteinShareInSolids: e.proteinShareInSolids, stabilizerGrams,
  };
};

/** Turn a metric set into a `RecipeResult`-shaped object the adapter can read. */
const resultLikeOf = (m: BaseEngineMetrics): BaseEngineResultLike => ({
  pod_points: m.pod,
  npac_points: m.npac,
  ice_fraction_percent: m.iceFraction,
  percentages: {
    water_percent: m.water,
    solids_percent: m.solids,
    fat_percent: m.fat ?? 0,
    lactose_percent: m.lactose ?? 0,
    protein_percent: m.aeratingProtein ?? 0,
  },
  indicators: [
    { key: 'lactose_sandiness_risk', value: m.lactoseSanding ?? null },
    { key: 'protein_in_solids', value: m.proteinShareInSolids ?? null },
  ],
  items: [{ effective_grams: m.stabilizerGrams ?? 1.9, ingredient: { category: 'stabilizer' } }],
});

const constraintsOf = (intent: NormalizedRecipeIntent) => designRecipe(intent).optimizerConstraints;

/** Build the optimizer result via the real router → optimizer pipeline. */
const optimizationFor = (intent: NormalizedRecipeIntent, metrics: BaseEngineMetrics) => {
  const flow = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metrics });
  return routeOptimizationFlow({ flow, intent, optimizerConstraints: constraintsOf(intent) });
};

/** A mock solver+engine that returns a crafted corrected result. */
const mockRerun = (corrected: BaseEngineResultLike): RerunCorrectionFn => () => ({
  applied: true,
  correctedRecipe: { note: 'hypothetical' },
  correctedResult: corrected,
  appliedAdjustments: [{ type: 'add', ingredient: 'dextrose', grams: 12 }],
});

const STD13 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 });
const STD12 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });

/* ======================================================================== *
 * Short-circuits — the solver is never invoked                              *
 * ======================================================================== */

describe('runOptimizationRerunPreview — short-circuits (no solver call)', () => {
  it('ready → no_action_needed and never calls the solver', () => {
    let called = false;
    const spy: RerunCorrectionFn = () => { called = true; return { applied: false, reason: 'x' }; };
    const r = runOptimizationRerunPreview({
      intent: STD12,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD12, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD12),
      rerunCorrection: spy,
    });
    expect(r.decision).toBe('no_action_needed');
    expect(r.rerunState).toBe('not_needed');
    expect(r.trace.solverInvoked).toBe(false);
    expect(called).toBe(false);
  });

  it('blocked → blocked and never calls the solver', () => {
    let called = false;
    const spy: RerunCorrectionFn = () => { called = true; return { applied: false, reason: 'x' }; };
    const granita = intentOf({ productProfile: 'granita' as unknown as ProductProfile });
    const blockedFlow = routeRecipeIntegrationFlow({ intent: granita, baseEngineMetrics: metricsOf('G17', 1.9) });
    const blockedOpt = routeOptimizationFlow({ flow: blockedFlow, intent: granita, optimizerConstraints: constraintsOf(STD12) });
    const r = runOptimizationRerunPreview({
      intent: granita,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: blockedOpt,
      optimizerConstraints: constraintsOf(STD12),
      rerunCorrection: spy,
    });
    expect(r.decision).toBe('blocked');
    expect(r.rerunState).toBe('blocked');
    expect(called).toBe(false);
  });

  it('optimizer impossible (no feasible plan) → impossible, surfacing rejected corrections, no solver call', () => {
    let called = false;
    const spy: RerunCorrectionFn = () => { called = true; return { applied: false, reason: 'x' }; };
    // Vegan with a forced dairy-only goal → no allowed lever → optimizer impossible.
    const vegan = intentOf({ productProfile: 'vegan_gelato', servingTemperatureC: -13 });
    const real = routeRecipeIntegrationFlow({ intent: vegan, baseEngineMetrics: metricsOf('V01_rejected', 1.9) });
    const flow: IntegrationFlowResult = {
      ...real,
      correctionGoals: ['increase_aerating_protein'],
      temperatureRegulatorEvaluation: { ...real.temperatureRegulatorEvaluation, acceptable: false, hardGateFailures: ['aerating_protein'] },
    };
    const optimization = routeOptimizationFlow({ flow, intent: vegan, optimizerConstraints: constraintsOf(vegan) });
    expect(optimization.decision).toBe('impossible');
    const r = runOptimizationRerunPreview({ intent: vegan, beforeMetrics: metricsOf('V01_rejected', 1.9), optimization, optimizerConstraints: constraintsOf(vegan), rerunCorrection: spy });
    expect(r.decision).toBe('impossible');
    expect(r.rerunState).toBe('no_feasible_plan');
    expect(r.rejectedCorrections.some((rej) => rej.reason === 'no_allowed_lever')).toBe(true);
    expect(called).toBe(false);
  });
});

/* ======================================================================== *
 * tradeoff → solver invoked; rerun verdict drives the decision              *
 * ======================================================================== */

describe('runOptimizationRerunPreview — solver invoked on tradeoff', () => {
  it('rerun_not_connected: a tradeoff with no injected solver stays tradeoff (never faked optimized)', () => {
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      // no rerunCorrection
    });
    expect(r.decision).toBe('tradeoff');
    expect(r.rerunState).toBe('rerun_not_connected');
    expect(r.rerun).toBeNull();
    expect(r.warnings).toContain('rerun_not_connected');
  });

  it('a correction that fully fixes the recipe → optimized', () => {
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9), // too hard at −13
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: mockRerun(resultLikeOf(metricsOf('G18', 1.9))), // clean −13 reference
    });
    expect(r.trace.solverInvoked).toBe(true);
    expect(r.rerunState).toBe('rerun_complete');
    expect(r.decision).toBe('optimized');
    expect(r.rerun?.after.acceptable).toBe(true);
    expect(r.proposedAdjustments.length).toBeGreaterThan(0);
  });

  it('a partial correction (fewer failures, still not acceptable) → tradeoff', () => {
    const before: BaseEngineMetrics = { npac: 46, pod: 15, iceFraction: 49, water: 62, solids: 30, fat: 6, lactose: 5, lactoseSanding: 8, aeratingProtein: 3.7, proteinShareInSolids: 10, stabilizerGrams: 1.9 };
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: before,
      optimization: optimizationFor(STD13, before),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: mockRerun(resultLikeOf({ ...before, npac: 51 })), // npac fixed, solids still low
    });
    expect(r.decision).toBe('tradeoff');
    expect(r.rerunState).toBe('rerun_complete');
  });

  it('a correction with no improvement → impossible', () => {
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: mockRerun(resultLikeOf(metricsOf('G17', 1.9))), // unchanged
    });
    expect(r.decision).toBe('impossible');
    expect(r.rerunState).toBe('rerun_complete');
  });

  it('a correction that worsens a higher-priority gate → impossible', () => {
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      // npac fixed but water broken (a new higher-priority-adjacent hard failure).
      rerunCorrection: mockRerun(resultLikeOf({ ...metricsOf('G18', 1.9), water: 40 })),
    });
    expect(r.decision).toBe('impossible');
    expect(r.rerun?.newFailures).toContain('water');
  });

  it('the solver finding no safe correction → impossible, never faked as optimized', () => {
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: () => ({ applied: false, reason: 'no_candidate' }),
    });
    expect(r.decision).toBe('impossible');
    expect(r.rerunState).toBe('solver_no_correction');
    expect(r.warnings).toContain('solver_no_correction:no_candidate');
  });

  it('a corrected result missing a core Base Engine metric → blocked (missing data)', () => {
    const broken: BaseEngineResultLike = { ...resultLikeOf(metricsOf('G18', 1.9)), npac_points: null };
    const r = runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: metricsOf('G17', 1.9),
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: mockRerun(broken),
    });
    expect(r.decision).toBe('blocked');
    expect(r.rerunState).toBe('rerun_incomplete');
    expect(r.hardBlockers).toContain('missing_base_engine_metrics');
  });
});

/* ======================================================================== *
 * Real solver + real Base Engine rerun, driven through the seam             *
 * ======================================================================== */

const ZERO: IngredientComponentProfile = {
  water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0,
  sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0, fructose_percent: 0,
  lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
};
const comp = (over: Partial<IngredientComponentProfile>): IngredientComponentProfile => ({ ...ZERO, ...over });
const item = (id: string, category: RecipeItem['ingredient']['category'], over: Partial<IngredientComponentProfile>, grams: number): RecipeItem => ({
  id,
  ingredient: { id: `ing-${id}`, name: id, category, composition: comp(over), pod_value: null, pac_value: null, npac_value: null, de_value: null, cost_per_kg: 1, confidence_score: 90, source_type: 'manual', is_verified: false },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

/** A POD-low milk gelato at −11 (a real, correctable draft). */
const realDraft = (): RecipeInput => {
  const items: RecipeItem[] = [
    item('milk', 'dairy', { water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 }, 740),
    item('cream', 'dairy', { water_percent: 58.9, solids_percent: 41.1, fat_percent: 35, protein_percent: 2.2, carbohydrate_percent: 3.1, sugar_percent: 3.1, lactose_percent: 3.1, salt_percent: 0.1, kcal_per_100g: 337 }, 130),
    item('smp', 'dairy', { water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 }, 35),
    item('sucrose', 'sugar', { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 }, 60),
    item('dextrose', 'sugar', { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 }, 30),
    item('tara', 'stabilizer', { water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 }, 5),
  ];
  return { items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 1000, machine_capacity_grams: null };
};

/** The real solver + Base Engine rerun, wired through the injected seam. */
const realRerun: RerunCorrectionFn = (ctx) => {
  const draft = ctx.recipeDraft as RecipeInput;
  const proposed = proposeAutoFix({ input: draft, context: 'planning', exactCorrectionGrams: true });
  if (proposed.redacted) return { applied: false, reason: 'redacted' };
  const proposal = proposed.proposals.find((p) => 'actions' in p && p.actions.length > 0);
  if (!proposal) return { applied: false, reason: 'no_proposal' };
  const applied = applyAutoFix({ input: draft, proposal, context: 'planning' });
  if (!applied.success) return { applied: false, reason: applied.reason };
  const correctedResult = calculateRecipe(applied.newInput) as unknown as BaseEngineResultLike;
  return {
    applied: true,
    correctedRecipe: applied.newInput,
    correctedResult,
    appliedAdjustments: applied.actions.map((a) => ({ type: a.type, ingredient: a.ingredient_name, grams: a.grams })),
  };
};

describe('runOptimizationRerunPreview — REAL solver + Base Engine rerun', () => {
  const intent11 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -11 });

  it('drives the real solver + real calculateRecipe through the seam and returns a verified decision', () => {
    const draft = realDraft();
    const beforeMetrics = adaptBaseEngineResult(calculateRecipe(draft) as unknown as BaseEngineResultLike).metrics;
    const optimization = optimizationFor(intent11, beforeMetrics);
    expect(optimization.decision).toBe('tradeoff'); // POD too low at −11 → a real correction is needed

    const snapshot = JSON.stringify(draft);
    const r = runOptimizationRerunPreview({
      intent: intent11,
      beforeMetrics,
      recipeDraft: draft,
      optimization,
      optimizerConstraints: constraintsOf(intent11),
      rerunCorrection: realRerun,
    });

    expect(JSON.stringify(draft)).toBe(snapshot); // the real recipe draft is never mutated
    expect(r.trace.solverInvoked).toBe(true);
    expect(['rerun_complete', 'solver_no_correction']).toContain(r.rerunState);
    if (r.rerunState === 'rerun_complete') {
      expect(['optimized', 'tradeoff', 'impossible']).toContain(r.decision);
      expect(r.rerun).not.toBeNull();
      expect(r.correctedBaseEngineResult).not.toBeNull();
      expect(r.proposedAdjustments.length).toBeGreaterThan(0); // the real solver added grams
      // the decision is a genuine verification, never a fabricated success
      if (r.decision === 'optimized') expect(r.rerun?.after.acceptable).toBe(true);
    }
  });
});

/* ======================================================================== *
 * Purity + boundary                                                          *
 * ======================================================================== */

describe('runOptimizationRerunPreview — purity + boundary', () => {
  it('never mutates the before metrics or the corrected Base Engine result', () => {
    const before = metricsOf('G17', 1.9);
    const corrected = resultLikeOf(metricsOf('G18', 1.9));
    const snap = JSON.parse(JSON.stringify({ before, corrected }));
    Object.freeze(before);
    runOptimizationRerunPreview({
      intent: STD13,
      beforeMetrics: before,
      optimization: optimizationFor(STD13, metricsOf('G17', 1.9)),
      optimizerConstraints: constraintsOf(STD13),
      rerunCorrection: mockRerun(corrected),
    });
    expect({ before, corrected }).toEqual(snap);
  });

  it('carries the version and touches no engine/DB/Mapper import, no pac/pod writes, no recipe save path', () => {
    expect(OPTIMIZATION_RERUN_PREVIEW_VERSION).toBe('0.1.0');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const src = strip(readFileSync(join(resolve(import.meta.dirname), 'optimizationRerunPreview.ts'), 'utf8'));
    expect(/supabase|service_role/i.test(src)).toBe(false);
    expect(/mapper_basement/i.test(src)).toBe(false);
    expect(/@\/engine|from\s+['"][^'"]*\/engine['"/]/i.test(src)).toBe(false);
    expect(/calculateRecipe\s*\(/.test(src)).toBe(false); // the Spine never calls the engine directly
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(src)).toBe(false);
    expect(/saveRecipe|persist|insertRecipe|\.save\(/i.test(src)).toBe(false); // no recipe save path
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
