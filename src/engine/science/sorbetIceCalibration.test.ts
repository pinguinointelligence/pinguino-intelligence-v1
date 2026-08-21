import { describe, expect, it } from 'vitest';
import {
  publishedLemonSorbetDscState,
  runSorbetIceCalibration,
  type SorbetCalibrationMixture,
} from './sorbetIceCalibration';

const baseline = (overrides: Partial<SorbetCalibrationMixture> = {}): SorbetCalibrationMixture => ({
  waterGrams: 745,
  sucroseGrams: 250,
  otherNonColligativeSolidsGrams: 5,
  temperatureCelsius: -12,
  ...overrides,
});

describe('Sorbet research ice calibration harness', () => {
  it('keeps total-mix ice and frozen-initial-water denominators explicit', () => {
    const state = runSorbetIceCalibration(baseline());
    expect(state.iceMassGrams).not.toBeNull();
    expect(state.iceMassFractionOfMix).toBeCloseTo(state.iceMassGrams! / 1_000, 12);
    expect(state.frozenFractionOfInitialWater).toBeCloseTo(state.iceMassGrams! / 745, 12);
    expect(state.iceMassFractionOfMix).not.toBeCloseTo(state.frozenFractionOfInitialWater!, 3);
    expect(state.freezableWaterGrams).toBeNull();
    expect(state.frozenFractionOfFreezableWater).toBeNull();
  });

  it.each([1_000, 1_237, 1_500, 10_000])(
    'conserves mass without recipe-scale rounding at %d g',
    (batch) => {
      const state = runSorbetIceCalibration({
        waterGrams: batch * 0.7,
        sucroseGrams: batch * 0.15,
        dextroseGrams: batch * 0.08,
        fructoseGrams: batch * 0.04,
        inulinGrams: batch * 0.025,
        otherNonColligativeSolidsGrams: batch * 0.005,
        temperatureCelsius: -12,
      });
      expect(state.totalMixtureGrams).toBeCloseTo(batch, 10);
      expect(Math.abs(state.massConservationResidualGrams!)).toBeLessThan(1e-9);
      expect(state.iceMassGrams).toBeGreaterThanOrEqual(0);
      expect(state.iceMassGrams).toBeLessThanOrEqual(state.initialWaterGrams);
      expect(state.frozenFractionOfInitialWater).toBeGreaterThanOrEqual(0);
      expect(state.frozenFractionOfInitialWater).toBeLessThanOrEqual(1);
    },
  );

  it('matches the published binary sucrose and glucose phase-diagram freezing points', () => {
    const sucrose = runSorbetIceCalibration(
      { waterGrams: 68.7, sucroseGrams: 31.3, temperatureCelsius: -11 },
      'pongsawatmanit_binary_phase_diagram',
    );
    const glucose = runSorbetIceCalibration(
      { waterGrams: 70.7, glucoseGrams: 29.3, temperatureCelsius: -11 },
      'pongsawatmanit_binary_phase_diagram',
    );
    expect(sucrose.initialFreezingPointCelsius).toBeCloseTo(-2.7, 0);
    expect(glucose.initialFreezingPointCelsius).toBeCloseTo(-4.7, 0);
    expect(sucrose.authority).toBe('published_binary_only');
    expect(glucose.authority).toBe('published_binary_only');
  });

  it('fails closed for fructose and for non-ideal binary/ternary mixture extrapolation', () => {
    const fructose = runSorbetIceCalibration(
      baseline({ sucroseGrams: 0, fructoseGrams: 250 }),
      'pongsawatmanit_binary_phase_diagram',
    );
    const binary = runSorbetIceCalibration(
      baseline({ sucroseGrams: 125, dextroseGrams: 125 }),
      'pongsawatmanit_binary_phase_diagram',
    );
    const ternary = runSorbetIceCalibration(
      baseline({ sucroseGrams: 84, dextroseGrams: 83, fructoseGrams: 83 }),
      'pongsawatmanit_binary_phase_diagram',
    );
    for (const state of [fructose, binary, ternary]) {
      expect(state.convergence).toEqual({
        converged: false,
        iterations: 0,
        reason: 'unsupported_model_domain',
      });
      expect(state.iceMassGrams).toBeNull();
    }
  });

  it('keeps arbitrary pure, binary and ternary ideal runs finite but explicitly non-authoritative', () => {
    const recipes = [
      baseline(),
      baseline({ sucroseGrams: 0, glucoseGrams: 250 }),
      baseline({ sucroseGrams: 0, fructoseGrams: 250 }),
      baseline({ sucroseGrams: 125, dextroseGrams: 125 }),
      baseline({ sucroseGrams: 125, fructoseGrams: 125 }),
      baseline({ sucroseGrams: 0, dextroseGrams: 125, fructoseGrams: 125 }),
      baseline({ sucroseGrams: 84, dextroseGrams: 83, fructoseGrams: 83 }),
    ];
    for (const recipe of recipes) {
      const state = runSorbetIceCalibration(recipe);
      expect(state.authority).toBe('research_baseline_only');
      expect(state.convergence.converged).toBe(true);
      expect(Number.isFinite(state.iceMassGrams)).toBe(true);
      expect(Number.isFinite(state.equilibriumSerum!.solidsMassFraction)).toBe(true);
    }
  });

  it('obeys monotonic temperature and effective-antifreeze concentration invariants', () => {
    const warm = runSorbetIceCalibration(baseline({ temperatureCelsius: -11 }));
    const cold = runSorbetIceCalibration(baseline({ temperatureCelsius: -13 }));
    expect(cold.iceMassGrams).toBeGreaterThanOrEqual(warm.iceMassGrams!);

    const lowerParticles = runSorbetIceCalibration(
      baseline({ sucroseGrams: 250, dextroseGrams: 0 }),
    );
    const higherParticles = runSorbetIceCalibration(
      baseline({ sucroseGrams: 150, dextroseGrams: 100 }),
    );
    expect(higherParticles.iceMassGrams).toBeLessThanOrEqual(lowerParticles.iceMassGrams!);
  });

  it('re-derives the published lemon Sorbet DSC total-mix ice fractions', () => {
    expect(publishedLemonSorbetDscState(-11).iceMassFractionOfMix).toBeCloseTo(0.5069082738, 9);
    expect(publishedLemonSorbetDscState(-12).iceMassFractionOfMix).toBeCloseTo(0.5191074635, 9);
    expect(publishedLemonSorbetDscState(-13).iceMassFractionOfMix).toBeCloseTo(0.5202860922, 9);
    expect(() => publishedLemonSorbetDscState(-13.01)).toThrow(RangeError);
  });

  it('audits S01/S02/S03 without promoting the ideal baseline to authority', () => {
    // Current repo composition path, using its documented raspberry surrogate:
    // fruit water/sugars + actual 92%-dry dextrose, 95%-dry inulin and 88%-dry tara.
    const fixtures = [
      {
        id: 'S01',
        input: {
          waterGrams: 704.586,
          sucroseGrams: 103.8,
          glucoseGrams: 12,
          dextroseGrams: 54.28,
          fructoseGrams: 14.4,
          otherNonColligativeSolidsGrams: 110.934,
          temperatureCelsius: -11,
        },
        idealIceMixPercent: 58.9235566369,
      },
      {
        id: 'S02',
        input: {
          waterGrams: 690.246,
          sucroseGrams: 90,
          glucoseGrams: 12,
          dextroseGrams: 82.8,
          fructoseGrams: 14.4,
          otherNonColligativeSolidsGrams: 110.554,
          temperatureCelsius: -12,
        },
        idealIceMixPercent: 56.9017278483,
      },
      {
        id: 'S03',
        input: {
          waterGrams: 674.796,
          sucroseGrams: 78,
          glucoseGrams: 12,
          dextroseGrams: 115,
          fructoseGrams: 14.4,
          otherNonColligativeSolidsGrams: 105.804,
          temperatureCelsius: -13,
        },
        idealIceMixPercent: 54.5594773836,
      },
    ] as const;

    for (const fixture of fixtures) {
      const ideal = runSorbetIceCalibration(fixture.input);
      const publishedBinary = runSorbetIceCalibration(
        fixture.input,
        'pongsawatmanit_binary_phase_diagram',
      );
      expect(ideal.totalMixtureGrams, fixture.id).toBeCloseTo(1_000, 9);
      expect(ideal.iceMassFractionOfMix! * 100, fixture.id).toBeCloseTo(
        fixture.idealIceMixPercent,
        8,
      );
      expect(ideal.authority, fixture.id).toBe('research_baseline_only');
      expect(publishedBinary.convergence.reason, fixture.id).toBe('unsupported_model_domain');
      expect(publishedBinary.iceMassFractionOfMix, fixture.id).toBeNull();
    }
  });

  it('uses a bounded solver and rejects invalid physical states', () => {
    const state = runSorbetIceCalibration(baseline());
    expect(state.convergence.converged).toBe(true);
    expect(state.convergence.iterations).toBeLessThanOrEqual(200);
    expect(() => runSorbetIceCalibration(baseline({ waterGrams: -1 }))).toThrow(RangeError);
    expect(() => runSorbetIceCalibration(baseline({ temperatureCelsius: Number.NaN }))).toThrow(
      RangeError,
    );
  });
});
