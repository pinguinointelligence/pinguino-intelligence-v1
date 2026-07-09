/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateTemperatureRegulator, type BaseEngineMetrics } from './evaluateTemperatureRegulator';
import {
  ACTUAL_BATCH_RESCUE_USER_DECISIONS,
  routeBatchRescue,
  type BatchRescueIntent,
} from './batchRescueRouter';

/** Standard Gelato metrics inside every −11 regulator band (clean-center npac). */
const ACCEPTABLE_METRICS: BaseEngineMetrics = {
  npac: 40,
  pod: 15,
  iceFraction: 50,
  water: 60,
  solids: 37,
  fat: 8,
  lactose: 5,
  lactoseSanding: 7,
  aeratingProtein: 4,
  proteinShareInSolids: 10,
  stabilizerGrams: 5,
};

const intent = (over: Partial<BatchRescueIntent> = {}): BatchRescueIntent => ({
  productProfile: 'standard_gelato',
  intendedServingTemperatureC: -11,
  batchSizeG: 5000,
  observation: { problem: 'too_hard' },
  constraints: {
    canReprocess: true,
    liquidAdditionPossible: true,
    dryAdditionPossible: true,
    batchAlreadyFrozen: false,
    batchAlreadyServed: false,
  },
  ...over,
});

describe('routeBatchRescue — supported composition problems (add-only)', () => {
  it('too hard → rescue with a NPAC-increase direction via sugars', () => {
    const r = routeBatchRescue(intent({ observation: { problem: 'too_hard' } }));
    expect(['rescue_possible', 'rescue_with_tradeoff']).toContain(r.decision);
    const a = r.recommendedActions[0]!;
    expect(a.targetMetric).toBe('npac');
    expect(a.direction).toBe('increase');
    expect(a.leverFamilies).toContain('dextrose');
    expect(a.addOnly).toBe(true);
    expect(r.risks).toContain('sweetness_increases_with_added_sugars');
    expect(r.requiredMeasurements).toContain('rerun_base_engine_with_planned_addition_before_adding');
  });

  it('too soft → rescue with a NPAC-decrease / solids direction', () => {
    const r = routeBatchRescue(intent({ observation: { problem: 'too_soft' } }));
    expect(['rescue_possible', 'rescue_with_tradeoff']).toContain(r.decision);
    const a = r.recommendedActions[0]!;
    expect(a.targetMetric).toBe('npac');
    expect(a.direction).toBe('decrease');
    expect(a.leverFamilies).toContain('skimmed_milk_powder');
    expect(a.addOnly).toBe(true);
  });

  it('icy / sandy → warning + measurement requirement before any addition', () => {
    for (const problem of ['icy', 'sandy'] as const) {
      const r = routeBatchRescue(intent({ observation: { problem } }));
      expect(r.warnings).toContain('crystallization_requires_verification_before_any_addition');
      expect(r.requiredMeasurements.length).toBeGreaterThan(1);
      expect(r.requiredMeasurements).toContain('check_storage_temperature_stability');
    }
    // sandy targets the lactose share; icy targets water binding (stabilizer)
    expect(routeBatchRescue(intent({ observation: { problem: 'sandy' } })).recommendedActions[0]!.targetMetric).toBe('lactose_sanding');
    expect(routeBatchRescue(intent({ observation: { problem: 'icy' } })).recommendedActions[0]!.targetMetric).toBe('stabilizer');
  });

  it('too sweet → POD-decrease via liquid dilution, or reprocess when liquid is impossible', () => {
    const r = routeBatchRescue(intent({ observation: { problem: 'too_sweet' } }));
    const a = r.recommendedActions[0]!;
    expect(a.targetMetric).toBe('pod');
    expect(a.direction).toBe('decrease');
    expect(a.method).toBe('add_liquid'); // dilution is liquid-only — never dry
    expect(a.leverFamilies).not.toContain('sucrose'); // never more sugar
    // liquid impossible → dilution impossible → reprocess path
    const noLiquid = routeBatchRescue(
      intent({
        observation: { problem: 'too_sweet' },
        constraints: { canReprocess: true, liquidAdditionPossible: false, dryAdditionPossible: true, batchAlreadyFrozen: false },
      }),
    );
    expect(noLiquid.decision).toBe('reprocess_required');
  });

  it('too fatty → fat-decrease via low-fat liquid, profile-gated (sorbet gets water only)', () => {
    const std = routeBatchRescue(intent({ observation: { problem: 'too_fatty' } }));
    expect(std.recommendedActions[0]!.targetMetric).toBe('fat');
    expect(std.recommendedActions[0]!.leverFamilies).toContain('milk');
    const sorbet = routeBatchRescue(intent({ productProfile: 'sorbet', observation: { problem: 'too_fatty' } }));
    expect(sorbet.recommendedActions[0]!.leverFamilies).toEqual(['water']); // dairy never offered to sorbet
  });

  it('sorbet / vegan never get dairy levers for too_soft (profile-gated add-only)', () => {
    for (const productProfile of ['sorbet', 'vegan_gelato'] as const) {
      const r = routeBatchRescue(intent({ productProfile, observation: { problem: 'too_soft' } }));
      const levers = r.recommendedActions[0]!.leverFamilies;
      expect(levers).not.toContain('skimmed_milk_powder');
      expect(levers).not.toContain('milk');
      expect(levers).not.toContain('cream');
      expect(r.trace.blockedFamilies).toContain('skimmed_milk_powder');
    }
  });
});

