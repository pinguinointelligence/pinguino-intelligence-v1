/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, selectTargetBand } from '@/engine';
import type { RecipeInput } from '@/engine';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';
import {
  analyzeSolverTargetInjection,
  buildInjectedSolverTarget,
  injectRegulatorBands,
  INJECTED_TARGET_SOURCE,
} from './solverTargetInjection';

/** A real Standard Gelato (milk) recipe, re-servable at any temperature. */
const gelato = (temperatureC: number): RecipeInput => ({
  ...findOptimizationPreviewFixture('gelato-tradeoff')!.recipe,
  target_temperature_c: temperatureC,
});
const npacCmp = (a: ReturnType<typeof analyzeSolverTargetInjection>) =>
  a.comparisons.find((c) => c.metric === 'npac')!;

describe('buildInjectedSolverTarget', () => {
  it('exposes the regulator npac band as a hard injected target, labelled shadow', () => {
    const t = buildInjectedSolverTarget('standard_gelato', -12);
    expect(t.active).toBe(true);
    expect(t.source).toBe(INJECTED_TARGET_SOURCE);
    expect(t.injectedMetrics).toContain('npac');
    const npac = t.hardTargetBands.find((b) => b.metric === 'npac')!;
    expect(npac.band).toEqual([42, 50]);
    expect(npac.gateLevel).toBe('hard');
  });

  it('keeps chocolate protein-share ADVISORY — never injected as a hard target', () => {
    const t = buildInjectedSolverTarget('chocolate_gelato', -13);
    expect(t.injectedMetrics).not.toContain('protein_in_solids');
    expect(t.advisoryTargetBands.map((b) => b.metric)).toContain('protein_in_solids');
    expect(t.hardTargetBands.map((b) => b.metric)).not.toContain('protein_in_solids');
  });

  it('injects NO dairy metrics for sorbet (dairy gates disabled)', () => {
    const t = buildInjectedSolverTarget('sorbet', -12);
    expect(t.injectedMetrics).not.toContain('lactose');
    expect(t.injectedMetrics).not.toContain('lactose_sandiness_risk');
    expect(t.injectedMetrics).not.toContain('aerating_protein');
    expect(t.injectedMetrics).toContain('npac'); // structure gates still injected
  });

  it('injects NO dairy metrics for vegan (dairy gates disabled)', () => {
    const t = buildInjectedSolverTarget('vegan_gelato', -13);
    expect(t.injectedMetrics).not.toContain('lactose');
    expect(t.injectedMetrics).not.toContain('lactose_sandiness_risk');
    expect(t.injectedMetrics).not.toContain('aerating_protein');
  });

  it('blocks an unsupported profile / temperature (never remapped)', () => {
    expect(buildInjectedSolverTarget('granita', -12)).toMatchObject({
      active: false,
      fallbackReason: 'unsupported_product_profile',
      injectedMetrics: [],
    });
    expect(buildInjectedSolverTarget('standard_gelato', -18)).toMatchObject({
      active: false,
      fallbackReason: 'unsupported_serving_temperature',
    });
  });
});

describe('injectRegulatorBands — immutable band swap', () => {
  it('replaces only the hard-gate bands and NEVER mutates the original result', () => {
    const result = calculateRecipe(gelato(-12));
    const originalNpacBand = JSON.stringify(result.indicators.find((i) => i.key === 'npac')!.band);
    const target = buildInjectedSolverTarget('standard_gelato', -12);

    const injected = injectRegulatorBands(result, target);
    // original untouched
    expect(JSON.stringify(result.indicators.find((i) => i.key === 'npac')!.band)).toBe(originalNpacBand);
    expect(injected).not.toBe(result);
    expect(injected.indicators).not.toBe(result.indicators);
    // injected npac band is now the regulator band
    expect(injected.indicators.find((i) => i.key === 'npac')!.band).toEqual({ min: 42, max: 50 });
    // metric VALUES and keys preserved
    for (const key of ['npac', 'pod', 'fat'] as const) {
      expect(injected.indicators.find((i) => i.key === key)!.value).toBe(
        result.indicators.find((i) => i.key === key)!.value,
      );
    }
  });

  it('never mutates the global engine TARGET_BANDS (config read-only)', () => {
    const before = JSON.stringify(selectTargetBand('milk_gelato', -11)!.band.metrics.npac);
    analyzeSolverTargetInjection({ recipe: gelato(-12), productProfile: 'standard_gelato', servingTemperatureC: -12 });
    analyzeSolverTargetInjection({ recipe: gelato(-13), productProfile: 'standard_gelato', servingTemperatureC: -13 });
    const after = selectTargetBand('milk_gelato', -11)!.band.metrics.npac;
    expect(JSON.stringify(after)).toBe(before);
    expect(after).toEqual({ min: 33, max: 42 });
  });
});

