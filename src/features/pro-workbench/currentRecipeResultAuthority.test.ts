import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  buildCurrentRecipeResultAuthority,
  type CurrentRecipeResultAuthorityInput,
} from './currentRecipeResultAuthority';

const authorityInput = (
  overrides: Partial<CurrentRecipeResultAuthorityInput> = {},
): CurrentRecipeResultAuthorityInput => {
  const recipe = starterMilkBase();
  return {
    recipe,
    toppings: [],
    snapshots: productBehaviorTestSnapshots(recipe),
    draftRevision: 17,
    awaitingRecalculation: false,
    loading: false,
    ...overrides,
  };
};

describe('one current Recipe result authority', () => {
  it('keeps verified currentness separate from granular live module readiness', () => {
    const complete = buildCurrentRecipeResultAuthority(authorityInput());
    expect(complete).toMatchObject({
      state: 'CURRENT',
      ready: true,
      baseTechnicalReady: true,
      nutritionReady: true,
      costReady: true,
      labelReady: true,
      draftRevision: 17,
      blockedModules: [],
    });

    const recipe = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(recipe);
    const firstLine = recipe.items[0]!.id;
    snapshots[firstLine] = {
      ...snapshots[firstLine]!,
      moduleEligibility: {
        ...snapshots[firstLine]!.moduleEligibility,
        NUTRITION: 'blocked',
      },
    };
    const split = buildCurrentRecipeResultAuthority(authorityInput({ recipe, snapshots }));

    expect(split.moduleGates.MONITOR.ready).toBe(true);
    expect(split.moduleGates.NUTRITION.ready).toBe(false);
    expect(split).toMatchObject({
      state: 'STALE',
      ready: false,
      baseTechnicalReady: true,
      nutritionReady: false,
      costReady: true,
      labelReady: true,
      blockedModules: ['NUTRITION'],
    });
  });

  it('does not let a missing Label fact hide known Monitor, nutrition or cost facts', () => {
    const recipe = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(recipe);
    const firstLine = recipe.items[0]!.id;
    snapshots[firstLine] = {
      ...snapshots[firstLine]!,
      moduleEligibility: {
        ...snapshots[firstLine]!.moduleEligibility,
        LABEL: 'blocked',
      },
    };

    expect(buildCurrentRecipeResultAuthority(authorityInput({ recipe, snapshots }))).toMatchObject({
      state: 'CURRENT',
      ready: true,
      baseTechnicalReady: true,
      nutritionReady: true,
      costReady: true,
      labelReady: false,
    });
  });

  it('keeps one stable result reference for one revision, recipe and frozen behavior set', () => {
    const first = buildCurrentRecipeResultAuthority(authorityInput());
    const same = buildCurrentRecipeResultAuthority(authorityInput());
    expect(same.recipeFingerprint).toBe(first.recipeFingerprint);
    expect(same.behaviorFingerprint).toBe(first.behaviorFingerprint);
    expect(same.resultReference).toBe(first.resultReference);

    const edited = starterMilkBase();
    edited.items = edited.items.map((item, index) =>
      index === 0
        ? { ...item, planned_grams: item.planned_grams + 1 }
        : index === 1
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item,
    );
    const next = buildCurrentRecipeResultAuthority(
      authorityInput({
        recipe: edited,
        snapshots: productBehaviorTestSnapshots(edited),
        draftRevision: 18,
      }),
    );
    expect(next.recipeFingerprint).not.toBe(first.recipeFingerprint);
    expect(next.resultReference).not.toBe(first.resultReference);
  });

  it('marks optimization stale while retaining the independently valid live draft facts', () => {
    const stale = buildCurrentRecipeResultAuthority(
      authorityInput({ awaitingRecalculation: true }),
    );
    expect(stale).toMatchObject({
      state: 'STALE',
      ready: false,
      baseTechnicalReady: true,
      nutritionReady: true,
      costReady: true,
      labelReady: true,
    });

    const loading = buildCurrentRecipeResultAuthority(
      authorityInput({ awaitingRecalculation: true, loading: true }),
    );
    expect(loading).toMatchObject({
      state: 'LOADING',
      ready: false,
      baseTechnicalReady: true,
      nutritionReady: true,
      costReady: true,
      labelReady: true,
    });
  });
});