describe('routeBatchRescue — serving temperature mismatch', () => {
  it('observed colder than intended → warm-up guidance (non-invasive, rescue_possible)', () => {
    const r = routeBatchRescue(
      intent({
        observation: { problem: 'serving_temperature_mismatch', observedServingTemperatureC: -14 },
      }),
    );
    expect(r.decision).toBe('rescue_possible');
    const a = r.recommendedActions[0]!;
    expect(a.kind).toBe('temperature_adjustment');
    expect(a.direction).toBe('increase'); // −14 → −11 = warmer
    expect(a.method).toBe('adjust_cabinet_temperature');
    expect(a.leverFamilies).toEqual([]); // no ingredients touched
    expect(r.requiredMeasurements).toContain('re_measure_serving_temperature_after_adjustment');
  });

  it('missing observed temperature → blocked_missing_data + measurement requirement', () => {
    const r = routeBatchRescue(intent({ observation: { problem: 'serving_temperature_mismatch' } }));
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_observed_serving_temperature');
    expect(r.requiredMeasurements).toContain('measure_actual_serving_temperature_c');
  });

  it('works even for a frozen batch (cabinet temperature is not a composition change)', () => {
    const r = routeBatchRescue(
      intent({
        observation: { problem: 'serving_temperature_mismatch', observedServingTemperatureC: -10 },
        constraints: { canReprocess: false, liquidAdditionPossible: false, dryAdditionPossible: false, batchAlreadyFrozen: true },
      }),
    );
    expect(r.decision).toBe('rescue_possible');
    expect(r.recommendedActions[0]!.direction).toBe('decrease'); // −10 → −11 = colder
  });
});

