// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorLegacyInspection,
} from '@/features/product-intelligence/recipeBehaviorAuthority';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  DEFAULT_DIRECTION_TARGETS,
  useRecipeProfileStore,
} from '@/features/pro-workbench/recipeProfileStore';
import type { NewRecipeServingModeId } from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import {
  rebuildNewProRecipeStarter,
  requestNewRecipeProductTypeChange,
  startNewProRecipe,
} from './startNewProRecipe';

const PROFILE_CATEGORY = {
  gelato: 'milk_gelato',
  sorbet: 'sorbet',
  vegan: 'vegan_gelato',
  protein: 'protein_gelato',
} as const;

const NATIVE_MINUS_12 = {
  gelato: {
    templateId: 'milk_base_g17_minus12_v1',
    gramsByCanonicalId: {
      'PI-ING-000236': 599,
      'PI-ING-000180': 135,
      'PI-ING-000270': 43,
      'PI-ING-000514': 86,
      'PI-ING-000494': 80,
      'PI-ING-000456': 54,
      'PI-ING-000492': 3,
    },
  },
  sorbet: {
    templateId: 'S02',
    gramsByCanonicalId: {
      'PI-ING-001409': 161,
      'PI-ING-000514': 90,
      'PI-ING-000494': 90,
      'PI-ING-000456': 55,
      'PI-ING-000492': 4,
    },
  },
  vegan: {
    templateId: 'vegan_neutral_minus12_final',
    gramsByCanonicalId: {
      'PI-ING-001409': 397,
      'PI-ING-001565': 250,
      'PI-ING-000163': 53,
      'PI-ING-000514': 145,
      'PI-ING-000494': 100,
      'PI-ING-000456': 53,
      'PI-ING-000492': 2,
    },
  },
  protein: {
    templateId: 'protein_dairy_neutral_minus12_v1',
    gramsByCanonicalId: {
      'PI-ING-000236': 522,
      'PI-ING-000180': 114,
      'PI-ING-000264': 81,
      'PI-ING-001409': 104,
      'PI-ING-000514': 71,
      'PI-ING-000494': 106,
      'PI-ING-000492': 2,
    },
  },
} as const;

const ALL_PROFILE_TRANSITIONS = [
  ['gelato', 'sorbet'],
  ['gelato', 'vegan'],
  ['gelato', 'protein'],
  ['sorbet', 'gelato'],
  ['sorbet', 'vegan'],
  ['sorbet', 'protein'],
  ['vegan', 'gelato'],
  ['vegan', 'sorbet'],
  ['vegan', 'protein'],
  ['protein', 'gelato'],
  ['protein', 'sorbet'],
  ['protein', 'vegan'],
] as const satisfies readonly (readonly [VisibleProductType, VisibleProductType])[];

const SERVING_TEMPERATURE: Readonly<Record<NewRecipeServingModeId, number>> = {
  temp_minus_11: -11,
  temp_minus_12: -12,
  temp_minus_13: -13,
  fresh: -11,
};

const gramsByCanonicalId = () =>
  Object.fromEntries(
    useRecipeStore
      .getState()
      .items.map((item) => [
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        item.planned_grams,
      ]),
  );

