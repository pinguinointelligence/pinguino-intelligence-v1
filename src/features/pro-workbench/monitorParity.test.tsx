/**
 * Focused acceptance contract for the professional Monitor.
 *
 * The former parity suite protected the historical, text-heavy Monitor. The owner
 * explicitly replaced that contract with six compact technology modules, one score,
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

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function renderPanel(input: RecipeInput) {
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

  it('renders exactly one technical score and the exact shared six-axis component', () => {
    expect(html.match(/data-testid="monitor-summary-score"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="profile-direction-axes"');
    for (const axis of ['sweetness', 'softness', 'creaminess', 'flavor', 'structure', 'stability']) {
      expect(html).toContain(`data-testid="profile-axis-${axis}"`);
    }
  });

  it('renders the six approved technology modules and keeps core metrics visible', () => {
    for (const id of ['freezing', 'sugars', 'water-solids', 'fat', 'protein', 'stability']) {
      expect(html).toContain(`data-testid="monitor-module-${id}"`);
    }
    for (const label of [
      'Frakcja lodu',
      'PAC',
      'NPAC',
      'POD',
      'Woda',
      'Ciała stałe',
      'Tłuszcz',
      'Białko napowietrzające',
      'Stabilizator',
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

  it('keeps Nutrition/Cost secondary and owner diagnostics separate as ADVANCED', () => {
    expect(html).toContain('data-testid="monitor-secondary-nutrition"');
    expect(text).toContain('DO PRZEGLĄDU');
    expect(html).toContain('data-testid="monitor-process-guide-entry"');
    expect(text).toContain('Jak je przygotować?');
    expect(html).toContain('data-testid="monitor-owner-diagnostics"');
    expect(html).toContain('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(text).toContain('ADVANCED');
    expect(html.indexOf('monitor-process-guide-entry')).toBeLessThan(
      html.indexOf('monitor-owner-diagnostics'),
    );
  });

  it('uses protected position scales without exposing proprietary min/max ranges', () => {
    expect(html).toContain('grid-cols-5');
    expect(html).toContain('bg-status-error/20');
    expect(html).toContain('bg-status-ideal/28');
    expect(html).toContain('bg-gold/34');
    expect(text).not.toMatch(/zakres\s+-?\d+[.,]?\d*\s*[–-]\s*-?\d+/i);
  });

  it('renders honest no-evaluation scales for incomplete input without hiding modules', () => {
    const empty = renderPanel({ ...starterMilkBase(), items: [] });
    for (const id of ['freezing', 'sugars', 'water-solids', 'fat', 'protein', 'stability']) {
      expect(empty).toContain(`data-testid="monitor-module-${id}"`);
    }
    expect(empty).toContain('data-evaluation="none"');
    expect(empty).toContain('bg-stone-200');
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
    expect(content).toContain('setProcessGuideOpen(true)');
    expect(content).toContain('initialLesson="process"');
  });

  it('keeps the score behind the existing technical-score seam', () => {
    const summary = read('features', 'pro-workbench', 'MonitorLiveSummary.tsx');
    expect(summary).toContain('monitorScoreView');
    expect(summary).not.toContain('recipeMatchScore(');
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
