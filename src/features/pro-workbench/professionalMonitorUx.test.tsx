import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import {
  starterMilkBase,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { targetStepToPosition } from './recipeAxisModel';
import { useRecipeProfileStore } from './recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { ProfessionalMonitorModules } from './ProfessionalMonitorModules';
import { buildProfessionalMonitorModules } from './professionalMonitorModel';

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

const behaviorFixtureState = vi.hoisted(() => ({
  snapshots: {} as Record<string, ProductBehaviorSnapshot>,
}));
vi.mock('@/stores/recipeStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/recipeStore')>();
  const real = actual.useRecipeStore;
  const mocked = Object.assign(
    (selector?: (state: ReturnType<typeof real.getState>) => unknown) => {
      const state = {
        ...real.getState(),
        productBehaviorSnapshots: behaviorFixtureState.snapshots,
      };
      return selector ? selector(state) : state;
    },
    {
      getState: real.getState,
      getInitialState: real.getInitialState,
      setState: real.setState,
      subscribe: real.subscribe,
    },
  );
  return { ...actual, useRecipeStore: mocked };
});

const { MonitorPanelContent } = await import('./MonitorPanelContent');

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

function renderMonitor(input: RecipeInput = starterMilkBase()) {
  behaviorFixtureState.snapshots = productBehaviorTestSnapshots(input);
  const result = calculateRecipe(input);
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });
  return renderToStaticMarkup(
    <MonitorPanelContent
      result={result}
      servingTemperatureC={input.target_temperature_c}
      corrections={corrections}
      input={input}
      onOpenProfile={() => undefined}
    />,
  );
}

