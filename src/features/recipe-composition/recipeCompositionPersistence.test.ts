import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { workingStateFingerprint } from '@/features/constraint-studio/applyPipeline';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  readRecipeCompositionMetadata,
  recipeCompositionFromState,
  type RecipeToppingItem,
} from './recipeCompositionPersistence';
import { toppingIngredientIdentity } from './labelTopping';
import type { CatalogLabelToppingIngredient } from './labelTopping';

const topping = (id: string, grams: number, canonicalId = id): RecipeToppingItem => ({
  id,
  ingredient: {
    ...DEFAULT_PRESET.items[0]!.ingredient,
    id: canonicalId,
    canonical_ingredient_id: canonicalId,
  },
  planned_grams: grams,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON',
  addon_sort_order: 0,
});

const labelIngredient: CatalogLabelToppingIngredient = {
  kind: 'catalog_label_topping',
  id: 'catalog:label-sauce',
  canonical_ingredient_id: 'catalog:label-sauce',
  private_product_id: 'catalog:label-sauce:version:v1',
  name: 'Label sauce',
  catalog_product_id: 'label-sauce',
  catalog_version_id: 'v1',
  verification_status: 'verified',
  label_nutrition_per_100g: {
    basis: 'per_100g',
    energyKcal: 180,
    fat: 1,
    saturatedFat: 0.2,
    carbohydrate: 42,
    sugars: 38,
    protein: 1,
    salt: 0.04,
    fibre: 2,
  },
  ingredients_text: 'Fruit, sugar',
  allergens_text: 'None declared',
  cost_per_kg: null,
  cost_currency: null,
};

