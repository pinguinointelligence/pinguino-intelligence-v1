import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { APP_NAV_ITEMS } from '@/features/shell/appNav';
import { SurfaceToneContext } from '@/components/ui/surface';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const renderIngredients = (mode: 'recipe' | 'production') => {
  const input = starterMilkBase();
  const result = calculateRecipe(input);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SurfaceToneContext.Provider value="paper">
        <IngredientBuilder
          items={result.items}
          totalBatchG={result.total_batch_g}
          targetBatchG={input.target_batch_grams}
          demo={false}
          layout="workbench"
          mode={mode}
        />
      </SurfaceToneContext.Provider>
    </QueryClientProvider>,
  );
};

describe('final Pro visual system', () => {
  it('uses a white/black/graphite surface without Pro navy utilities', () => {
    const files = [
      read('pages', 'pro', 'ProWorkspacePage.tsx'),
      read('features', 'pro-workbench', 'RecipeProfilePanel.tsx'),
      read('features', 'ingredient-builder', 'IngredientRow.tsx'),
      read('features', 'studio', 'StudioEngineSurface.tsx'),
    ].join('\n');
    expect(files).not.toMatch(/(?:bg|text|border)-navy/);
    const theme = read('styles', 'theme-pro-light.css');
    expect(theme).toContain('background-color: #ffffff');
    expect(theme).toContain('.theme-pro-light .bg-charcoal');
  });

  it('keeps primary actions black with white text and semantic colors purposeful', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const workbar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(page).toMatch(/bg-ink[^"']*text-white/);
    expect(workbar).toMatch(/bg-ink[^"']*text-white/);
    const tokens = read('styles', 'tokens.css');
    expect(tokens).toContain('--color-nonproduction-pink');
  });
});

describe('one global menu and four local contexts', () => {
  it('keeps every accepted global Pro route in the hamburger inventory', () => {
    const routes = new Set(APP_NAV_ITEMS.map((item) => item.to));
    for (const route of [
      '/pro/recipe', '/pro/monitor', '/pro/versions', '/pro/production', '/pro/history',
      '/pro/costs', '/pro/exports', '/pro/settings', '/pro/machine', '/pro/tools',
    ]) expect(routes, route).toContain(route);
    expect(new Set(APP_NAV_ITEMS.map((item) => item.id)).size).toBe(APP_NAV_ITEMS.length);
  });

  it('does not restore a horizontal global tab bar', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).not.toContain('role="tablist"');
    expect(page).not.toContain('pro-tab-recipe');
    expect(page).toContain('AppShell');
  });

  it('renders Profile, Monitor, Production and Summary as contextual controls', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    for (const label of ['Profil receptury', 'Monitor', 'Produkcja', 'Podsumowanie']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('onTabChange(tab.id)');
    expect(panel).toContain('setEducationOpen(true)');
    expect(panel).not.toContain('navigate(');
  });
});

describe('recipe and production table modes', () => {
  it('normal recipe mode shows planned grams but no actual-production column', () => {
    const html = renderIngredients('recipe');
    expect(html).toContain('Cena/kg');
    expect(html).toContain('Zablokuj gramaturę:');
    expect(html).toContain('blokada procentowa w przygotowaniu');
    expect(html).not.toContain('Faktycznie');
  });

  it('Production replaces builder controls with plan, actual, difference and status', () => {
    const html = renderIngredients('production');
    for (const label of ['Planowane', 'Faktycznie', 'Różnica', 'Status']) expect(html).toContain(label);
    expect(html).not.toContain('Szukaj składników');
    expect(html).not.toContain('Cena/kg');
    expect(html).toContain('data-readiness="W PRZYGOTOWANIU"');
  });

  it('keeps percentage lock disabled and pink while gram lock remains interactive', () => {
    const html = renderIngredients('recipe');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="row-lock-percent-[^"]+"/);
    expect(html).toContain('border-nonprod/45');
    expect(html).toMatch(/data-testid="row-lock-grams-[^"]+"/);
    expect(html).toContain('Moja cena · W PRZYGOTOWANIU');
    expect(html).toContain('Znajdź zamiennik · W PRZYGOTOWANIU');
  });
});

