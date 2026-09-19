import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { EngineIngredient, RecipeItem } from '@/engine';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore, type RecipeState } from './recipeStore';

const line = (id: string, ingredient: EngineIngredient): RecipeItem => ({
  id,
  ingredient,
  planned_grams: 125,
  actual_grams: null,
  lock_type: 'grams',
  grams_constraint: { grams: 125 },
});

describe('atomic Base ingredient replacement', () => {
  let prior: RecipeState;

  beforeEach(() => {
    prior = useRecipeStore.getState();
    useRecipeStore.setState({
      items: [],
      baseOrder: [],
      productBehaviorSnapshots: {},
      excludedIngredientIds: [],
      unavailableMainIngredientIds: [],
      compositionMigrationAmbiguities: [],
      dirty: false,
      draftRevision: 70,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();
  });

  afterEach(() => useRecipeStore.setState(prior, true));

  it('RPL-BASE-01 replaces in place and requires recalculation when facts change', () => {
    const milk = findDemoIngredient('milk_3_5')!;
    const cream = findDemoIngredient('cream_30')!;
    useRecipeStore.setState({ items: [line('line-milk', milk)], baseOrder: ['line-milk'] });

    const result = useRecipeStore.getState().replaceIngredient('line-milk', cream);
    const state = useRecipeStore.getState();

    expect(result).toEqual({
      status: 'replaced',
      lineId: 'line-milk',
      canonicalId: canonicalIngredientId(cream),
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: 'line-milk',
      ingredient: { id: cream.id },
      planned_grams: 125,
      lock_type: 'grams',
      grams_constraint: { grams: 125 },
    });
    expect(state.draftRevision).toBe(71);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });

  it('fails closed when the selected replacement already exists in another row', () => {
    const milk = findDemoIngredient('milk_3_5')!;
    const cream = findDemoIngredient('cream_30')!;
    useRecipeStore.setState({
      items: [line('line-milk', milk), line('line-cream', cream)],
      baseOrder: ['line-milk', 'line-cream'],
    });
    const before = useRecipeStore.getState();

    const result = before.replaceIngredient('line-milk', cream);

    expect(result).toEqual({
      status: 'duplicate',
      lineId: 'line-cream',
      canonicalId: canonicalIngredientId(cream),
    });
    expect(useRecipeStore.getState()).toBe(before);
    expect(useRecipeStore.getState().items).toHaveLength(2);
  });

  it('RPL-BASE-02 stores the exact new SKU and invalidates old results when its facts differ', () => {
    const base = findDemoIngredient('milk_3_5')!;
    const skuA: EngineIngredient = {
      ...base,
      id: 'sku-a',
      canonical_ingredient_id: 'PI-ING-MILK-35',
      private_product_id: 'sku-a',
      identity_provenance: 'private_product',
      name: 'MILK 3.5% · SKU A',
    };
    const skuB: EngineIngredient = {
      ...skuA,
      id: 'sku-b',
      private_product_id: 'sku-b',
      name: 'MILK 3.5% · SKU B',
      composition: {
        ...skuA.composition,
        fat_percent: skuA.composition.fat_percent + 1,
      },
    };
    useRecipeStore.setState({ items: [line('line-milk', skuA)], baseOrder: ['line-milk'] });

    expect(useRecipeStore.getState().replaceIngredient('line-milk', skuB).status).toBe('replaced');
    expect(useRecipeStore.getState().items).toHaveLength(1);
    expect(useRecipeStore.getState().items[0]?.ingredient).toMatchObject({
      canonical_ingredient_id: 'PI-ING-MILK-35',
      private_product_id: 'sku-b',
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });

  it('RPL-BASE-03 does not invalidate a calculated result for a fact-identical exact SKU', () => {
    const base = findDemoIngredient('milk_3_5')!;
    const skuA: EngineIngredient = {
      ...base,
      id: 'sku-a',
      canonical_ingredient_id: 'PI-ING-MILK-35',
      private_product_id: 'sku-a',
      identity_provenance: 'private_product',
    };
    const skuB: EngineIngredient = {
      ...skuA,
      id: 'sku-b',
      private_product_id: 'sku-b',
    };
    useRecipeStore.setState({ items: [line('line-milk', skuA)], baseOrder: ['line-milk'] });

    expect(useRecipeStore.getState().replaceIngredient('line-milk', skuB).status).toBe('replaced');
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });
});
