import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTION_TARGETS, useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  requestNewRecipeProductTypeChange,
  startNewProRecipe,
} from './startNewProRecipe';

describe('visible + Nowa receptura action', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    useProductionSessionStore.getState().clear();
    useMasterLabelStore.getState().clear();
    useIngredientTableUxStore.getState().reset();
    useCustomerPriceStore.getState().clear();
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

  it.each([
    ['gelato', 'milk_gelato', 1_000],
    ['sorbet', 'sorbet', 400],
    ['vegan', 'vegan_gelato', 1_000],
    ['protein', 'protein_gelato', 1_000],
  ] as const)(
    'loads the canonical neutral %s starter without inventing a flavour',
    (visibleProductType, category, expectedMass) => {
      useRecipeStore.setState({ visibleProductType, category });

      startNewProRecipe();

      const fresh = useRecipeStore.getState();
      expect(fresh.visibleProductType).toBe(visibleProductType);
      expect(fresh.category).toBe(category);
      expect(fresh.target_temperature_c).toBe(-12);
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
      expect(fresh.items.some((item) => item.lock_type === 'main')).toBe(false);
      expect(fresh.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(
        expectedMass,
        6,
      );
      if (visibleProductType === 'sorbet' || visibleProductType === 'vegan') {
        expect(
          fresh.items.some((item) => /milk|cream|whey|casein/i.test(item.ingredient.name)),
        ).toBe(false);
      }
      if (visibleProductType === 'protein') {
        expect(
          fresh.items.some((item) => item.ingredient.canonical_ingredient_id === 'PI-ING-000264'),
        ).toBe(true);
      }
    },
  );

  it('clears every recipe-specific sidecar while retaining account-private prices and defaults', () => {
    const previous = useRecipeStore.getState();
    previous.addTopping(previous.items[0]!.ingredient, 12);
    useConstraintStudioStore.setState({
      constraints: {
        byLineId: {
          [previous.items[0]!.id]: { mode: 'locked', grams: previous.items[0]!.planned_grams },
        },
      },
      proCoreRecipeId: 'old-recipe',
      lastSavedVersion: 8,
    });
    useProductionSessionStore.setState({ session: { sessionId: 'old-production' } as never });
    useMasterLabelStore.setState({ label: { productName: 'Old label' } as never });
    useIngredientTableUxStore.getState().markRequiredRemoved('missing-line', 'Old missing line');
    const privatePrice = {
      overrideId: 'private-price',
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.23,
      currency: 'EUR',
      createdBy: 'owner-a',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    };
    useCustomerPriceStore.setState({
      activeOwnerUserId: 'owner-a',
      overridesByCanonicalId: { [privatePrice.canonicalIngredientId]: privatePrice },
      status: 'ready',
    });
    useRecipeProfileStore.getState().saveDefaults('local-device:gelato', {
      visibleProductType: 'gelato',
      mode: 'classic',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_100,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      servingModeId: 'temp_minus_12',
      targetTemperatureC: -12,
      machineCapacityGrams: null,
      directionTargets: DEFAULT_DIRECTION_TARGETS,
    });

    startNewProRecipe();

    expect(useRecipeStore.getState().toppings).toEqual([]);
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual({});
    expect(useConstraintStudioStore.getState().constraints.byLineId).toEqual({});
    expect(useConstraintStudioStore.getState().history).toEqual([]);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBeNull();
    expect(useConstraintStudioStore.getState().lastSavedVersion).toBeNull();
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useMasterLabelStore.getState().label).toBeNull();
    expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
    expect(useCustomerPriceStore.getState().overridesByCanonicalId).toEqual({
      [privatePrice.canonicalIngredientId]: privatePrice,
    });
    expect(useRecipeProfileStore.getState().defaultsFor('local-device:gelato')).not.toBeNull();
  });

  it('replaces an untouched explicit starter when the product type changes', () => {
    startNewProRecipe();

    expect(requestNewRecipeProductTypeChange('sorbet')).toBe('starter_replaced');

    const changed = useRecipeStore.getState();
    expect(changed.visibleProductType).toBe('sorbet');
    expect(changed.category).toBe('sorbet');
    expect(changed.newRecipeStarterTemplateId).toBe('S02');
    expect(changed.items.some((item) => /milk|cream/i.test(item.ingredient.name))).toBe(false);
  });

  it('requires confirmation before replacing an edited starter', () => {
    startNewProRecipe();
    const firstLine = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(firstLine.id, firstLine.planned_grams + 1);

    expect(requestNewRecipeProductTypeChange('vegan')).toBe('confirmation_required');
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');

    startNewProRecipe('vegan');
    expect(useRecipeStore.getState().visibleProductType).toBe('vegan');
  });

  it('never injects a starter into an opened saved recipe during a profile switch', () => {
    const before = structuredClone(useRecipeStore.getState().items);
    useRecipeStore.getState().loadRecipeInput(
      {
        items: before,
        mode: 'classic',
        category: 'milk_gelato',
        target_temperature_c: -12,
        target_batch_grams: 1_000,
        machine_capacity_grams: null,
      },
      { savedId: 'saved-existing', savedName: 'Existing', versionNumber: 2 },
    );

    expect(requestNewRecipeProductTypeChange('sorbet')).toBe('recipe_profile_changed');
    expect(useRecipeStore.getState().newRecipeStarterTemplateId).toBeNull();
    expect(useRecipeStore.getState().items).toEqual(before);
  });
});