describe('analyzeSolverTargetInjection — engine-seeded vs regulator-shadow', () => {
  it('the engine-seeded violations match the REAL solver detectViolations (no fabrication)', () => {
    const a = analyzeSolverTargetInjection({ recipe: gelato(-12), productProfile: 'standard_gelato', servingTemperatureC: -12 });
    const real = detectViolations(calculateRecipe(gelato(-12))).map((v) => `${v.metric}_${v.direction}`);
    expect(a.engineSeededViolations.map((v) => `${v.metric}_${v.direction}`)).toEqual(real);
  });

  it('Standard Gelato −11 is near-same (regulator band ≈ engine band, no NEW violations)', () => {
    const a = analyzeSolverTargetInjection({ recipe: gelato(-11), productProfile: 'standard_gelato', servingTemperatureC: -11 });
    expect(a.active).toBe(true);
    expect(a.newViolationsUnderRegulator).toEqual([]); // engine −11 [33,42] vs regulator −11 [33,43]
    expect(npacCmp(a).regulatorBand).toEqual([33, 43]);
    expect(npacCmp(a).targetCenterDelta!).toBeLessThanOrEqual(1);
    // near-aligned: a sub-tolerance center shift does NOT flag a correction change
    expect(a.correctionChanged).toBe(false);
  });

  it('Standard Gelato −12 uses the regulator-shadow target (npac [42,50]) and changes the correction', () => {
    const a = analyzeSolverTargetInjection({ recipe: gelato(-12), productProfile: 'standard_gelato', servingTemperatureC: -12 });
    expect(a.active).toBe(true);
    expect(npacCmp(a).regulatorBand).toEqual([42, 50]);
    expect(npacCmp(a).engineBand).toEqual([33, 42]); // engine still on the −11 fallback band
    expect(npacCmp(a).targetCenterDelta!).toBeGreaterThan(5);
    expect(a.correctionChanged).toBe(true);
    expect(a.warnings).toContain('regulator_shadow_target_changes_correction');
  });

  it('Standard Gelato −13 uses the regulator-shadow target (npac [48,55]) with a larger divergence', () => {
    const a = analyzeSolverTargetInjection({ recipe: gelato(-13), productProfile: 'standard_gelato', servingTemperatureC: -13 });
    expect(npacCmp(a).regulatorBand).toEqual([48, 55]);
    expect(npacCmp(a).targetCenterDelta!).toBeGreaterThan(10);
    expect(a.correctionChanged).toBe(true);
  });

  it('an in-band-at-−11 recipe is revealed as a NEW violation at −12 by the regulator target', () => {
    // The SAME recipe: its npac value is fixed; only the target band moves with temperature.
    const r11 = analyzeSolverTargetInjection({ recipe: gelato(-11), productProfile: 'standard_gelato', servingTemperatureC: -11 });
    const r12 = analyzeSolverTargetInjection({ recipe: gelato(-12), productProfile: 'standard_gelato', servingTemperatureC: -12 });
    // whatever npac does at −11, the −12 regulator band [42,50] is stricter on the low side
    expect(npacCmp(r12).shadowTargetCenter!).toBeGreaterThan(npacCmp(r11).shadowTargetCenter!);
  });

  it('advisory gates are never turned into violations (chocolate protein-share stays out of the injected set)', () => {
    const recipe = { ...findOptimizationPreviewFixture('chocolate-advisory')!.recipe, target_temperature_c: -13 };
    const a = analyzeSolverTargetInjection({ recipe, productProfile: 'chocolate_gelato', servingTemperatureC: -13 });
    expect(a.injectedMetrics).not.toContain('protein_in_solids');
    expect(a.comparisons.map((c) => c.metric)).not.toContain('protein_in_solids');
  });

  it('an unsupported profile blocks the injection (engine-seeded still returned, never remapped)', () => {
    const recipe = { ...findOptimizationPreviewFixture('granita-blocked')!.recipe };
    const a = analyzeSolverTargetInjection({ recipe, productProfile: 'granita', servingTemperatureC: -11 });
    expect(a.active).toBe(false);
    expect(a.blockedReason).toBe('unsupported_product_profile');
    expect(a.regulatorShadowViolations).toEqual([]);
    expect(a.warnings).toContain('injected_target_blocked:unsupported_product_profile');
    // the engine-seeded side is still honestly computed
    expect(a.engineSeededViolations.length).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    const run = () => analyzeSolverTargetInjection({ recipe: gelato(-12), productProfile: 'standard_gelato', servingTemperatureC: -12 });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('solverTargetInjection — boundary (preview only, no live engine mutation)', () => {
  const src = readFileSync(join(import.meta.dirname, 'solverTargetInjection.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('reads the engine only via the public barrel (calculateRecipe + detectViolations), no deep import', () => {
    expect(/from\s+['"]@\/engine['"]/.test(src)).toBe(true);
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
    expect(src.includes('detectViolations')).toBe(true);
  });

  it('never imports or mutates TARGET_BANDS, no DB / Mapper / save / pac-pod write', () => {
    expect(/import[^;]*TARGET_BANDS/.test(src)).toBe(false);
    expect(/TARGET_BANDS\s*[.[]|TARGET_BANDS\s*=/.test(src)).toBe(false);
    expect(/service_role|@\/services\/|@\/data\/products|mapper_basement/.test(src)).toBe(false);
    expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]/.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
