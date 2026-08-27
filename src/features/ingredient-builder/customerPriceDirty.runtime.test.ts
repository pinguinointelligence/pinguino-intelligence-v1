// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useCustomerPriceDirtyStore } from './customerPriceDirtyStore';
import { useIngredientChangeStore } from './ingredientChangeStore';

describe('customer price dirty state is not a Recalculate marker', () => {
  beforeEach(() => {
    useCustomerPriceDirtyStore.getState().clear();
    useIngredientChangeStore.getState().clearRecalculation();
  });

  it('a manual price edit stays local to the price editor', () => {
    useCustomerPriceDirtyStore.getState().setDirty('apple', true);
    expect(useCustomerPriceDirtyStore.getState().dirtyByLineId.apple).toBe(true);
    expect(useIngredientChangeStore.getState().changedByLastRecalculation).toEqual([]);
  });

  it('price hydration and save cannot move a captured Recalculate result', () => {
    useIngredientChangeStore.getState().captureRecalculation(['milk']);
    useCustomerPriceDirtyStore.getState().setDirty('apple', true);
    useCustomerPriceDirtyStore.getState().setDirty('apple', false);
    expect(useIngredientChangeStore.getState().changedByLastRecalculation).toEqual(['milk']);
  });
});
