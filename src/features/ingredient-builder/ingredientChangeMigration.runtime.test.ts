// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('recalculation marker reopen boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('ignores every persisted legacy baseline and starts with no marker evidence', async () => {
    localStorage.setItem(
      'pinguino-ingredient-change-baseline',
      JSON.stringify({ state: { baselineByLineId: { apple: 'stale' } }, version: 3 }),
    );
    const { useIngredientChangeStore } = await import('./ingredientChangeStore');
    expect(useIngredientChangeStore.getState().changedByLastRecalculation).toEqual([]);
  });

  it('does not persist the current Recalculate result', async () => {
    const { useIngredientChangeStore } = await import('./ingredientChangeStore');
    useIngredientChangeStore.getState().captureRecalculation(['milk', 'cream']);
    expect(useIngredientChangeStore.getState().changedByLastRecalculation).toEqual([
      'milk',
      'cream',
    ]);
    expect(localStorage.getItem('pinguino-ingredient-change-baseline')).toBeNull();
  });
});
