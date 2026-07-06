/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INTEGRATION_FLOW_VERSION,
  routeRecipeIntegrationFlow,
  type IntegrationFlowInput,
} from './integrationFlowRouter';
import { adaptBaseEngineResult, type BaseEngineResultLike } from './baseEngineMetricsAdapter';
import {
  findTemperatureRegulatorFixture,
  type TemperatureRegulatorGoldenFixture,
} from './temperatureRegulator';
import type { BaseEngineMetrics } from './evaluateTemperatureRegulator';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type ServingTemperatureC,
} from './types';

/** A complete normalized intent with overrides — the router's single source of truth. */
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

/** A golden fixture's expected metrics as a Base Engine metric input. */
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

const run = (over: IntegrationFlowInput) => routeRecipeIntegrationFlow(over);

/* ======================================================================== *
 * Ready / warning / tradeoff / impossible / blocked                         *
 * ======================================================================== */

describe('routeRecipeIntegrationFlow — Standard Gelato flows', () => {
  it('a clean −12 Standard Gelato is ready and routes to show_recipe', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineMetrics: metricsOf('G17', 1.9),
    });
    expect(r.decision).toBe('ready');
    expect(r.nextAction).toBe('show_recipe');
    expect(r.selectedProductProfile).toBe('standard_gelato');
    expect(r.selectedTemperatureRegulatorProfile).toBe('standard_gelato_temperature_regulator');
    expect(r.servingTemperatureC).toBe(-12);
    expect(r.correctionGoals).toEqual([]);
    expect(r.hardBlockers).toEqual([]);
    expect(r.temperatureRegulatorEvaluation.acceptable).toBe(true);
  });

  it('a hard-gate failure with no correction lever is impossible', () => {
    // G12 at −11 is clean except water forced out of band [57,70]; Standard Gelato has no water goal.
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -11 }),
      baseEngineMetrics: { ...metricsOf('G12', 1.9), water: 72 },
    });
    expect(r.decision).toBe('impossible');
    expect(r.nextAction).toBe('revise_recipe_or_intent');
    expect(r.hardBlockers).toContain('water');
    expect(r.correctionGoals).toEqual([]); // nothing the temperature layer can hand the Optimizer
  });

  it('an off-clean-center acceptable recipe is a warning (surfaced, not blocked)', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12, texturePreference: 'medium' }),
      baseEngineMetrics: { ...metricsOf('G17', 1.9), npac: 43 }, // in band [42,50], below cleanCenter [45,46.2]
    });
    expect(r.decision).toBe('warning');
    expect(r.nextAction).toBe('show_recipe_with_warnings');
    expect(r.temperatureRegulatorEvaluation.acceptable).toBe(true);
    expect(r.temperatureRegulatorEvaluation.npacStatus).toBe('firm_side');
  });

  it('an NPAC out of band routes to tradeoff and surfaces the correction goals', () => {
    // G17 metrics evaluated at −13 (band [48,55]) → NPAC 46.18 is too hard.
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 }),
      baseEngineMetrics: metricsOf('G17', 1.9),
    });
    expect(r.decision).toBe('tradeoff');
    expect(r.nextAction).toBe('run_optimizer');
    expect(r.correctionGoals).toContain('increase_npac');
    expect(r.temperatureRegulatorEvaluation.acceptable).toBe(false);
  });
});

/* ======================================================================== *
 * Profile → regulator selection (each profile uses its own regulator)       *
 * ======================================================================== */

describe('routeRecipeIntegrationFlow — profile → regulator routing', () => {
  it('Chocolate uses the chocolate regulator; advisory protein share is a warning, never a blocker', () => {
    const r = run({
      intent: intentOf({ productProfile: 'chocolate_gelato', servingTemperatureC: -13 }),
      baseEngineMetrics: {
        npac: 51, // clean_center [49.8,54.1]
        pod: 16,
        iceFraction: 48,
        water: 60,
        solids: 42,
        fat: 9,
        lactose: 5,
        lactoseSanding: 7,
        aeratingProtein: 4,
        proteinShareInSolids: 6, // below the advisory hard minimum 7
        stabilizerGrams: 1.9,
      },
    });
    expect(r.selectedTemperatureRegulatorProfile).toBe('chocolate_gelato_temperature_regulator');
    expect(r.decision).toBe('warning'); // advisory only — never impossible/blocked
    expect(r.temperatureRegulatorEvaluation.acceptable).toBe(true);
    expect(r.temperatureRegulatorEvaluation.advisoryFlags).toContain('protein_share_below_hard_minimum');
    expect(r.temperatureRegulatorEvaluation.hardGateFailures).not.toContain('protein_share_in_solids');
    expect(r.correctionGoals).toContain('increase_aerating_protein');
  });

  it('Sorbet uses the sorbet regulator and keeps dairy gates disabled', () => {
    const r = run({
      intent: intentOf({ productProfile: 'sorbet', servingTemperatureC: -12 }),
      baseEngineMetrics: { ...metricsOf('S02', 0.8), lactose: 0, lactoseSanding: 0, proteinShareInSolids: 0 },
    });
    expect(r.selectedTemperatureRegulatorProfile).toBe('sorbet_temperature_regulator');
    expect(r.decision).toBe('ready'); // dairy 0 must not fail a sorbet
    expect(r.temperatureRegulatorEvaluation.hardGateFailures).not.toContain('lactose');
  });

  it('Vegan uses the vegan regulator', () => {
    const r = run({
      intent: intentOf({ productProfile: 'vegan_gelato', servingTemperatureC: -13 }),
      baseEngineMetrics: metricsOf('V02_fixed', 1.9),
    });
    expect(r.selectedTemperatureRegulatorProfile).toBe('vegan_gelato_temperature_regulator');
    expect(r.decision).toBe('ready');
    expect(r.temperatureRegulatorEvaluation.hardGateFailures).toEqual([]);
  });

  it('a designer plan whose profile disagrees with the intent is flagged', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineMetrics: metricsOf('G17', 1.9),
      designerPlan: { productProfile: 'chocolate_gelato' } as IntegrationFlowInput['designerPlan'],
    });
    expect(r.warnings).toContain('designer_profile_mismatch');
    expect(r.trace.designerProfile).toBe('chocolate_gelato');
  });
});

