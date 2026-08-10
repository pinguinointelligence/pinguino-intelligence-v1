import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
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
  showsProfessionalServing,
  useRecipeProfileStore,
} from './recipeProfileStore';
import { attachRecipeProfileMetadata, readRecipeProfileMetadata } from './recipeProfilePersistence';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { RecipeAxisScale } from './RecipeAxisScale';

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
  it('keeps the approved logo left-aligned and uses the shared score seam in the top workbar', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    expect(page).toContain('maxWidthClass="max-w-none"');
    expect(page).toContain('brand={<OfficialProLogo />}');
    expect(page).toContain('data-testid="pro-top-score"');
    expect(page).toContain('monitorScoreView(result, input).match');
    const topActions = page.slice(
      page.indexOf('function ProTopActions'),
      page.indexOf('function RecipeWorkbench'),
    );
    expect(topActions.match(/data-testid="pro-top-score"/g)).toHaveLength(1);
    expect(logo).toContain("'/logo/PI-logo-blackwhite-web.png'");
    expect(logo).toContain('data-logo-source="/logo/PI-logo-blackwhite.pdf"');
  });

  it('integrates pending state into the recalculation control', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('data-testid="pro-recalc-state"');
    expect(page).toContain('Zmieniono recepturę lub ustawienia. Przelicz ponownie.');
    expect(page).not.toContain('copy.proWorkbar.pendingRecalc');
  });
});

describe('profile hierarchy and compact preflight', () => {
  it('renders score → settings → axes → nutrition and preserves score education', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const scoreAt = panel.indexOf('<ProfileScoreCard');
    const settingsAt = panel.indexOf('<WorkbenchSettingsLine');
    const directionAt = panel.indexOf('<ProfileDirectionAxes');
    const nutritionAt = panel.indexOf('<NutritionAndCost');
    expect(scoreAt).toBeGreaterThan(-1);
    expect(settingsAt).toBeGreaterThan(scoreAt);
    expect(directionAt).toBeGreaterThan(settingsAt);
    expect(nutritionAt).toBeGreaterThan(directionAt);
    expect(panel).toContain('setEducationOpen(true)');
    expect(panel).toContain('<ContextualEducationView');
    expect(read('features', 'education', 'ContextualEducationView.tsx')).toContain(
      'data-testid="profile-education-view"',
    );
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
    expect(card).toContain('Ustaw jako domyślne');
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
    const attached = attachRecipeProfileMetadata(input, settings());
    expect(JSON.stringify(attached.items)).toBe(beforeItems);
    expect(attached.target_batch_grams).toBe(input.target_batch_grams);
    expect(readRecipeProfileMetadata(attached)).toEqual(settings());
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

describe('six-axis target language', () => {
  it('renders four adjustable axes, two information axes and no read-only copy', () => {
    const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    const scale = read('features', 'pro-workbench', 'RecipeAxisScale.tsx');
    for (const id of ['sweetness', 'softness', 'creaminess', 'flavor']) {
      expect(axes).toContain(`id: '${id}'`);
    }
    for (const id of ['structure', 'stability']) {
      expect(axes).toContain(`id: '${id}'`);
    }
    expect(scale).toContain('data-testid={`axis-minus-${id}`}');
    expect(scale).toContain('data-testid={`axis-plus-${id}`}');
    expect(`${axes}\n${scale}`.toLowerCase()).not.toContain('read only');
    expect(axes).toContain('readiness={readiness}');
    expect(axes).toContain("state?.status === 'blocked_runtime'");
    expect(axes).toContain("? 'NIEOBSŁUGIWANE'");
    expect(axes).toContain("? 'BRAK DANYCH'");
    expect(axes).toContain("? 'WYMAGA KALIBRACJI'");
  });

  it('moves only the desired target and marks recalculation pending', () => {
    const beforeItems = JSON.stringify(useRecipeStore.getState().items);
    useRecipeStore.getState().moveDirectionTarget('sweetness', -1);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(-1);
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(beforeItems);
  });

  it('keeps target and actual markers structurally independent', () => {
    const scale = read('features', 'pro-workbench', 'RecipeAxisScale.tsx');
    expect(scale).toContain('data-testid={`axis-target-${id}`}');
    expect(scale).toContain('data-testid={`axis-actual-${id}`}');
    expect(scale).toContain('targetPosition');
    expect(scale).toContain('actualPosition');
    const html = renderToStaticMarkup(
      <RecipeAxisScale
        id="sweetness"
        label="Słodycz"
        adjustable
        targetPosition={25}
        actualPosition={75}
      />,
    );
    expect(html).toContain('data-position="25"');
    expect(html).toContain('data-position="75"');
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
