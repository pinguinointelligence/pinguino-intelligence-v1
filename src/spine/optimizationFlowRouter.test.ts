/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPTIMIZATION_FLOW_VERSION,
  routeOptimizationFlow,
  verifyOptimizationRerun,
} from './optimizationFlowRouter';
import { routeRecipeIntegrationFlow, type IntegrationFlowResult } from './integrationFlowRouter';
import { designRecipe } from './designRecipe';
import {
  findTemperatureRegulatorFixture,
  type TemperatureRegulatorGoldenFixture,
} from './temperatureRegulator';
import type { BaseEngineMetrics, CorrectionGoal } from './evaluateTemperatureRegulator';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type ProductProfile,
} from './types';

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
  dietary: {
    vegan: false,
    lactoseFree: false,
    glutenFree: false,
    allergenAware: false,
    noAddedSugar: false,
    lowSugar: false,
    alcohol: false,
  },
  constraints: {
    excludedIngredientIds: [],
    lockedIngredientIds: [],
    heroIngredientIds: [],
    batchSizeG: null,
    machineCapacityG: null,
  },
  source: 'user_input',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
  ...over,
});

const metricsOf = (id: string, stabilizerGrams?: number): BaseEngineMetrics => {
  const fx = findTemperatureRegulatorFixture(id) as TemperatureRegulatorGoldenFixture;
  const e = fx.expected;
  return {
    npac: e.npac!,
    pod: e.pod!,
    iceFraction: e.iceFraction!,
    water: e.water!,
    solids: e.solids!,
    fat: e.fat,
    lactose: e.lactose,
    lactoseSanding: e.lactoseSanding,
    aeratingProtein: e.aeratingProtein,
    proteinShareInSolids: e.proteinShareInSolids,
    stabilizerGrams,
  };
};

const constraintsOf = (intent: NormalizedRecipeIntent) => designRecipe(intent).optimizerConstraints;

/** Build an Integration Flow result from a real router run, then route it through the optimizer. */
const optimize = (
  intent: NormalizedRecipeIntent,
  metrics: BaseEngineMetrics,
  extra: { beforeMetrics?: BaseEngineMetrics; proposedCorrectedMetrics?: BaseEngineMetrics } = {},
) => {
  const flow = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metrics });
  return {
    flow,
    result: routeOptimizationFlow({
      flow,
      intent,
      optimizerConstraints: constraintsOf(intent),
      beforeMetrics: extra.beforeMetrics,
      proposedCorrectedMetrics: extra.proposedCorrectedMetrics,
    }),
  };
};

/* ======================================================================== *
 * Short-circuits: ready / warning / blocked / impossible-no-goals           *
 * ======================================================================== */

describe('routeOptimizationFlow — short-circuits', () => {
  it('a ready recipe needs no action (idempotence)', () => {
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const { flow, result } = optimize(intent, metricsOf('G17', 1.9));
    expect(flow.decision).toBe('ready');
    expect(result.decision).toBe('no_action_needed');
    expect(result.proposedCorrections).toEqual([]);
    expect(result.rejectedCorrections).toEqual([]);
  });

  it('a warning (acceptable but off-center) recipe needs no hard optimization', () => {
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const { flow, result } = optimize(intent, { ...metricsOf('G17', 1.9), npac: 43 });
    expect(flow.decision).toBe('warning');
    expect(result.decision).toBe('no_action_needed');
  });

  it('a blocked recipe cannot be optimized', () => {
    // granita never reaches the Designer (a normalized intent never carries it); on the blocked
    // path the optimizer short-circuits before reading constraints, so valid ones are passed here.
    const intent = intentOf({ productProfile: 'granita' as unknown as ProductProfile, servingTemperatureC: -12 });
    const flow = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metricsOf('G17', 1.9) });
    expect(flow.decision).toBe('blocked');
    const result = routeOptimizationFlow({
      flow,
      intent,
      optimizerConstraints: constraintsOf(intentOf({ productProfile: 'standard_gelato' })),
    });
    expect(result.decision).toBe('blocked');
    expect(result.proposedCorrections).toEqual([]);
  });

  it('an impossible recipe with no correction goals stays impossible', () => {
    // G12 at −11 with water forced out of band → hard fail, no gelato water lever → router impossible.
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -11 });
    const { flow, result } = optimize(intent, { ...metricsOf('G12', 1.9), water: 72 });
    expect(flow.decision).toBe('impossible');
    expect(flow.correctionGoals).toEqual([]);
    expect(result.decision).toBe('impossible');
    expect(result.reason).toBe('router_impossible_no_correction_goals');
  });
});

