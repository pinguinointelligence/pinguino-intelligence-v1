/**
 * Product-host verification for the focused professional Monitor.
 *
 * This suite renders the real /pro/monitor route. It complements the component
 * contract by proving that the owner-facing route mounts the redesigned Monitor and
 * that the values shown there still come from the current canonical draft's Engine
 * result.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
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

const { ProWorkspacePage } = await import('@/pages/pro/ProWorkspacePage');

function renderWorkbench(path = '/pro/monitor'): string {
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
  const end = pageHtml.indexOf('data-testid="pro-workbar"', start);
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

  it('mounts all six compact modules and no historical module stack', () => {
    for (const id of ['freezing', 'sugars', 'water-solids', 'fat', 'protein', 'stability']) {
      expect(PANEL).toContain(`data-testid="monitor-module-${id}"`);
    }
    expect(PANEL).not.toContain('data-testid="user-monitor-module-');
  });

  it('shows current Engine PAC, NPAC, ice, POD and water values rather than a fixture', () => {
    const pod = RESULT.indicators.find((indicator) => indicator.key === 'pod')?.value ?? null;
    const water = RESULT.indicators.find((indicator) => indicator.key === 'water')?.value ?? null;
    for (const [metric, value] of [
      ['pac', RESULT.pac_points],
      ['npac', RESULT.npac_points],
      ['ice_fraction', RESULT.ice_fraction_percent],
      ['pod', pod],
      ['water', water],
    ] as const) {
      const anchor = PANEL.indexOf(`data-raw-metric="${metric}"`);
      expect(anchor, metric).toBeGreaterThan(-1);
      expect(visibleText(PANEL.slice(anchor, anchor + 1200)), metric).toContain(format(value));
    }
  });

  it('has exactly one score and shares the six-axis component with Profile', () => {
    expect(PANEL.match(/data-testid="monitor-summary-score"/g)).toHaveLength(1);
    expect(PANEL.match(/data-testid="profile-direction-axes"/g)).toHaveLength(1);
    expect(PANEL.match(/data-testid="profile-axis-/g)).toHaveLength(6);
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

  it('keeps Nutrition/Cost secondary and visibly marked for review', () => {
    expect(PANEL).toContain('data-testid="monitor-secondary-nutrition"');
    expect(TEXT).toContain('DO PRZEGLĄDU');
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
