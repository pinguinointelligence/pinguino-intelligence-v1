import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTION_TARGETS, useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  applyProfessionalStarterMachineSelection,
  isUntouchedNewRecipeStarter,
  rebuildNewProRecipeStarter,
  requestNewRecipeProductTypeChange,
  requestProfessionalStarterServingChange,
  requestNewRecipeStarterSettingsChange,
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

      startNewProRecipe(visibleProductType);

      const fresh = useRecipeStore.getState();
      expect(fresh.visibleProductType).toBe(visibleProductType);
      expect(fresh.category).toBe(category);
      expect(fresh.target_temperature_c).toBe(-12);
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
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
      preview: { old: true } as never,
      previewIssue: { old: true } as never,
      substitutionConsent: { old: true } as never,
      substitutionAuthorization: { old: true } as never,
      suggestedFixAuthorization: { old: true } as never,
      directionBestCandidate: { old: true } as never,
      directionConsent: { old: true } as never,
      blocked: { old: true } as never,
      feasibility: { old: true } as never,
      recalculationTerminal: { state: 'BLOCKED', code: 'old' } as never,
      history: [{ old: true }] as never,
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
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
    expect(useConstraintStudioStore.getState().substitutionConsent).toBeNull();
    expect(useConstraintStudioStore.getState().substitutionAuthorization).toBeNull();
    expect(useConstraintStudioStore.getState().suggestedFixAuthorization).toBeNull();
    expect(useConstraintStudioStore.getState().directionBestCandidate).toBeNull();
    expect(useConstraintStudioStore.getState().directionConsent).toBeNull();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().feasibility).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
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

  it('uses the canonical profile instead of inheriting the previously opened recipe', () => {
    useRecipeStore.setState({ visibleProductType: 'sorbet', category: 'sorbet' });

    startNewProRecipe();

    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
  });

  it('prefers an explicit account-level product-profile default over the canonical default', () => {
    useRecipeProfileStore.getState().saveDefaults('local-device', {
      visibleProductType: 'vegan',
      mode: 'classic',
      formulationStrategy: 'eco',
      targetBatchGrams: 1_275,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Vegan −13°C',
      servingModeId: 'temp_minus_13',
      targetTemperatureC: -13,
      machineCapacityGrams: null,
      directionTargets: DEFAULT_DIRECTION_TARGETS,
    });

    startNewProRecipe();

    const fresh = useRecipeStore.getState();
    expect(fresh.visibleProductType).toBe('vegan');
    expect(fresh.formulation_strategy).toBe('eco');
    expect(fresh.target_temperature_c).toBe(-13);
    expect(fresh.target_batch_grams).toBe(1_275);
  });

  it('rebuilds an untouched starter immediately for serving, strategy and mass changes', () => {
    startNewProRecipe('gelato');
    const minus12 = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' }))
      .toBe('starter_replaced');
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
    expect(useRecipeStore.getState().items).not.toEqual(minus12);

    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' }))
      .toBe('starter_replaced');
    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');

    expect(requestNewRecipeStarterSettingsChange({ targetBatchGrams: 1_275 }))
      .toBe('starter_replaced');
    expect(useRecipeStore.getState().target_batch_grams).toBe(1_275);
    expect(useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0))
      .toBe(1_275);
  });

  it('switches an untouched explicit starter from Home to Professional at the same temperature', () => {
    startNewProRecipe('gelato');
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'temp_minus_12',
      machineId: 'home-same-temperature',
      label: 'Home −12°C',
      temperatureC: -12,
      capacityGrams: 500,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();

    expect(
      requestProfessionalStarterServingChange(
        'temp_minus_12',
        'Maszyna profesjonalna',
      ),
    ).toBe('starter_replaced');
    expect(useRecipeStore.getState()).toMatchObject({
      machineKind: 'professional',
      servingModeId: 'temp_minus_12',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      target_temperature_c: -12,
      machine_capacity_grams: null,
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('applies the requested Professional context after confirming an edited starter rebuild', () => {
    startNewProRecipe('gelato');
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'temp_minus_12',
      machineId: 'home-edited-same-temperature',
      label: 'Home −12°C',
      temperatureC: -12,
      capacityGrams: 500,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);

    expect(
      requestProfessionalStarterServingChange(
        'temp_minus_12',
        'Maszyna profesjonalna',
      ),
    ).toBe('confirmation_required');
    expect(useRecipeStore.getState().machineKind).toBe('home');

    rebuildNewProRecipeStarter({ servingModeId: 'temp_minus_12' });
    applyProfessionalStarterMachineSelection(
      'temp_minus_12',
      'Maszyna profesjonalna',
    );
    useRecipeProfileStore.getState().acknowledgeRecalculation();
    expect(useRecipeStore.getState()).toMatchObject({
      machineKind: 'professional',
      servingModeId: 'temp_minus_12',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      target_temperature_c: -12,
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('does not misclassify account-price dirtiness as a material starter edit', () => {
    startNewProRecipe('gelato');
    const before = structuredClone(useRecipeStore.getState().items);
    useRecipeStore.setState({ dirty: true });

    expect(isUntouchedNewRecipeStarter()).toBe(true);
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' }))
      .toBe('starter_replaced');
    expect(useRecipeStore.getState().items).toEqual(before);
  });

  it('requires confirmation for an edited settings rebuild and Cancel is byte-identical', () => {
    startNewProRecipe('gelato');
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);
    const beforeItems = structuredClone(useRecipeStore.getState().items);
    const beforeTemperature = useRecipeStore.getState().target_temperature_c;

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' }))
      .toBe('confirmation_required');
    expect(useRecipeStore.getState().items).toEqual(beforeItems);
    expect(useRecipeStore.getState().target_temperature_c).toBe(beforeTemperature);

    rebuildNewProRecipeStarter({ servingModeId: 'temp_minus_13' });
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
    expect(isUntouchedNewRecipeStarter()).toBe(true);
  });

  it('does not silently restore a removed starter ingredient on a settings change', () => {
    startNewProRecipe('gelato');
    const removedLineId = useRecipeStore.getState().items[0]!.id;
    useRecipeStore.getState().removeItem(removedLineId);
    const afterRemoval = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' }))
      .toBe('confirmation_required');
    expect(useRecipeStore.getState().items).toEqual(afterRemoval);
    expect(useRecipeStore.getState().items.some((item) => item.id === removedLineId)).toBe(false);
  });

  it('treats a Main lock, Topping, and explicit unavailability as material starter edits', () => {
    startNewProRecipe('gelato');
    const mainLine = useRecipeStore.getState().items[0]!;
    // The behavior-authority gate normally owns Main selection in the UI; the
    // store-level role write isolates starter edit detection here.
    useRecipeStore.getState().setLockType(mainLine.id, 'main');
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' }))
      .toBe('confirmation_required');

    startNewProRecipe('gelato');
    const toppingIngredient = useRecipeStore.getState().items[0]!.ingredient;
    useRecipeStore.getState().addTopping(toppingIngredient, 0);
    expect(requestNewRecipeStarterSettingsChange({ targetBatchGrams: 5_000 }))
      .toBe('confirmation_required');

    startNewProRecipe('gelato');
    const unavailableLine = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().markIngredientUnavailable(unavailableLine.id);
    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'fresh' }))
      .toBe('confirmation_required');
  });

  it('treats Required/role metadata and pending direction work as material starter edits', () => {
    startNewProRecipe('gelato');
    const lineId = useRecipeStore.getState().items[0]!.id;
    useIngredientTableUxStore.getState().toggleRequired(lineId);

    expect(isUntouchedNewRecipeStarter()).toBe(false);
    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' }))
      .toBe('confirmation_required');

    startNewProRecipe('gelato');
    useRecipeProfileStore.getState().markRecalculationRequired();
    expect(isUntouchedNewRecipeStarter()).toBe(false);
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' }))
      .toBe('confirmation_required');
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
