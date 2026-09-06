/**
 * OWNER-LOCKED — Home machine authority and formulation modules (2026-09-05).
 *
 * A Home machine owns preparation/capacity metadata and one formulation
 * preference. It never creates an Engine temperature cell and a Gellatti
 * recommended batch is never promoted into an equipment hard limit.
 */
import { describe, expect, it } from 'vitest';
import {
  HOME_ENGINE_TEMPERATURE_C,
  HOME_FORMULATION_MODULES,
  MACHINE_CATALOG,
  deriveMachineSetup,
  planContainerSplit,
  validateHomeMachineProfile,
  type HomeMachineProfile,
} from '@/features/machine-catalog';

const EXPECTED = {
  'ninja-creami-nc302eu-eu-es': {
    technology: 'respin',
    module: 'FROZEN_PINT',
    recommended: 450,
    vesselMl: 473,
    maxLiquidMl: null,
    maxBatchMl: 473,
    finishedMl: null,
    vessels: 2,
    trueHardMaximum: true,
    preFreeze: 'mixture',
  },
  'ninja-creami-deluxe-nc502eu-eu-es': {
    technology: 'respin',
    module: 'FROZEN_PINT',
    recommended: 670,
    vesselMl: 706,
    maxLiquidMl: null,
    maxBatchMl: 706,
    finishedMl: null,
    vessels: 2,
    trueHardMaximum: true,
    preFreeze: 'mixture',
  },
  'ninja-creami-scoop-swirl-nc7-eu-es': {
    technology: 'respin_soft',
    module: 'SOFT_DISPENSE',
    recommended: 460,
    vesselMl: 480,
    maxLiquidMl: null,
    maxBatchMl: 480,
    finishedMl: null,
    vessels: 2,
    trueHardMaximum: true,
    preFreeze: 'mixture',
  },
  'moulinex-freezi-mj803af0-es': {
    technology: 'compressor',
    module: 'COMPRESSOR',
    recommended: 950,
    vesselMl: null,
    maxLiquidMl: 1000,
    maxBatchMl: 1000,
    finishedMl: 1400,
    vessels: 1,
    trueHardMaximum: true,
    preFreeze: 'none',
  },
  'sage-smart-scoop-bci600-uk-eu': {
    technology: 'compressor',
    module: 'COMPRESSOR',
    recommended: 950,
    vesselMl: 1000,
    maxLiquidMl: null,
    maxBatchMl: null,
    finishedMl: null,
    vessels: 1,
    trueHardMaximum: false,
    preFreeze: 'none',
  },
  'magimix-gelato-expert-eu': {
    technology: 'compressor',
    module: 'COMPRESSOR',
    recommended: 950,
    vesselMl: 2000,
    maxLiquidMl: 1000,
    maxBatchMl: 1000,
    finishedMl: 1000,
    vessels: 2,
    trueHardMaximum: true,
    preFreeze: 'none',
  },
  'cuisinart-ice100e-eu': {
    technology: 'compressor',
    module: 'COMPRESSOR',
    recommended: 950,
    vesselMl: 1500,
    maxLiquidMl: 1000,
    maxBatchMl: 1000,
    finishedMl: 1500,
    vessels: 1,
    trueHardMaximum: true,
    preFreeze: 'none',
  },
  'kitchenaid-5ksmicm-uk-eu': {
    technology: 'frozen_bowl',
    module: 'FROZEN_BOWL',
    recommended: 1330,
    vesselMl: 1900,
    maxLiquidMl: 1400,
    maxBatchMl: 1400,
    finishedMl: 1900,
    vessels: 1,
    trueHardMaximum: true,
    preFreeze: 'bowl',
  },
  'cuisinart-ice21e-eu': {
    technology: 'frozen_bowl',
    module: 'FROZEN_BOWL',
    recommended: 1330,
    vesselMl: null,
    maxLiquidMl: null,
    maxBatchMl: 1400,
    finishedMl: 1400,
    vessels: 1,
    trueHardMaximum: true,
    preFreeze: 'bowl',
  },
  'cuisinart-ice30bce-eu': {
    technology: 'frozen_bowl',
    module: 'FROZEN_BOWL',
    recommended: 1430,
    vesselMl: 2000,
    maxLiquidMl: 1500,
    maxBatchMl: 1500,
    finishedMl: 2000,
    vessels: 1,
    trueHardMaximum: true,
    preFreeze: 'bowl',
  },
} as const;

