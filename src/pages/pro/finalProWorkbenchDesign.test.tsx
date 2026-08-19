import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { APP_NAV_ITEMS } from '@/features/shell/appNav';
import { SurfaceToneContext } from '@/components/ui/surface';
import { shouldActivateMobileCockpitModal } from '@/features/studio/mobileCockpitModal';

const SRC = resolve(import.meta.dirname, '..', '..');
const ROOT = resolve(SRC, '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const sha256 = (...parts: string[]) =>
  createHash('sha256')
    .update(readFileSync(join(ROOT, ...parts)))
    .digest('hex');

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
    expect(theme).toContain('background-color: var(--color-charcoal)');
    expect(theme).toContain('.theme-pro-light .bg-charcoal');
    for (const token of ['--color-pro-warm', '--color-pro-graphite', '--shadow-pro-sm']) {
      expect(read('styles', 'tokens.css')).toContain(token);
    }
  });

  it('keeps primary actions black with white text and semantic colors purposeful', () => {
    const editor = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    const workbar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(editor).toMatch(/bg-ink[^"']*text-white/);
    expect(editor).toContain('data-testid="pro-workbar-recalc"');
    expect(workbar).toMatch(/bg-ink[^"']*text-white/);
    const tokens = read('styles', 'tokens.css');
    expect(tokens).toContain('--color-nonproduction-pink');
  });

  it('uses the exact owner-provided logo and removes the retired ice-circle tutorial', () => {
    expect(sha256('public', 'logo', 'gellattiLOGO.png')).toBe(
      'b1c85e5a47fb25ab296668e17a04f33df56d6701aba4525d2fd9ee6fd72b7721',
    );
    expect(existsSync(join(ROOT, 'public', 'logo', 'gellattiLOGO.png'))).toBe(true);
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const education = read('features', 'education', 'ContextualEducationView.tsx');
    expect(page).toContain('brand={<OfficialProLogo />}');
    expect(logo).toContain("'/logo/gellattiLOGO.png'");
    expect(logo).toContain('data-logo-source="/logo/gellattiLOGO.png"');
    expect(panel).toContain('<ContextualEducationView');
    expect(education).not.toContain('ice-cockpit-bg.png');
    expect(education).not.toContain('education-ice-cockpit');
    expect(education).toContain('contextual-learning-hub');
  });
});

describe('one global menu and four local contexts', () => {
  it('keeps one shallow Pro workspace destination and removes contextual routes from the hamburger', () => {
    const routes = new Set(APP_NAV_ITEMS.map((item) => item.to));
    expect(routes).toContain('/pro/recipe');
    for (const route of [
      '/pro/monitor',
      '/pro/versions',
      '/pro/production',
      '/pro/history',
      '/pro/costs',
      '/pro/exports',
      '/pro/settings',
      '/pro/machine',
      '/pro/tools',
    ])
      expect(routes, route).not.toContain(route);
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
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
    for (const label of ['Receptura', 'Monitor', 'Produkcja', 'Etykieta']) {
      expect(tabs).toContain(`label: '${label}'`);
    }
    expect(tabs).toContain('onTabChange(tab.id)');
    expect(panel).toContain('setEducationOpen(true)');
    expect(panel).not.toContain('navigate(');
  });

  it('switches Summary to the frozen actual Base and Toppings after Production completion', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(panel).toContain('production?.session?.completionSnapshot');
    expect(panel).toContain('completed?.productComposition.toppings ?? toppings');
    expect(panel).toContain("completed ? 'Faktyczna zakończona partia'");
    expect(panel).toContain('item.actual_grams ?? item.planned_grams');
    expect(panel).toContain('Masa całej partii produktu finalnego');
    expect(panel).not.toContain('Ilość netto produktu finalnego');
  });
});

describe('recipe and production table modes', () => {
  it('normal recipe mode shows planned grams but no actual-production column', () => {
    const html = renderIngredients('recipe');
    expect(html).toContain('Cena/kg');
    expect(html).toContain('Zablokuj gramy');
    expect(html).toContain('Zablokuj % partii');
    expect(html).not.toContain('Faktycznie');
  });

  it('Production replaces builder controls with plan, actual, difference and status', () => {
    const html = renderIngredients('production');
    for (const label of ['Planowane', 'Faktycznie', 'Różnica', 'Status'])
      expect(html).toContain(label);
    expect(html).not.toContain('Szukaj składników');
    expect(html).not.toContain('Cena/kg');
    expect(html).toContain('data-readiness="W PRZYGOTOWANIU"');
  });

  it('keeps percentage and gram locks interactive and mutually visible', () => {
    const html = renderIngredients('recipe');
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    const price = read('features', 'ingredient-builder', 'IngredientPriceControl.tsx');
    expect(html).toMatch(/data-testid="row-lock-percent-[^"]+"/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*data-testid="row-lock-percent-[^"]+"/);
    expect(html).toMatch(/data-testid="row-lock-grams-[^"]+"/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(row).toContain('t.recipe.findSubstitute');
    expect(row).not.toContain('W PRZYGOTOWANIU');
    expect(price).toContain('Moja cena');
    expect(price).toContain('Moja cena za kg');
  });

  it('uses one opaque, metadata-filtered picker for Base and Toppings without visible technical ids', () => {
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    for (const label of [
      'Wszystkie',
      'Ulubione',
      'Świeże',
      'Mleczne',
      'Suche',
      'Czekolada',
      'Owoce',
      'Orzechy',
      'Pasty',
    ]) {
      expect(picker).toContain(`label: '${label}'`);
    }
    expect(picker).toContain('matchesPickerFilter');
    expect(picker).toContain('Nr art.');
    expect(picker).toContain('Informacje o');
    expect(picker).toContain('Dodaj własny składnik ręcznie');
    expect(picker).toContain('event.stopPropagation()');
    expect(picker).not.toMatch(/`Produkt \$\{option\.name\} · ID/);
    expect(picker).not.toContain('Mapper ${entity.entityId}');
    expect(builder).toContain('data-testid="ingredient-add-slot"');
    expect(builder).toContain('scope="BASE_FORMULATION"');
    expect(builder).toContain('scope="POST_PROCESS_ADDON"');
  });
});

describe('profile semantics and readiness', () => {
  it('provides only the two approved direct recipe controls', () => {
    const panel = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    for (const id of ['sweetness', 'softness']) {
      expect(panel).toContain(`['${id}',`);
    }
    for (const label of ['Słodycz', 'Twardość', 'Mniej słodkie', 'Bardziej twarde'])
      expect(panel).toContain(label);
    expect(panel).toContain('const DETENTS = [-2, -1, 0, 1, 2] as const');
    expect(panel).not.toContain('creaminess');
    expect(panel).not.toContain('intensity');
    expect(panel).not.toContain("['structure',");
    expect(panel).not.toContain("['stability',");
  });

  it('marks Sorbet, Vegan, Protein and quality behavior honestly', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain('role="status"');
    expect(settings).toContain('aria-live="polite"');
    for (const type of ["visibleProductType === 'sorbet'", "visibleProductType === 'vegan'"]) {
      expect(settings).toContain(type);
    }
    expect(settings).toContain('<ProteinTargetControl');
    expect(settings).toContain('Mapper 2088');
    expect(settings).not.toContain('testid="workbench-quality"');
    expect(settings).toContain('testid="workbench-strategy"');
    expect(settings).toContain("label: 'OPTIMAL'");
    expect(settings).toContain("label: 'ECO'");
    expect(settings).toContain('Priorytet smaku.');
    expect(settings).toContain('Priorytet kosztu.');
    expect(settings).not.toContain('const MODES: ProductMode[]');
    expect(settings).toContain('CZĘŚCIOWO PODŁĄCZONE');
  });

  it('hides serving mode for home machines and keeps it for professional machines', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain("store.machineKind === 'home'");
    expect(settings).toContain('home-machine-capacity');
    expect(settings).toContain('Pojemność jednego cyklu');
    expect(settings).toContain('testid="workbench-serving"');
  });
});

describe('Monitor, overlay, responsiveness and truthfulness', () => {
  it('protects internal bands while using an Engine-driven green scale and staged Preview', () => {
    const monitor = read('features', 'pro-workbench', 'ProfessionalMonitorModules.tsx');
    const theme = read('styles', 'theme-pro-light.css');
    const model = read('features', 'pro-workbench', 'professionalMonitorModel.ts');
    const diagnostic = read('features', 'studio', 'OwnerDiagnosticPanel.tsx');
    expect(monitor).toContain('monitor-summary-grid');
    expect(monitor).toContain('data-scale-metric');
    expect(monitor).toContain('geometry.acceptedWidthPercent');
    expect(monitor).toContain('bg-[#a8dfb1]');
    expect(monitor).toContain('bg-[#101113]');
    expect(monitor).toContain('outside-segment');
    expect(monitor).not.toContain('bg-[#8f5e4d]/72');
    expect(monitor).not.toContain('bg-[#b98555]/68');
    expect(monitor).not.toContain('band.bandMin.toFixed');
    expect(monitor).not.toContain('band.bandMax.toFixed');
    expect(theme).toContain('minmax(8rem, 1.25fr) 6.75rem');
    expect(theme).not.toContain('minmax(5.5rem, auto)');
    expect(model).toContain('bandPosition');
    expect(diagnostic).not.toContain('a.window.minPercentOfTotalMix');
    expect(diagnostic).not.toContain('a.window.maxPercentOfTotalMix');
    expect(diagnostic).not.toContain('a.window.mapperId');
  });

  it('uses explicit five-detent Direction semantics without permanent helper clutter and keeps the Pro summary fully Polish', () => {
    const axes = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    const summary = read('features', 'pi-panel', 'NutritionCostScorePanel.tsx');
    const proCopy = read('copy', 'pro.pl.ts');
    expect(axes).toContain('const DETENTS = [-2, -1, 0, 1, 2] as const');
    expect(axes).toContain('role="radio"');
    expect(axes).toContain('aria-checked={position === detent}');
    expect(axes).toContain("event.key === 'ArrowRight'");
    expect(axes).toContain("'border-[#f58a07] bg-[#f58a07] text-white shadow-pro-e1'");
    expect(axes).not.toContain('Po zmianie:');
    expect(axes).not.toContain('Legenda kierunku');
    for (const label of ['Wartości odżywcze i koszt', 'Na 100 g', 'Węglowodany', 'Cała partia']) {
      expect(proCopy).toContain(label);
    }
    expect(summary).toContain('copy/pro.pl');
  });

  it('names score concepts and provides shared keyboard/reduced-motion treatment', () => {
    const header = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    const production = read('features', 'production-workspace', 'ProductionCockpit.tsx');
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const theme = read('styles', 'theme-pro-light.css');
    expect(page).toContain('WorkbenchIntelligenceHeader');
    expect(header).toContain('Dopasowanie techniczne receptury');
    expect(page).not.toContain('production.score');
    expect(production).toContain('Przewidywane dopasowanie partii');
    expect(theme).toContain(':focus-visible');
    expect(theme).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the focused Monitor modules mounted and Preview as a fixed overlay', () => {
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    for (const component of [
      'ProfessionalMonitorModules',
      'CorrectionPanel',
      'OwnerDiagnosticPanel',
    ]) {
      expect(panel).toContain(component);
    }
    expect(panel).not.toContain('NutritionCostScorePanel');
    expect(panel).not.toContain('ProcessGuideEntry');
    expect(panel).not.toContain('UserMonitorPro');
    expect(panel).not.toContain('OverallScoreCard');
    const preview = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    expect(preview).toContain('fixed inset-0');
    expect(preview).toContain('role="dialog"');
  });

  it('locks the desktop body and provides a mobile cockpit bottom sheet without horizontal scrolling', () => {
    const shell = read('features', 'shell', 'AppShell.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(shell).toContain('xl:h-dvh');
    expect(shell).toContain('xl:overflow-hidden');
    expect(shell).toContain('max-sm:flex-nowrap');
    expect(read('styles', 'theme-pro-light.css')).toContain(
      '@container right-pane (max-width: 540px)',
    );
    expect(read('styles', 'theme-pro-light.css')).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
    expect(surface).toContain('mobile-cockpit-trigger');
    expect(surface).toContain('mobile-cockpit-sheet');
    expect(surface).toContain('h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))]');
    expect(surface).not.toContain('overflow-x-auto');
  });

  it('treats the mobile cockpit as a real modal with keyboard and scroll containment', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(shouldActivateMobileCockpitModal(true, true)).toBe(true);
    expect(shouldActivateMobileCockpitModal(true, false)).toBe(false);
    expect(shouldActivateMobileCockpitModal(false, true)).toBe(false);
    expect(surface).toContain('role="dialog"');
    expect(surface).toContain('aria-modal="true"');
    expect(surface).toContain('aria-haspopup="dialog"');
    expect(surface).toContain('ref={cockpitPanelRef}');
    expect(surface).toContain('ref={cockpitTriggerRef}');
    expect(surface).toContain('window.matchMedia(MOBILE_COCKPIT_QUERY)');
    expect(surface).toContain(
      'shouldActivateMobileCockpitModal(mobileCockpitOpen, mobileViewport)',
    );
    expect(surface).toContain("e.key === 'Escape'");
    expect(surface).toContain("e.key !== 'Tab'");
    expect(surface).toContain("body.style.overflow = 'hidden'");
  });

  it('uses pink only through explicit readiness states with accessible limitations', () => {
    const readiness = read('features', 'design-review', 'ReadinessMarker.tsx');
    for (const state of [
      'W PRZYGOTOWANIU',
      'TESTOWE / NIEPRODUKCYJNE',
      'DO PRZEGLĄDU',
      'CZĘŚCIOWO PODŁĄCZONE',
    ]) {
      expect(readiness).toContain(state);
    }
    expect(readiness).toContain('Ograniczenie:');
    expect(readiness).toContain('Wpływ na obliczenia:');
    expect(readiness).toContain('Do podłączenia:');
    expect(readiness).toContain('aria-label');
  });
});