/* ======================================================================== *
 * Tradeoff → profile-gated correction plans                                 *
 * ======================================================================== */

describe('routeOptimizationFlow — tradeoff builds correction plans', () => {
  it('a too-hard Standard Gelato proposes an increase_npac plan with sugar levers', () => {
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 });
    const { flow, result } = optimize(intent, metricsOf('G17', 1.9)); // NPAC 46.18 below the −13 band
    expect(flow.decision).toBe('tradeoff');
    expect(result.decision).toBe('tradeoff');
    const plan = result.proposedCorrections.find((p) => p.goal === 'increase_npac')!;
    expect(plan).toBeDefined();
    expect(plan.direction).toBe('increase');
    expect(plan.targetMetric).toBe('npac');
    expect(plan.affectedIngredientClasses).toEqual(expect.arrayContaining(['dextrose', 'sucrose']));
    expect(plan.goldenMiddleRank).toBe(2); // npac_pac
    expect(result.reason).toBe('correction_plan_proposed_pending_rerun_verification');
  });

  it('correction plans are ordered by Golden Middle priority (stabilizer before pod)', () => {
    // A recipe missing stabilizer AND with POD out of band → two hard goals.
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const { result } = optimize(intent, { ...metricsOf('G17'), pod: 19, stabilizerGrams: 0 });
    const ranks = result.proposedCorrections.map((p) => p.goldenMiddleRank);
    expect(result.proposedCorrections[0]?.goal).toBe('restore_stabilizer'); // rank 0, first
    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('an advisory-flag goal is a warning, never a hard correction plan', () => {
    // Chocolate −13: ice fraction out of band (hard) + protein share below the advisory minimum.
    const intent = intentOf({ productProfile: 'chocolate_gelato', servingTemperatureC: -13 });
    const metrics: BaseEngineMetrics = {
      npac: 51,
      pod: 16,
      iceFraction: 44, // below the −13 chocolate band [46,52] → hard fail
      water: 60,
      solids: 42,
      fat: 9,
      lactose: 5,
      lactoseSanding: 7,
      aeratingProtein: 4,
      proteinShareInSolids: 6, // advisory: below the hard minimum 7
      stabilizerGrams: 1.9,
    };
    const { flow, result } = optimize(intent, metrics);
    expect(flow.decision).toBe('tradeoff');
    expect(result.decision).toBe('tradeoff');
    expect(result.proposedCorrections.map((p) => p.goal)).toContain('increase_ice_fraction');
    expect(result.proposedCorrections.map((p) => p.goal)).not.toContain('increase_aerating_protein');
    expect(
      result.rejectedCorrections.some(
        (r) => r.goal === 'increase_aerating_protein' && r.reason === 'advisory_only',
      ),
    ).toBe(true);
    expect(result.warnings).toContain('advisory_goal:increase_aerating_protein');
  });

  it('a genuine protein-share HARD failure (standard gelato) yields an increase_aerating_protein plan', () => {
    // increase_aerating_protein is emitted from the protein_share_in_solids miss, which is a HARD
    // gate for standard gelato — it must NOT be misread as advisory-only.
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const metrics: BaseEngineMetrics = {
      npac: 46, // clean center [45,46.2]
      pod: 15,
      iceFraction: 50,
      water: 63,
      solids: 37,
      fat: 8,
      lactose: 5,
      lactoseSanding: 7,
      aeratingProtein: 4.5, // in band [3,6] — NOT the failing gate
      proteinShareInSolids: 4, // below band [9,13] → HARD fail for standard gelato
      stabilizerGrams: 5,
    };
    const { flow, result } = optimize(intent, metrics);
    expect(flow.correctionGoals).toContain('increase_aerating_protein');
    expect(flow.temperatureRegulatorEvaluation.hardGateFailures).toContain('protein_share_in_solids');
    expect(result.decision).toBe('tradeoff');
    const plan = result.proposedCorrections.find((p) => p.goal === 'increase_aerating_protein');
    expect(plan).toBeDefined();
    expect(plan!.affectedIngredientClasses).toEqual(expect.arrayContaining(['skimmed_milk_powder']));
    expect(result.rejectedCorrections.some((r) => r.goal === 'increase_aerating_protein')).toBe(false);
  });
});