/* ======================================================================== *
 * Unsupported profile / temperature → blocked, never remapped               *
 * ======================================================================== */

describe('routeRecipeIntegrationFlow — unsupported inputs block', () => {
  it('Granita is blocked and never remapped to a supported profile', () => {
    const r = run({
      intent: intentOf({ productProfile: 'granita' as unknown as ProductProfile, servingTemperatureC: -12 }),
      baseEngineMetrics: metricsOf('G17', 1.9),
    });
    expect(r.decision).toBe('blocked');
    expect(r.nextAction).toBe('resolve_blocker');
    expect(r.selectedProductProfile).toBeNull();
    expect(r.selectedTemperatureRegulatorProfile).toBeNull();
    expect(r.hardBlockers).toContain('unsupported_product_profile');
  });

  it('an unsupported serving temperature is blocked and never remapped', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -18 as unknown as ServingTemperatureC }),
      baseEngineMetrics: metricsOf('G17', 1.9),
    });
    expect(r.decision).toBe('blocked');
    expect(r.servingTemperatureC).toBeNull();
    expect(r.hardBlockers).toContain('unsupported_serving_temperature');
  });

  it('missing core Base Engine metrics block the flow', () => {
    const r = run({ intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }) });
    expect(r.decision).toBe('blocked');
    expect(r.hardBlockers).toContain('missing_base_engine_metrics');
    expect(r.baseEngineMetricsSummary).toBeNull();
  });
});

/* ======================================================================== *
 * Base Engine adapter seam                                                   *
 * ======================================================================== */

const g17Result: BaseEngineResultLike = {
  pod_points: 15.57,
  npac_points: 46.18,
  ice_fraction_percent: 50.34,
  percentages: {
    water_percent: 63.18,
    solids_percent: 36.82,
    fat_percent: 6.19,
    lactose_percent: 5.44,
    protein_percent: 3.65,
  },
  totals: { protein_g: 36.5, solids_g: 368.2, lactose_g: 54.4, water_g: 631.8 },
  indicators: [
    { key: 'lactose_sandiness_risk', value: 8.62 },
    { key: 'protein_in_solids', value: 9.9 },
  ],
  items: [
    { effective_grams: 1.9, ingredient: { category: 'stabilizer' } },
    { effective_grams: 600, ingredient: { category: 'dairy' } },
  ],
};

describe('adaptBaseEngineResult — maps a real-like Base Engine result', () => {
  it('maps every metric, derives protein share + stabilizer grams, and is complete', () => {
    const a = adaptBaseEngineResult(g17Result);
    expect(a.complete).toBe(true);
    expect(a.missingFields).toEqual([]);
    expect(a.metrics).toMatchObject({
      npac: 46.18,
      pod: 15.57,
      iceFraction: 50.34,
      water: 63.18,
      solids: 36.82,
      fat: 6.19,
      lactose: 5.44,
      lactoseSanding: 8.62,
      aeratingProtein: 3.65,
      proteinShareInSolids: 9.9,
      stabilizerGrams: 1.9,
    });
  });

  it('reports null core metrics as missing (NaN, warning) — never a silent zero', () => {
    const a = adaptBaseEngineResult({ ...g17Result, npac_points: null, ice_fraction_percent: null });
    expect(a.complete).toBe(false);
    expect(a.missingFields).toEqual(expect.arrayContaining(['npac', 'iceFraction']));
    expect(a.warnings).toEqual(expect.arrayContaining(['missing_base_engine_metric:npac']));
    expect(Number.isNaN(a.metrics.npac)).toBe(true);
  });

  it('routes cleanly end-to-end when the router is given a raw Base Engine result', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineResult: g17Result,
    });
    expect(r.trace.metricsSource).toBe('adapter');
    expect(r.decision).toBe('ready');
    expect(r.baseEngineMetricsSummary?.npac).toBe(46.18);
  });

  it('a raw result with a null core metric blocks via the adapter', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineResult: { ...g17Result, npac_points: null },
    });
    expect(r.decision).toBe('blocked');
    expect(r.trace.adapterMissingFields).toContain('npac');
    expect(r.hardBlockers).toContain('missing_base_engine_metrics');
  });

  it('no stabilizer item → stabilizer grams 0 → the regulator hard-fails stabilizer', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineResult: { ...g17Result, items: [{ effective_grams: 600, ingredient: { category: 'dairy' } }] },
    });
    expect(r.temperatureRegulatorEvaluation.hardGateFailures).toContain('stabilizer');
    expect(r.correctionGoals).toContain('restore_stabilizer');
    expect(r.decision).toBe('tradeoff');
  });
});

