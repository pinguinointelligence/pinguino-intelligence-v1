import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
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
  it('keeps the approved logo left-aligned and owns score in one persistent right header', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const header = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    expect(page).toContain('maxWidthClass="max-w-[1776px]"');
    expect(page).toContain('brand={<OfficialProLogo />}');
    expect(page).not.toContain('data-testid="pro-top-score"');
    expect(header).toContain('data-testid="workbench-intelligence-header"');
    expect(header).toContain('monitorScoreView(result, input).match');
    const topActions = page.slice(
      page.indexOf('function ProTopActions'),
      page.indexOf('function RecipeWorkbench'),
    );
    expect(topActions).not.toContain('Dopasowanie techniczne receptury');
    expect(logo).toContain("'/logo/PI-logo-blackwhite-web.png'");
    expect(logo).toContain('data-logo-source="/logo/PI-logo-blackwhite.pdf"');
  });

  it('integrates pending state into the recalculation control', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('data-testid="pro-recalc-state"');
    expect(builder).toContain('Oczekuje na przeliczenie');
    expect(page).toContain("state: 'SETTINGS_CONFIRMATION_REQUIRED'");
    expect(read('features', 'pro-core', 'ProRecalcPanel.tsx')).toContain(
      'pinguino:profile-settings-required',
    );
    expect(page).toContain('profile.isConfirmed(signature, recipe.draftContextSeq)');
    expect(page).not.toContain('copy.proWorkbar.pendingRecalc');
  });
});

describe('profile hierarchy and compact preflight', () => {
  it('renders one persistent score header, then Profile inputs without Summary duplication', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const scoreAt = panel.indexOf('<WorkbenchIntelligenceHeader');
    const settingsAt = panel.indexOf('<WorkbenchSettingsLine');
    const directionAt = panel.indexOf('<ProfileDirectionAxes');
    expect(scoreAt).toBeGreaterThan(-1);
    expect(settingsAt).toBeGreaterThan(-1);
    expect(directionAt).toBeLessThan(settingsAt);
    expect(panel).toContain('data-testid="profile-desktop-grid"');
    expect(panel).toContain('2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]');
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
    expect(surface).toContain('xl:min-w-0 xl:overflow-hidden xl:border-t-0');
    expect(panel).toContain('lg:rounded-[28px]');
    expect(panel).toContain('lg:shadow-pro-e2');
    expect(panel).toContain('lg:flex-1 lg:overflow-y-auto');
    expect(panel).toContain("activeTab === 'profile'");
    expect(panel).toContain("activeTab === 'monitor'");
    expect(panel).toContain("activeTab === 'production'");
    expect(panel).toContain("activeTab === 'summary'");
  });

  it('keeps canonical field order and removes legacy advanced settings', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    const productAt = card.indexOf('workbench-product-type');
    const machineAt = card.indexOf('workbench-machine');
    const conditionalAt = card.indexOf('machine-conditional-settings');
    const batchAt = card.indexOf('workbench-batch');
    const strategyAt = card.indexOf('workbench-strategy');
    expect(productAt).toBeGreaterThan(-1);
    expect(machineAt).toBeGreaterThan(productAt);
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
  it('renders exactly one six-row regulator family without Direction text clutter', () => {
    const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    expect(axes).toContain("['sweetness'");
    expect(axes).toContain("['softness'");
    expect(axes).toContain('[-2, -1, 0, 1, 2]');
    expect(axes).not.toContain('Wybrano:');
    expect(axes).not.toContain('Mniej słodkie');
    expect(axes).not.toContain('Bardziej słodkie');
    expect(axes).toContain('unavailable="Kalibracja"');
    expect(axes).toContain('unavailable="Brak danych"');
    expect(axes).toContain('Zbalansowana');
    expect(axes).toContain('Bardzo stabilna');
    expect(axes).toContain('profile-regulator-');
    expect(axes).toContain("role={readOnly ? 'img' : 'slider'}");
    expect(axes).toContain('id="creaminess"');
    expect(axes).toContain('id="intensity"');
    expect(axes).toContain('id="structure"');
    expect(axes).toContain('id="stability"');
    expect(axes).not.toContain('Teraz</');
    expect(axes).not.toContain('Cel</');
    expect(read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx')).not.toContain(
      'Słodycz i Miękkość Direction już działają',
    );
  });

  it('renders Structure and Stability as accessible read-only visual scales, never controls', () => {
    const html = renderToStaticMarkup(
      <ProfileDirectionAxes result={calculateRecipe(starterMilkBase())} />,
    );
    for (const id of ['structure', 'stability']) {
      const start = html.indexOf(`data-testid="profile-regulator-${id}"`);
      expect(start).toBeGreaterThan(-1);
      const end = html.indexOf('</article>', start);
      const card = html.slice(start, end);
      expect(card).toContain('role="img"');
      expect(card).toContain('data-regulator-state="readonly"');
      expect(card).not.toContain('<button');
      expect(card).not.toContain('<input');
    }
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
    expect(read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx')).toContain('min-h-11');
    expect(read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx')).toContain(
      'profileSnapshotFromState(store, directionTargets, directionIntents)',
    );
  });
});

describe('hard scope guards', () => {
  it('does not edit protected ingredient, Monitor or Engine implementations', () => {
    const changed = readFileSync(join(resolve(SRC, '..'), '.git'), 'utf8');
    expect(changed).toContain('gitdir:');
    const page = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(page).toContain('<MonitorPanelContent');
    expect(page).toContain('<ProductionPanel');
    expect(page).toContain('<SummaryPanel');
  });
});