describe('professional Monitor — final owner-approved information architecture', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.setState({ toppings: [] });
  });

  it('keeps Monitor analysis-only and leaves the canonical score to the shared workbench header', () => {
    const html = renderMonitor();
    expect(html).not.toContain('data-testid="monitor-summary-score"');
    expect(html).not.toContain('monitor-detail-score');
    expect(html).toContain('data-testid="monitor-direction-evidence"');
    expect(html).not.toContain('data-testid="profile-direction-axes"');
    expect(html).not.toContain('jeden poziom');
    expect(textOf(html)).toContain('Bieżący wynik dla wybranych ustawień');
  });

  it('reads the shared target state without exposing any mutation control', () => {
    const input = starterMilkBase();
    const gramsBefore = input.items.map((item) => item.planned_grams);
    useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
    const after = renderMonitor(input);
    expect(textOf(after)).toContain('Słodycz');
    expect(targetStepToPosition(useRecipeStore.getState().direction_targets.sweetness)).toBe(75);
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(input.items.map((item) => item.planned_grams)).toEqual(gramsBefore);

    const profile = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    const summary = read('features', 'pro-workbench', 'MonitorLiveSummary.tsx');
    expect(summary).not.toContain('ProfileDirectionAxes');
    expect(summary).not.toContain('setDirectionTarget');
    expect(profile).toContain('setDirectionTarget');
  });

  it('removes customer-facing confidence/readiness/trial copy and duplicate batch warnings', () => {
    const text = textOf(renderMonitor());
    for (const forbidden of [
      'Pewność danych',
      'Gotowość produkcyjna',
      'test próbnej partii',
      'Przed produkcją zalecany jest test próbnej partii',
      'Batch mass differs from the target',
      'WYNIK NA ŻYWO',
      'Oceniono ',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('renders exactly the seven approved compact Monitor modules', () => {
    const html = renderMonitor();
    const text = textOf(html);
    const modules = [
      ['sweetness', 'Słodycz'],
      ['hardness', 'Twardość'],
      ['freezing', 'Zamrożenie'],
      ['water-solids', 'Woda i ciała stałe'],
      ['fat', 'Tłuszcz i kremowość'],
      ['protein', 'Białko i struktura'],
      ['stability', 'Stabilność i ryzyka'],
    ] as const;
    for (const [id, title] of modules) {
      expect(html).toContain(`data-testid="monitor-module-${id}"`);
      expect(text).toContain(title);
    }
    expect(html).not.toContain('data-testid="monitor-module-sugars"');
    expect(text).toContain('POD');
    expect(text).toContain('NPAC');
    expect(text).toContain('PAC');
    expect(text).not.toContain('LÓD');
    expect(html).not.toContain('data-testid="user-monitor-module-expert"');
    expect(text).not.toContain('Tryb Expert');
    expect(text).not.toContain('Przypnij');
  });

  it('renders all seven rows inside one continuous Monitor block', () => {
    const html = renderMonitor();
    expect(html.match(/data-testid="monitor-unified-block"/g)).toHaveLength(1);
    const unifiedAt = html.indexOf('data-testid="monitor-unified-block"');
    expect(unifiedAt).toBeGreaterThan(-1);
    for (const id of [
      'sweetness',
      'hardness',
      'freezing',
      'water-solids',
      'fat',
      'protein',
      'stability',
    ]) {
      expect(html.indexOf(`data-testid="monitor-module-${id}"`)).toBeGreaterThan(unifiedAt);
    }
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(panel).toContain('<ProfessionalMonitorModules');
    expect(panel).toContain('embedded');
  });

  it('keeps canonical detail metrics behind independently expandable cards and hides numeric ranges', () => {
    const html = renderMonitor();
    const source = read('features', 'pro-workbench', 'ProfessionalMonitorModules.tsx');
    expect(source).toContain('data-raw-metric={metric.rawMetric}');
    expect(source).toContain('const [expanded, setExpanded]');
    expect(source).toContain('window.localStorage.setItem(STORAGE_KEY');
    expect(source).toContain('current.includes(module.id)');
    expect(html).not.toMatch(/data-(min|max|range)=/);
    expect(textOf(html)).not.toMatch(/zakres\s+\d+[.,]?\d*\s*[–-]\s*\d/i);
  });

  it('renders freezing stability as a qualitative Polish domain status, never a dash or number', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: () => JSON.stringify(['stability']),
        setItem: () => undefined,
      },
    });
    try {
      const input = starterMilkBase();
      const html = renderToStaticMarkup(
        <ProfessionalMonitorModules
          modules={buildProfessionalMonitorModules(
            calculateRecipe(input),
            input.target_temperature_c,
            input,
            'GOOD',
          )}
        />,
      );
      const row = html.match(
        /<div[^>]*data-testid="monitor-metric-freezing-stability"[\s\S]*?<\/div>/,
      )?.[0];
      expect(row).toBeDefined();
      expect(row).toContain('data-domain-status="GOOD"');
      expect(textOf(row ?? '')).toContain('Stabilność zamrażania');
      expect(textOf(row ?? '')).toContain('Dobra');
      expect(textOf(row ?? '')).not.toContain('—');
      expect(textOf(row ?? '')).not.toMatch(/\d|%/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the BASE freezing status unchanged through topping 0 → 1 → 20 → 50 → 0 g and removal', () => {
    const input = starterMilkBase();
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: () => JSON.stringify(['stability']),
        setItem: () => undefined,
      },
    });
    try {
      useRecipeStore.getState().addTopping(input.items[0]!.ingredient, 0);
      const toppingId = useRecipeStore.getState().toppings[0]!.id;

      for (const grams of [0, 1, 20, 50, 0]) {
        useRecipeStore.getState().setToppingGrams(toppingId, grams);
        const html = renderMonitor(input);
        expect(html).toContain('data-domain-status="GOOD"');
        expect(textOf(html)).toContain('Stabilność zamrażania');
        expect(textOf(html)).toContain('Dobra');
        expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
      }

      useRecipeStore.getState().removeTopping(toppingId);
      const removedHtml = renderMonitor(input);
      expect(removedHtml).toContain('data-domain-status="GOOD"');
      expect(textOf(removedHtml)).toContain('Dobra');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['GOOD', 'Dobra'],
    ['ATTENTION', 'Wymaga uwagi'],
    ['UNAVAILABLE', 'Brak danych'],
    ['STALE', 'Oczekuje na przeliczenie'],
  ] as const)('maps %s in the adapter instead of deriving status in React', (status, copy) => {
    const input = starterMilkBase();
    const row = buildProfessionalMonitorModules(
      calculateRecipe(input),
      input.target_temperature_c,
      input,
      status,
    )
      .find((module) => module.id === 'stability')
      ?.primary.find((metric) => metric.id === 'freezing-stability');

    expect(row).toMatchObject({ value: null, unit: '', displayText: copy, domainStatus: status });
  });

  it('uses neutral no-evaluation scales without inventing a result', () => {
    const html = renderMonitor({ ...starterMilkBase(), items: [] });
    expect(html).toContain('aria-label="Słodycz: brak danych"');
    expect(html).not.toContain('data-testid="monitor-scale-pod-actual"');
    expect(textOf(html)).not.toContain('Poza zakresem');
    expect(textOf(html)).not.toContain('W ZAKRESIE');
  });

  it('shows an out-of-range segment only between the accepted band and actual point', () => {
    const problematic = withGrams(starterMilkBase(), starterLine('sucrose'), 10);
    const html = renderMonitor(problematic);
    expect(html).toMatch(/data-problem="true"/);
    const source = read('features', 'pro-workbench', 'ProfessionalMonitorModules.tsx');
    const geometry = read('features', 'pro-workbench', 'monitorScaleModel.ts');
    expect(source).toContain('data-testid={`${testId}-outside-segment`}');
    expect(geometry).toContain('redLeftPercent: markerPercent');
    expect(geometry).toContain('redLeftPercent: acceptedRightPercent');
  });

  it('shows only a compact amber preflight reminder and keeps Monitor as the daily workspace', () => {
    const html = renderMonitor();
    expect(html).toContain('data-testid="monitor-preflight-reminder"');
    expect(textOf(html)).toContain('Sprawdź ustawienia receptury');
    expect(html).not.toContain('data-testid="workbench-settings-line"');
  });

  it('keeps corrections compact and removes nutrition/process content from Monitor', () => {
    const html = renderMonitor();
    expect(html).not.toContain('monitor-detail-score');
    expect(html).not.toContain('data-testid="monitor-secondary-nutrition"');
    expect(html).not.toContain('data-testid="monitor-process-guide-entry"');
    expect(textOf(html)).not.toContain('Jak je przygotować?');
    expect(html).not.toContain('data-testid="monitor-owner-diagnostics"');
    expect(textOf(html)).not.toContain('Diagnostyka właściciela');
    const source = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(source).not.toContain('ProcessGuideEntry');
    expect(source).not.toContain('NutritionCostScorePanel');
  });

  it('preserves pin/layout contracts without mounting their noisy presentation in normal Monitor', () => {
    const source = read('features', 'user-monitor', 'userMonitorLayout.ts');
    expect(source).toContain('export function pinMetric');
    expect(source).toContain('export function unpinMetric');
    expect(source).toContain('export function movePinned');
    expect(renderMonitor()).not.toContain('aria-label="Przypnij:');
  });
});
