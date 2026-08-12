import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTION_TARGETS, useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { startNewProRecipe } from './startNewProRecipe';

describe('visible + Nowa receptura action', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
  });

  it('detaches the previous saved draft and applies per-product account defaults', () => {
    const previous = useRecipeStore.getState();
    const savedInput = {
      items: previous.items.map((item) => ({ ...item, ingredient: { ...item.ingredient } })),
      mode: previous.mode,
      category: previous.category,
      target_temperature_c: previous.target_temperature_c,
      target_batch_grams: 875,
      machine_capacity_grams: previous.machine_capacity_grams,
    };
    previous.loadRecipeInput(
      savedInput,
      { savedId: 'saved-old', savedName: 'Nie zmieniaj', versionNumber: 4 },
    );
    useRecipeProfileStore.getState().saveDefaults('local-device:gelato', {
      visibleProductType: 'gelato',
      mode: 'classic',
      formulationStrategy: 'eco',
      targetBatchGrams: 1_200,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Gelato −12°C',
      servingModeId: 'temp_minus_12',
      targetTemperatureC: -12,
      machineCapacityGrams: null,
      directionTargets: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -1 },
      directionIntents: { sweetness: -2, softness: 0, creaminess: 0, flavor: 0 },
    });

    startNewProRecipe();

    const fresh = useRecipeStore.getState();
    expect(fresh.savedRecipeId).toBeNull();
    expect(fresh.savedRecipeName).toBeNull();
    expect(fresh.target_batch_grams).toBe(1_200);
    expect(fresh.formulation_strategy).toBe('eco');
    expect(useRecipeProfileStore.getState().directionIntents.sweetness).toBe(-2);
    expect(savedInput.target_batch_grams).toBe(875);
  });
});
