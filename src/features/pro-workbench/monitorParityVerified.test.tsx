/**
 * Product-host verification for the focused professional Monitor.
 *
 * This suite renders the real /pro/monitor route. It complements the component
 * contract by proving that the owner-facing route mounts the redesigned Monitor and
 * that the values shown there still come from the current canonical draft's Engine
 * result.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

const mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

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

const { ProWorkspacePage } = await import('@/pages/pro/ProWorkspacePage');

function renderWorkbench(path = '/pro/monitor'): string {
  const state = useRecipeStore.getState();
  const input = buildRecipeInput({
    mode: state.mode,
    category: state.category,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: state.machine_capacity_grams,
    flavor_intensity: state.flavor_intensity,
    cost_priority: state.cost_priority,
    items: state.items,
  });
  behaviorFixtureState.snapshots = productBehaviorTestSnapshots(input);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function monitorPanelOf(pageHtml: string): string {
  const start = pageHtml.indexOf('data-testid="pro-monitor-panel"');
  expect(start, 'the real /pro/monitor route must mount the desktop Monitor').toBeGreaterThan(-1);
  const end = pageHtml.indexOf('</aside>', start);
  return pageHtml.slice(start, end > start ? end : pageHtml.length);
}

const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const format = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function currentResult() {
  const state = useRecipeStore.getInitialState();
  return calculateRecipe(
    buildRecipeInput({
      mode: state.mode,
      category: state.category,
      target_temperature_c: state.target_temperature_c,
      target_batch_grams: state.target_batch_grams,
      machine_capacity_grams: state.machine_capacity_grams,
      flavor_intensity: state.flavor_intensity,
      cost_priority: state.cost_priority,
      items: state.items,
    }),
  );
}

const PAGE = renderWorkbench();
const PANEL = monitorPanelOf(PAGE);
const TEXT = visibleText(PANEL);
const RESULT = currentResult();

describe('real Pro Monitor route', () => {
  it('mounts the focused Monitor in the workbench analysis rail', () => {
    expect(PANEL).toContain('data-testid="monitor-panel-content"');
    expect(PANEL).toContain('data-testid="monitor-live-summary"');
    expect(PANEL).toContain('data-testid="monitor-technology-modules"');
  });

  it('mounts all seven approved cards and no historical module stack', () => {
    for (const id of [
      'sweetness',
      'hardness',
      'freezing',
      'water-solids',
      'fat',
      'protein',
      'stability',
    ]) {
      expect(PANEL).toContain(`data-testid="monitor-module-${id}"`);
    }
    expect(PANEL).not.toContain('data-testid="user-monitor-module-');
  });

  it('shows one authoritative Engine value per headline and keeps ice/water canonical', () => {
    const pod = RESULT.indicators.find((indicator) => indicator.key === 'pod')?.value ?? null;
    expect(TEXT).toContain(pod?.toFixed(2) ?? '—');
    expect(TEXT).toContain(RESULT.npac_points?.toFixed(2) ?? '—');
    const freezing = PANEL.slice(
      PANEL.indexOf('data-testid="monitor-module-freezing"'),
      PANEL.indexOf('data-testid="monitor-module-water-solids"'),
    );
    const ice = RESULT.indicators.find((indicator) => indicator.key === 'ice_fraction')?.value ?? null;
    expect(visibleText(freezing)).toContain(format(ice));
    expect(visibleText(freezing)).not.toContain(format(RESULT.pac_points));
    const model = readFileSync(
      new URL('./professionalMonitorModel.ts', import.meta.url),
      'utf8',
    );
    expect(model).toContain("classified(result, 'ice_fraction'");
    expect(model).toContain("classified(result, 'water'");
  });

  it('has analysis-only Direction evidence and no duplicate Profile controls', () => {
    expect(PANEL).not.toContain('data-testid="monitor-summary-score"');
    expect(PANEL.match(/data-testid="monitor-direction-evidence"/g)).toHaveLength(1);
    expect(PANEL).not.toContain('data-testid="profile-direction-axes"');
    expect(PANEL).not.toContain('jeden poziom');
  });

  it('does not reintroduce superseded customer-facing diagnostics', () => {
    for (const removed of [
      'Pewność danych',
      'Gotowość produkcyjna',
      'Zalecany test partii',
      'Tryb Expert',
    ]) {
      expect(TEXT).not.toContain(removed);
    }
  });

  it('does not expose proprietary exact target ranges', () => {
    expect(TEXT).not.toMatch(/zakres\s+-?\d+[.,]?\d*\s*[–-]\s*-?\d+/i);
    expect(PANEL).not.toContain('bandMin');
    expect(PANEL).not.toContain('bandMax');
  });

  it('keeps owner diagnostics in a distinct ADVANCED area after normal Monitor modules', () => {
    const modules = PANEL.indexOf('data-testid="monitor-technology-modules"');
    const advanced = PANEL.indexOf('data-testid="monitor-owner-diagnostics"');
    expect(modules).toBeGreaterThan(-1);
    expect(advanced).toBeGreaterThan(modules);
    expect(PANEL.slice(advanced)).toContain('ADVANCED');
    expect(PANEL.slice(advanced)).toContain('data-testid="owner-identity-diagnostics"');
  });

  it('keeps Nutrition/Cost and Process outside the customer Monitor', () => {
    expect(PANEL).not.toContain('data-testid="monitor-secondary-nutrition"');
    expect(TEXT).not.toContain('Jak je przygotować?');
  });
});

describe('real Monitor layout contract', () => {
  it('leaves scrolling to the host instead of adding a nested scroll inside MonitorPanelContent', () => {
    const start = PANEL.indexOf('data-testid="monitor-panel-content"');
    const content = PANEL.slice(start);
    expect(content).not.toContain('overflow-y-auto');
    expect(content).not.toMatch(/max-h-/);
  });

  it('does not hide normal Monitor modules with display:none', () => {
    expect(PANEL).not.toContain('display:none');
    expect(PANEL).not.toContain('display: none');
  });

  it('keeps the desktop workbench and mobile cockpit hosts reachable on the real page', () => {
    expect(PAGE).toContain('data-testid="pro-monitor-panel"');
    expect(PAGE).toContain('data-testid="mobile-cockpit-trigger"');
  });
});