/* ======================================================================== *
 * Missing (unconfirmed) hard gate → blocked / missing-data, never impossible *
 * ======================================================================== */

describe('routeRecipeIntegrationFlow — an unconfirmed hard gate is missing data, not impossible', () => {
  it('a raw result with no totals/indicators (lactose sanding + protein share unavailable) is blocked', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineResult: {
        pod_points: 15.57,
        npac_points: 46.18,
        ice_fraction_percent: 50.34,
        percentages: {
          water_percent: 63.18,
          solids_percent: 36.82,
          fat_percent: 6.19,
          lactose_percent: 5.44,
          protein_percent: 3.65,
        },
        items: [{ effective_grams: 1.9, ingredient: { category: 'stabilizer' } }],
        // no totals, no indicators → lactoseSanding + proteinShareInSolids cannot be derived
      },
    });
    expect(r.decision).toBe('blocked'); // missing data — NOT impossible
    expect(r.nextAction).toBe('resolve_blocker');
    expect(r.hardBlockers).toContain('missing_base_engine_metrics');
    expect(r.hardBlockers).toEqual(
      expect.arrayContaining(['missing:lactose_sanding', 'missing:protein_share_in_solids']),
    );
  });

  it('a hard-gate metric passed as undefined blocks (never impossible with empty blockers)', () => {
    const r = run({
      intent: intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }),
      baseEngineMetrics: {
        npac: 45.5,
        pod: 15,
        iceFraction: 50,
        water: 63,
        solids: 37,
        fat: 6,
        lactose: 5,
        lactoseSanding: undefined, // a hard gate that could not be confirmed
        aeratingProtein: 3.7,
        proteinShareInSolids: 10,
        stabilizerGrams: 5,
      },
    });
    expect(r.decision).toBe('blocked');
    expect(r.decision).not.toBe('impossible');
    expect(r.hardBlockers).toContain('missing:lactose_sanding');
  });
});

/* ======================================================================== *
 * Purity, trace + boundary                                                   *
 * ======================================================================== */

describe('routeRecipeIntegrationFlow — purity, trace, boundary', () => {
  it('never mutates the Base Engine metrics input and is deterministic', () => {
    const metrics = metricsOf('G17', 1.9);
    const snapshot = JSON.parse(JSON.stringify(metrics));
    Object.freeze(metrics);
    const a = run({ intent: intentOf(), baseEngineMetrics: metrics });
    const b = run({ intent: intentOf(), baseEngineMetrics: metrics });
    expect(metrics).toEqual(snapshot); // Base Engine result is never rewritten
    expect(a).toEqual(b); // deterministic
  });

  it('trace records the realized flow order and version', () => {
    const r = run({ intent: intentOf(), baseEngineMetrics: metricsOf('G17', 1.9) });
    expect(INTEGRATION_FLOW_VERSION).toBe('0.1.0');
    expect(r.trace.integrationFlowVersion).toBe('0.1.0');
    expect(r.trace.stepsRealized).toEqual([
      'recipe_intent',
      'designer',
      'product_profile',
      'base_engine_output',
      'temperature_regulator',
      'decision_router',
    ]);
    expect(r.trace.metricsSource).toBe('metrics');
    expect(r.trace.regulatorStatus).toBe('optimal');
  });

  it('the router + adapter touch no DB / Supabase / Mapper and never write pac/pod or statuses', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const file of ['integrationFlowRouter.ts', 'baseEngineMetricsAdapter.ts']) {
      const src = strip(readFileSync(join(resolve(import.meta.dirname), file), 'utf8'));
      expect(/supabase|service_role/i.test(src), `${file} supabase`).toBe(false);
      expect(/mapper_basement/i.test(src), `${file} basement`).toBe(false);
      // No engine-package import (spineContracts already pins imports to ./ ; this pins the alias too).
      expect(/@\/engine|from\s+['"][^'"]*\/engine['"/]/i.test(src), `${file} engine import`).toBe(false);
      expect(/calculateRecipe\s*\(/.test(src), `${file} recalculates`).toBe(false);
      expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(src), `${file} pac/pod write`).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
        expect(src.includes(verb), `${file} ${verb}`).toBe(false);
      }
    }
  });
});
