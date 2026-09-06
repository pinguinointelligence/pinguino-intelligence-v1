/** @vitest-environment jsdom */
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, proposeCorrections } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  listActiveHomeMachines,
  MACHINE_CATALOG,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { buildDirectPercentEdit } from '@/features/ingredient-builder/directPercentEdit';
import { MobileIngredientLine } from '@/features/ingredient-builder/IngredientLineControls';
import { buildRecipeInput, recipeContext } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import {
  profileSettingsSignature,
  recipeProfilePersistPartialize,
  savedRecipeProfileDraftIdentity,
  useRecipeProfileStore,
} from './recipeProfileStore';
import { buildCurrentRecipeResultAuthority } from './currentRecipeResultAuthority';
import { RecipeProfilePanel } from './RecipeProfilePanel';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const topping: CatalogLabelToppingIngredient = {
  kind: 'catalog_label_topping',
  id: 'catalog:owner-regression-topping',
  canonical_ingredient_id: 'catalog:owner-regression-topping',
  private_product_id: 'catalog:owner-regression-topping:v1',
  name: 'Owner regression topping',
  catalog_product_id: 'owner-regression-topping',
  catalog_version_id: 'v1',
  verification_status: 'verified',
  label_nutrition_per_100g: {
    basis: 'per_100g',
    energyKcal: 220,
    fat: 8,
    saturatedFat: 4,
    carbohydrate: 31,
    sugars: 24,
    protein: 3,
    salt: 0.1,
    fibre: 2,
  },
  ingredients_text: 'Owner regression topping',
  allergens_text: '',
  cost_per_kg: 14,
  cost_currency: 'EUR',
};

const currentInput = () => buildRecipeInput(useRecipeStore.getState());

const currentSettingsSignature = (): string => {
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  return profileSettingsSignature(
    profileSnapshotFromState(recipe, recipe.direction_targets, profile.directionIntents),
  );
};

const confirmCurrentSettings = (): string => {
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  const identity = profile.activeDraftIdentity!;
  profile.confirmSettings(currentSettingsSignature(), identity, recipe.draftContextSeq);
  return identity;
};

const currentSettingsConfirmed = (): boolean => {
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  return (
    profile.activeDraftIdentity !== null &&
    profile.isConfirmed(
      currentSettingsSignature(),
      profile.activeDraftIdentity,
      recipe.draftContextSeq,
    )
  );
};

const baseCurrentAuthority = () => {
  const recipe = useRecipeStore.getState();
  return buildCurrentRecipeResultAuthority({
    recipe: currentInput(),
    toppings: [],
    snapshots: recipe.productBehaviorSnapshots,
    draftRevision: recipe.draftRevision,
    awaitingRecalculation: useRecipeProfileStore.getState().awaitingRecalculation,
    loading: false,
  });
};

const establishCurrent = (): void => {
  useRecipeProfileStore.getState().acknowledgeRecalculation();
  const authority = baseCurrentAuthority();
  expect(authority.ready).toBe(true);
  useRecipeProfileStore.getState().recordCalculatedRecipe({
    draftIdentity: useRecipeProfileStore.getState().activeDraftIdentity!,
    recipeFingerprint: authority.recipeFingerprint,
    behaviorFingerprint: authority.behaviorFingerprint,
  });
};

const renderProfile = (): string => {
  const input = currentInput();
  return renderToStaticMarkup(
    <RecipeProfilePanel
      activeTab="profile"
      onTabChange={() => undefined}
      result={calculateRecipe(input)}
      servingTemperatureC={input.target_temperature_c}
      corrections={proposeCorrections({ input, context: recipeContext(input), redact: false })}
      input={input}
      idPrefix="owner-state-regression"
      showTabs={false}
      onOpenPreview={() => undefined}
      onRecalculate={() => undefined}
    />,
  );
};

beforeEach(() => {
  useSessionStore.setState({ plan: 'pro' });
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
  const input = starterMilkBase();
  useRecipeStore.getState().loadRecipeInput(input);
  useRecipeStore.setState({
    productBehaviorSnapshots: productBehaviorTestSnapshots(input),
    dirty: false,
    toppings: [],
  });
  establishCurrent();
  confirmCurrentSettings();
});