const expectCleanStarter = (
  visibleProductType: VisibleProductType,
  servingModeId?: NewRecipeServingModeId,
) => {
  const recipe = useRecipeStore.getState();
  expect(recipe.visibleProductType).toBe(visibleProductType);
  expect(recipe.category).toBe(PROFILE_CATEGORY[visibleProductType]);
  expect(recipe.mode).toBe('classic');
  expect(recipe.formulation_strategy).toBe('optimal');
  expect(recipe.newRecipeStarterKey).toMatchObject({
    visibleProductType,
    formulationStrategy: 'optimal',
    ...(servingModeId ? { servingModeId } : {}),
  });
  if (servingModeId) {
    expect(recipe.servingModeId).toBe(servingModeId);
    expect(recipe.target_temperature_c).toBe(SERVING_TEMPERATURE[servingModeId]);
  }
  expect(recipe.items.length).toBeGreaterThan(0);
  expect(recipe.items.every((item) => item.lock_type === 'unlocked')).toBe(true);
  expect(recipe.toppings).toEqual([]);
  expect(recipe.productBehaviorSnapshots).toEqual({});
  expect(recipe.ownerReviewGate).toBeNull();
  expect(recipe.compositionMigrationAmbiguities).toEqual([]);
  expect(recipe.excludedIngredientIds).toEqual([]);
  expect(recipe.unavailableMainIngredientIds).toEqual([]);
  expect(recipe.savedRecipeId).toBeNull();
  expect(recipe.savedRecipeName).toBeNull();
  expect(recipe.currentVersionNumber).toBeNull();
  expect(recipe.savedRecipeLatestVersionNumber).toBeNull();
  expect(recipe.currentVersionId).toBeNull();
  expect(recipe.currentVersionDate).toBeNull();
  expect(recipe.practicalRecipeAudit).toBeNull();
  expect(recipe.savedProductionFingerprint).toBeNull();
  expect(recipe.dirty).toBe(false);

  const studio = useConstraintStudioStore.getState();
  expect(studio.constraints.byLineId).toEqual({});
  expect(studio.preview).toBeNull();
  expect(studio.previewIssue).toBeNull();
  expect(studio.history).toEqual([]);
  expect(studio.rescueAdvice).toBeNull();
  expect(studio.recalculationTerminal).toBeNull();
  expect(studio.proCoreRecipeId).toBeNull();
  expect(studio.lastSavedVersion).toBeNull();
  expect(useProductionSessionStore.getState().session).toBeNull();
  expect(useIngredientTableUxStore.getState().metaByLineId).toEqual({});
  expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
  expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
};

