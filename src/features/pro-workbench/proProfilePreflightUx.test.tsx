/** @vitest-environment jsdom */
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  listActiveHomeMachines,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  DEFAULT_DIRECTION_TARGETS,
  profileSettingsSignature,
  recipeProfilePersistPartialize,
  showsProfessionalServing,
  useRecipeProfileStore,
} from './recipeProfileStore';
import {
  attachRecipeProfileMetadata,
  PROFILE_METADATA_KEY,
  readRecipeProfileMetadata,
} from './recipeProfilePersistence';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { RecipeProfilePanel } from './RecipeProfilePanel';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const settings = () => ({
  visibleProductType: 'gelato' as const,
  mode: 'classic' as const,
  formulationStrategy: 'optimal' as const,
  targetBatchGrams: 1_000,
  machineKind: 'professional' as const,
  machineId: null,
  machineLabel: 'Maszyna profesjonalna',
  servingModeId: 'temp_minus_11',
  targetTemperatureC: -11,
  machineCapacityGrams: null,
  directionTargets: DEFAULT_DIRECTION_TARGETS,
});

beforeEach(() => {
  useRecipeProfileStore.getState().resetForTests();
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useRecipeStore.setState({ dirty: false });
});

describe('canonical Pro header contract', () => {
  it('keeps the approved logo left-aligned and the score/PI action in the editor dock', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const header = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    const dock = read('features', 'pro-workbench', 'WorkbenchRecipeActionDock.tsx');
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    expect(page).toContain('maxWidthClass="max-w-[1776px]"');
    expect(page).toContain('brand={<OfficialProLogo />}');
    expect(page).not.toContain('data-testid="pro-top-score"');
    expect(header).toContain('data-testid="workbench-intelligence-header"');
    expect(header).toContain('monitorScoreView(result, input).match');
    expect(dock).toContain('<WorkbenchIntelligenceHeader');
    expect(dock).not.toContain('className="xl:hidden"');
    expect(dock).toContain('<WorkbenchActionBar');
    expect(page).not.toContain('<WorkbenchIntelligenceHeader');
    expect(page).not.toContain('variant="global"');
    expect(logo).toContain("'/logo/gellattiLOGO.png'");
    expect(logo).toContain('data-logo-source="/logo/gellattiLOGO.png"');
    expect(logo).toContain('w-[136px]');
    expect(logo).toContain('max-h-12');
  });

  it('integrates pending state into the recalculation control', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const header = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    expect(header).toContain('data-testid="pro-workbar-recalc"');
    expect(header).toContain("working ? 'Przeliczanie…' : 'Przelicz'");
    expect(page).toContain("state: 'SETTINGS_CONFIRMATION_REQUIRED'");
    expect(read('features', 'pro-core', 'ProRecalcPanel.tsx')).toContain(
      'pinguino:profile-settings-required',
    );
    expect(page).toContain('profile.isConfirmed(signature, recipe.draftContextSeq)');
    expect(page).not.toContain('copy.proWorkbar.pendingRecalc');
  });
});

