import { describe, expect, it } from 'vitest';
import {
  deriveTemperatureAwareTarget,
  temperatureRegulatorTarget,
  type EngineTargetSignalLike,
} from './temperatureAwareCorrectionTargets';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type ServingTemperatureC,
} from '@/spine';

const intentOf = (over: Partial<NormalizedRecipeIntent> = {}): NormalizedRecipeIntent => ({
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -11,
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

// Engine result signals: the −11 seeded milk_gelato NPAC band is [33,42].
const aligned: EngineTargetSignalLike = { indicators: [{ key: 'npac', band: { min: 33, max: 42 } }] };
const tempFallback: EngineTargetSignalLike = { indicators: [{ key: 'npac', band: { min: 33, max: 42 }, temperature_fallback: true }] };
const catFallback: EngineTargetSignalLike = { indicators: [{ key: 'npac', band: { min: 33, max: 42 }, category_fallback: true }] };

describe('temperatureRegulatorTarget', () => {
  it('returns the regulator NPAC band per serving temperature (Standard Gelato)', () => {
    expect(temperatureRegulatorTarget('standard_gelato', -11)?.npacBand).toEqual([33, 43]);
    expect(temperatureRegulatorTarget('standard_gelato', -12)?.npacBand).toEqual([42, 50]);
    expect(temperatureRegulatorTarget('standard_gelato', -13)?.npacBand).toEqual([48, 55]);
  });

  it('marks chocolate protein-share advisory (never hard) and carries the chocolate regulator', () => {
    const t = temperatureRegulatorTarget('chocolate_gelato', -13)!;
    expect(t.regulatorProfile).toBe('chocolate_gelato_temperature_regulator');
    expect(t.advisoryGates).toContain('protein_share_in_solids');
    expect(t.hardGates).not.toContain('protein_share_in_solids');
  });

  it('sorbet/vegan disable the dairy gates and forbid dairy adjustment families', () => {
    const s = temperatureRegulatorTarget('sorbet', -12)!;
    expect(s.hardGates).not.toContain('lactose');
    expect(s.hardGates).not.toContain('lactose_sanding');
    const v = temperatureRegulatorTarget('vegan_gelato', -13)!;
    expect(v.hardGates).not.toContain('lactose');
    expect(v.forbiddenAdjustmentFamilies).toEqual(expect.arrayContaining(['milk', 'cream', 'skimmed_milk_powder']));
  });

  it('returns null for an unsupported profile or temperature', () => {
    expect(temperatureRegulatorTarget('granita', -12)).toBeNull();
    expect(temperatureRegulatorTarget('standard_gelato', -18)).toBeNull();
  });
});

describe('deriveTemperatureAwareTarget', () => {
  it('Standard Gelato −11 with no fallback is aligned (base_engine_seeded), no warning', () => {
    const g = deriveTemperatureAwareTarget(intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -11 }), aligned);
    expect(g.solverTargetAligned).toBe(true);
    expect(g.solverTargetSource).toBe('base_engine_seeded');
    expect(g.warnings).toEqual([]);
    expect(g.target?.npacBand).toEqual([33, 43]);
  });

  it('Standard Gelato −12/−13 on a temperature fallback is NOT connected and warns', () => {
    for (const servingTemperatureC of [-12, -13] as ServingTemperatureC[]) {
      const g = deriveTemperatureAwareTarget(intentOf({ productProfile: 'standard_gelato', servingTemperatureC }), tempFallback);
      expect(g.solverTargetAligned, String(servingTemperatureC)).toBe(false);
      expect(g.solverTargetSource, String(servingTemperatureC)).toBe('not_connected');
      expect(g.warnings).toContain('temperature_target_not_connected');
      expect(g.warnings).toContain('solver_uses_temperature_fallback_band');
    }
  });

  it('a category fallback (sorbet/vegan/chocolate) is NOT connected', () => {
    const g = deriveTemperatureAwareTarget(intentOf({ productProfile: 'sorbet', servingTemperatureC: -11 }), catFallback);
    expect(g.solverTargetAligned).toBe(false);
    expect(g.solverTargetSource).toBe('not_connected');
    expect(g.warnings).toContain('solver_uses_category_fallback_band');
  });

  it('never turns the chocolate advisory gate into a hard target', () => {
    const g = deriveTemperatureAwareTarget(intentOf({ productProfile: 'chocolate_gelato', servingTemperatureC: -13 }), catFallback);
    expect(g.target?.advisoryGates).toContain('protein_share_in_solids');
    expect(g.target?.hardGates).not.toContain('protein_share_in_solids');
  });

  it('blocks an unsupported profile or temperature — never remapped', () => {
    const p = deriveTemperatureAwareTarget(intentOf({ productProfile: 'granita' as unknown as ProductProfile, servingTemperatureC: -12 }), aligned);
    expect(p.blocked).toBe(true);
    expect(p.blockedReason).toBe('unsupported_product_profile');
    expect(p.target).toBeNull();
    const t = deriveTemperatureAwareTarget(intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -18 as unknown as ServingTemperatureC }), aligned);
    expect(t.blocked).toBe(true);
    expect(t.blockedReason).toBe('unsupported_serving_temperature');
  });

  it('computes the NPAC target divergence (engine −11 seeded band vs regulator −13 band)', () => {
    const g = deriveTemperatureAwareTarget(intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -13 }), tempFallback);
    // engine center (33+42)/2 = 37.5 ; regulator −13 center (48+55)/2 = 51.5 → 14
    expect(g.npacTargetDivergence).toBe(14);
  });

  it('never mutates the engine signal input', () => {
    const snapshot = JSON.stringify(tempFallback);
    deriveTemperatureAwareTarget(intentOf({ productProfile: 'standard_gelato', servingTemperatureC: -12 }), tempFallback);
    expect(JSON.stringify(tempFallback)).toBe(snapshot);
  });
});