describe('owner matrix A–F: base mutations preserve settings and publish the live draft', () => {
  const cases: Array<[string, () => void]> = [
    [
      'A grams',
      () => {
        const line = useRecipeStore.getState().items[0]!;
        useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);
      },
    ],
    [
      'B add ingredient',
      () => useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 5),
    ],
    [
      'C remove ingredient',
      () => useRecipeStore.getState().removeItem(useRecipeStore.getState().items[1]!.id),
    ],
    [
      'D Main/Crown',
      () =>
        useRecipeStore.setState((state) => ({
          items: state.items.map((item, index) =>
            index === 0 ? { ...item, lock_type: 'main' as const } : item,
          ),
          dirty: true,
          draftRevision: state.draftRevision + 1,
        })),
    ],
    ['E Słodycz', () => useRecipeStore.getState().setDirectionTarget('sweetness', 1)],
    ['F Twardość', () => useRecipeStore.getState().setDirectionTarget('softness', -1)],
  ];

  it.each(cases)('%s', (_name, mutate) => {
    const confirmedIdentity = useRecipeProfileStore.getState().activeDraftIdentity;
    mutate();
    const mutatedInput = currentInput();
    useRecipeStore.setState({
      productBehaviorSnapshots: productBehaviorTestSnapshots(mutatedInput),
    });

    expect(useRecipeProfileStore.getState().activeDraftIdentity).toBe(confirmedIdentity);
    expect(currentSettingsConfirmed()).toBe(true);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(baseCurrentAuthority()).toMatchObject({
      state: 'STALE',
      ready: false,
      baseTechnicalReady: true,
      nutritionReady: true,
      costReady: true,
    });
    const html = renderProfile();
    expect(html).toContain('data-testid="profile-direction-axes"');
    expect(html).toContain('Słodycz');
    expect(html).toContain('Twardość');
    expect(html).not.toContain('friendly-lab-recipe-stale');
  });

  it('keeps batch, percentage, Monitor, Score, kcal and cost visible through the five live edits', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const renderLiveDraft = async () => {
      const input = currentInput();
      const result = calculateRecipe(input);
      const first = result.items[0]!;
      await act(async () => {
        root.render(
          <>
            <MobileIngredientLine
              item={first}
              percent={(first.effective_grams / result.total_batch_g) * 100}
              isMain={first.lock_type === 'main'}
              required={false}
              unavailable={false}
              estimated={false}
              changed
              missingAmount={false}
              onSetMain={() => undefined}
              onOpen={() => undefined}
            />
            <WorkbenchIntelligenceHeader
              result={result}
              input={input}
              onRecalculate={() => undefined}
              variant="dock"
            />
            <RecipeProfilePanel
              activeTab="profile"
              onTabChange={() => undefined}
              result={result}
              servingTemperatureC={input.target_temperature_c}
              corrections={proposeCorrections({
                input,
                context: recipeContext(input),
                redact: false,
              })}
              input={input}
              idPrefix="live-five-profile"
              showTabs={false}
              onOpenPreview={() => undefined}
              onRecalculate={() => undefined}
            />
            <RecipeProfilePanel
              activeTab="monitor"
              onTabChange={() => undefined}
              result={result}
              servingTemperatureC={input.target_temperature_c}
              corrections={proposeCorrections({
                input,
                context: recipeContext(input),
                redact: false,
              })}
              input={input}
              idPrefix="live-five-monitor"
              showTabs={false}
              onOpenPreview={() => undefined}
              onRecalculate={() => undefined}
            />
          </>,
        );
      });
      return { input, result, first };
    };

    const assertLive = async () => {
      const { input, result, first } = await renderLiveDraft();
      const expected = calculateFinalProduct(input);
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
      expect(
        host
          .querySelector('[data-testid="workbench-intelligence-header"]')
          ?.getAttribute('data-current-result-state'),
      ).toBe('STALE');
      expect(host.querySelector('[data-testid="workbench-score-ring"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="pro-workbar-recalc"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="monitor-live-summary"]')).not.toBeNull();
      // SUPERSEDED, owner authority 2026-09-02 (approved desktop PDF §5). This
      // read the live base mass off `Baza receptury` inside Settings — a
      // duplicate of a number the LEFT column already owns as „Baza lodowa",
      // now removed. This host renders the PANEL only, so that mass is no
      // longer observable from here at all. What Settings does own is the
      // TARGET batch. The owner then removed that field too, so no surface
      // prints the batch any more. What must stay true is that the batch
      // AUTHORITY keeps tracking the live recipe through all five edits —
      // asserted on the store, which is where it now lives alone.
      expect(useRecipeStore.getState().target_batch_grams).toBeGreaterThan(0);
      expect(
        host.querySelector(`[data-testid="row-mobile-percent-${first.id}"]`)?.textContent,
      ).toContain(`${((first.effective_grams / result.total_batch_g) * 100).toFixed(1)} %`);
      expect(host.textContent).toContain(
        `${expected.finalLabelNutritionPer100g?.kcal.toFixed(0)}kcal / 100 g`,
      );
      expect(host.textContent).toContain(`${expected.finalCosts?.cost_per_kg?.toFixed(2)} €za kg`);
    };

    try {
      const first = useRecipeStore.getState().items[0]!;
      useRecipeStore.getState().setPlannedGrams(first.id, first.planned_grams + 1);
      await assertLive();

      useRecipeStore.getState().setPlannedGrams(first.id, first.planned_grams);
      await assertLive();

      const percentEdit = buildDirectPercentEdit(currentInput(), { byLineId: {} }, first.id, 60);
      expect(percentEdit.ok).toBe(true);
      if (percentEdit.ok)
        useRecipeStore.getState().setPlannedGramsVector(percentEdit.gramsByLineId);
      await assertLive();

      useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 5);
      useRecipeStore.setState({
        productBehaviorSnapshots: productBehaviorTestSnapshots(currentInput()),
      });
      await assertLive();

      const added = useRecipeStore
        .getState()
        .items.find((item) => item.ingredient.id === findDemoIngredient('inulin')!.id)!;
      useRecipeStore.getState().removeItem(added.id);
      useRecipeStore.setState({
        productBehaviorSnapshots: productBehaviorTestSnapshots(currentInput()),
      });
      await assertLive();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

describe('owner matrix G–K and P: exact persistence boundaries', () => {
  it('G restores a confirmed unsaved draft only for its persisted identity, context and signature', () => {
    const recipe = useRecipeStore.getState();
    const persisted = recipeProfilePersistPartialize(useRecipeProfileStore.getState());
    const identity = persisted.activeDraftIdentity!;
    const signature = persisted.confirmedSignature!;

    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.setState(persisted);
    useRecipeProfileStore
      .getState()
      .openDraft(recipe.draftContextSeq, recipe.direction_targets, persisted.directionIntents);
    expect(
      useRecipeProfileStore.getState().isConfirmed(signature, identity, recipe.draftContextSeq),
    ).toBe(true);

    useRecipeProfileStore
      .getState()
      .openDraft(recipe.draftContextSeq + 1, recipe.direction_targets, persisted.directionIntents);
    expect(useRecipeProfileStore.getState().activeDraftIdentity).not.toBe(identity);
    expect(
      useRecipeProfileStore
        .getState()
        .isConfirmed(
          signature,
          useRecipeProfileStore.getState().activeDraftIdentity!,
          recipe.draftContextSeq + 1,
        ),
    ).toBe(false);
  });

  it('H reopens only the same immutable saved recipe/version with identical settings', () => {
    const input = starterMilkBase();
    const link = {
      savedId: 'recipe-owner-h',
      savedName: 'Owner H',
      versionNumber: 3,
      versionId: 'version-owner-h-3',
    };
    useRecipeStore.getState().loadRecipeInput(input, link);
    useRecipeStore.setState({ productBehaviorSnapshots: productBehaviorTestSnapshots(input) });
    confirmCurrentSettings();
    const signature = currentSettingsSignature();
    const identity = savedRecipeProfileDraftIdentity(useRecipeStore.getState())!;

    useRecipeStore.getState().loadRecipeInput(input, link);
    expect(savedRecipeProfileDraftIdentity(useRecipeStore.getState())).toBe(identity);
    expect(currentSettingsConfirmed()).toBe(true);

    useRecipeStore.getState().loadRecipeInput(input, {
      ...link,
      savedId: 'another-recipe',
      versionId: 'another-version',
    });
    expect(currentSettingsConfirmed()).toBe(false);
    expect(
      useRecipeProfileStore
        .getState()
        .isConfirmed(
          signature,
          useRecipeProfileStore.getState().activeDraftIdentity!,
          useRecipeStore.getState().draftContextSeq,
        ),
    ).toBe(false);
  });

  const settingsMutations: Array<[string, () => void]> = [
    [
      'I machine',
      () => {
        const machine = listActiveHomeMachines(MACHINE_CATALOG)[0]!;
        const setup = deriveMachineSetup(machine);
        useRecipeStore.getState().setMachineSelection({
          kind: 'home',
          servingModeId: setup.resolvedVisibleMode!,
          machineId: machine.id,
          label: machineDisplayName(machine),
          temperatureC: temperatureForMode(setup.resolvedVisibleMode!)!,
          batchGrams: setup.recommendedBatchGrams,
          hardCapacityGrams: setup.hardMaximumBatchGrams,
        });
      },
    ],
    ['J serving temperature', () => useRecipeStore.getState().setServingMode('temp_minus_12', -12)],
    ['K formulation mode', () => useRecipeStore.getState().setFormulationStrategy('eco')],
  ];

  it.each(settingsMutations)('%s invalidates confirmation', (_name, mutate) => {
    mutate();
    expect(currentSettingsConfirmed()).toBe(false);
  });

  it('P migrates confirmation and calculated fingerprints across Save → reload → exact reopen', () => {
    const priorIdentity = useRecipeProfileStore.getState().activeDraftIdentity;
    useRecipeStore
      .getState()
      .markSaved(
        'saved-owner-p',
        'Owner P',
        1,
        '2026-08-28T00:00:00.000Z',
        undefined,
        'saved-owner-p-v1',
      );
    const savedIdentity = savedRecipeProfileDraftIdentity(useRecipeStore.getState())!;
    expect(savedIdentity).not.toBe(priorIdentity);
    expect(useRecipeProfileStore.getState().activeDraftIdentity).toBe(savedIdentity);
    expect(currentSettingsConfirmed()).toBe(true);
    expect(useRecipeProfileStore.getState().calculatedRecipeAuthority?.draftIdentity).toBe(
      savedIdentity,
    );
    const persisted = recipeProfilePersistPartialize(useRecipeProfileStore.getState());
    expect(persisted).toMatchObject({
      activeDraftIdentity: savedIdentity,
      confirmedDraftIdentity: savedIdentity,
      calculatedRecipeAuthority: { draftIdentity: savedIdentity },
    });

    const input = currentInput();
    useRecipeStore.getState().loadRecipeInput(input, {
      savedId: 'saved-owner-p',
      savedName: 'Owner P',
      versionNumber: 1,
      versionId: 'saved-owner-p-v1',
    });
    useRecipeStore.setState({ productBehaviorSnapshots: productBehaviorTestSnapshots(input) });
    expect(currentSettingsConfirmed()).toBe(true);
    const authority = baseCurrentAuthority();
    expect(authority.recipeFingerprint).toBe(
      useRecipeProfileStore.getState().calculatedRecipeAuthority?.recipeFingerprint,
    );
    expect(authority.behaviorFingerprint).toBe(
      useRecipeProfileStore.getState().calculatedRecipeAuthority?.behaviorFingerprint,
    );
  });
});

describe('owner matrix L–N: topping changes final product, never Base currentness', () => {
  it('add, change grams and remove preserve Base authority/Monitor while final facts follow grams', async () => {
    const base = calculateFinalProduct(currentInput(), []);
    const confirmedIdentity = useRecipeProfileStore.getState().activeDraftIdentity;

    useRecipeStore.getState().addTopping(topping, 20);
    const line = useRecipeStore.getState().toppings[0]!;
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(baseCurrentAuthority().state).toBe('CURRENT');
    expect(currentSettingsConfirmed()).toBe(true);
    const added = calculateFinalProduct(currentInput(), useRecipeStore.getState().toppings);
    expect(added.finalMassG).toBe(base.finalMassG + 20);
    expect(added.finalLabelNutritionPer100g?.kcal).not.toBe(base.finalLabelNutritionPer100g?.kcal);

    useRecipeStore.getState().setToppingGrams(line.id, 35);
    const changed = calculateFinalProduct(currentInput(), useRecipeStore.getState().toppings);
    expect(changed.finalMassG).toBe(base.finalMassG + 35);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(baseCurrentAuthority().state).toBe('CURRENT');

    const input = currentInput();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <RecipeProfilePanel
          activeTab="monitor"
          onTabChange={() => undefined}
          result={calculateRecipe(input)}
          servingTemperatureC={input.target_temperature_c}
          corrections={proposeCorrections({ input, context: recipeContext(input), redact: false })}
          input={input}
          idPrefix="owner-topping-monitor"
          showTabs={false}
          onOpenPreview={() => undefined}
          onRecalculate={() => undefined}
        />,
      );
    });
    expect(host.querySelector('[data-testid="monitor-live-summary"]')).not.toBeNull();
    await act(async () => root.unmount());
    host.remove();

    useRecipeStore.getState().removeTopping(line.id);
    expect(calculateFinalProduct(currentInput(), []).finalMassG).toBe(base.finalMassG);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(useRecipeProfileStore.getState().activeDraftIdentity).toBe(confirmedIdentity);
    expect(currentSettingsConfirmed()).toBe(true);
  });
});