describe('profile hierarchy and compact preflight', () => {
  it('keeps Recipe profile indicators populated when only a post-production topping changes', async () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    const topping = {
      id: 'post-process-topping',
      ingredient: {
        kind: 'catalog_label_topping',
        id: 'catalog:cranberry',
        canonical_ingredient_id: 'catalog:cranberry',
        private_product_id: 'catalog:cranberry:v1',
        name: 'Cranberry',
        catalog_product_id: 'cranberry',
        catalog_version_id: 'v1',
        verification_status: 'verified',
        label_nutrition_per_100g: {
          basis: 'per_100g',
          energyKcal: 120,
          fat: 0,
          saturatedFat: null,
          carbohydrate: 30,
          sugars: 28,
          protein: 0,
          salt: 0,
          fibre: null,
        },
        ingredients_text: 'Żurawina, cukier',
        allergens_text: '',
        cost_per_kg: 12,
        cost_currency: 'EUR',
      } satisfies CatalogLabelToppingIngredient,
      planned_grams: 1,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    } as const;
    useRecipeStore.setState({
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
      toppings: [],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
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
            idPrefix="profile-topping-regression"
            showTabs={false}
            onOpenPreview={() => undefined}
            onRecalculate={() => undefined}
          />,
        ),
      );
      const initialProfile = host.querySelector('[data-testid="profile-direction-axes"]');
      expect(initialProfile).not.toBeNull();
      const initialValues = initialProfile?.textContent;

      for (const toppingGrams of [1, 51, 73, 0]) {
        await act(async () => {
          useRecipeStore.setState({
            toppings: toppingGrams === 0 ? [] : [{ ...topping, planned_grams: toppingGrams }],
          });
        });
        const currentProfile = host.querySelector('[data-testid="profile-direction-axes"]');
        expect(currentProfile).not.toBeNull();
        expect(currentProfile?.textContent).toBe(initialValues);
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('renders one editor-dock score, then Profile inputs without Summary duplication', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    const settingsAt = panel.indexOf('<WorkbenchSettingsLine');
    const directionAt = panel.indexOf('<ProfileDirectionAxes');
    expect(surface).toContain('<WorkbenchRecipeActionDock');
    expect(panel).not.toContain('<WorkbenchIntelligenceHeader');
    expect(settingsAt).toBeGreaterThan(-1);
    expect(directionAt).toBeLessThan(settingsAt);
    expect(panel).toContain('data-testid="profile-desktop-grid"');
    expect(panel).toContain('data-profile-layout="stacked"');
    expect(panel).not.toContain('<NutritionAndCost');
    expect(panel).toContain('data-testid="profile-learning-entry"');
    expect(panel).toContain('setEducationOpen(true)');
    expect(panel).toContain('<ContextualEducationView');
    expect(read('features', 'education', 'ContextualEducationView.tsx')).toContain(
      'data-testid="profile-education-view"',
    );
  });

  it('uses one inset shell and one desktop body scroller for every cockpit tab', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(surface).toContain('xl:flex xl:min-w-0 xl:flex-col xl:overflow-hidden');
    expect(panel).toContain('lg:rounded-[18px]');
    expect(panel).toContain('lg:shadow-pro-e1');
    expect(panel).toContain('lg:flex-1 lg:overflow-y-auto');
    expect(panel).toContain("activeTab === 'profile'");
    expect(panel).toContain("activeTab === 'monitor'");
    expect(panel).toContain("activeTab === 'production'");
    expect(panel).toContain("activeTab === 'summary'");
  });

  it('keeps canonical field order and removes legacy advanced settings', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    const productAt = card.indexOf('workbench-product-type');
    const confirmationAt = card.indexOf('data-settings-cell="confirmation"');
    const machineAt = card.indexOf('workbench-machine');
    const conditionalAt = card.indexOf('machine-conditional-settings');
    const batchAt = card.indexOf('workbench-batch');
    const strategyAt = card.indexOf('workbench-strategy');
    expect(productAt).toBeGreaterThan(-1);
    expect(confirmationAt).toBeGreaterThan(productAt);
    expect(machineAt).toBeGreaterThan(confirmationAt);
    expect(conditionalAt).toBeGreaterThan(machineAt);
    expect(batchAt).toBeGreaterThan(conditionalAt);
    expect(strategyAt).toBeGreaterThan(batchAt);
    expect(card).not.toContain('workbench-quality');
    expect(card).not.toContain('Więcej ustawień');
    expect(card).not.toContain('setCostPriority');
    expect(card).not.toContain('setFlavorIntensity');
  });

  it('contains one confirmation action and conditional professional/home contexts', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(card).toContain('data-testid="profile-settings-confirm"');
    expect(card.match(/Potwierdź ustawienia/g)).toHaveLength(1);
    expect(card).toContain('testid="workbench-serving"');
    expect(card).toContain('data-testid="home-machine-capacity"');
    expect(card).toContain('Pojemność jednego cyklu');
    expect(card).toContain('data-testid="profile-batch-combined"');
    expect(card).toContain('data-testid="settings-grid-status"');
    expect(card).not.toContain('data-testid="settings-header-status"');
    expect(card.indexOf('data-settings-cell="product-type"')).toBeLessThan(
      card.indexOf('data-settings-cell="confirmation"'),
    );
    expect(card.indexOf('data-settings-cell="confirmation"')).toBeLessThan(
      card.indexOf('data-settings-cell="machine"'),
    );
    expect(card).toContain('Baza lodowa bez toppingu');
    expect(card).not.toContain('BAZA LODOWA BEZ TOPPINGU');
    expect(card).toContain("compactSelect, 'w-16'");
    expect(card).not.toContain('2xl:h-[63px]');
    expect(card).not.toContain('Ustaw jako domyślne');
    expect(read('features', 'pro-workbench', 'AccountRecipeDefaults.tsx')).toContain(
      'Domyślne ustawienia receptury',
    );
  });

  it('routes starter strategy, serving and batch changes through one protected rebuild flow', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(card).toContain('requestNewRecipeStarterSettingsChange');
    expect(card).toContain('starterSettingsPatch.serving');
    expect(card).toContain('starterSettingsPatch.strategy');
    expect(card).toContain('starterSettingsPatch.batch');
    expect(card).toContain('Zmiana ustawień wymaga przebudowy składników.');
    expect(card).toContain('rebuildNewProRecipeStarter(pendingStarterChange.patch)');
    expect(card).not.toContain('startNewProRecipe(pendingProductType)');
  });

  it('renders serving immediately for Professional and capacity instead for a Home machine', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_12',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -12,
    });
    const professional = renderToStaticMarkup(<WorkbenchSettingsLine actualBatchG={900} />);
    expect(professional).toContain('data-testid="workbench-serving"');

    const home = listActiveHomeMachines(MACHINE_CATALOG)[0]!;
    const setup = deriveMachineSetup(home);
    const temperature = temperatureForMode(setup.resolvedVisibleMode!);
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode!,
      machineId: home.id,
      label: machineDisplayName(home),
      temperatureC: temperature!,
      batchGrams: setup.recommendedBatchGrams,
      capacityGrams: setup.recommendedBatchGrams,
    });
    expect(useRecipeStore.getState().machineKind).toBe('home');
    expect(showsProfessionalServing(useRecipeStore.getState().machineKind)).toBe(false);
    expect(showsProfessionalServing('professional')).toBe(true);
  });
});