/* ======================================================================== *
 * No allowed lever / unsupported goal → safe rejection                      *
 * ======================================================================== */

describe('routeOptimizationFlow — safe rejection', () => {
  it('a hard goal with no allowed lever (dairy for a vegan) is rejected → impossible, never remapped', () => {
    const intent = intentOf({ productProfile: 'vegan_gelato', servingTemperatureC: -13 });
    const real = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metricsOf('V01_rejected', 1.9) });
    // Force a dairy-only goal against a matching hard failure — vegan forbids the dairy levers.
    const flow: IntegrationFlowResult = {
      ...real,
      correctionGoals: ['increase_aerating_protein'],
      temperatureRegulatorEvaluation: {
        ...real.temperatureRegulatorEvaluation,
        acceptable: false,
        hardGateFailures: ['aerating_protein'],
      },
    };
    const result = routeOptimizationFlow({ flow, intent, optimizerConstraints: constraintsOf(intent) });
    expect(result.decision).toBe('impossible');
    expect(result.proposedCorrections).toEqual([]);
    const rej = result.rejectedCorrections.find((r) => r.goal === 'increase_aerating_protein')!;
    expect(rej.reason).toBe('no_allowed_lever');
    expect(rej.blockedFamilies).toEqual(expect.arrayContaining(['skimmed_milk_powder', 'milk']));
  });

  it('an unsupported correction goal is rejected safely without crashing', () => {
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 });
    const real = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metricsOf('G17', 1.9) });
    const flow: IntegrationFlowResult = {
      ...real,
      correctionGoals: ['increase_npac', 'frobnicate' as unknown as CorrectionGoal],
    };
    const result = routeOptimizationFlow({ flow, intent, optimizerConstraints: constraintsOf(intent) });
    expect(result.decision).toBe('tradeoff'); // the real goal still yields a plan
    expect(result.rejectedCorrections.some((r) => r.reason === 'unsupported_goal')).toBe(true);
  });
});

/* ======================================================================== *
 * Rerun-verification seam                                                    *
 * ======================================================================== */