describe('routeBatchRescue — blocks, safety and honest dead ends', () => {
  it('food safety concern → discard_or_rebatch, checked FIRST and never overridden', () => {
    const r = routeBatchRescue(
      intent({ observation: { problem: 'too_hard', foodSafetyConcern: true } }),
    );
    expect(r.decision).toBe('discard_or_rebatch');
    expect(r.warnings).toContain('food_safety_concern_never_overridden');
    expect(r.recommendedActions).toEqual([]); // no rescue advice on top of a safety concern
    // even with everything else missing, safety still wins
    const worst = routeBatchRescue(
      intent({ productProfile: 'granita', batchSizeG: null, observation: { problem: 'too_hard', foodSafetyConcern: true } }),
    );
    expect(worst.decision).toBe('discard_or_rebatch');
  });

  it('missing batch size → blocked_missing_data + weigh requirement', () => {
    const r = routeBatchRescue(intent({ batchSizeG: null }));
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_batch_size');
    expect(r.requiredMeasurements).toContain('weigh_actual_batch_g');
    expect(routeBatchRescue(intent({ batchSizeG: 0 })).decision).toBe('blocked_missing_data');
  });

  it('unknown product profile → not_supported (never remapped)', () => {
    const r = routeBatchRescue(intent({ productProfile: 'granita' }));
    expect(r.decision).toBe('not_supported');
    expect(r.blockedReason).toBe('unsupported_product_profile');
  });

  it('already-served batch → not_supported (nothing left to rescue)', () => {
    const r = routeBatchRescue(
      intent({ constraints: { canReprocess: true, liquidAdditionPossible: true, dryAdditionPossible: true, batchAlreadyFrozen: false, batchAlreadyServed: true } }),
    );
    expect(r.decision).toBe('not_supported');
    expect(r.blockedReason).toBe('batch_already_served');
  });

  it('frozen batch → reprocess_required; with reprocessing unavailable there is NO addition advice', () => {
    const canReprocess = routeBatchRescue(
      intent({ constraints: { canReprocess: true, liquidAdditionPossible: true, dryAdditionPossible: true, batchAlreadyFrozen: true } }),
    );
    expect(canReprocess.decision).toBe('reprocess_required');
    expect(canReprocess.recommendedActions[0]!.kind).toBe('reprocess_and_rebalance');

    const cannot = routeBatchRescue(
      intent({ constraints: { canReprocess: false, liquidAdditionPossible: true, dryAdditionPossible: true, batchAlreadyFrozen: true } }),
    );
    expect(cannot.decision).toBe('reprocess_required');
    expect(cannot.recommendedActions).toEqual([]); // never pretends the hardened batch can take additions
    expect(cannot.warnings).toContain('reprocessing_declared_unavailable');
    expect(cannot.risks).toContain('discard_or_rebatch_may_be_required');
  });

  it('unfrozen with no addition method → reprocess if possible, else discard_or_rebatch', () => {
    const reproc = routeBatchRescue(
      intent({ constraints: { canReprocess: true, liquidAdditionPossible: false, dryAdditionPossible: false, batchAlreadyFrozen: false } }),
    );
    expect(reproc.decision).toBe('reprocess_required');
    const dead = routeBatchRescue(
      intent({ constraints: { canReprocess: false, liquidAdditionPossible: false, dryAdditionPossible: false, batchAlreadyFrozen: false } }),
    );
    expect(dead.decision).toBe('discard_or_rebatch');
    expect(dead.blockedReason).toBe('no_addition_method_available');
  });

  it('vocabulary members not yet routed (v0.1) → not_supported, honestly warned', () => {
    for (const problem of ['not_sweet_enough', 'stabilizer_issue', 'texture_differs_from_expected'] as const) {
      const r = routeBatchRescue(intent({ observation: { problem } }));
      expect(r.decision).toBe('not_supported');
      expect(r.blockedReason).toBe('problem_not_supported_v01');
    }
  });
});