describe('OWNER LOCK — complete Home machine authority', () => {
  it('defines exactly the four canonical, brand-neutral modules', () => {
    expect(Object.keys(HOME_FORMULATION_MODULES)).toEqual([
      'FROZEN_BOWL',
      'COMPRESSOR',
      'FROZEN_PINT',
      'SOFT_DISPENSE',
    ]);
    expect(Object.values(HOME_FORMULATION_MODULES).map((module) => module.displayLabel)).toEqual([
      'Frozen Bowl',
      'Compressor',
      'Frozen Pint',
      'Soft Dispense',
    ]);
    expect(HOME_FORMULATION_MODULES.FROZEN_BOWL.preference.pac).toBe('strong_lower');
    expect(HOME_FORMULATION_MODULES.COMPRESSOR.preference.pac).toBe('moderate_lower');
    expect(HOME_FORMULATION_MODULES.FROZEN_PINT.preference.pac).toBe('neutral');
    expect(HOME_FORMULATION_MODULES.SOFT_DISPENSE.preference).toMatchObject({
      pac: 'strong_upper_safe',
      softness: 2,
      creaminess: 1,
      sweetness: 0,
    });
  });

  it('pins all ten active machines to one module, the −11 cell, soft batch, and honest hard gram authority', () => {
    expect(MACHINE_CATALOG).toHaveLength(10);
    for (const profile of MACHINE_CATALOG) {
      const setup = deriveMachineSetup(profile);
      const expected = EXPECTED[profile.id as keyof typeof EXPECTED];
      expect(expected, profile.id).toBeDefined();
      expect(profile.technology).toBe(expected.technology);
      expect(profile.homeFormulationModuleId).toBe(expected.module);
      expect(setup.homeFormulationModule.id).toBe(expected.module);
      expect(setup.engineTemperatureC).toBe(HOME_ENGINE_TEMPERATURE_C);
      expect(setup.engineTemperatureC).toBe(-11);
      expect(setup.recommendedBatchGrams).toBe(expected.recommended);
      expect(profile.capacity.vesselCapacityMl).toBe(expected.vesselMl);
      expect(profile.capacity.maximumLiquidMixMl).toBe(expected.maxLiquidMl);
      expect(profile.capacity.maximumBatchMl).toBe(expected.maxBatchMl);
      expect(profile.capacity.finishedProductCapacityMl).toBe(expected.finishedMl);
      expect(profile.capacity.vesselCount).toBe(expected.vessels);
      expect(profile.capacity.trueHardMaximumDocumented).toBe(expected.trueHardMaximum);
      expect(profile.preFreezeTarget).toBe(expected.preFreeze);
      expect(setup.hardMaximumBatchGrams).toBeNull();
      expect(profile.capacity.hardMaximumBatchGrams).toBeNull();
      expect(validateHomeMachineProfile(profile)).toEqual([]);
    }
  });

  it('rejects an active future machine that has no formulation-module assignment', () => {
    const future = {
      ...MACHINE_CATALOG[0]!,
      id: 'future-machine-without-module',
      homeFormulationModuleId: undefined,
    } as unknown as HomeMachineProfile;
    expect(validateHomeMachineProfile(future)).toContain(
      'future-machine-without-module: active Home machine requires a valid homeFormulationModuleId',
    );
  });

  it('keeps recommended per-container batch soft and supports larger total recipes by splitting', () => {
    expect(planContainerSplit(900, 450)).toMatchObject({
      containers: 2,
      gramsPerContainer: 450,
      totalGrams: 900,
    });
    expect(planContainerSplit(1000, 450)).toMatchObject({
      containers: 3,
      gramsPerContainer: 333.3,
      totalGrams: 1000,
    });
    expect(planContainerSplit(1350, 450)).toMatchObject({
      containers: 3,
      gramsPerContainer: 450,
      totalGrams: 1350,
    });
  });
});