describe('profile semantics and readiness', () => {
  it('provides four direction controls and two read-only technological axes', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    for (const id of ['sweetness', 'softness', 'creaminess', 'flavor']) {
      expect(panel).toContain(`id: '${id}'`);
    }
    expect(panel).toContain('data-testid="profile-readonly-axes"');
    expect(panel).toContain("'Lekka'");
    expect(panel).toContain("'Zbalansowana'");
    expect(panel).toContain("'Zwarta'");
    expect(panel).not.toMatch(/structureLabel[^\n]*krem/i);
  });

  it('marks Sorbet, Vegan, Protein and quality behavior honestly', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    for (const type of ["visibleProductType === 'sorbet'", "visibleProductType === 'vegan'", "visibleProductType === 'protein'"]) {
      expect(settings).toContain(type);
    }
    expect(settings).toContain('Poziomy zmieniają wagi i ranking');
    expect(settings).toContain('CZĘŚCIOWO PODŁĄCZONE');
  });

  it('hides serving mode for home machines and keeps it for professional machines', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain("const homeMachine = store.machineKind === 'home'");
    expect(settings).toContain('home-machine-auto-serving');
    expect(settings).toContain('Ustawienia dopasowane automatycznie do wybranej maszyny.');
    expect(settings).toContain('testid="workbench-serving"');
  });
});

describe('Monitor, overlay, responsiveness and truthfulness', () => {
  it('protects internal bands while showing red-green-gold-green-red position scales', () => {
    const monitor = read('features', 'user-monitor', 'UserMonitorPro.tsx');
    const scale = monitor.slice(monitor.indexOf('data-testid="monitor-protected-scale"'));
    const order = ['bg-status-error/75', 'bg-status-ideal/70', 'bg-gold/85', 'bg-status-ideal/70', 'bg-status-error/75'];
    let cursor = 0;
    for (const token of order) {
      const next = scale.indexOf(token, cursor);
      expect(next, token).toBeGreaterThanOrEqual(cursor);
      cursor = next + token.length;
    }
    expect(scale.slice(0, 700)).not.toMatch(/min|max|boundary/i);
  });

  it('keeps full Monitor modules mounted and Preview as a fixed overlay', () => {
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    for (const component of ['UserMonitorPro', 'NutritionCostScorePanel', 'CorrectionPanel', 'OverallScoreCard', 'OwnerDiagnosticPanel']) {
      expect(panel).toContain(component);
    }
    const preview = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    expect(preview).toContain('fixed inset-0');
    expect(preview).toContain('role="dialog"');
  });

  it('locks the desktop body and provides a mobile cockpit bottom sheet without horizontal scrolling', () => {
    const shell = read('features', 'shell', 'AppShell.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(shell).toContain('lg:h-dvh');
    expect(shell).toContain('lg:overflow-hidden');
    expect(shell).toContain('max-sm:grid-cols-1');
    expect(shell).toContain('max-sm:flex-nowrap');
    expect(surface).toContain('mobile-cockpit-trigger');
    expect(surface).toContain('mobile-cockpit-sheet');
    expect(surface).toContain('max-h-[82dvh]');
    expect(surface).not.toContain('overflow-x-auto');
  });

  it('uses pink only through explicit readiness states with accessible limitations', () => {
    const readiness = read('features', 'design-review', 'ReadinessMarker.tsx');
    for (const state of ['W PRZYGOTOWANIU', 'TESTOWE / NIEPRODUKCYJNE', 'DO PRZEGLĄDU', 'CZĘŚCIOWO PODŁĄCZONE']) {
      expect(readiness).toContain(state);
    }
    expect(readiness).toContain('Ograniczenie:');
    expect(readiness).toContain('Wpływ na obliczenia:');
    expect(readiness).toContain('Do podłączenia:');
    expect(readiness).toContain('aria-label');
  });
});