describe('routeBatchRescue — expected-metrics cross-check (existing pure evaluation)', () => {
  it('the acceptable fixture really is acceptable at −11 (sanity, via evaluateTemperatureRegulator)', () => {
    const e = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -11,
      metrics: ACCEPTABLE_METRICS,
      texturePreference: 'medium',
    });
    expect(e.evaluated).toBe(true);
    expect(e.acceptable).toBe(true);
  });

  it('recipe fine at intended temp + batch held colder → temperature divergence warning', () => {
    const r = routeBatchRescue(
      intent({
        expectedMetrics: ACCEPTABLE_METRICS,
        observation: { problem: 'too_hard', observedServingTemperatureC: -14 },
      }),
    );
    expect(r.warnings).toContain('serving_temperature_divergence_may_explain_observation');
    expect(r.trace.expectedEvaluation?.acceptable).toBe(true);
  });

  it('expected metrics already out of band → recipe-correction warning (rescue only patches this batch)', () => {
    const r = routeBatchRescue(
      intent({ expectedMetrics: { ...ACCEPTABLE_METRICS, npac: 25 } }),
    );
    expect(r.warnings).toContain('expected_metrics_already_out_of_band_recipe_correction_recommended');
    expect(r.trace.expectedEvaluation?.acceptable).toBe(false);
  });
});

describe('routeBatchRescue — output contract invariants', () => {
  it('NO exact grams anywhere: actions are direction-level (structurally gram-free)', () => {
    const decisions = [
      routeBatchRescue(intent()),
      routeBatchRescue(intent({ observation: { problem: 'too_sweet' } })),
      routeBatchRescue(intent({ observation: { problem: 'serving_temperature_mismatch', observedServingTemperatureC: -14 } })),
    ];
    for (const r of decisions) {
      for (const a of r.recommendedActions) {
        expect('grams' in a).toBe(false);
        expect(Object.values(a).some((v) => typeof v === 'number')).toBe(false);
        expect(a.addOnly).toBe(true);
        // only additive / process / temperature action kinds exist — no removal kind
        expect(['add_ingredients', 'reprocess_and_rebalance', 'temperature_adjustment']).toContain(a.kind);
        expect(['add_dry', 'add_liquid', 'reprocess', 'adjust_cabinet_temperature']).toContain(a.method);
      }
    }
  });

  it('gram-free output is safe for Demo/Free by construction; Pro adds nothing hidden here', () => {
    // Redaction concern exists only when exact grams exist — v0.1 emits none, so
    // the SAME result is safe for every tier; UI gating uses the existing spine
    // capability `canUseActualBatchRescue` (demo: false, paid: true).
    const r = routeBatchRescue(intent());
    expect(JSON.stringify(r)).not.toMatch(/\d+(\.\d+)?\s*g\b/);
  });

  it('a feasible rescue offers the locked §17 five-option user-decision menu', () => {
    const r = routeBatchRescue(intent());
    expect(r.nextUserDecisionOptions).toEqual([...ACTUAL_BATCH_RESCUE_USER_DECISIONS]);
    expect(ACTUAL_BATCH_RESCUE_USER_DECISIONS).toHaveLength(5);
    // blocked/unsupported paths offer no menu
    expect(routeBatchRescue(intent({ batchSizeG: null })).nextUserDecisionOptions).toEqual([]);
    expect(routeBatchRescue(intent({ productProfile: 'granita' })).nextUserDecisionOptions).toEqual([]);
  });

  it('never mutates its input', () => {
    const input = intent({
      expectedMetrics: ACCEPTABLE_METRICS,
      recipeSnapshot: { items: [{ id: 'milk', planned_grams: 700 }] },
      observation: { problem: 'too_hard', observedServingTemperatureC: -14 },
    });
    const snapshot = JSON.stringify(input);
    routeBatchRescue(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const run = () => routeBatchRescue(intent({ expectedMetrics: ACCEPTABLE_METRICS }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('batchRescueRouter — boundary (pure spine module)', () => {
  const src = readFileSync(join(import.meta.dirname, 'batchRescueRouter.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('imports only within src/spine (no engine, no DB, no Mapper, no services)', () => {
    for (const match of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      expect(match[1]).toMatch(/^\.\//);
    }
    expect(/@\/engine|@\/services|@\/lib|@\/data/.test(src)).toBe(false);
    expect(/mapper_basement|service_role/i.test(src)).toBe(false);
  });

  it('has no save / persistence / write path and no product PAC-POD or status writes', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
    expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(src)).toBe(false);
  });
});
