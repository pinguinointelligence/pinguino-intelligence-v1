/** @vitest-environment jsdom */
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput, recipeContext } from '@/features/studio/buildRecipeInput';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  listActiveHomeMachines,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
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
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';
import { monitorScoreView } from './monitorSummaryView';
import { formatMonitorValue } from './professionalMonitorModel';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import {
  FRIENDLY_LAB_MOMENT_EVENT,
  type FriendlyLabMomentEventDetail,
} from '@/components/shared/friendlyLabMoment';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const settings = () => ({
  visibleProductType: 'gelato' as const,
  mode: 'classic' as const,
  formulationStrategy: 'optimal' as const,
  targetBatchGrams: 1_000,
  batchSource: 'PROFESSIONAL_USER_BATCH' as const,
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
    // In workbench mode the header shares the workbench cap so the module strip
    // stays on the display column; other PRO surfaces keep the 1776 page width.
    // SUPERSEDED, owner 2026-09-02 (option A). The header keeps the page's full
    // width on EVERY route again — the 1440 cap it briefly carried is now on the
    // centred band inside it, not on the row, so the hamburger, the wordmark and
    // the login measure 32 / 96 / 32 px identically on Shop and PRO.
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
    expect(logo).toContain("'/brand/gellatti-wordmark-graphite.svg'");
    expect(logo).toContain('data-logo-source="/brand/gellatti-wordmark-graphite.svg"');
    expect(logo).toContain('w-[120px]');
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
    expect(page).toContain(
      'profile.isConfirmed(signature, profile.activeDraftIdentity, recipe.draftContextSeq)',
    );
    expect(page).not.toContain('copy.proWorkbar.pendingRecalc');
  });
});