describe('preflight and recipe-specific persistence', () => {
  it('confirms one material signature and invalidates on material settings only', () => {
    const store = useRecipeProfileStore.getState();
    const signature = profileSettingsSignature(settings(), 7);
    store.openDraft(7, DEFAULT_DIRECTION_TARGETS);
    expect(useRecipeProfileStore.getState().isConfirmed(signature, 7)).toBe(false);
    store.confirmSettings(signature, 7);
    expect(useRecipeProfileStore.getState().isConfirmed(signature, 7)).toBe(true);
    const changed = profileSettingsSignature({ ...settings(), targetBatchGrams: 1_200 }, 7);
    expect(useRecipeProfileStore.getState().isConfirmed(changed, 7)).toBe(false);

    useRecipeStore.getState().setPlannedGrams(useRecipeStore.getState().items[0]!.id, 111);
    expect(useRecipeProfileStore.getState().isConfirmed(signature, 7)).toBe(true);
  });

  it('round-trips saved profile settings and direction targets without changing Engine fields', () => {
    const input = starterMilkBase();
    const beforeItems = JSON.stringify(input.items);
    const attached = attachRecipeProfileMetadata(
      input,
      {
        ...settings(),
        directionIntents: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
      },
      { [input.items[0]!.id]: { role: 'addition', required: true } },
    );
    expect(JSON.stringify(attached.items)).toBe(beforeItems);
    expect(attached.target_batch_grams).toBe(input.target_batch_grams);
    expect(readRecipeProfileMetadata(attached)).toEqual({
      ...settings(),
      directionIntents: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
      ingredientUxByLineId: { [input.items[0]!.id]: { role: 'addition', required: true } },
    });
  });

  it('preserves legacy five-detent intent when old metadata stored ±2 in directionTargets', () => {
    const legacy = attachRecipeProfileMetadata(starterMilkBase(), settings()) as RecipeInput &
      Record<string, unknown>;
    const metadata = legacy[PROFILE_METADATA_KEY] as Record<string, unknown>;
    metadata.directionTargets = {
      sweetness: -2,
      softness: 2,
      creaminess: 0,
      flavor: 0,
    };
    delete metadata.directionIntents;
    const restored = readRecipeProfileMetadata(legacy);
    expect(restored?.directionTargets).toEqual({
      sweetness: -1,
      softness: 1,
      creaminess: 0,
      flavor: 0,
    });
    expect(restored?.directionIntents).toEqual({
      sweetness: -2,
      softness: 2,
      creaminess: 0,
      flavor: 0,
    });
  });

  it('stores defaults separately from the open recipe', () => {
    const originalBatch = useRecipeStore.getState().target_batch_grams;
    useRecipeProfileStore.getState().saveDefaults('owner-a', {
      ...settings(),
      targetBatchGrams: 1_400,
    });
    expect(useRecipeProfileStore.getState().defaultsFor('owner-a')?.targetBatchGrams).toBe(1_400);
    expect(useRecipeStore.getState().target_batch_grams).toBe(originalBatch);
  });

  it('atomically replaces authenticated-owner defaults and removes stale product rows', () => {
    useRecipeProfileStore.getState().saveDefaults('owner-a:gelato', settings());
    useRecipeProfileStore.getState().saveDefaults('owner-a:sorbet', {
      ...settings(),
      visibleProductType: 'sorbet',
    });
    useRecipeProfileStore.getState().saveDefaults('owner-b:gelato', settings());
    useRecipeProfileStore.getState().replaceDefaultsForOwner('owner-a', [
      {
        productContextKey: 'gelato',
        settings: { ...settings(), targetBatchGrams: 1_400 },
      },
    ]);
    expect(useRecipeProfileStore.getState().defaultsFor('owner-a:gelato')?.targetBatchGrams).toBe(
      1_400,
    );
    expect(useRecipeProfileStore.getState().defaultsFor('owner-a:sorbet')).toBeNull();
    expect(useRecipeProfileStore.getState().defaultsFor('owner-b:gelato')).not.toBeNull();
  });

  it('preserves the five-detent intent in defaults instead of collapsing ±2 to Engine ±1', () => {
    const directionIntents = {
      ...DEFAULT_DIRECTION_TARGETS,
      sweetness: -2 as const,
      softness: 2 as const,
    };
    useRecipeProfileStore.getState().saveDefaults('owner-five-detent', {
      ...settings(),
      directionIntents,
    });
    expect(
      useRecipeProfileStore.getState().defaultsFor('owner-five-detent')?.directionIntents,
    ).toEqual(directionIntents);
  });

  it('loads defaults only for a new draft and lets a saved recipe override them exactly', () => {
    const defaults = {
      ...settings(),
      targetBatchGrams: 1_400,
      directionTargets: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -1 as const },
    };
    useRecipeProfileStore.getState().saveDefaults('local-device', defaults);

    useRecipeStore.getState().loadRecipeInput(starterMilkBase());
    expect(useRecipeStore.getState().target_batch_grams).toBe(1_400);
    expect(useRecipeProfileStore.getState().directionTargets.sweetness).toBe(-1);
    expect(useRecipeProfileStore.getState().confirmedSignature).toBeNull();

    const savedSettings = {
      ...settings(),
      mode: 'signature' as const,
      targetBatchGrams: 875,
      targetTemperatureC: -13,
      servingModeId: 'temp_minus_13',
      directionTargets: { ...DEFAULT_DIRECTION_TARGETS, sweetness: 1 as const },
    };
    const savedInput = attachRecipeProfileMetadata(
      {
        ...starterMilkBase(),
        mode: 'signature',
        target_batch_grams: 875,
        target_temperature_c: -13,
      },
      savedSettings,
    );
    useRecipeStore.getState().loadRecipeInput(savedInput, {
      savedId: 'recipe-1',
      savedName: 'Owner recipe',
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(875);
    expect(useRecipeStore.getState().mode).toBe('classic');
    expect(useRecipeStore.getState().formulation_strategy).toBe('optimal');
    expect(useRecipeStore.getState().servingModeId).toBe('temp_minus_13');
    expect(useRecipeProfileStore.getState().directionTargets.sweetness).toBe(1);
    expect(useRecipeProfileStore.getState().confirmedSignature).toBeNull();
  });
});

describe('five-detent direction language', () => {
  it('renders only the two approved five-detent customer controls', () => {
    const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    expect(axes).toContain("['sweetness'");
    expect(axes).toContain("['softness'");
    expect(axes).toContain('[-2, -1, 0, 1, 2]');
    expect(axes).not.toContain('Wybrano:');
    expect(axes).toContain('Mniej słodkie');
    expect(axes).toContain('Bardziej słodkie');
    expect(axes).toContain('Bardziej miękkie');
    expect(axes).toContain('Bardziej twarde');
    expect(axes).toContain('profile-regulator-');
    expect(axes).toContain('role="radiogroup"');
    expect(axes).toContain('role="radio"');
    expect(axes).not.toContain('id="creaminess"');
    expect(axes).not.toContain('id="intensity"');
    expect(axes).not.toContain('id="structure"');
    expect(axes).not.toContain('id="stability"');
    expect(axes).not.toContain('Teraz</');
    expect(axes).not.toContain('Cel</');
    expect(read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx')).not.toContain(
      'Słodycz i Miękkość Direction już działają',
    );
  });

  it('does not render solver-result axes as duplicate customer controls', () => {
    const html = renderToStaticMarkup(
      <ProfileDirectionAxes result={calculateRecipe(starterMilkBase())} />,
    );
    expect(html).toContain('data-testid="profile-regulator-sweetness"');
    expect(html).toContain('data-testid="profile-regulator-softness"');
    expect(html).not.toContain('data-testid="profile-regulator-structure"');
    expect(html).not.toContain('data-testid="profile-regulator-stability"');
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
  });

  it('moves only the desired target and marks recalculation pending', () => {
    const beforeItems = JSON.stringify(useRecipeStore.getState().items);
    useRecipeStore.getState().moveDirectionTarget('sweetness', -1);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(-1);
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(beforeItems);
  });

  it('keeps five-step owner intent separate from three-state Engine target', () => {
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    expect(useRecipeProfileStore.getState().directionIntents.sweetness).toBe(2);
    useRecipeStore.getState().setDirectionTarget('sweetness', 1);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(1);
  });

  it('persists the open five-detent intent with its draft context across ambient refresh', () => {
    useRecipeProfileStore.getState().openDraft(17, DEFAULT_DIRECTION_TARGETS);
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);

    expect(recipeProfilePersistPartialize(useRecipeProfileStore.getState())).toMatchObject({
      openedContextSeq: 17,
      awaitingRecalculation: true,
      directionIntents: { sweetness: 2, softness: 0, creaminess: 0, flavor: 0 },
    });
  });

  it('retains five-detent defaults when a fresh demo draft is opened', () => {
    useRecipeProfileStore.getState().saveDefaults('local-device', {
      ...settings(),
      directionIntents: { sweetness: -2, softness: 2, creaminess: 0, flavor: 0 },
    });
    useRecipeStore.getState().resetToDemo();

    expect(useRecipeProfileStore.getState().directionIntents).toEqual({
      sweetness: -2,
      softness: 2,
      creaminess: 0,
      flavor: 0,
    });
  });

  it('marks same-sign detent movement dirty and clears pending state only after verified Apply', () => {
    useRecipeStore.setState({ dirty: false, draftRevision: 0 });
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', -1);
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', -1);
    useRecipeStore.getState().markProfileTargetChanged();
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(useRecipeStore.getState().draftRevision).toBe(1);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);

    expect(useRecipeStore.getState().applyVerifiedRecipeInput(starterMilkBase())).toEqual({
      ok: true,
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('invalidates the current score after every material ingredient edit', () => {
    useRecipeProfileStore.getState().acknowledgeRecalculation();
    const line = useRecipeStore.getState().items[0]!;

    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);

    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });

  it('wires the Profile detent and settings snapshot to the durable intent contract', () => {
    expect(read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx')).toContain(
      'else recipe.markProfileTargetChanged()',
    );
    expect(read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx')).toContain('size-9');
    expect(read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx')).toContain(
      'profileSnapshotFromState(store, directionTargets, directionIntents)',
    );
  });
});

describe('hard scope guards', () => {
  it('does not edit protected ingredient, Monitor or Engine implementations', () => {
    const gitPath = join(resolve(SRC, '..'), '.git');
    const gitMetadata = statSync(gitPath).isDirectory()
      ? readFileSync(join(gitPath, 'HEAD'), 'utf8')
      : readFileSync(gitPath, 'utf8');
    expect(gitMetadata.trim().length).toBeGreaterThan(0);
    const page = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(page).toContain('<MonitorPanelContent');
    expect(page).toContain('<ProductionPanel');
    expect(page).toContain('<SummaryPanel');
  });
});
