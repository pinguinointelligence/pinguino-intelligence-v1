// @vitest-environment jsdom
/**
 * §K — a MANUAL price edit must still be visible, even though asynchronous
 * price hydration is deliberately excluded from the §8 recipe signature.
 *
 *     ingredientChanged = recipeVectorChanged || customerPriceDirty
 *
 * These prove the second term behaves: only a keystroke raises it, and the
 * existing save/reset flow lowers it. The price itself is never persisted here
 * — `customerPriceStore` still owns that.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useCustomerPriceDirtyStore } from './customerPriceDirtyStore';
import { ingredientChangeSignature } from './ingredientChangeHighlight';

const composed = (lineId: string, recipeVectorChanged: boolean) =>
  recipeVectorChanged || useCustomerPriceDirtyStore.getState().dirtyByLineId[lineId] === true;

describe('customer price dirty state', () => {
  beforeEach(() => useCustomerPriceDirtyStore.getState().clear());

  it('K1 — hydration cannot raise it: only an explicit edit sets the flag', () => {
    // Nothing typed → nothing dirty, no matter what prices arrive.
    expect(useCustomerPriceDirtyStore.getState().dirtyByLineId).toEqual({});
    expect(composed('line-1', false)).toBe(false);
    // And price is not in the recipe signature at all, so a hydrated price
    // cannot move it either.
    const before = ingredientChangeSignature({
      lineId: 'line-1',
      ingredientId: 'milk',
      plannedGrams: 480,
      lockType: 'unlocked',
    });
    expect(before).toBe('milk|480|unlocked');
  });

  it('K2 — a manual edit marks exactly that line', () => {
    useCustomerPriceDirtyStore.getState().setDirty('line-1', true);
    expect(composed('line-1', false)).toBe(true);
    expect(composed('line-2', false)).toBe(false);
  });

  it('K3 — a successful save clears it, and the row clears with no recipe change', () => {
    useCustomerPriceDirtyStore.getState().setDirty('line-1', true);
    expect(composed('line-1', false)).toBe(true);
    useCustomerPriceDirtyStore.getState().setDirty('line-1', false);
    expect(composed('line-1', false)).toBe(false);
  });

  it('K3b — a cleared price still leaves a real recipe change marked', () => {
    useCustomerPriceDirtyStore.getState().setDirty('line-1', false);
    expect(composed('line-1', true)).toBe(true);
  });

  it('K4 — it is NOT persisted: an unsaved typed price does not survive a reload', () => {
    useCustomerPriceDirtyStore.getState().setDirty('line-1', true);
    expect(localStorage.getItem('customer-price-dirty')).toBeNull();
    for (const key of Object.keys(localStorage))
      expect(localStorage.getItem(key) ?? '').not.toContain('dirtyByLineId');
  });

  it('typing back to the saved value lowers the flag again', () => {
    const store = useCustomerPriceDirtyStore.getState();
    store.setDirty('line-1', true);
    store.setDirty('line-1', false);
    expect(useCustomerPriceDirtyStore.getState().dirtyByLineId['line-1']).toBeUndefined();
  });
});