describe('verifyOptimizationRerun — before/after re-evaluation', () => {
  const intent13 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 });

  it('a fully corrected recipe is optimized', () => {
    const v = verifyOptimizationRerun(intent13, metricsOf('G17', 1.9), metricsOf('G18', 1.9));
    expect(v.before.acceptable).toBe(false); // G17 is too hard at −13
    expect(v.after.acceptable).toBe(true); // G18 is the clean −13 reference
    expect(v.newFailures).toEqual([]);
    expect(v.decision).toBe('optimized');
  });

  it('a partial correction (fewer failures, still not acceptable) is a tradeoff', () => {
    const before: BaseEngineMetrics = {
      npac: 46, // too hard at −13 [48,55]
      pod: 15,
      iceFraction: 49,
      water: 62,
      solids: 30, // below the −13 band [35,45]
      fat: 6,
      lactose: 5,
      lactoseSanding: 8,
      aeratingProtein: 3.7,
      proteinShareInSolids: 10,
      stabilizerGrams: 1.9,
    };
    const after: BaseEngineMetrics = { ...before, npac: 51 }; // NPAC fixed; solids still low
    const v = verifyOptimizationRerun(intent13, before, after);
    expect(v.before.hardGateFailures).toEqual(expect.arrayContaining(['npac', 'total_solids']));
    expect(v.after.hardGateFailures).toEqual(['total_solids']);
    expect(v.improvementDetected).toBe(true);
    expect(v.after.acceptable).toBe(false);
    expect(v.decision).toBe('tradeoff');
  });

  it('no improvement is impossible', () => {
    const same = metricsOf('G17', 1.9);
    const v = verifyOptimizationRerun(intent13, same, same);
    expect(v.improvementDetected).toBe(false);
    expect(v.decision).toBe('impossible');
  });

  it('a correction that introduces a new hard failure (regression) is impossible', () => {
    const before = metricsOf('G17', 1.9); // too hard at −13 (npac only)
    const after: BaseEngineMetrics = { ...metricsOf('G18', 1.9), water: 40 }; // npac fixed but water broken
    const v = verifyOptimizationRerun(intent13, before, after);
    expect(v.newFailures).toContain('water');
    expect(v.decision).toBe('impossible');
  });

  it('a correction that worsens an already-failing higher-priority gate is impossible (Golden Middle)', () => {
    const intent12 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const before: BaseEngineMetrics = {
      npac: 40, // below band [42,50] → hard fail (rank 2), 2 out
      pod: 15,
      iceFraction: 50,
      water: 63,
      solids: 46, // above band [31,44] → hard fail (rank 4)
      fat: 6,
      lactose: 5,
      lactoseSanding: 7,
      aeratingProtein: 4,
      proteinShareInSolids: 10,
      stabilizerGrams: 5,
    };
    const after: BaseEngineMetrics = { ...before, npac: 38, solids: 40 }; // solids fixed; npac pushed further out
    const v = verifyOptimizationRerun(intent12, before, after);
    expect(v.worsenedFailures).toContain('npac'); // higher-priority gate regressed
    expect(v.decision).toBe('impossible'); // never fix a lower-priority gate by breaking a higher one
  });

  it('an already-acceptable recipe with no change is never reported as optimized', () => {
    const intent12 = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const x = metricsOf('G17', 1.9); // clean/acceptable at −12
    const v = verifyOptimizationRerun(intent12, x, x);
    expect(v.before.acceptable).toBe(true);
    expect(v.decision).not.toBe('optimized'); // no correction occurred → not an optimization
  });

  it('end-to-end: routeOptimizationFlow with a corrected-metric set returns optimized', () => {
    const { result } = optimize(intent13, metricsOf('G17', 1.9), {
      beforeMetrics: metricsOf('G17', 1.9),
      proposedCorrectedMetrics: metricsOf('G18', 1.9),
    });
    expect(result.decision).toBe('optimized');
    expect(result.rerun?.decision).toBe('optimized');
    expect(result.trace.verified).toBe(true);
  });
});

/* ======================================================================== *
 * Purity + boundary                                                          *
 * ======================================================================== */

describe('routeOptimizationFlow — purity + boundary', () => {
  it('never mutates the inputs and is deterministic', () => {
    const intent = intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 });
    const metrics = metricsOf('G17', 1.9);
    const corrected = metricsOf('G18', 1.9);
    const flow = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: metrics });
    const constraints = constraintsOf(intent);
    const snap = JSON.parse(JSON.stringify({ metrics, corrected, constraints }));
    Object.freeze(metrics);
    Object.freeze(corrected);
    const a = routeOptimizationFlow({ flow, intent, optimizerConstraints: constraints, beforeMetrics: metrics, proposedCorrectedMetrics: corrected });
    const b = routeOptimizationFlow({ flow, intent, optimizerConstraints: constraints, beforeMetrics: metrics, proposedCorrectedMetrics: corrected });
    expect({ metrics, corrected, constraints }).toEqual(snap); // inputs untouched
    expect(a).toEqual(b); // deterministic
  });

  it('verifyOptimizationRerun never mutates the metric inputs', () => {
    const intent = intentOf({ servingTemperatureC: -13 });
    const before = metricsOf('G17', 1.9);
    const after = metricsOf('G18', 1.9);
    const snap = JSON.parse(JSON.stringify({ before, after }));
    Object.freeze(before);
    Object.freeze(after);
    verifyOptimizationRerun(intent, before, after);
    expect({ before, after }).toEqual(snap);
  });

  it('carries the version and touches no DB / Supabase / Mapper / engine and writes no pac/pod', () => {
    expect(OPTIMIZATION_FLOW_VERSION).toBe('0.1.0');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const src = strip(readFileSync(join(resolve(import.meta.dirname), 'optimizationFlowRouter.ts'), 'utf8'));
    expect(/supabase|service_role/i.test(src)).toBe(false);
    expect(/mapper_basement/i.test(src)).toBe(false);
    expect(/@\/engine|from\s+['"][^'"]*\/engine['"/]/i.test(src)).toBe(false);
    expect(/calculateRecipe\s*\(/.test(src)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
