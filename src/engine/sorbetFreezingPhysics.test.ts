import { describe, expect, it } from 'vitest';

import {
  solveSorbetFreezingPhysics,
  sorbetChenCompositionParameters,
  sorbetChenFreezingPointCelsius,
  type SorbetFreezingPhysicsInput,
} from './sorbetFreezingPhysics';

const sourceSystem = (
  overrides: Partial<SorbetFreezingPhysicsInput> = {},
): SorbetFreezingPhysicsInput => ({
  totalMixtureGrams: 1_000,
  initialWaterGrams: 700,
  totalDrySolidsGrams: 300,
  sucroseGrams: 285,
  glucoseGrams: 0,
  dextroseGrams: 0,
  fructoseGrams: 0,
  unsupportedFreezeActiveSolidsGrams: 0,
  temperatureCelsius: -12,
  ...overrides,
});

describe('Sorbet composition-sensitive Chen freezing physics', () => {
  it.each([
    ['pure fructose', 0.95, 0, 0, 0.07695, 0.1634],
    ['pure glucose', 0, 0.95, 0, 0.06745, 0.21185],
    ['pure sucrose', 0, 0, 0.95, 0.0608, 0.1083],
    ['fructose/glucose', 0.475, 0.475, 0, 0.080999375, 0.220115],
    ['fructose/sucrose', 0.475, 0, 0.475, 0.06842375, 0.190676875],
    ['glucose/sucrose', 0, 0.475, 0.475, 0.08082125, 0.13615875],
    ['ternary centroid', 0.317, 0.317, 0.317, 0.096987261085, 0.024740716725],
  ])('reproduces published pure/binary/ternary E/B regression for %s', (_label, f, g, s, e, b) => {
    const parameters = sorbetChenCompositionParameters({
      fructoseDrySolidsFraction: f,
      glucoseDrySolidsFraction: g,
      sucroseDrySolidsFraction: s,
    });
    expect(parameters).not.toBeNull();
    expect(parameters!.chenE).toBeCloseTo(e, 12);
    expect(parameters!.chenB).toBeCloseTo(b, 12);
  });

  it.each([
    ['tuna', 0.327, 0.577, 0, 0.074812481, 0.212084776],
    ['orange', 0.233, 0.189, 0.417, 0.076343351805, 0.056327527925],
    ['mango', 0.218, 0.095, 0.54, 0.069426403, 0.088517305],
    ['strawberry', 0.285, 0.258, 0.05, 0.0504004625, 0.1059117825],
    ['pineapple', 0.317, 0.264, 0.103, 0.06092156388, 0.0976331168],
  ])('reproduces the published real-juice model row for %s', (_label, f, g, s, e, b) => {
    const parameters = sorbetChenCompositionParameters({
      fructoseDrySolidsFraction: f,
      glucoseDrySolidsFraction: g,
      sucroseDrySolidsFraction: s,
    });
    expect(parameters!.chenE).toBeCloseTo(e, 12);
    expect(parameters!.chenB).toBeCloseTo(b, 12);
  });

  it('solves the bounded freeze-concentration mass balance with explicit denominators', () => {
    const state = solveSorbetFreezingPhysics(sourceSystem());
    expect(state.status).toBe('available');
    if (state.status !== 'available') return;
    expect(state.iterations).toBe(0);
    expect(state.iceMassGrams).toBeGreaterThan(0);
    expect(state.iceMassGrams).toBeLessThan(
      state.equilibriumSerum.liquidWaterGrams + state.iceMassGrams,
    );
    expect(state.iceMassFractionOfMix).toBeCloseTo(state.iceMassGrams / 1_000, 12);
    expect(state.frozenFractionOfInitialWater).toBeCloseTo(state.iceMassGrams / 700, 12);
    expect(state.iceMassFractionOfMix).not.toBeCloseTo(state.frozenFractionOfInitialWater, 3);
    expect(Math.abs(state.massConservationResidualGrams)).toBeLessThan(1e-9);
    expect(
      sorbetChenFreezingPointCelsius(
        state.equilibriumSerum.drySolidsMassFraction,
        state.parameters,
      ),
    ).toBeCloseTo(-12, 9);
  });

  it('uses actual dry dextrose as glucose and produces identical physics', () => {
    const glucose = solveSorbetFreezingPhysics(
      sourceSystem({ sucroseGrams: 0, glucoseGrams: 285 }),
    );
    const dextrose = solveSorbetFreezingPhysics(
      sourceSystem({ sucroseGrams: 0, dextroseGrams: 285 }),
    );
    expect(dextrose).toEqual(glucose);
  });

  it('is monotonic with colder temperature and invariant under recipe scaling', () => {
    const warm = solveSorbetFreezingPhysics(sourceSystem({ temperatureCelsius: -11 }));
    const middle = solveSorbetFreezingPhysics(sourceSystem({ temperatureCelsius: -12 }));
    const cold = solveSorbetFreezingPhysics(sourceSystem({ temperatureCelsius: -13 }));
    expect(warm.status).toBe('available');
    expect(middle.status).toBe('available');
    expect(cold.status).toBe('available');
    if (warm.status !== 'available' || middle.status !== 'available' || cold.status !== 'available')
      return;
    expect(middle.iceMassGrams).toBeGreaterThan(warm.iceMassGrams);
    expect(cold.iceMassGrams).toBeGreaterThan(middle.iceMassGrams);

    for (const batch of [1_000, 1_237, 1_500, 10_000]) {
      const scale = batch / 1_000;
      const scaled = solveSorbetFreezingPhysics({
        ...sourceSystem(),
        totalMixtureGrams: batch,
        initialWaterGrams: 700 * scale,
        totalDrySolidsGrams: 300 * scale,
        sucroseGrams: 285 * scale,
      });
      expect(scaled.status).toBe('available');
      if (scaled.status !== 'available') continue;
      expect(scaled.iceMassFractionOfMix).toBeCloseTo(middle.iceMassFractionOfMix, 12);
      expect(scaled.iceMassGrams).toBeCloseTo(middle.iceMassGrams * scale, 8);
      expect(Math.abs(scaled.massConservationResidualGrams)).toBeLessThan(1e-8);
    }
  });

  it('improves materially on the independent lemon Sorbet DSC holdout without fitting to it', () => {
    const observed = new Map([
      [-11, 0.5069082737856593],
      [-12, 0.5191074634521675],
      [-13, 0.5202860922317823],
    ]);
    for (const temperatureCelsius of [-11, -12, -13]) {
      const state = solveSorbetFreezingPhysics({
        totalMixtureGrams: 1_000,
        initialWaterGrams: 738.1,
        totalDrySolidsGrams: 261.9,
        sucroseGrams: 146,
        glucoseGrams: 0,
        dextroseGrams: 0.9,
        fructoseGrams: 80,
        unsupportedFreezeActiveSolidsGrams: 0,
        temperatureCelsius,
      });
      expect(state.status).toBe('available');
      if (state.status !== 'available') continue;
      expect(Math.abs(state.iceMassFractionOfMix - observed.get(temperatureCelsius)!)).toBeLessThan(
        0.06,
      );
    }
  });

  it.each([
    [
      'S01',
      {
        initialWaterGrams: 704.586,
        totalDrySolidsGrams: 295.414,
        sucroseGrams: 103.8,
        glucoseGrams: 12,
        dextroseGrams: 54.28,
        fructoseGrams: 14.4,
        temperatureCelsius: -11,
      },
      54.8957746494,
    ],
    [
      'S02',
      {
        initialWaterGrams: 690.246,
        totalDrySolidsGrams: 309.754,
        sucroseGrams: 90,
        glucoseGrams: 12,
        dextroseGrams: 82.8,
        fructoseGrams: 14.4,
        temperatureCelsius: -12,
      },
      52.9929753897,
    ],
    [
      'S03',
      {
        initialWaterGrams: 674.796,
        totalDrySolidsGrams: 325.204,
        sucroseGrams: 78,
        glucoseGrams: 12,
        dextroseGrams: 115,
        fructoseGrams: 14.4,
        temperatureCelsius: -13,
      },
      50.6711969272,
    ],
  ] as const)('recalculates %s through the production model', (_id, values, expectedPercent) => {
    const state = solveSorbetFreezingPhysics({
      totalMixtureGrams: 1_000,
      unsupportedFreezeActiveSolidsGrams: 0,
      ...values,
    });
    expect(state.status).toBe('available');
    if (state.status !== 'available') return;
    expect(state.iceMassFractionOfMix * 100).toBeCloseTo(expectedPercent, 8);
  });

  it('fails closed outside source authority and leaves Inulin/other dry matter unparameterized', () => {
    expect(
      solveSorbetFreezingPhysics(sourceSystem({ unsupportedFreezeActiveSolidsGrams: 0.4 })),
    ).toMatchObject({ status: 'available' });
    expect(
      solveSorbetFreezingPhysics(sourceSystem({ unsupportedFreezeActiveSolidsGrams: 2 })),
    ).toMatchObject({ status: 'unavailable', reason: 'unsupported_freeze_active_solute' });
    expect(solveSorbetFreezingPhysics(sourceSystem({ sucroseGrams: 150 }))).toMatchObject({
      status: 'unavailable',
      reason: 'sugar_share_outside_validated_domain',
    });
    expect(solveSorbetFreezingPhysics(sourceSystem({ temperatureCelsius: -14 }))).toMatchObject({
      status: 'unavailable',
      reason: 'unsupported_temperature',
    });
    expect(solveSorbetFreezingPhysics(sourceSystem({ totalMixtureGrams: 999 }))).toMatchObject({
      status: 'unavailable',
      reason: 'mass_balance_mismatch',
    });

    const withNeutralDryMatter = solveSorbetFreezingPhysics(sourceSystem({ sucroseGrams: 240 }));
    expect(withNeutralDryMatter.status).toBe('available');
  });
});