const contaminateWorkingRecipe = () => {
  const recipe = useRecipeStore.getState();
  const line = recipe.items[0]!;
  const snapshots = productBehaviorTestSnapshots(buildRecipeInput(recipe));
  recipe.setPlannedGrams(line.id, line.planned_grams + 9);
  recipe.setLockType(line.id, 'main');
  recipe.addTopping(line.ingredient, 17);
  useRecipeStore.setState({
    productBehaviorSnapshots: snapshots,
    compositionMigrationAmbiguities: [
      { lineId: line.id, reason: 'LEGACY_BEHAVIOR:historyczny produkt testowy' },
    ],
    ownerReviewGate: {
      status: 'OWNER_REVIEW_EDITABLE',
      productionStatus: 'PRODUCTION_BLOCKED',
      labelStatus: 'LABEL_BLOCKED',
      omittedToppingLineIds: [],
      technicalOnlyMainLineIds: [line.id],
    },
    savedRecipeId: 'old-recipe',
    savedRecipeName: 'Stara receptura',
    currentVersionNumber: 2,
    savedRecipeLatestVersionNumber: 5,
    currentVersionId: 'old-version',
    currentVersionDate: '2026-08-20T00:00:00.000Z',
    savedProductionFingerprint: 'old-production-fingerprint',
    dirty: true,
  });
  useConstraintStudioStore.setState({
    constraints: { byLineId: { [line.id]: { mode: 'locked', grams: line.planned_grams + 9 } } },
    proCoreRecipeId: 'old-recipe',
    lastSavedVersion: 5,
    preview: { stale: 'preview' } as never,
    previewIssue: { stale: 'issue' } as never,
    rescueAdvice: { stale: 'rescue' } as never,
    recalculationTerminal: { state: 'BLOCKED', code: 'old' } as never,
    history: [{ stale: 'apply' }] as never,
  });
  useProductionSessionStore.setState({ session: { sessionId: 'old-production' } as never });
  useIngredientTableUxStore.getState().toggleRequired(line.id);
  useIngredientTableUxStore.getState().markRequiredRemoved('old-required', 'Old required');
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const confirmProfileChange = (to: VisibleProductType) => {
  expect(requestNewRecipeProductTypeChange(to)).toBe('confirmation_required');
  startNewProRecipe(to);
};

describe('P0 working-recipe hard reset', () => {
  beforeEach(() => {
    localStorage.clear();
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
    useProductionSessionStore.getState().clear();
    useIngredientTableUxStore.getState().reset();
  });

  it.each(['gelato', 'sorbet', 'vegan', 'protein'] as const)(
    'New Recipe after a saved/dirty %s recipe keeps the current family and starts clean + OPTIMAL',
    (profile) => {
      startNewProRecipe(profile);
      contaminateWorkingRecipe();

      startNewProRecipe();

      expectCleanStarter(profile);
    },
  );

  it.each(
    Object.entries(NATIVE_MINUS_12) as [
      VisibleProductType,
      (typeof NATIVE_MINUS_12)[VisibleProductType],
    ][],
  )(
    'fresh %s exposes its native template, canonical PI identities, and exact grams',
    (profile, expected) => {
      startNewProRecipe(profile);

      expectCleanStarter(profile, 'temp_minus_12');
      expect(useRecipeStore.getState().newRecipeStarterTemplateId).toBe(expected.templateId);
      expect(gramsByCanonicalId()).toEqual(expected.gramsByCanonicalId);
    },
  );

  it('New Recipe after an unsaved dirty draft discards the draft and keeps only the current native starter', () => {
    startNewProRecipe('vegan');
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 31);
    useRecipeStore.setState({ savedRecipeName: 'Nigdy niezapisany szkic' });
    useConstraintStudioStore.setState({
      preview: { stale: 'dirty-preview' } as never,
      history: [{ stale: 'dirty-apply' }] as never,
    });

    startNewProRecipe();

    expectCleanStarter('vegan');
  });

  it.each(ALL_PROFILE_TRANSITIONS)(
    '%s → %s loads only the exact target-native starter after confirmation',
    (from, to) => {
      startNewProRecipe(from);
      const source = structuredClone({
        visibleProductType: useRecipeStore.getState().visibleProductType,
        category: useRecipeStore.getState().category,
        items: useRecipeStore.getState().items,
      });

      expect(requestNewRecipeProductTypeChange(to)).toBe('confirmation_required');
      expect(useRecipeStore.getState()).toMatchObject({
        visibleProductType: source.visibleProductType,
        category: source.category,
        items: source.items,
      });

      startNewProRecipe(to);

      expectCleanStarter(to, 'temp_minus_12');
      expect(useRecipeStore.getState().newRecipeStarterTemplateId).toBe(
        NATIVE_MINUS_12[to].templateId,
      );
      expect(gramsByCanonicalId()).toEqual(NATIVE_MINUS_12[to].gramsByCanonicalId);
    },
  );

  it('confirmed profile change clears Crown, exact locks, toppings, saved identity, and stale ProductBehavior warnings', () => {
    startNewProRecipe('gelato');
    contaminateWorkingRecipe();

    confirmProfileChange('sorbet');

    expectCleanStarter('sorbet');
    const recipe = useRecipeStore.getState();
    const authority = buildRecipeBehaviorAuthority({
      items: recipe.items,
      toppings: recipe.toppings,
      snapshots: recipe.productBehaviorSnapshots,
    });
    expect(recipeBehaviorLegacyInspection(authority, recipe.savedRecipeId)).toBe(false);
  });

  it('an opened saved recipe changes cross-family only through confirmed fresh replacement', () => {
    startNewProRecipe('gelato');
    const opened = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.getState().loadRecipeInput(opened, {
      savedId: 'saved-gelato',
      savedName: 'Saved Gelato',
      versionNumber: 3,
      latestVersionNumber: 3,
      versionId: 'version-3',
    });

    confirmProfileChange('vegan');

    expectCleanStarter('vegan');
    expect(opened.category).toBe('milk_gelato');
    expect(opened.items).not.toEqual(useRecipeStore.getState().items);
  });

  it('reopening a saved recipe after a hard reset restores its vector, Crown, locks, toppings, profile, mode, and version identity', () => {
    startNewProRecipe('protein');
    const protein = useRecipeStore.getState();
    protein.setLockType(protein.items[0]!.id, 'main');
    protein.setLockType(protein.items[1]!.id, 'grams');
    protein.addTopping(protein.items[2]!.ingredient, 13);
    useRecipeStore.setState({ formulation_strategy: 'eco' });
    const savedProtein = structuredClone(buildRecipeInput(useRecipeStore.getState()));
    const savedItems = structuredClone(savedProtein.items);
    const savedComposition = structuredClone(recipeCompositionFromState(useRecipeStore.getState()));

    startNewProRecipe('gelato');
    useRecipeStore.getState().loadRecipeInput(savedProtein, {
      savedId: 'saved-protein',
      savedName: 'Saved Protein',
      versionNumber: 7,
      latestVersionNumber: 7,
      versionId: 'protein-version-7',
      composition: savedComposition,
    });

    const reopened = useRecipeStore.getState();
    expect(reopened).toMatchObject({
      visibleProductType: 'protein',
      formulation_strategy: 'eco',
      savedRecipeId: 'saved-protein',
      savedRecipeName: 'Saved Protein',
      currentVersionNumber: 7,
      currentVersionId: 'protein-version-7',
      newRecipeStarterKey: null,
      dirty: false,
    });
    expect(reopened.items).toEqual(savedItems);
    expect(reopened.items.some((item) => item.lock_type === 'main')).toBe(true);
    expect(reopened.items.some((item) => item.lock_type === 'grams')).toBe(true);
    expect(reopened.toppings).toHaveLength(1);
    expect(reopened.toppings[0]?.planned_grams).toBe(13);
  });

  it.each(['temp_minus_11', 'temp_minus_12', 'temp_minus_13', 'fresh'] as const)(
    'fresh/native profile initialization is clean for %s',
    (servingModeId) => {
      startNewProRecipe('protein');
      contaminateWorkingRecipe();

      rebuildNewProRecipeStarter({
        visibleProductType: 'protein',
        servingModeId,
        formulationStrategy: 'optimal',
      });

      expectCleanStarter('protein', servingModeId);
    },
  );

  it('persists only the clean starter after reset, so reload cannot restore the old recipe warning or identity', () => {
    startNewProRecipe('sorbet');
    contaminateWorkingRecipe();
    startNewProRecipe();
    const cleanPersistedState = structuredClone(recipePersistPartialize(useRecipeStore.getState()));

    contaminateWorkingRecipe();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
    useProductionSessionStore.getState().clear();
    useIngredientTableUxStore.getState().reset();
    useRecipeStore.setState(cleanPersistedState);

    expectCleanStarter('sorbet');
    expect(useRecipeStore.getState().compositionMigrationAmbiguities).toEqual([]);
    expect(useRecipeStore.getState().savedRecipeId).toBeNull();
  });

  it('ignores a stored ECO preference for the default mode of every fresh recipe', () => {
    useRecipeProfileStore.getState().saveDefaults('local-device:gelato', {
      visibleProductType: 'gelato',
      mode: 'classic',
      formulationStrategy: 'eco',
      targetBatchGrams: 1_250,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Gelato −13°C',
      servingModeId: 'temp_minus_13',
      targetTemperatureC: -13,
      machineCapacityGrams: null,
      directionTargets: DEFAULT_DIRECTION_TARGETS,
    });
    useRecipeStore.setState({ visibleProductType: 'gelato', category: 'milk_gelato' });

    startNewProRecipe();

    expectCleanStarter('gelato', 'temp_minus_13');
    expect(useRecipeStore.getState().target_batch_grams).toBe(1_000);
    expect(useRecipeStore.getState().batch_source).toBe('PROFESSIONAL_DEFAULT');
  });
});
