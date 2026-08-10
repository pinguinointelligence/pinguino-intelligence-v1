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

const { MonitorPanelContent } = await import('./MonitorPanelContent');

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

function renderMonitor(input: RecipeInput = starterMilkBase()) {
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
  beforeEach(() => useRecipeProfileStore.getState().resetForTests());

  it('renders one score and the exact shared Profile six-axis component/state', () => {
    const html = renderMonitor();
    expect((html.match(/data-testid="monitor-summary-score"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('monitor-detail-score');
    expect(html).toContain('data-testid="monitor-summary-axes"');
    expect(html).toContain('data-testid="profile-direction-axes"');
    for (const id of ['sweetness', 'softness']) {
      expect(html).toContain(`data-testid="axis-minus-${id}"`);
      expect(html).toContain(`data-testid="axis-plus-${id}"`);
    }
    for (const id of ['creaminess', 'flavor']) {
      expect(html).toContain(`data-testid="profile-axis-${id}"`);
      expect(html).not.toContain(`data-testid="axis-minus-${id}"`);
      expect(html).toContain('WYMAGA KALIBRACJI');
    }
    for (const id of ['structure', 'stability']) {
      expect(html).toContain(`data-testid="profile-axis-${id}"`);
      expect(html).not.toContain(`data-testid="axis-minus-${id}"`);
      expect(html).not.toContain(`data-testid="axis-plus-${id}"`);
    }
  });

  it('uses one shared target state; moving it keeps the actual marker and grams independent', () => {
    const input = starterMilkBase();
    const gramsBefore = input.items.map((item) => item.planned_grams);
    const before = renderMonitor(input);
    expect(before).toContain('data-testid="axis-target-sweetness" data-position="50"');

    useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
    const after = renderMonitor(input);
    expect(after).toContain('data-testid="axis-actual-sweetness"');
    expect(targetStepToPosition(useRecipeStore.getState().direction_targets.sweetness)).toBe(100);
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(input.items.map((item) => item.planned_grams)).toEqual(gramsBefore);

    const profile = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    const summary = read('features', 'pro-workbench', 'MonitorLiveSummary.tsx');
    expect(summary).toContain('<ProfileDirectionAxes');
    expect(profile).toContain('moveDirectionTarget');
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

  it('renders six compact technological modules with their core metrics visible immediately', () => {
    const html = renderMonitor();
    const text = textOf(html);
    const modules = [
      ['freezing', 'Zamrożenie', ['Frakcja lodu', 'PAC', 'NPAC']],
      ['sugars', 'Słodycz i cukry', ['POD', 'Cukry ogółem']],
      ['water-solids', 'Woda i ciała stałe', ['Woda', 'Ciała stałe']],
      ['fat', 'Tłuszcz i kremowość', ['Tłuszcz']],
      ['protein', 'Białko i struktura', ['Białko napowietrzające', 'Białko w suchej masie']],
      ['stability', 'Stabilność i ryzyka', ['Ryzyko krystalizacji laktozy']],
    ] as const;
    for (const [id, title, metrics] of modules) {
      expect(html).toContain(`data-testid="monitor-module-${id}"`);
      expect(text).toContain(title);
      for (const metric of metrics) expect(text).toContain(metric);
    }
    expect(html).not.toContain('data-testid="user-monitor-module-expert"');
    expect(text).not.toContain('Tryb Expert');
    expect(text).not.toContain('Przypnij');
  });

  it('renders every canonical raw metric once and never exposes proprietary min/max ranges', () => {
    const html = renderMonitor();
    for (const metric of ['ice_fraction', 'pac', 'npac', 'pod', 'water']) {
      expect((html.match(new RegExp(`data-raw-metric="${metric}"`, 'g')) ?? []).length).toBe(1);
    }
    expect(html).not.toMatch(/data-(min|max|range)=/);
    expect(textOf(html)).not.toMatch(/zakres\s+\d+[.,]?\d*\s*[–-]\s*\d/i);
  });

  it('uses compact grey no-evaluation treatment and concise metric tooltips', () => {
    const html = renderMonitor({ ...starterMilkBase(), items: [] });
    expect(html).toContain('data-evaluation="none"');
    for (const metric of ['ice_fraction', 'npac', 'pod', 'water', 'total_solids', 'fat']) {
      expect(html).toContain(`data-raw-metric="${metric}" data-evaluation="none"`);
      expect(html).not.toContain(`data-testid="monitor-actual-${metric}"`);
    }
    expect(textOf(html)).not.toContain('Brak oceny');
    expect(html).toContain('data-testid="monitor-metric-info-');
    expect(html).toContain('title="');
  });

  it('auto-expands a problematic module enough to expose its secondary cause rows', () => {
    const problematic = withGrams(starterMilkBase(), starterLine('sucrose'), 10);
    const html = renderMonitor(problematic);
    expect(html).toMatch(/data-problem="true"/);
    expect(html).toMatch(/<details[^>]*open=""[^>]*data-testid="monitor-module-details-/);
  });

  it('shows only a compact amber preflight reminder and keeps Monitor as the daily workspace', () => {
    const html = renderMonitor();
    expect(html).toContain('data-testid="monitor-preflight-reminder"');
    expect(textOf(html)).toContain('Sprawdź ustawienia receptury');
    expect(html).not.toContain('data-testid="workbench-settings-line"');
  });

  it('keeps corrections and nutrition/cost compact and secondary, with owner diagnostics separate', () => {
    const html = renderMonitor();
    expect(html).not.toContain('monitor-detail-score');
    expect(html).toContain('data-testid="monitor-secondary-nutrition"');
    expect(textOf(html)).toContain('DO PRZEGLĄDU');
    expect(html).toContain('data-testid="monitor-process-guide-entry"');
    expect(textOf(html)).toContain('Jak je przygotować?');
    expect(html).toContain('data-testid="monitor-owner-diagnostics"');
    expect(textOf(html)).toContain('Diagnostyka właściciela');
    expect(textOf(html)).toContain('ADVANCED');
    expect(html.indexOf('monitor-process-guide-entry')).toBeLessThan(
      html.indexOf('monitor-owner-diagnostics'),
    );
  });

  it('preserves pin/layout contracts without mounting their noisy presentation in normal Monitor', () => {
    const source = read('features', 'user-monitor', 'userMonitorLayout.ts');
    expect(source).toContain('export function pinMetric');
    expect(source).toContain('export function unpinMetric');
    expect(source).toContain('export function movePinned');
    expect(renderMonitor()).not.toContain('aria-label="Przypnij:');
  });
});
