import { describe, expect, it } from 'vitest';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import type { VisibleProductType } from '@/features/studio/productType';
import {
  buildCanonicalNewRecipeStarter,
  NEW_RECIPE_SERVING_MODES,
  starterServingModeForTemperature,
  type NewRecipeServingModeId,
} from './newRecipeStarter';

const PROFILES: readonly VisibleProductType[] = ['gelato', 'sorbet', 'vegan', 'protein'];
const STRATEGIES: readonly FormulationStrategy[] = ['eco', 'optimal'];

const grams = (starter: ReturnType<typeof buildCanonicalNewRecipeStarter>) =>
  starter.items.map((item) => [item.ingredient.canonical_ingredient_id, item.planned_grams]);

const build = (
  visibleProductType: VisibleProductType,
  servingModeId: NewRecipeServingModeId,
  formulationStrategy: FormulationStrategy,
  targetBatchGrams = 1_000,
) => buildCanonicalNewRecipeStarter({
  visibleProductType,
  servingModeId,
  formulationStrategy,
  targetBatchGrams,
});

describe('mode- and temperature-aware new recipe starters', () => {
  it('fails closed for an unsupported numeric temperature instead of silently using −12°C', () => {
    expect(starterServingModeForTemperature(undefined)).toBe('temp_minus_12');
    expect(starterServingModeForTemperature(-11)).toBe('temp_minus_11');
    expect(starterServingModeForTemperature(-12)).toBe('temp_minus_12');
    expect(starterServingModeForTemperature(-13)).toBe('temp_minus_13');
    expect(() => starterServingModeForTemperature(-10)).toThrow(
      'Unsupported new-recipe starter temperature: -10C.',
    );
  });

  it('resolves all 32 complete keys deterministically without canonical duplicates', () => {
    const keys = PROFILES.flatMap((profile) =>
      NEW_RECIPE_SERVING_MODES.flatMap((serving) =>
        STRATEGIES.map((strategy) => ({ profile, serving, strategy })),
      ),
    );
    expect(keys).toHaveLength(32);

    for (const key of keys) {
      const first = build(key.profile, key.serving, key.strategy);
      const second = build(key.profile, key.serving, key.strategy);
      expect(grams(second)).toEqual(grams(first));
      expect(first.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
      const canonicalIds = first.items.map((item) => item.ingredient.canonical_ingredient_id);
      expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
      expect(first.formulationStrategy).toBe(key.strategy);
      expect(first.servingModeId).toBe(key.serving);
      expect(first.validationStatus).not.toBe('engine_checked');
    }
  });

  it.each(PROFILES)('%s keeps Świeże numerically identical to −11°C', (profile) => {
    for (const strategy of STRATEGIES) {
      const fresh = build(profile, 'fresh', strategy);
      const minus11 = build(profile, 'temp_minus_11', strategy);
      expect(grams(fresh)).toEqual(grams(minus11));
      expect(fresh.metrics).toEqual(minus11.metrics);
      expect(fresh.targetTemperatureC).toBe(-11);
    }
  });

  it.each(PROFILES)('%s routes real −11/−12/−13 template vectors', (profile) => {
    const vectors = (['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const)
      .map((serving) => JSON.stringify(grams(build(profile, serving, 'optimal'))));
    expect(new Set(vectors).size).toBe(3);
  });

  it('keeps OPTIMAL composition price-independent and reports only effective cost changes', () => {
    const baseline = build('gelato', 'temp_minus_12', 'optimal');
    const canonicalId = baseline.lines[0]!.canonicalId;
    const override = (pricePerKg: number) => ({
      [canonicalId]: {
        overrideId: `price-${pricePerKg}`,
        ownerUserId: 'owner-a',
        canonicalIngredientId: canonicalId,
        pricePerKg,
        currency: 'EUR',
        createdBy: 'owner-a',
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      },
    });
    const cheap = buildCanonicalNewRecipeStarter({
      visibleProductType: 'gelato',
      servingModeId: 'temp_minus_12',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_000,
      priceOverrides: override(0.1),
    });
    const expensive = buildCanonicalNewRecipeStarter({
      visibleProductType: 'gelato',
      servingModeId: 'temp_minus_12',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_000,
      priceOverrides: override(100),
    });

    expect(grams(cheap)).toEqual(grams(expensive));
    expect(cheap.lines[0]).toMatchObject({
      priceSource: 'customer_override',
      effectivePricePerKg: 0.1,
    });
    expect(expensive.lines[0]).toMatchObject({
      priceSource: 'customer_override',
      effectivePricePerKg: 100,
    });
  });

  it.each(PROFILES)('%s reports ECO = OPTIMAL when no validated alternative exists', (profile) => {
    for (const serving of NEW_RECIPE_SERVING_MODES) {
      const eco = build(profile, serving, 'eco');
      const optimal = build(profile, serving, 'optimal');
      expect(grams(eco)).toEqual(grams(optimal));
      expect(eco.strategyResolution).toBe('eco_equals_optimal_no_validated_alternative');
    }
  });

  it.each(['gelato', 'vegan', 'protein'] as const)(
    '%s scales 1000/5000/1275 g to an exact whole-gram Base',
    (profile) => {
      for (const target of [1_000, 5_000, 1_275]) {
        const starter = build(profile, 'temp_minus_12', 'optimal', target);
        expect(starter.metrics.actualBaseMassGrams).toBe(target);
        expect(starter.metrics.missingMainMassGrams).toBe(0);
        expect(starter.validationStatus).toBe(
          profile === 'protein'
            ? 'blocked_engine_native_band_miss'
            : 'engine_validated_native',
        );
        expect(starter.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
      }
    },
  );

  it('never rounds the Gelato starter stabilizer system above the inward hard maximum', () => {
    const cases = [
      { target: 1_000, expected: 5 },
      { target: 1_500, expected: 7 },
      { target: 10_000, expected: 50 },
    ];

    for (const { target, expected } of cases) {
      const starter = build('gelato', 'temp_minus_11', 'optimal', target);
      const stabilizerTotal = starter.lines
        .filter((line) => line.role === 'stabilizer')
        .reduce((sum, line) => sum + line.grams, 0);
      expect(stabilizerTotal).toBe(expected);
      expect(Number.isInteger(stabilizerTotal)).toBe(true);
      expect(starter.metrics.actualBaseMassGrams).toBe(target);
    }
  });

  it('keeps Sorbet dairy-free and truthfully blocked on the user-supplied fruit/Main', () => {
    for (const target of [1_000, 5_000, 1_275]) {
      const starter = build('sorbet', 'temp_minus_12', 'optimal', target);
      expect(starter.validationStatus).toBe('blocked_missing_user_main');
      expect(starter.metrics.actualBaseMassGrams).toBe(Math.round(target * 0.4));
      expect(starter.metrics.missingMainMassGrams).toBe(target - Math.round(target * 0.4));
      expect(starter.items.some((item) => /milk|cream|whey|casein/i.test(item.ingredient.name)))
        .toBe(false);
      expect(starter.items.some((item) => item.lock_type === 'main')).toBe(false);
    }
  });

  it('keeps a recipe-level cost unknown when any positive starter line has no valid price', () => {
    const starter = build('gelato', 'temp_minus_12', 'optimal');
    const missing = starter.lines.filter((line) => line.priceSource === 'missing');
    if (missing.length > 0) {
      expect(starter.metrics.costComplete).toBe(false);
      expect(starter.metrics.costPerKg).toBeNull();
      expect(missing.every((line) => line.lineCost === null)).toBe(true);
    }
  });

  it('reports every native Engine miss instead of calling a calculated vector validated', () => {
    const cases = [
      ['gelato', 'temp_minus_13', ['lactose_sandiness_risk']],
      ['vegan', 'temp_minus_11', ['ice_fraction']],
      ['vegan', 'fresh', ['ice_fraction']],
      ['protein', 'temp_minus_12', ['npac', 'pod']],
      ['protein', 'temp_minus_13', ['npac', 'pod']],
    ] as const;

    for (const [profile, serving, expectedMetrics] of cases) {
      const starter = build(profile, serving, 'optimal');
      expect(starter.validationStatus).toBe('blocked_engine_native_band_miss');
      expect(starter.metrics.validatedNative).toBe(false);
      expect(starter.metrics.provisional).toBe(false);
      expect(starter.metrics.nativeViolations.map((violation) => violation.metric)).toEqual(
        expectedMetrics,
      );
    }

    for (const [profile, serving] of [
      ['gelato', 'temp_minus_11'],
      ['gelato', 'temp_minus_12'],
      ['vegan', 'temp_minus_12'],
      ['vegan', 'temp_minus_13'],
      ['protein', 'temp_minus_11'],
    ] as const) {
      const starter = build(profile, serving, 'optimal');
      expect(starter.validationStatus).toBe('engine_validated_native');
      expect(starter.metrics.nativeViolations).toEqual([]);
    }
  });
});