describe('Base/Topping composition sidecar', () => {
  beforeEach(() => {
    useRecipeStore.getState().loadPreset(DEFAULT_PRESET);
  });

  it('allows the same canonical product once in Base and once in Toppings, but merges per scope', () => {
    const milk = useRecipeStore.getState().items[0]!.ingredient;
    const canonicalId = canonicalIngredientId(milk);
    const baseBefore = useRecipeStore
      .getState()
      .items.filter((item) => canonicalIngredientId(item.ingredient) === canonicalId).length;
    const engineBefore = calculateRecipe(buildRecipeInput(useRecipeStore.getState()));

    useRecipeStore.getState().addIngredient(milk, 25);
    useRecipeStore.getState().addTopping(milk, 70);
    useRecipeStore.getState().addTopping({ ...milk, name: `${milk.name} · refreshed` }, 99);

    const state = useRecipeStore.getState();
    expect(
      state.items.filter((item) => canonicalIngredientId(item.ingredient) === canonicalId),
    ).toHaveLength(baseBefore);
    expect(
      state.toppings.filter((item) => toppingIngredientIdentity(item.ingredient) === canonicalId),
    ).toHaveLength(1);
    expect(state.toppings[0]!.planned_grams).toBe(70);
    expect(calculateRecipe(buildRecipeInput(state))).toEqual(engineBefore);
  });

  it('keeps Base Engine currentness and fingerprint stable across topping add/change/remove', () => {
    const baseInput = buildRecipeInput(useRecipeStore.getState());
    const baseResult = calculateRecipe(baseInput);
    const constraints = useConstraintStudioStore.getState().constraints;
    const baseFingerprint = workingStateFingerprint(baseInput, constraints);
    useRecipeProfileStore.setState({ awaitingRecalculation: false });
    const toppingIngredient = useRecipeStore.getState().items[0]!.ingredient;

    useRecipeStore.getState().addTopping(toppingIngredient, 25);
    const toppingId = useRecipeStore.getState().toppings[0]!.id;
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(workingStateFingerprint(buildRecipeInput(useRecipeStore.getState()), constraints)).toBe(
      baseFingerprint,
    );
    expect(calculateRecipe(buildRecipeInput(useRecipeStore.getState()))).toEqual(baseResult);

    useRecipeStore.getState().setToppingGrams(toppingId, 70);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(workingStateFingerprint(buildRecipeInput(useRecipeStore.getState()), constraints)).toBe(
      baseFingerprint,
    );

    useRecipeStore.getState().removeTopping(toppingId);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(workingStateFingerprint(buildRecipeInput(useRecipeStore.getState()), constraints)).toBe(
      baseFingerprint,
    );
    expect(calculateRecipe(buildRecipeInput(useRecipeStore.getState()))).toEqual(baseResult);
  });

  it('keeps manual Base order outside RecipeInput and therefore outside Engine science', () => {
    const before = useRecipeStore.getState();
    const engineInputBefore = buildRecipeInput(before);
    const engineResultBefore = calculateRecipe(engineInputBefore);
    const lastId = before.baseOrder.at(-1)!;

    useRecipeStore.getState().moveBaseItem(lastId, -1);

    const after = useRecipeStore.getState();
    expect(after.baseOrder).not.toEqual(before.baseOrder);
    expect(buildRecipeInput(after).items.map((item) => item.id)).toEqual(
      engineInputBefore.items.map((item) => item.id),
    );
    expect(calculateRecipe(buildRecipeInput(after))).toEqual(engineResultBefore);
  });

  it('records invalid and duplicate persisted topping data instead of dropping it silently', () => {
    const first = topping('topping-a', 70, 'PI-ING-TOPPING');
    const parsed = readRecipeCompositionMetadata({
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: ['milk', 'milk', '', 42],
      toppings: [
        first,
        { ...first, id: 'topping-b', addon_sort_order: 8 },
        { ...topping('topping-c', 60, 'PI-ING-SAUCE'), actual_grams: -1 },
      ],
      migrationAmbiguities: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.baseOrder).toEqual(['milk']);
    expect(parsed!.toppings).toEqual([{ ...first, addon_sort_order: 0 }]);
    expect(parsed!.migrationAmbiguities.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_BASE_ORDER_ENTRY',
        'INVALID_BASE_ORDER_ENTRY',
        'DUPLICATE_TOPPING_CANONICAL_ID',
        'INVALID_TOPPING_RECORD',
      ]),
    );
  });

  it('rejects a persisted Base/Topping line-id collision instead of deadlocking Production', () => {
    const collision = topping('base-milk', 70, 'PI-ING-TOPPING');
    const parsed = readRecipeCompositionMetadata(
      {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: ['base-milk'],
        toppings: [collision],
        migrationAmbiguities: [],
      },
      ['base-milk'],
    );
    expect(parsed?.toppings).toEqual([]);
    expect(parsed?.migrationAmbiguities).toContainEqual({
      lineId: 'base-milk',
      reason: 'CROSS_SCOPE_LINE_ID_COLLISION',
    });
  });

  it('preserves a schema-v1 Owner Review gate and derives technical Main ids from saved locks', () => {
    const parsed = readRecipeCompositionMetadata(
      {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: ['main-seed', 'standard-seed'],
        toppings: [],
        ownerReviewGate: {
          status: 'OWNER_REVIEW_EDITABLE',
          productionStatus: 'PRODUCTION_BLOCKED',
          labelStatus: 'LABEL_BLOCKED',
          omittedToppingLineIds: ['missing-topping'],
          // Legacy schema-v1 payload: technicalOnlyMainLineIds did not exist.
        },
        migrationAmbiguities: [],
      },
      ['main-seed', 'standard-seed'],
      ['main-seed'],
    );

    expect(parsed?.ownerReviewGate).toEqual({
      status: 'OWNER_REVIEW_EDITABLE',
      productionStatus: 'PRODUCTION_BLOCKED',
      labelStatus: 'LABEL_BLOCKED',
      omittedToppingLineIds: ['missing-topping'],
      technicalOnlyMainLineIds: ['main-seed'],
    });
  });

  it('fails closed on malformed or non-canonical persisted ingredient snapshots', () => {
    const valid = topping('valid', 70, 'PI-ING-TOPPING');
    const malformed = {
      ...topping('malformed', 60, 'PI-ING-BROKEN'),
      ingredient: {
        ...topping('malformed-source', 60, 'PI-ING-BROKEN').ingredient,
        composition: { water_percent: 'forged' },
      },
    };
    const nonCanonical = {
      ...topping('non-canonical', 50, 'raw-line-id'),
      ingredient: {
        ...topping('non-canonical-source', 50, 'raw-line-id').ingredient,
        canonical_ingredient_id: undefined,
      },
    };
    const conflictingCanonical = {
      ...topping('conflict', 40, 'PI-ING-AUTHORITATIVE'),
      ingredient: {
        ...topping('conflict-source', 40, 'PI-ING-AUTHORITATIVE').ingredient,
        id: 'PI-ING-AUTHORITATIVE',
        canonical_ingredient_id: 'PI-ING-FORGED',
      },
    };
    const parsed = readRecipeCompositionMetadata({
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: [],
      toppings: [valid, malformed, nonCanonical, conflictingCanonical],
      migrationAmbiguities: [],
    });
    expect(parsed?.toppings).toEqual([{ ...valid, addon_sort_order: 0 }]);
    expect(
      parsed?.migrationAmbiguities.filter((item) => item.reason === 'INVALID_TOPPING_RECORD'),
    ).toHaveLength(3);
  });

  it('serializes two independent orders with factual topping snapshots', () => {
    const state = useRecipeStore.getState();
    const metadata = recipeCompositionFromState({
      items: state.items,
      baseOrder: [...state.baseOrder].reverse(),
      toppings: [topping('milk-topping', 70), topping('sauce-topping', 60)],
    });
    expect(metadata.baseOrder).toEqual([...state.baseOrder].reverse());
    expect(metadata.toppings.map((item) => item.addon_sort_order)).toEqual([0, 1]);
    expect(metadata.toppings.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(130);
  });

  it('round-trips a label-only catalog Topping without creating Engine composition', () => {
    const item: RecipeToppingItem = {
      id: 'label-topping-line',
      ingredient: labelIngredient,
      planned_grams: 80,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    };
    const metadata = recipeCompositionFromState({
      items: useRecipeStore.getState().items,
      toppings: [item],
    });
    const parsed = readRecipeCompositionMetadata(metadata);

    expect(parsed?.toppings).toHaveLength(1);
    expect(parsed?.toppings[0]?.ingredient).toEqual(labelIngredient);
    expect(parsed?.toppings[0]?.ingredient).not.toHaveProperty('composition');
    expect(toppingIngredientIdentity(parsed!.toppings[0]!.ingredient)).toBe('catalog:label-sauce');
  });

  it('keeps topping substitution inside topping scope and merges a duplicate canonical target', () => {
    const [milk, sugar] = useRecipeStore.getState().items.map((item) => item.ingredient);
    useRecipeStore.getState().addTopping(milk!, 70);
    useRecipeStore.getState().addTopping(sugar!, 60);
    const [milkTopping] = useRecipeStore.getState().toppings;

    useRecipeStore.getState().replaceToppingIngredient(milkTopping!.id, sugar!);

    const state = useRecipeStore.getState();
    expect(state.toppings).toHaveLength(1);
    expect(state.toppings[0]).toMatchObject({
      planned_grams: 130,
      process_scope: 'POST_PROCESS_ADDON',
    });
    expect(toppingIngredientIdentity(state.toppings[0]!.ingredient)).toBe(
      canonicalIngredientId(sugar!),
    );
    expect(state.items).toHaveLength(DEFAULT_PRESET.items.length);
  });

  it('removes only the selected topping and round-trips the remaining topping scope through reload', () => {
    const initial = useRecipeStore.getState();
    const [milk, sugar] = initial.items.map((item) => item.ingredient);
    const baseBefore = structuredClone(initial.items);
    useRecipeStore.getState().addTopping(milk!, 70);
    useRecipeStore.getState().addTopping(sugar!, 60);
    const [removed, remaining] = useRecipeStore.getState().toppings;

    useRecipeStore.getState().removeTopping(removed!.id);
    const afterRemoval = useRecipeStore.getState();
    expect(afterRemoval.items).toEqual(baseBefore);
    expect(afterRemoval.toppings).toEqual([
      expect.objectContaining({
        id: remaining!.id,
        planned_grams: 60,
        process_scope: 'POST_PROCESS_ADDON',
      }),
    ]);

    const savedInput = buildRecipeInput(afterRemoval);
    const savedComposition = recipeCompositionFromState(afterRemoval);
    useRecipeStore.getState().loadPreset(DEFAULT_PRESET);
    useRecipeStore.getState().loadRecipeInput(savedInput, { composition: savedComposition });

    const reloaded = useRecipeStore.getState();
    expect(reloaded.items).toEqual(afterRemoval.items);
    expect(reloaded.toppings).toEqual(afterRemoval.toppings);
    expect(calculateRecipe(buildRecipeInput(reloaded))).toEqual(
      calculateRecipe(buildRecipeInput(afterRemoval)),
    );
  });

  it('preserves both manual orders and topping vector through Preview Apply and Undo', () => {
    const state = useRecipeStore.getState();
    const [milk, sugar] = state.items.map((item) => item.ingredient);
    useRecipeStore.getState().addTopping(milk!, 70);
    useRecipeStore.getState().addTopping(sugar!, 60);
    const lastBaseId = useRecipeStore.getState().baseOrder.at(-1)!;
    useRecipeStore.getState().moveBaseItem(lastBaseId, -1);
    const lastToppingId = useRecipeStore.getState().toppings.at(-1)!.id;
    useRecipeStore.getState().moveTopping(lastToppingId, -1);
    const beforeBaseOrder = [...useRecipeStore.getState().baseOrder];
    const beforeToppings = structuredClone(useRecipeStore.getState().toppings);
    useConstraintStudioStore.getState().resetForTests();
    useConstraintStudioStore.getState().createBatchRescalePreview(1200);
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useRecipeStore.getState().baseOrder).toEqual(beforeBaseOrder);
    expect(useRecipeStore.getState().toppings).toEqual(beforeToppings);
    useConstraintStudioStore.getState().undoLastApply();
    expect(useRecipeStore.getState().baseOrder).toEqual(beforeBaseOrder);
    expect(useRecipeStore.getState().toppings).toEqual(beforeToppings);
  });
});
