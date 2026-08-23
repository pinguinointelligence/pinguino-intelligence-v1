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
        // Protein closeout: the v1 Protein seeds encoded the retired
        // 20 %-by-mass target and MISSED npac/pod at −12. The Engine-derived
        // v2 starter is natively validated like every other profile.
        expect(starter.validationStatus).toBe('engine_validated_native');
        expect(starter.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
      }
    },
  );

  it.each(
    NEW_RECIPE_SERVING_MODES.flatMap((serving) => [
      [serving, 1_000, 3] as const,
      [serving, 1_500, 5] as const,
      [serving, 10_000, 30] as const,
    ]),
  )(
    'starts Gelato %s / %i g at the Owner-preferred %i g stabilizer total',
    (serving, target, expected) => {
      const starter = build('gelato', serving, 'optimal', target);
      const stabilizerTotal = starter.lines
        .filter((line) => line.role === 'stabilizer')
        .reduce((sum, line) => sum + line.grams, 0);
      expect(stabilizerTotal).toBe(expected);
      expect(Number.isInteger(stabilizerTotal)).toBe(true);
      // Retain the exact-mass regression of the locked −11 template. G18 has
      // an existing 1000.1 g scale denominator and is outside this correction.
      if (serving === 'temp_minus_11') {
        expect(starter.metrics.actualBaseMassGrams).toBe(target);
      }
    },
  );

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

  it.each(
    (['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const).flatMap((serving) => [
      [serving, 1_000, 4] as const,
      [serving, 1_500, 6] as const,
      [serving, 1_237, 5] as const,
      [serving, 10_000, 40] as const,
    ]),
  )(
    'rebuilds historical Sorbet %s / %i g starter at the Owner-preferred %i g total',
    (serving, target, expected) => {
      const starter = build('sorbet', serving, 'optimal', target);
      const stabilizers = starter.lines.filter((line) => line.role === 'stabilizer');
      expect(stabilizers.reduce((sum, line) => sum + line.grams, 0)).toBe(expected);
      expect(stabilizers.every((line) => Number.isInteger(line.grams))).toBe(true);
      expect(starter.validationStatus).toBe('blocked_missing_user_main');
      expect(starter.metrics.actualBaseMassGrams).toBe(Math.round(target * 0.4));
    },
  );

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
      // Protein closeout: −12 and −13 join −11 as natively validated. The v1
      // seeds missed npac/pod at both because they carried the retired
      // 20 %-protein-by-mass target; the v2 starter is Engine-derived.
      ['protein', 'temp_minus_11'],
      ['protein', 'temp_minus_12'],
      ['protein', 'temp_minus_13'],
    ] as const) {
      const starter = build(profile, serving, 'optimal');
      expect(starter.validationStatus).toBe('engine_validated_native');
      expect(starter.metrics.nativeViolations).toEqual([]);
    }
  });
});
