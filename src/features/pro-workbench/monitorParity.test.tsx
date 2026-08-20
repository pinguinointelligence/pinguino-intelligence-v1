/**
 * Focused acceptance contract for the professional Monitor.
 *
 * The former parity suite protected the historical, text-heavy Monitor. The owner
 * explicitly replaced that contract with seven aligned result cards, one score,
 * the shared Profile axes and a separate ADVANCED owner-diagnostics area. Engine
 * values and the single desktop/mobile content source remain protected here.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
  }),
}));

let mockRecipeState: Record<string, unknown> = {
  items: [],
  toppings: [],
  productBehaviorSnapshots: {},
  machineId: null,
  savedRecipeId: null,
};
vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) =>
      selector ? selector(mockRecipeState) : mockRecipeState,
    {
      getState: () => mockRecipeState,
      subscribe: () => () => undefined,
    },
  ),
}));

const { MonitorPanelContent, MonitorToppingSummary } = await import('./MonitorPanelContent');
const { ProfessionalMonitorModules } = await import('./ProfessionalMonitorModules');
const { buildProfessionalMonitorModules } = await import('./professionalMonitorModel');

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function renderPanel(input: RecipeInput) {
  const productBehaviorSnapshots = productBehaviorTestSnapshots(input);
  mockRecipeState = {
    items: input.items,
    toppings: [],
    productBehaviorSnapshots,
    machineId: null,
    savedRecipeId: null,
    machineKind: 'professional',
    machineLabel: null,
    machine_capacity_grams: input.machine_capacity_grams,
    servingModeId: 'temp_minus_11',
    target_temperature_c: input.target_temperature_c,
    target_batch_grams: input.target_batch_grams,
    visibleProductType: 'gelato',
    mode: 'classic',
    formulation_strategy: 'optimal',
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    draftContextSeq: 0,
  };
  const result = calculateRecipe(input);
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });
  return renderToStaticMarkup(
    <MonitorPanelContent
      result={result}
      servingTemperatureC={input.target_temperature_c}
      corrections={corrections}
      input={input}
    />,
  );
}

describe('professional Monitor acceptance contract', () => {
  const html = renderPanel(starterMilkBase());
  const text = visibleText(html);

  it('keeps genuine legacy history readable but blocks a partial modern authority', () => {
    const input = starterMilkBase();
    renderPanel(input);
    const completeSnapshots = mockRecipeState.productBehaviorSnapshots as Record<
      string,
      ProductBehaviorSnapshot
    >;

    mockRecipeState = {
      ...mockRecipeState,
      savedRecipeId: 'legacy-recipe',
      productBehaviorSnapshots: {},
    };
    const legacyHtml = renderToStaticMarkup(
      <MonitorPanelContent
        result={calculateRecipe(input)}
        servingTemperatureC={input.target_temperature_c}
        corrections={proposeCorrections({ input, context: recipeContext(input), redact: false })}
        input={input}
      />,
    );
    expect(legacyHtml).toContain('data-testid="monitor-behavior-revalidation"');
    expect(legacyHtml).toContain('Podgląd historyczny');
    expect(legacyHtml).toContain('data-testid="monitor-module-freezing"');

    const [firstLineId] = Object.keys(completeSnapshots);
    mockRecipeState = {
      ...mockRecipeState,
      productBehaviorSnapshots: firstLineId
        ? { [firstLineId]: completeSnapshots[firstLineId]! }
        : {},
    };
    const partialHtml = renderToStaticMarkup(
      <MonitorPanelContent
        result={calculateRecipe(input)}
        servingTemperatureC={input.target_temperature_c}
        corrections={proposeCorrections({ input, context: recipeContext(input), redact: false })}
        input={input}
      />,
    );
    expect(partialHtml).toContain('data-testid="monitor-behavior-revalidation"');
    expect(partialHtml).toContain(
      'Monitor wymaga ponownej walidacji danych produktów użytych w tej recepturze.',
    );
    expect(partialHtml).not.toContain('Brak zatwierdzonego uprawnienia MONITOR dla:');
    for (const lineId of Object.keys(completeSnapshots)) {
      expect(partialHtml).not.toContain(lineId);
    }
    expect(partialHtml).not.toContain('data-testid="monitor-module-freezing"');

    mockRecipeState = {
      ...mockRecipeState,
      productBehaviorSnapshots: Object.fromEntries(
        Object.entries(completeSnapshots).map(([lineId, productSnapshot]) => [
          lineId,
          { ...productSnapshot, resolutionState: 'LEGACY_RECONSTRUCTED' as const },
        ]),
      ),
    };
    const reconstructedHtml = renderToStaticMarkup(
      <MonitorPanelContent
        result={calculateRecipe(input)}
        servingTemperatureC={input.target_temperature_c}
        corrections={proposeCorrections({ input, context: recipeContext(input), redact: false })}
        input={input}
      />,
    );
    expect(reconstructedHtml).toContain('Podgląd historyczny');
    expect(reconstructedHtml).toContain('data-testid="monitor-module-freezing"');
    expect(reconstructedHtml).not.toContain('data-testid="monitor-correction-summary"');
  });

  it('renders analysis-only Direction evidence and no duplicate score or Profile controls', () => {
    expect(html).not.toContain('data-testid="monitor-summary-score"');
    expect(html).toContain('data-testid="monitor-direction-evidence"');
    expect(html).not.toContain('data-testid="profile-direction-axes"');
    expect(html).not.toContain('jeden poziom');
  });

  it('uses the parent-frozen ProductBehavior projection for Preview in all seven modules', () => {
    const summarySource = readFileSync(
      resolve(import.meta.dirname, 'MonitorLiveSummary.tsx'),
      'utf8',
    );
    const panelSource = readFileSync(
      resolve(import.meta.dirname, 'MonitorPanelContent.tsx'),
      'utf8',
    );
    expect(summarySource).not.toContain('calculateRecipe(preview.proposedInput)');
    expect(summarySource).toContain('previewResult?: RecipeResult | null');
    expect(panelSource).toContain('recipeInputFromFrozenBehavior(');
    expect(panelSource).toContain('previewResult={previewProjection?.result}');
    expect(panelSource).toContain('previewModules={previewProjection?.modules}');
  });

  it('renders the seven approved result cards and keeps core metrics reachable', () => {
    for (const id of [
      'sweetness',
      'hardness',
      'freezing',
      'water-solids',
      'fat',
      'protein',
      'stability',
    ]) {
      expect(html).toContain(`data-testid="monitor-module-${id}"`);
    }
    for (const label of [
      'Słodycz',
      'Twardość',
      'PAC',
      'NPAC',
      'POD',
      'Tłuszcz',
      'Białko i struktura',
      'Stabilność i ryzyka',
    ]) {
      expect(text).toContain(label);
    }
  });

  it('removes the superseded normal-customer noise and duplicate score layer', () => {
    for (const removed of [
      'Pewność danych',
      'Gotowość produkcyjna',
      'Zalecany test partii',
      'Tryb Expert',
      'Oceniono ',
    ]) {
      expect(text).not.toContain(removed);
    }
    expect(html).not.toContain('monitor-detail-score');
    expect(html).not.toContain('user-monitor-module-');
  });

  it('removes Nutrition/Cost and Process from customer Monitor and keeps QA chrome owner-only', () => {
    expect(html).not.toContain('data-testid="monitor-secondary-nutrition"');
    expect(html).not.toContain('data-testid="monitor-process-guide-entry"');
    expect(text).not.toContain('Jak je przygotować?');
    expect(html).not.toContain('data-testid="monitor-owner-diagnostics"');
    expect(html).not.toContain('data-testid="review-marked-monitor-owner-diagnostic"');
    const source = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(source).not.toContain('<ProcessGuideEntry');
    expect(source).not.toContain('<NutritionAndCost');
  });

  it('uses protected position scales without exposing proprietary min/max ranges', () => {
    expect(html).toContain('data-scale-metric="ice_fraction"');
    expect(html).toContain('data-testid="monitor-scale-freezing-accepted"');
    expect(html).toContain('bg-[#a8dfb1]');
    expect(html).toContain('bg-[#101113]');
    expect(html).not.toContain('rotate-45');
    expect(text).not.toMatch(/zakres\s+-?\d+[.,]?\d*\s*[–-]\s*-?\d+/i);
  });

  it('renders a distinct orange Preview marker on the aligned scales', () => {
    const input = starterMilkBase();
    const previewInput = {
      ...input,
      items: input.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + 1 } : item,
      ),
    };
    const current = buildProfessionalMonitorModules(
      calculateRecipe(input),
      input.target_temperature_c,
      input,
    );
    const preview = buildProfessionalMonitorModules(
      calculateRecipe(previewInput),
      previewInput.target_temperature_c,
      previewInput,
    );
    const previewHtml = renderToStaticMarkup(
      <ProfessionalMonitorModules modules={current} previewModules={preview} />,
    );
    expect(previewHtml).toContain('data-testid="monitor-scale-freezing-preview"');
    expect(previewHtml).toContain('border-[#f58a07]');
  });

  it('renders honest no-evaluation scales for incomplete input without hiding modules', () => {
    const empty = renderPanel({ ...starterMilkBase(), items: [] });
    for (const id of [
      'sweetness',
      'hardness',
      'freezing',
      'water-solids',
      'fat',
      'protein',
      'stability',
    ]) {
      expect(empty).toContain(`data-testid="monitor-module-${id}"`);
    }
    expect(empty).toContain('brak danych');
    expect(empty).not.toContain('data-position="50"');
    expect(empty).not.toContain('monitor-scale-pod-actual');
  });

  it('keeps topping facts collapsed and informational without changing Base metrics', () => {
    const input = starterMilkBase();
    const before = calculateRecipe(input);
    const ingredient: CatalogLabelToppingIngredient = {
      kind: 'catalog_label_topping',
      id: 'catalog:sauce',
      canonical_ingredient_id: 'catalog:sauce',
      private_product_id: 'catalog:sauce:v1',
      name: 'Sos owocowy',
      catalog_product_id: 'sauce',
      catalog_version_id: 'v1',
      verification_status: 'manual_unverified',
      label_nutrition_per_100g: {
        basis: 'per_100g',
        energyKcal: 180,
        fat: 0.2,
        saturatedFat: null,
        carbohydrate: 43,
        sugars: null,
        protein: 0.4,
        salt: 0.01,
        fibre: null,
      },
      ingredients_text: 'Owoce, cukier',
      allergens_text: 'Brak deklaracji',
      cost_per_kg: null,
      cost_currency: null,
    };
    const html = renderToStaticMarkup(
      <MonitorToppingSummary
        toppings={[
          {
            id: 'topping-milk',
            ingredient,
            planned_grams: 70,
            actual_grams: null,
            process_scope: 'POST_PROCESS_ADDON',
            addon_sort_order: 0,
          },
        ]}
        actualByLineId={new Map([['topping-milk', 75]])}
      />,
    );
    expect(html).toContain('data-testid="monitor-topping-summary"');
    expect(visibleText(html)).toContain('Toppingi po produkcji');
    expect(visibleText(html)).toContain('Nie wpływają na bilans bazy.');
    expect(visibleText(html)).toContain('faktycznie 75 g');
    expect(html).toContain('data-catalog-verification="manual_unverified"');
    expect(visibleText(html)).toContain('Dodany manualnie');
    expect(html).not.toContain('open=""');
    const after = calculateRecipe(input);
    expect(after.pod_points).toBe(before.pod_points);
    expect(after.npac_points).toBe(before.npac_points);
    expect(after.scores).toEqual(before.scores);
  });
});

describe('Monitor layout and integration seams', () => {
  it('introduces no nested vertical scroll or height cap inside the content component', () => {
    const html = renderPanel(starterMilkBase());
    expect(html).not.toContain('overflow-y-auto');
    expect(html).not.toMatch(/max-h-/);
    expect(html).not.toMatch(/\bh-0\b/);
  });

  it('uses one MonitorPanelContent source for desktop and mobile hosts', () => {
    const drawer = read('features', 'pro-core', 'MonitorDrawer.tsx');
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const content = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(drawer).toContain('<MonitorPanelContent');
    expect(profile).toContain('<MonitorPanelContent');
    expect(content).not.toContain('setProcessGuideOpen(true)');
    expect(content).not.toContain('initialLesson="process"');
    expect(content).toContain('previewModules={previewProjection?.modules}');
  });

  it('keeps the canonical score behind the persistent workbench header seam', () => {
    const header = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const mainEnvelope = read('features', 'product-intelligence', 'mainEnvelope.ts');
    expect(header).toContain('monitorScoreView');
    expect(header).toContain('recalculationTerminal');
    expect(header).toContain('previewMatch');
    expect(header).toContain("? 'Podgląd gotowy'");
    expect(header).toContain('data-score-source');
    expect(header).toContain('workbench-intelligence-header');
    expect(header).toContain('Podgląd historyczny');
    expect(header).not.toContain('PodglÄ…d historyczny');
    expect(header).not.toContain('recipeMatchScore(');
    expect(profile).toContain('Podgląd historyczny');
    expect(profile).not.toMatch(/PodglÄ|edycjÄ|utwÃ|produktÃ/);
    expect(mainEnvelope).toContain('Product-layer Main contract');
    expect(mainEnvelope).toContain('mainBehaviorBlockReason(snapshot)');
    expect(mainEnvelope).toContain("code: 'main_above_optimal_ceiling'");
    expect(mainEnvelope).toContain('Brak zatwierdzonego wspólnego limitu dla tej grupy Main.');
    expect(mainEnvelope).not.toContain('wspÃ³lnego');
  });

  it('keeps the historical customizable Monitor available without mounting it in normal Pro Monitor', () => {
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    const layout = read('features', 'user-monitor', 'userMonitorLayout.ts');
    expect(panel).not.toContain('UserMonitorPro');
    expect(layout).toContain('pinMetric');
    expect(layout).toContain('unpinMetric');
    expect(layout).toContain('toggleModule');
  });
});
