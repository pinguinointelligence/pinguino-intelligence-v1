import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  alcoholAndSugarHeavyJimBeam,
  starterLine,
  starterMilkBase,
  withGrams,
} from './constraintFixtures';
import { evaluateFreezingStabilityStatus } from './freezingStabilityStatus';

const current = (recipe: RecipeInput) =>
  evaluateFreezingStabilityStatus({
    recipe,
    snapshots: productBehaviorTestSnapshots(recipe),
    calculationState: 'CURRENT',
  });

const starterInput = (
  visibleProductType: 'sorbet' | 'vegan' | 'protein',
  servingModeId: 'temp_minus_11' | 'temp_minus_12' | 'temp_minus_13',
): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType,
    servingModeId,
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

const verifiedGelatoAt = (temperature: -12 | -13): RecipeInput => {
  const grams =
    temperature === -12
      ? {
          milk_3_5: 600,
          cream_30: 135,
          smp: 43,
          sucrose: 86,
          dextrose: 80,
          inulin: 54,
          tara_gum: 2,
        }
      : {
          milk_3_5: 600,
          cream_30: 125,
          smp: 45,
          sucrose: 72,
          dextrose: 112,
          inulin: 44,
          tara_gum: 2,
        };
  return {
    ...ownerSameInputRecipe(),
    target_temperature_c: temperature,
    items: (Object.keys(grams) as Array<keyof typeof grams>).map((key) => ({
      id: `verified-${temperature}:${key}`,
      ingredient: OWNER_MAPPER_INGREDIENTS[key],
      planned_grams: grams[key],
      actual_grams: null,
      lock_type: 'unlocked',
    })),
  };
};

describe('freezing stability domain status', () => {
  it.each([
    [-11, starterMilkBase()],
    [-12, verifiedGelatoAt(-12)],
    [-13, verifiedGelatoAt(-13)],
  ] as const)(
    'certifies valid current Gelato at %i°C from direct authority',
    (_temperature, recipe) => {
      const assessment = current(recipe);
      expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
      expect(assessment.constraintAuthority.valid).toBe(true);
    },
  );

  it('removes GOOD immediately when the exact BASE is stale and restores a fresh derivation', () => {
    const base = starterMilkBase();
    const changed = {
      ...base,
      items: base.items.map((item) =>
        item.id === starterLine('milk_3_5')
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === starterLine('cream_30')
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };
    const snapshots = productBehaviorTestSnapshots(changed);

    expect(current(base).status).toBe('GOOD');
    expect(
      evaluateFreezingStabilityStatus({
        recipe: changed,
        snapshots,
        calculationState: 'STALE',
      }).status,
    ).toBe('STALE');
    expect(
      evaluateFreezingStabilityStatus({
        recipe: changed,
        snapshots,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('GOOD');
  });

  it('reports ATTENTION for a real canonical Engine/freezing violation', () => {
    const violated = withGrams(starterMilkBase(), starterLine('sucrose'), 300);
    const assessment = current(violated);
    expect(assessment.constraintAuthority.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'engine' })]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it('fails closed to UNAVAILABLE for missing or stale ProductBehavior', () => {
    const recipe = starterMilkBase();
    const missing = productBehaviorTestSnapshots(recipe);
    delete missing[recipe.items[0]!.id];
    expect(
      evaluateFreezingStabilityStatus({
        recipe,
        snapshots: missing,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('UNAVAILABLE');

    const stale = productBehaviorTestSnapshots(recipe);
    const lineId = recipe.items[0]!.id;
    stale[lineId] = { ...stale[lineId]!, resolutionState: 'REVALIDATION_REQUIRED' };
    expect(
      evaluateFreezingStabilityStatus({
        recipe,
        snapshots: stale,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('UNAVAILABLE');
  });

  it('consumes the existing Gelato stabilizer owner authority', () => {
    const recipe = starterMilkBase();
    const excessive = {
      ...recipe,
      items: recipe.items.map((item) =>
        item.id === starterLine('tara_gum')
          ? { ...item, planned_grams: 6 }
          : item.id === starterLine('milk_3_5')
            ? { ...item, planned_grams: item.planned_grams - 1 }
            : item,
      ),
    };
    const assessment = current(excessive);
    expect(assessment.constraintAuthority.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'owner_policy', code: 'aggregate_above_maximum' }),
      ]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it('reports ATTENTION for the existing alcohol/freezing safety edge case', () => {
    const assessment = current(alcoholAndSugarHeavyJimBeam());
    expect(assessment.result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'alcohol_above_safe_range' })]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it.each([
    ['sorbet', 'temp_minus_11'],
    ['sorbet', 'temp_minus_12'],
    ['sorbet', 'temp_minus_13'],
    ['vegan', 'temp_minus_11'],
    ['vegan', 'temp_minus_12'],
    ['vegan', 'temp_minus_13'],
  ] as const)('does not certify unresolved %s authority at %s', (profile, temperature) => {
    expect(current(starterInput(profile, temperature)).status).toBe('UNAVAILABLE');
  });

  it('uses the existing direct Protein authority without inventing profile physics', () => {
    const recipe = starterInput('protein', 'temp_minus_11');
    const assessment = current(recipe);
    expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
  });

  it('derives Preview/Apply/Undo and reopened-version states from the exact supplied BASE', () => {
    const original = starterMilkBase();
    const preview = {
      ...original,
      items: original.items.map((item) =>
        item.id === starterLine('milk_3_5')
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === starterLine('cream_30')
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };

    expect(current(original).status).toBe('GOOD');
    expect(current(preview).status).toBe('GOOD');
    expect(current(structuredClone(preview)).status).toBe('GOOD');
    expect(current(structuredClone(original)).status).toBe('GOOD');
  });
});
