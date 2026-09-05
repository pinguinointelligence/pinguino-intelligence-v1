import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTION_TARGETS,
  useRecipeProfileStore,
} from '@/features/pro-workbench/recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
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
    useIngredientTableUxStore.getState().reset();
    useCustomerPriceStore.getState().clear();
  });

  it('detaches the previous saved draft, applies the Professional 1000 g default, and starts OPTIMAL', () => {
    const previous = useRecipeStore.getState();
    const savedInput = {
      items: previous.items.map((item) => ({ ...item, ingredient: { ...item.ingredient } })),
      mode: previous.mode,
      category: previous.category,
      target_temperature_c: previous.target_temperature_c,
      target_batch_grams: 875,
      machine_capacity_grams: previous.machine_capacity_grams,
    };
    previous.loadRecipeInput(savedInput, {
      savedId: 'saved-old',
      savedName: 'Nie zmieniaj',
      versionNumber: 4,
    });
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
    expect(fresh.target_batch_grams).toBe(1_000);
    expect(fresh.batch_source).toBe('PROFESSIONAL_DEFAULT');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(useRecipeProfileStore.getState().directionIntents.sweetness).toBe(-2);
    expect(savedInput.target_batch_grams).toBe(875);
  });

  it.each([
    ['gelato', 'milk_gelato', 'milk_base_g17_minus12_v1', 1_000],
    ['sorbet', 'sorbet', 'S02', 400],
    ['vegan', 'vegan_gelato', 'vegan_neutral_minus12_final', 1_000],
    ['protein', 'protein_gelato', 'protein_dairy_neutral_minus12_v1', 1_000],
  ] as const)(
    'loads the canonical neutral %s starter without inventing a flavour',
    (visibleProductType, category, templateId, expectedMass) => {
      useRecipeStore.setState({ visibleProductType, category });

      startNewProRecipe(visibleProductType);

      const fresh = useRecipeStore.getState();
      expect(fresh.visibleProductType).toBe(visibleProductType);
      expect(fresh.category).toBe(category);
      expect(fresh.newRecipeStarterTemplateId).toBe(templateId);
      expect(fresh.newRecipeStarterKey?.visibleProductType).toBe(visibleProductType);
      expect(fresh.target_temperature_c).toBe(-12);
      expect(fresh.formulation_strategy).toBe('optimal');
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

  it('requires confirmation before Gelato → Protein and loads canonical P12 only after confirm', () => {
    startNewProRecipe('gelato');
    const gelato = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeProductTypeChange('protein')).toBe('confirmation_required');
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(useRecipeStore.getState().items).toEqual(gelato);

    startNewProRecipe('protein');

    const fresh = useRecipeStore.getState();
    expect(fresh.visibleProductType).toBe('protein');
    expect(fresh.category).toBe('protein_gelato');
    expect(fresh.newRecipeStarterTemplateId).toBe('protein_dairy_neutral_minus12_v1');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(
      Object.fromEntries(
        fresh.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      'PI-ING-000236': 522,
      'PI-ING-000180': 114,
      'PI-ING-000264': 81,
      'PI-ING-001409': 104,
      'PI-ING-000514': 71,
      'PI-ING-000494': 106,
      'PI-ING-000492': 2,
    });
  });

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
    expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
    expect(useCustomerPriceStore.getState().overridesByCanonicalId).toEqual({
      [privatePrice.canonicalIngredientId]: privatePrice,
    });
    expect(useRecipeProfileStore.getState().defaultsFor('local-device:gelato')).not.toBeNull();
  });

  it('never replaces an untouched starter before profile confirmation', () => {
    startNewProRecipe();
    const gelato = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeProductTypeChange('sorbet')).toBe('confirmation_required');
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(useRecipeStore.getState().items).toEqual(gelato);

    startNewProRecipe('sorbet');

    const changed = useRecipeStore.getState();
    expect(changed.visibleProductType).toBe('sorbet');
    expect(changed.category).toBe('sorbet');
    expect(changed.newRecipeStarterTemplateId).toBe('S02');
    expect(changed.items.some((item) => /milk|cream/i.test(item.ingredient.name))).toBe(false);
  });

  it('treats selecting the already-active profile as a no-op', () => {
    startNewProRecipe('protein');
    const before = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeProductTypeChange('protein')).toBe('no_change');
    expect(useRecipeStore.getState().items).toEqual(before);
  });

  it.each([
    ['gelato', 'milk_gelato'],
    ['sorbet', 'sorbet'],
    ['vegan', 'vegan_gelato'],
    ['protein', 'protein_gelato'],
  ] as const)(
    'preserves the current %s family when + Nowa receptura supplies that context',
    (visibleProductType, category) => {
      const distinctiveItems = useRecipeStore.getState().items.map((item, index) => ({
        ...item,
        planned_grams: index === 0 ? 777 : item.planned_grams,
      }));
      useRecipeStore.setState({
        visibleProductType,
        category,
        formulation_strategy: 'eco',
        items: distinctiveItems,
        savedRecipeId: 'source-recipe',
        savedRecipeName: 'Source name',
        currentVersionNumber: 7,
      });
      const source = useRecipeStore.getState();
      const sourceSnapshot = structuredClone({
        items: source.items,
        savedRecipeId: source.savedRecipeId,
        savedRecipeName: source.savedRecipeName,
        currentVersionNumber: source.currentVersionNumber,
        formulation_strategy: source.formulation_strategy,
      });

      startNewProRecipe(visibleProductType);

      const fresh = useRecipeStore.getState();
      expect(fresh.visibleProductType).toBe(visibleProductType);
      expect(fresh.category).toBe(category);
      expect(fresh.formulation_strategy).toBe('optimal');
      expect(fresh.savedRecipeId).toBeNull();
      expect(fresh.savedRecipeName).toBeNull();
      expect(fresh.currentVersionNumber).toBeNull();
      expect(fresh.items).not.toEqual(sourceSnapshot.items);
      expect(sourceSnapshot).toMatchObject({
        savedRecipeId: 'source-recipe',
        savedRecipeName: 'Source name',
        currentVersionNumber: 7,
        formulation_strategy: 'eco',
      });
      expect(sourceSnapshot.items[0]?.planned_grams).toBe(777);
    },
  );

  it.each(['eco', 'optimal'] as const)(
    'reopens a saved %s recipe with its persisted mode',
    (mode) => {
      const current = useRecipeStore.getState();
      current.loadRecipeInput(
        {
          items: structuredClone(current.items),
          mode: 'classic',
          category: current.category,
          target_temperature_c: current.target_temperature_c,
          target_batch_grams: current.target_batch_grams,
          machine_capacity_grams: null,
          goals: { formulation_strategy: mode },
        },
        { savedId: `saved-${mode}`, savedName: `Saved ${mode}`, versionNumber: 2 },
      );

      expect(useRecipeStore.getState().formulation_strategy).toBe(mode);
    },
  );

  it('reopens a saved Protein ECO recipe as Protein ECO with its P12 ingredient identities', () => {
    startNewProRecipe('protein');
    const protein = useRecipeStore.getState();
    const savedItems = structuredClone(protein.items);

    protein.loadRecipeInput(
      {
        items: savedItems,
        mode: 'classic',
        category: 'protein_gelato',
        target_temperature_c: -12,
        target_batch_grams: 1_000,
        machine_capacity_grams: null,
        goals: { formulation_strategy: 'eco' },
      },
      { savedId: 'saved-protein-eco', savedName: 'Saved Protein ECO', versionNumber: 3 },
    );

    const reopened = useRecipeStore.getState();
    expect(reopened.visibleProductType).toBe('protein');
    expect(reopened.category).toBe('protein_gelato');
    expect(reopened.formulation_strategy).toBe('eco');
    expect(reopened.newRecipeStarterTemplateId).toBeNull();
    expect(reopened.items).toEqual(savedItems);
    expect(
      reopened.items.some((item) => item.ingredient.canonical_ingredient_id === 'PI-ING-000264'),
    ).toBe(true);
  });

  it('uses OPTIMAL for a new/reset draft even when an old account default says ECO', () => {
    useRecipeProfileStore.getState().saveDefaults('local-device:gelato', {
      visibleProductType: 'gelato',
      mode: 'classic',
      formulationStrategy: 'eco',
      targetBatchGrams: 1_000,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      servingModeId: 'temp_minus_12',
      targetTemperatureC: -12,
      machineCapacityGrams: null,
      directionTargets: DEFAULT_DIRECTION_TARGETS,
    });

    useRecipeStore.getState().resetToDemo();
    expect(useRecipeStore.getState().formulation_strategy).toBe('optimal');

    const current = useRecipeStore.getState();
    current.loadRecipeInput({
      items: structuredClone(current.items),
      mode: 'classic',
      category: current.category,
      target_temperature_c: current.target_temperature_c,
      target_batch_grams: current.target_batch_grams,
      machine_capacity_grams: null,
    });
    expect(useRecipeStore.getState().formulation_strategy).toBe('optimal');
  });

  it('does not let an account-level default redirect New Recipe away from the current family', () => {
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
    expect(fresh.visibleProductType).toBe('gelato');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(fresh.target_temperature_c).toBe(-12);
    expect(fresh.target_batch_grams).toBe(1_000);
  });

  it('rebuilds an untouched starter immediately for serving, strategy and mass changes', () => {
    startNewProRecipe('gelato');
    const minus12 = structuredClone(useRecipeStore.getState().items);

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' })).toBe(
      'starter_replaced',
    );
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
    expect(useRecipeStore.getState().items).not.toEqual(minus12);

    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' })).toBe(
      'starter_replaced',
    );
    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');

    expect(requestNewRecipeStarterSettingsChange({ targetBatchGrams: 1_275 })).toBe(
      'starter_replaced',
    );
    expect(useRecipeStore.getState().target_batch_grams).toBe(1_275);
    expect(useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
      1_275,
    );
  });

  it('switches an untouched explicit starter from Home to Professional at the same temperature', () => {
    startNewProRecipe('gelato');
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'temp_minus_12',
      machineId: 'home-same-temperature',
      label: 'Home −12°C',
      temperatureC: -12,
      hardCapacityGrams: 500,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();

    expect(requestProfessionalStarterServingChange('temp_minus_12', 'Maszyna profesjonalna')).toBe(
      'starter_replaced',
    );
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
      hardCapacityGrams: 500,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);

    expect(requestProfessionalStarterServingChange('temp_minus_12', 'Maszyna profesjonalna')).toBe(
      'confirmation_required',
    );
    expect(useRecipeStore.getState().machineKind).toBe('home');

    rebuildNewProRecipeStarter({ servingModeId: 'temp_minus_12' });
    applyProfessionalStarterMachineSelection('temp_minus_12', 'Maszyna profesjonalna');
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
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' })).toBe(
      'starter_replaced',
    );
    expect(useRecipeStore.getState().items).toEqual(before);
  });

  it('requires confirmation for an edited settings rebuild and Cancel is byte-identical', () => {
    startNewProRecipe('gelato');
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);
    const beforeItems = structuredClone(useRecipeStore.getState().items);
    const beforeTemperature = useRecipeStore.getState().target_temperature_c;

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' })).toBe(
      'confirmation_required',
    );
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

    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' })).toBe(
      'confirmation_required',
    );
    expect(useRecipeStore.getState().items).toEqual(afterRemoval);
    expect(useRecipeStore.getState().items.some((item) => item.id === removedLineId)).toBe(false);
  });

  it('treats a Main lock, Topping, and explicit unavailability as material starter edits', () => {
    startNewProRecipe('gelato');
    const mainLine = useRecipeStore.getState().items[0]!;
    // The behavior-authority gate normally owns Main selection in the UI; the
    // store-level role write isolates starter edit detection here.
    useRecipeStore.getState().setLockType(mainLine.id, 'main');
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' })).toBe(
      'confirmation_required',
    );

    startNewProRecipe('gelato');
    const toppingIngredient = useRecipeStore.getState().items[0]!.ingredient;
    useRecipeStore.getState().addTopping(toppingIngredient, 0);
    expect(requestNewRecipeStarterSettingsChange({ targetBatchGrams: 5_000 })).toBe(
      'confirmation_required',
    );

    startNewProRecipe('gelato');
    const unavailableLine = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().markIngredientUnavailable(unavailableLine.id);
    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'fresh' })).toBe(
      'confirmation_required',
    );
  });

  it('treats Required/role metadata and pending direction work as material starter edits', () => {
    startNewProRecipe('gelato');
    const lineId = useRecipeStore.getState().items[0]!.id;
    useIngredientTableUxStore.getState().toggleRequired(lineId);

    expect(isUntouchedNewRecipeStarter()).toBe(false);
    expect(requestNewRecipeStarterSettingsChange({ servingModeId: 'temp_minus_13' })).toBe(
      'confirmation_required',
    );

    startNewProRecipe('gelato');
    useRecipeProfileStore.getState().markRecalculationRequired();
    expect(isUntouchedNewRecipeStarter()).toBe(false);
    expect(requestNewRecipeStarterSettingsChange({ formulationStrategy: 'eco' })).toBe(
      'confirmation_required',
    );
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

  it('never relabels an opened saved recipe when its target profile needs another base', () => {
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

    expect(requestNewRecipeProductTypeChange('sorbet')).toBe('confirmation_required');
    expect(useRecipeStore.getState().newRecipeStarterTemplateId).toBeNull();
    expect(useRecipeStore.getState().items).toEqual(before);
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(useRecipeStore.getState().category).toBe('milk_gelato');
  });
});