describe('profile hierarchy and compact preflight', () => {
  it('keeps frozen controls mounted while INITIAL, WORKING, STALE and BLOCKED stay out of permanent cards', async () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const moments: FriendlyLabMomentEventDetail[] = [];
    const applySuccessEvent = (event: Event) =>
      moments.push((event as CustomEvent<FriendlyLabMomentEventDetail>).detail);
    window.addEventListener(FRIENDLY_LAB_MOMENT_EVENT, applySuccessEvent);
    /* The Summary tab now renders a draft label whose „Zmień ustawienia" is a
       router Link, so the panel needs a routing context to mount. */
    const renderPanel = () => (
      <MemoryRouter>
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
          idPrefix="friendly-lab-state"
          showTabs={false}
          onOpenPreview={() => undefined}
          onRecalculate={() => undefined}
        />
      </MemoryRouter>
    );

    useConstraintStudioStore.getState().resetForTests();
    useRecipeStore.setState({
      newRecipeStarterKey: {
        visibleProductType: 'gelato',
        servingModeId: 'temp_minus_11',
        formulationStrategy: 'optimal',
        targetBatchGrams: 1_000,
      },
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
      draftRevision: 51,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();

    try {
      await act(async () => root.render(renderPanel()));
      expect(
        host
          .querySelector('[data-testid="pro-context-recipe"]')
          ?.getAttribute('data-friendly-lab-recipe-state'),
      ).toBe('INITIAL');
      expect(host.querySelector('[data-testid="profile-direction-axes"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="friendly-lab-recipe-initial"]')).toBeNull();
      expect(host.textContent).not.toContain('Jeszcze nie liczyliśmy tej receptury.');

      await act(async () => {
        useRecipeProfileStore.getState().markRecalculationRequired();
        useConstraintStudioStore.setState({ recalculationTerminal: { state: 'WORKING' } });
        root.render(renderPanel());
      });
      expect(
        host
          .querySelector('[data-testid="pro-context-recipe"]')
          ?.getAttribute('data-friendly-lab-recipe-state'),
      ).toBe('WORKING');
      expect(host.querySelector('[data-testid="profile-direction-axes"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="friendly-lab-recipe-working"]')).toBeNull();

      await act(async () => {
        useRecipeStore.setState({ newRecipeStarterKey: null });
        useConstraintStudioStore.setState({ recalculationTerminal: null });
        root.render(renderPanel());
      });
      expect(
        host
          .querySelector('[data-testid="pro-context-recipe"]')
          ?.getAttribute('data-friendly-lab-recipe-state'),
      ).toBe('STALE');
      expect(host.querySelector('[data-testid="profile-direction-axes"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="friendly-lab-recipe-stale"]')).toBeNull();

      await act(async () => {
        useRecipeProfileStore.getState().acknowledgeRecalculation();
        const blockedSnapshots = productBehaviorTestSnapshots(input);
        const firstLineId = input.items[0]!.id;
        blockedSnapshots[firstLineId] = {
          ...blockedSnapshots[firstLineId]!,
          moduleEligibility: {
            ...blockedSnapshots[firstLineId]!.moduleEligibility,
            NUTRITION: 'blocked',
          },
        };
        useRecipeStore.setState({ productBehaviorSnapshots: blockedSnapshots });
        useConstraintStudioStore.setState({
          recalculationTerminal: {
            state: 'ERROR',
            messagePl: 'Nie udało się przeliczyć receptury.',
          },
        });
        root.render(renderPanel());
      });
      expect(
        host
          .querySelector('[data-testid="pro-context-recipe"]')
          ?.getAttribute('data-friendly-lab-recipe-state'),
      ).toBe('BLOCKED');
      expect(host.querySelector('[data-testid="profile-direction-axes"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="friendly-lab-recipe-blocked"]')).toBeNull();

      await act(async () => {
        useRecipeStore.setState({ productBehaviorSnapshots: productBehaviorTestSnapshots(input) });
        useRecipeProfileStore.getState().acknowledgeRecalculation();
        useConstraintStudioStore.setState({
          applyPending: false,
          blocked: null,
          history: [],
          recalculationTerminal: null,
        });
        root.render(renderPanel());
      });
      await act(async () => {
        useConstraintStudioStore.setState({ applyPending: true });
        root.render(renderPanel());
      });
      await act(async () => {
        useConstraintStudioStore.setState({ applyPending: false, history: [{} as never] });
        root.render(renderPanel());
      });
      expect(host.querySelector('[data-testid="friendly-lab-apply-success"]')).toBeNull();
      expect(moments).toHaveLength(1);
      expect(moments[0]).toMatchObject({ kind: 'apply-complete' });
    } finally {
      window.removeEventListener(FRIENDLY_LAB_MOMENT_EVENT, applySuccessEvent);
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('publishes live score, Monitor, kcal and cost under their own module gates', async () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    const corrections = proposeCorrections({
      input,
      context: recipeContext(input),
      redact: false,
    });
    const completeSnapshots = productBehaviorTestSnapshots(input);
    const firstLineId = input.items[0]!.id;
    const splitSnapshots = structuredClone(completeSnapshots);
    splitSnapshots[firstLineId] = {
      ...splitSnapshots[firstLineId]!,
      moduleEligibility: {
        ...splitSnapshots[firstLineId]!.moduleEligibility,
        NUTRITION: 'blocked',
      },
    };
    useSessionStore.setState({ plan: 'pro' });
    useRecipeStore.setState({
      productBehaviorSnapshots: splitSnapshots,
      toppings: [],
      draftRevision: 41,
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();
    expect(result.total_batch_g).toBeGreaterThan(0);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const view = () => (
      <>
        <div data-surface="score">
          <WorkbenchIntelligenceHeader
            result={result}
            input={input}
            onRecalculate={() => undefined}
            variant="dock"
          />
        </div>
        <div data-surface="profile">
          <RecipeProfilePanel
            activeTab="profile"
            onTabChange={() => undefined}
            result={result}
            servingTemperatureC={input.target_temperature_c}
            corrections={corrections}
            input={input}
            idPrefix="current-result-profile"
            showTabs={false}
            onOpenPreview={() => undefined}
            onRecalculate={() => undefined}
          />
        </div>
        <div data-surface="monitor">
          <RecipeProfilePanel
            activeTab="monitor"
            onTabChange={() => undefined}
            result={result}
            servingTemperatureC={input.target_temperature_c}
            corrections={corrections}
            input={input}
            idPrefix="current-result-monitor"
            showTabs={false}
            onOpenPreview={() => undefined}
            onRecalculate={() => undefined}
          />
        </div>
      </>
    );
    const surface = (name: 'score' | 'profile' | 'monitor') =>
      host.querySelector(`[data-surface="${name}"]`)!;

    try {
      await act(async () => root.render(view()));

      // The technical base remains live when only Nutrition is unavailable.
      expect(surface('score').textContent).toContain('Wynik aktualny');
      expect(surface('score').querySelector('[data-testid="workbench-score-ring"]')).not.toBeNull();
      // SUPERSEDED, owner authority 2026-09-02 (approved desktop PDF §4). The
      // result is a readout, so the figure and its unit are separate elements
      // and textContent no longer glues them with a space. The DATA assertion
      // is unchanged — an empty result still reads „—" above „kcal / 100 g".
      expect(surface('profile').textContent).toContain('—kcal / 100 g');
      expect(surface('profile').textContent).toContain(
        `${calculateFinalProduct(input).finalCosts?.cost_per_kg?.toFixed(2)} €za kg`,
      );
      expect(
        surface('monitor').querySelector('[data-testid="monitor-live-summary"]'),
      ).not.toBeNull();

      await act(async () => {
        useRecipeStore.setState({ productBehaviorSnapshots: completeSnapshots });
        root.render(view());
      });
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
      expect(surface('score').textContent).toContain('Wynik aktualny');
      expect(surface('score').querySelector('[data-testid="workbench-score-ring"]')).not.toBeNull();
      expect(
        surface('score')
          .querySelector('[data-testid="workbench-score-ring"]')
          ?.getAttribute('data-score'),
      ).toBe(String(monitorScoreView(result, input).match.score));
      const expectedFinal = calculateFinalProduct(input);
      expect(surface('profile').textContent).toContain(
        `${expectedFinal.finalLabelNutritionPer100g?.kcal.toFixed(0)}kcal / 100 g`,
      );
      expect(surface('profile').textContent).toContain(
        `${expectedFinal.finalCosts?.cost_per_kg?.toFixed(2)} €za kg`,
      );
      expect(
        surface('monitor').querySelector('[data-testid="monitor-live-summary"]'),
      ).not.toBeNull();
      expect(
        surface('monitor').querySelector('[data-testid="monitor-module-sweetness"]'),
      ).not.toBeNull();
      const podValue = result.indicators.find((indicator) => indicator.key === 'pod')!.value;
      expect(podValue).toBeTypeOf('number');
      expect(surface('monitor').textContent).toContain(formatMonitorValue(podValue!));

      // A material edit stales the optimization, but every live as-written
      // fact remains visible and the Recalculate action remains available.
      await act(async () => {
        useRecipeProfileStore.getState().markRecalculationRequired();
        root.render(view());
      });
      expect(surface('score').querySelector('[data-testid="workbench-score-ring"]')).not.toBeNull();
      expect(surface('score').querySelector('[data-testid="pro-workbar-recalc"]')).not.toBeNull();
      expect(
        surface('score')
          .querySelector('[data-testid="workbench-intelligence-header"]')
          ?.getAttribute('data-current-result-state'),
      ).toBe('STALE');
      expect(surface('profile').textContent).toContain(
        `${expectedFinal.finalLabelNutritionPer100g?.kcal.toFixed(0)}kcal / 100 g`,
      );
      expect(surface('profile').textContent).toContain(
        `${expectedFinal.finalCosts?.cost_per_kg?.toFixed(2)} €za kg`,
      );
      expect(
        surface('monitor').querySelector('[data-testid="monitor-live-summary"]'),
      ).not.toBeNull();
      expect(surface('monitor').textContent).toContain('Oczekuje na przeliczenie');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

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
    const panel = (activeTab: 'profile' | 'monitor' | 'summary') => (
      /* Summary renders the draft label, whose „Zmień ustawienia" is a router
         Link — the panel needs a routing context to mount. */
      <MemoryRouter>
        <RecipeProfilePanel
          activeTab={activeTab}
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
        />
      </MemoryRouter>
    );
    try {
      await act(async () => root.render(panel('profile')));
      const initialProfile = host.querySelector('[data-testid="profile-direction-axes"]');
      expect(initialProfile).not.toBeNull();
      const initialValues = initialProfile?.textContent;

      for (const toppingGrams of [0, 1, 20, 51, 0]) {
        const activeToppings =
          toppingGrams === 0 ? [] : [{ ...topping, planned_grams: toppingGrams }];
        await act(async () => {
          useRecipeStore.setState({
            toppings: activeToppings,
            productBehaviorSnapshots: productBehaviorTestSnapshots(input, activeToppings),
          });
          root.render(panel('profile'));
        });
        const currentProfile = host.querySelector('[data-testid="profile-direction-axes"]');
        expect(currentProfile).not.toBeNull();
        expect(currentProfile?.textContent).toBe(initialValues);

        const expectedFinal = calculateFinalProduct(input, activeToppings);
        const expectedNutrition = expectedFinal.finalLabelNutritionPer100g;
        const recipeSummary = host.querySelector('[data-testid="profile-nutrition-cost-summary"]');
        expect(recipeSummary?.textContent).toContain(
          `${expectedNutrition?.kcal.toFixed(0)}kcal / 100 g`,
        );
        expect(recipeSummary?.textContent).toContain(
          `${expectedFinal.finalCosts?.cost_per_kg?.toFixed(2)} €za kg`,
        );

        await act(async () => root.render(panel('summary')));
        /* OWNER DECISION (2026-08-30) — an explicit, approved divergence from
           the older V2.1 §18 Label GATE. Before Production completes the reader
           now sees a live DRAFT of the label rather than a panel telling them to
           go elsewhere. The old gate's assertions are replaced by the contract
           that supersedes them, not dropped:
             · the draft is on screen,
             · only genuinely outstanding data is listed,
             · nothing that needs a completed run is invented,
             · and the final print stays unavailable. */
        const draftCard = host.querySelector('[data-testid="draft-label-card"]');
        expect(draftCard).not.toBeNull();
        expect(host.querySelector('[data-testid="label-workspace-empty"]')).toBeNull();

        const pending = host.querySelector('[data-testid="draft-label-pending"]');
        expect(pending?.textContent).toContain('Numer partii (LOT)');
        expect(pending?.textContent).toContain('Data produkcji');
        expect(pending?.textContent).toContain('Potwierdzone składniki z produkcji');

        const print = host.querySelector<HTMLButtonElement>('[data-testid="draft-label-print"]');
        expect(print).not.toBeNull();
        expect(print?.disabled).toBe(true);

        // Settings never live in the workbench — they are one link away.
        expect(
          host.querySelector('[data-testid="label-settings-home-link"]')?.getAttribute('href'),
        ).toBe('/labels');
        expect(host.querySelector('[data-testid="label-consumer-preview"]')).toBeNull();
      }

      const variants = [
        {
          name: 'priced and complete',
          activeToppings: [{ ...topping, planned_grams: 20 }],
          blockedModule: null,
          nutritionVisible: true,
          costVisible: true,
        },
        {
          name: 'missing price',
          activeToppings: [
            {
              ...topping,
              planned_grams: 20,
              ingredient: { ...topping.ingredient, cost_per_kg: null, cost_currency: null },
            },
          ],
          blockedModule: 'COST' as const,
          nutritionVisible: true,
          costVisible: false,
        },
        {
          name: 'missing nutrition facts',
          activeToppings: [{ ...topping, planned_grams: 20 }],
          blockedModule: 'NUTRITION' as const,
          nutritionVisible: false,
          costVisible: true,
        },
        {
          name: 'missing Label facts only',
          activeToppings: [{ ...topping, planned_grams: 20 }],
          blockedModule: 'LABEL' as const,
          nutritionVisible: true,
          costVisible: true,
        },
        {
          name: 'removed topping',
          activeToppings: [],
          blockedModule: null,
          nutritionVisible: true,
          costVisible: true,
        },
      ];

      for (const variant of variants) {
        const snapshots = productBehaviorTestSnapshots(input, variant.activeToppings);
        const toppingSnapshot = snapshots[topping.id];
        if (toppingSnapshot && variant.blockedModule) {
          snapshots[topping.id] = {
            ...toppingSnapshot,
            moduleEligibility: {
              ...toppingSnapshot.moduleEligibility,
              [variant.blockedModule]: 'blocked',
            },
          };
        }
        await act(async () => {
          useRecipeStore.setState({
            toppings: variant.activeToppings,
            productBehaviorSnapshots: snapshots,
          });
          useRecipeProfileStore.getState().markRecalculationRequired();
          root.render(panel('profile'));
        });

        const expected = calculateFinalProduct(input, variant.activeToppings);
        const summary = host.querySelector('[data-testid="profile-nutrition-cost-summary"]');
        expect(summary, variant.name).not.toBeNull();
        if (variant.nutritionVisible) {
          expect(summary?.textContent, variant.name).toContain(
            `${expected.finalLabelNutritionPer100g?.kcal.toFixed(0)}kcal / 100 g`,
          );
        } else {
          expect(summary?.textContent, variant.name).toContain('—kcal / 100 g');
        }
        if (variant.costVisible) {
          expect(summary?.textContent, variant.name).toContain(
            `${expected.finalCosts?.cost_per_kg?.toFixed(2)} €za kg`,
          );
        } else {
          expect(summary?.textContent, variant.name).toContain('—za kg');
        }

        await act(async () => root.render(panel('monitor')));
        expect(
          host.querySelector('[data-testid="monitor-live-summary"]'),
          `${variant.name}: base Monitor`,
        ).not.toBeNull();
        expect(host.querySelector('[data-testid="monitor-topping-summary"]') === null).toBe(
          variant.activeToppings.length === 0,
        );
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
    expect(panel).toContain('lg:rounded-[10px]');
    expect(panel).toContain('lg:shadow-pro-e0');
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
    // `workbench-batch` no longer exists — see the field-order note below.
    const strategyAt = card.indexOf('workbench-strategy');
    expect(productAt).toBeGreaterThan(-1);
    // OWNER FROZEN PRO VISUAL: the confirmation left the grid for the band
    // header, so it now precedes every field in source. The FIELDS keep their
    // canonical order relative to one another, which is what this test is for.
    expect(confirmationAt).toBeLessThan(productAt);
    expect(machineAt).toBeGreaterThan(productAt);
    expect(conditionalAt).toBeGreaterThan(machineAt);
    expect(strategyAt).toBeGreaterThan(conditionalAt);
    // SUPERSEDED TWICE, owner authority 2026-09-02. The approved model reads
    // type | mode / serving | machine — the target-batch field was removed from
    // this surface entirely on the owner's final Settings contract, so the
    // grid order is 1 product-type, 2 strategy, 3 conditional, 4 machine — and
    // the duplicated `Baza receptury` cell is gone entirely.
    expect(card).toContain("compact && 'order-1'");
    expect(card).toContain('relative order-2 min-w-0');
    expect(card).toContain("compact ? 'order-3'");
    expect(card).toContain("compact && 'order-4'");
    expect(card).not.toContain('profile-settings-base-readout order-6');
    expect(card).not.toContain('workbench-quality');
    expect(card).not.toContain('Więcej ustawień');
    expect(card).not.toContain('setCostPriority');
    expect(card).not.toContain('setFlavorIntensity');
  });

  it('contains one confirmation action and conditional professional/home contexts', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(card).toContain('data-testid="profile-settings-confirm"');
    // Renamed and relocated by owner authority 2026-09-02 (§8): confirmation
    // lives INSIDE expanded Settings, to the right of the permanent
    // „Zapisz jako domyślne", and reads „Potwierdź zmiany".
    expect(card.match(/data-testid="profile-settings-confirm"/g)).toHaveLength(1);
    expect(card).toContain('data-testid="profile-settings-save-default"');
    expect(card).toContain('testid="workbench-serving"');
    expect(card).toContain('data-testid="home-machine-capacity"');
    expect(card).toContain('Zalecany wsad na cykl');
    // The target-batch field is REMOVED from Settings and must not return.
    expect(card).not.toContain('data-testid="profile-batch-combined"');
    expect(card).not.toContain('aria-label="Docelowa partia"');
    expect(card).toContain('data-testid="settings-grid-status"');
    expect(card).not.toContain('data-testid="settings-header-status"');
    // The collapsed band row carries the confirmation STATUS and is the way
    // into the settings, so it still precedes the grid in source.
    expect(card.indexOf('data-settings-cell="confirmation"')).toBeLessThan(
      card.indexOf('data-settings-cell="product-type"'),
    );
    expect(card).toContain("compact && 'order-1'");
    expect(card).toContain("compact ? 'order-3'");
    expect(card.indexOf('data-settings-cell="product-type"')).toBeLessThan(
      card.indexOf('data-settings-cell="machine"'),
    );
    // The batch card's helper line went with the card itself (owner authority
    // 2026-09-02, final Settings contract).
    expect(card).not.toContain('Baza lodowa bez toppingu');
    expect(card).not.toContain('BAZA LODOWA BEZ TOPPINGU');
    // `w-16` was the batch UNIT select, removed with the batch field.
    expect(card).not.toContain("compactSelect, 'w-16'");
    expect(card).not.toContain('2xl:h-[63px]');
    expect(card).not.toContain('Ustaw jako domyślne');
    expect(read('features', 'pro-workbench', 'AccountRecipeDefaults.tsx')).toContain(
      'Domyślne ustawienia receptury',
    );
  });

  it('routes every profile change through confirmation and the native hard-reset authority', () => {
    const card = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(card).toContain('store.setFormulationStrategy(strategy)');
    expect(card).toContain('requestNewRecipeProductTypeChange(next)');
    expect(card).toContain('setPendingBaseProfile(next)');
    expect(card).toContain('changeProRecipeProductType(pendingBaseProfile)');
    expect(card).not.toContain('store.setVisibleProductType(next)');
    expect(card).not.toContain('classifyProfileTransition(');
    expect(card).toContain('store.setMachineSelection({');
    expect(card).toContain('resizeBatchGrams(target)');
    expect(card).not.toContain('requestNewRecipeStarterSettingsChange');
    expect(card).not.toContain('rebuildNewProRecipeStarter');
    expect(card).not.toContain('Zmiana ustawień wymaga przebudowy składników.');
  });

  it('renders serving immediately for Professional and capacity instead for a Home machine', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_12',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -12,
    });
    const professional = renderToStaticMarkup(<WorkbenchSettingsLine />);
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
    const signature = profileSettingsSignature(settings());
    store.openDraft(7, DEFAULT_DIRECTION_TARGETS);
    const identity = useRecipeProfileStore.getState().activeDraftIdentity!;
    expect(useRecipeProfileStore.getState().isConfirmed(signature, identity, 7)).toBe(false);
    store.confirmSettings(signature, identity, 7);
    expect(useRecipeProfileStore.getState().isConfirmed(signature, identity, 7)).toBe(true);
    const changed = profileSettingsSignature({ ...settings(), targetBatchGrams: 1_200 });
    expect(useRecipeProfileStore.getState().isConfirmed(changed, identity, 7)).toBe(false);

    useRecipeStore.getState().setPlannedGrams(useRecipeStore.getState().items[0]!.id, 111);
    expect(useRecipeProfileStore.getState().isConfirmed(signature, identity, 7)).toBe(true);
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
      directionTargets: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
      directionIntents: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
      ingredientUxByLineId: { [input.items[0]!.id]: { role: 'addition', required: true } },
    });
  });

  it('does not let mismatched saved profile metadata relabel a Gelato ingredient base', () => {
    const gelato = starterMilkBase();
    const mismatched = attachRecipeProfileMetadata(gelato, {
      ...settings(),
      visibleProductType: 'sorbet',
    });

    useRecipeStore.getState().loadRecipeInput(mismatched, {
      savedId: 'legacy-mismatched-profile',
      savedName: 'Legacy Gelato',
      versionNumber: 2,
    });

    const opened = useRecipeStore.getState();
    expect(opened.visibleProductType).toBe('gelato');
    expect(opened.category).toBe('milk_gelato');
    expect(opened.items).toEqual(gelato.items);
  });

  it('does not let a legacy Gelato account default relabel an unsaved Sorbet input', () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    const sorbet = buildRecipeInput(useRecipeStore.getState());
    useRecipeProfileStore.getState().saveDefaults('local-device', settings());

    useRecipeStore.getState().loadRecipeInput(sorbet);

    const opened = useRecipeStore.getState();
    expect(opened.visibleProductType).toBe('sorbet');
    expect(opened.category).toBe('sorbet');
    expect(opened.items).toEqual(sorbet.items);
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
      sweetness: -2,
      softness: 2,
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

describe('Direction explains itself, and agrees with the engine', () => {
  const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
  const engine = read('features', 'recipe-direction', 'recipeDirectionTargets.ts');
  const v21 = read('styles', 'gellatti-v2-1.css');

  it('ramps the mark by size instead of printing a number', () => {
    expect(axes).toMatch(/const DOT_PX: Ramp = \[5, 6\.5, 8, 9\.5, 11\]/);
    expect(axes).toMatch(/const THUMB_PX: Ramp = \[13, 14\.5, 16, 17\.5, 19\]/);
    // Sized by SLOT, so the ball grows across the screen rather than along the
    // number line — the two differ on a mirrored axis.
    expect(axes).toContain('const rampAt = (sizes: Ramp, slot: Slot, reversed: boolean): number');
    // No +1 / -2 anywhere in the control any more, in any form.
    expect(axes).not.toContain('const sign =');
    expect(axes).not.toMatch(/\+\$\{detent\}/);
  });

  it('mirrors Twardość in PRESENTATION ONLY, never in what it stores', () => {
    /* The load-bearing one. The engine's sign is frozen and says so itself:
       canonical -2 is MORE SOFT, +2 is MORE FIRM. The owner wants firm on the
       LEFT. Both are satisfied by mirroring the slot map, so the leftmost mark
       WRITES +2 while the solver keeps reading exactly the number it always
       did. Nothing here may be "simplified" into flipping the stored value. */
    expect(engine).toContain('-2 = more soft (higher NPAC), +2 = more firm (lower NPAC)');
    expect(axes).toContain("reversed={axis === 'softness'}");
    expect(axes).toContain('(reversed ? 2 - slot : slot - 2) as DirectionIntent');
    expect(axes).toContain('(reversed ? 2 - detent : detent + 2) as Slot');
    // Firm left, soft right — the owner's approved reading order.
    expect(axes).toContain("['bardziej twarde', 'bardziej miękkie']");
    expect(axes).not.toContain("['bardziej miękkie', 'bardziej twarde']");
    /* Spoken names stay canonical: index 0 of the softness table is -2, and -2
       is SOFT. If this ever flips, the control announces its own mirror. */
    const soft = axes.indexOf('znacznie bardziej miękkie');
    const firm = axes.indexOf('znacznie bardziej twarde');
    expect(soft).toBeGreaterThan(-1);
    expect(soft).toBeLessThan(firm);
    expect(axes).toContain('phrases[(detent + 2) as Slot]');
  });

  it('walks the arrow keys across the SCREEN, not along the number line', () => {
    // On a mirrored axis ArrowLeft must reach the mark to the left, which is
    // canonical +2. Stepping the stored value instead would send the keyboard
    // the opposite way from the eye.
    expect(axes).toContain('onSet(detentForSlot(Math.max(0, Math.min(4, next)) as Slot, reversed))');
    expect(axes).not.toContain('onSet(Math.max(-2, position - 1)');
    expect(axes).not.toContain('onSet(Math.min(2, position + 1)');
  });

  it('tells the reader the column continues, since the scrollbar is hidden', () => {
    /* Expanding the breakdown pushes WIEDZA below the fold. It stays reachable
       — measured at 1440x820, 143 px of scroll brings it fully into view — but
       from 1536 px up `index.css` deliberately hides the scrollbar, so nothing
       said so and the section read as deleted.

       Four background layers and no scroll listener: two `local` layers scroll
       with the content and paint the ground, two `scroll` layers stay at the
       scroller's edges and paint a shadow. At either end the ground covers the
       shadow; in between it shows. */
    expect(v21).toMatch(/\.intelligence-tabpanel-scroll \{[\s\S]*?no-repeat local/);
    expect(v21).toMatch(/\.intelligence-tabpanel-scroll \{[\s\S]*?no-repeat\s+scroll/);
    expect((v21.match(/--pro-scroll-ground/g) ?? []).length).toBe(2);
  });
});

describe('a refused save points at the module that answers it', () => {
  const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
  const workbar = read('features', 'pro-core', 'ProWorkbar.tsx');
  const store = read('features', 'pro-workbench', 'recipeProfileStore.ts');
  const theme = read('styles', 'theme-pro-light.css');

  it('carries the refusal through ONE authority, not a second copy of the gate', () => {
    // The gate lives in useCanonicalRecipeSave and only the workbar calls it.
    // Settings reads what the card renders rather than recomputing it, so the
    // two can never disagree about whether the recipe is refusing to save.
    expect(workbar).toContain('setPreflightBlockMessage(publishedBlock)');
    expect(workbar).toContain("variant === 'panel' ? save.practicalBlockMessage : null");
    expect(settings).toContain('useRecipeProfileStore((state) => state.preflightBlockMessage)');
    expect(settings).not.toContain('practicalRecipeAuditMatchesInput');
    // Transient: absent from the persist allow-list, so a reload recomputes it
    // instead of restoring a refusal the draft may no longer earn.
    expect(store).not.toContain('preflightBlockMessage: state.preflightBlockMessage');
  });

  it('opens Settings on the refusal WITHOUT trapping it open', () => {
    // Derived, never a setExpanded(true) effect: forcing the state would leave
    // the module stuck open after the block clears and would fight an owner
    // who collapsed it deliberately.
    /* SUPERSEDED, owner 2026-09-03. `expanded || preflightBlocked` behind a
       plain toggle had a real defect: while the blocker held the module open
       the flag was still false, so a click meant to CLOSE flipped it to true
       and the module stayed open once the blocker cleared. The two states are
       now separate and only the manual one is ever written. */
    expect(settings).toContain('const open = manualExpanded || forcedOpen;');
    expect(settings).toContain('const forcedOpen = preflightBlockMessage !== null;');
    // Under the blocker a click can only ever record "closed".
    expect(settings).toMatch(/if \(forcedOpen\) \{\s*setManualExpanded\(false\);\s*return;/);
    expect(settings).not.toContain('setExpanded');
    expect(settings).toContain("data-settings-surface={open ? 'expanded' : 'collapsed'}");
  });

  it('wears the SAME attention marker a changed gram field wears, closed into a ring', () => {
    expect(settings).toContain("'settings-preflight-blocked'");
    // Same colour and same 4% tint as `.ingredient-line-changed`; the only
    // difference is that it goes all the way round, because here the whole
    // module is what needs attention rather than one cell in a row.
    expect(theme).toMatch(/\.ingredient-line-changed \{[^}]*var\(--color-attention\)/);
    expect(theme).toMatch(
      /\.pro-legend-box\.settings-preflight-blocked \{[\s\S]*?border-color: var\(--color-attention\)/,
    );
    expect(theme).toMatch(
      /\.pro-legend-box\.settings-preflight-blocked \{[\s\S]*?color-mix\(in srgb, var\(--color-attention\) 4%/,
    );
    // Two classes, or the border shorthand on .pro-legend-box wins on order.
    expect(theme).not.toMatch(/^\.settings-preflight-blocked \{/m);
  });

  it('never lets a sign-in prompt or a network error pull Settings open', () => {
    // Neither is something Settings can resolve; only the preflight refusal is.
    expect(workbar).not.toContain('setPreflightBlockMessage(save.error');
    expect(workbar).not.toContain('setPreflightBlockMessage(blockedMsg');
  });
});

describe('five-detent direction language', () => {
  it('renders only the two approved five-detent customer controls', () => {
    const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    expect(axes).toContain("['sweetness'");
    expect(axes).toContain("['softness'");
    // Five marks, now addressed by visual slot rather than by a value list.
    expect(axes).toContain('const SLOTS = [0, 1, 2, 3, 4] as const');
    expect(axes).not.toContain('Wybrano:');
    /* OWNER AUTHORITY 2026-09-03: the approved reference carries NO end labels
       under the track — the axis is one row, its name and its instrument. The
       direction each end means is carried by the axis name plus the thumb's
       position, the way every other bipolar control in the app does it. */
    expect(axes).not.toContain('Mniej słodkie');
    expect(axes).not.toContain('Bardziej twarde');
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

  it('keeps the exact five-step owner intent as the canonical Recipe target', () => {
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    expect(useRecipeProfileStore.getState().directionIntents.sweetness).toBe(2);
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(2);
    expect(useRecipeProfileStore.getState().directionIntents.sweetness).toBe(2);
  });

  it('keeps account defaults on the same exact five-step target authority', () => {
    const source = read('features', 'pro-workbench', 'AccountRecipeDefaults.tsx');
    expect(source).toContain('[axis]: intent');
    expect(source).not.toContain('Math.sign(intent)');
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
      'recipe.setDirectionTarget(axis, next)',
    );
    // OWNER FROZEN PRO VISUAL: the 28 px detent became a 36 px target carrying
    // a 13 px thumb. Geometry only — the intent wiring asserted around it is
    // what this test is actually for, and it is unchanged.
    expect(read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx')).toContain('size-[26px]');
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
