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
    const scoreDock = read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx');
    const workbar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(editor).toContain('data-testid="ingredient-action-slot"');
    expect(scoreDock).toContain('data-testid="pro-workbar-recalc"');
    // OWNER FROZEN PRO VISUAL: the recalculate CTA now rests in graphite like
    // every other primary action — which is what this test's own name asks for.
    // Orange stopped being a fill and became the attention dot on the cue that
    // stands BESIDE the button: orange states the condition, graphite offers
    // the action. Asserted as a pair so the cue cannot be dropped silently.
    expect(scoreDock).toMatch(/bg-\[var\(--g-graphite\)\][^"']*text-white/);
    expect(scoreDock).toContain('data-testid="pro-workbar-recalc-cue"');
    expect(scoreDock).toMatch(/rounded-full bg-\[#f58a07\]/);
    expect(workbar).toMatch(/bg-ink[^"']*text-white/);
    const tokens = read('styles', 'tokens.css');
    expect(tokens).toContain('--color-nonproduction-pink');
  });

  it('uses the exact owner-approved Gellatti wordmark and removes the retired ice-circle tutorial', () => {
    expect(sha256('public', 'brand', 'gellatti-wordmark-graphite.svg')).toBe(
      '4327226fb524ee172e8c04ef3bbc497e4da68ff7040bd243385e3247df393070',
    );
    expect(existsSync(join(ROOT, 'public', 'brand', 'gellatti-wordmark-graphite.svg'))).toBe(true);
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const education = read('features', 'education', 'ContextualEducationView.tsx');
    expect(page).toContain('brand={<OfficialProLogo />}');
    expect(logo).toContain("'/brand/gellatti-wordmark-graphite.svg'");
    expect(logo).toContain('data-logo-source="/brand/gellatti-wordmark-graphite.svg"');
    expect(logo).not.toContain('gellattiLOGO.png');
    expect(panel).toContain('<ContextualEducationView');
    expect(education).not.toContain('ice-cockpit-bg.png');
    expect(education).not.toContain('education-ice-cockpit');
    expect(education).toContain('contextual-learning-hub');
  });

  it('uses one moderate rectangular corner contract while preserving functional circles', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const styles = read('styles', 'index.css');
    const tokens = read('styles', 'tokens.css');

    expect(page).toContain('className={`pro-studio-radius-system theme-pro-light');
    expect(tokens).toContain('--radius-pro-studio: 0.75rem');
    expect(styles).toContain('.pro-studio-radius-system');
    expect(styles).toContain(".rounded:not(input[type='checkbox'])");
    expect(styles).toContain('.rounded-t,');
    expect(styles).toContain('.rounded-b,');
    expect(styles).toContain('.rounded-3xl');
    expect(styles).toContain('`rounded-full` is excluded');
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

  it('keeps the four workspace modules in one horizontal header row', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('<WorkbenchModuleTabs');
    // V2.1 §8: the strip is anchored to the display column by the shared contract.
    expect(page).toContain('DESKTOP_TAB_STRIP');
    expect(page).toContain('className="w-full border-b-0"');
    expect(page).toContain('AppShell');
  });

  it('states the mode with the canonical switch, not a private badge, and keeps the small overflow menu', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const workbar = read('features', 'pro-core', 'ProWorkbar.tsx');
    const ingredient = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    const topping = read('features', 'ingredient-builder', 'ToppingRow.tsx');
    const buttons = read('components', 'ui', 'buttonStyles.ts');
    // OWNER FROZEN PRO VISUAL, 2026-09-01. SUPERSEDES the private graphite plan pill.
    // The workbench states its mode with the CANONICAL `HomeProSwitch` that the global
    // header parity lane made global — one control per meaning, one geometry per route.
    expect(page).not.toContain('data-testid="pro-plan-indicator"');
    expect(page).not.toContain('bg-[var(--g-graphite)] px-2.5 text-[9px]');
    expect(page).toContain(
      "import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch'",
    );
    // OWNER, 2026-09-02: the switch moved OUT of the workbar and into the shell's
    // canonical `globalSwitch` slot. In the workbar it was conditional on
    // `workbench` — true only for a signed-in PRO on a workbench tab — so a
    // signed-out visitor saw no switch at all on /pro. Same component, same
    // `activeView`, now unconditional. The workbar must not render a second copy.
    expect(page).toContain(
      'globalSwitch={<HomeProSwitch entitlement={proEntitlement} activeView="pro" />}',
    );
    expect(page).not.toContain('<HomeProSwitch entitlement={entitlement} activeView="pro" />');
    // The trailing edge of column 1 is owned by the shell, for every route. The class
    // list lost its `hidden xl:flex` because the group is no longer a desktop-only copy
    // of a responsive pair — a CSS-hidden duplicate still reached the accessibility tree
    // (served 8dd11c9b). The guarantee this pins — the shell owning `ml-auto` at the
    // column edge — is unchanged.
    expect(read('features', 'shell', 'AppShell.tsx')).toContain(
      'ml-auto flex min-w-0 items-center',
    );
    for (const source of [workbar, ingredient, topping]) {
      expect(source).toContain("iconButtonClasses('xs')");
      expect(source).toContain('•••');
    }
    expect(buttons).toContain('rounded-full border border-ink/10');
    expect(buttons).toContain("size === 'xs' ? 'size-7 text-[11px]'");
  });

  it('renders Profile, Monitor, Production and Summary as contextual controls', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
    for (const label of ['Receptura', 'Monitor', 'Produkcja', 'Etykieta']) {
      expect(tabs).toContain(`label: '${label}'`);
    }
    // One component, two placements: the desktop header row and the mobile
    // bottom preview bar, where tapping the open module collapses it again.
    expect(tabs).toContain('onTabChange(tab)');
    expect(tabs).toContain("variant === 'bottom'");
    expect(tabs).toContain('onCollapse?.()');
    expect(panel).toContain('setEducationOpen(true)');
    expect(panel).not.toContain('navigate(');
  });

  it('delegates Etykieta to the one completed-run LabelWorkspace authority', () => {
    const panel = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(panel).toContain('production?.session?.completionSnapshot');
    expect(panel).toContain('snapshot={completed}');
    expect(panel).toContain('initialView={initialLabelView}');
    expect(panel).toContain('key={labelViewRequestKey ?? initialLabelView}');
    expect(panel).toContain('Etykieta potrzebuje zakończonej partii');
    expect(panel).toContain('<WorkflowNotice');
    expect(panel).toContain('variant="attention"');
    expect(panel).not.toContain('rounded-[20px] border border-ink/10 bg-[#fffdf8] p-5');
    expect(panel).not.toContain('Faktyczna zakończona partia');
    expect(panel).not.toContain('Receptura wykonawcza');
    expect(panel).not.toContain('Proces i gotowość');
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

  it('Production replaces builder controls with one weighing control and SR labels', () => {
    const html = renderIngredients('production');
    for (const label of ['Plan', 'Faktycznie', 'Odchylenie']) expect(html).toContain(label);
    expect(html).toContain('data-testid="production-table-header"');
    expect(html).toContain('data-table-family="recipe"');
    expect(html).not.toContain('Składnik / status');
    expect(html).not.toContain('Szukaj składników');
    expect(html).not.toContain('Cena/kg');
    expect(html).not.toContain('data-readiness="W PRZYGOTOWANIU"');
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
    const discoveryCopy = read('copy', 'productDiscovery.ts');
    for (const label of [
      'Ulubione',
      'Wszystkie',
      'Owoce',
      'Mleczne',
      'Orzechy',
      'Czekolada',
      'Techniczne',
    ]) {
      expect(discoveryCopy).toContain(`'${label}'`);
    }
    expect(picker).toContain('PRODUCT_DISCOVERY_TOP_FILTERS.map');
    expect(picker).toContain('matchesProductDiscoveryFilter');
    expect(picker).not.toContain('Status danych ·');
    expect(picker).toContain('Pokaż status danych produktu:');
    expect(picker).toContain('data-testid="product-data-status-dialog"');
    expect(picker).not.toContain('Nr art.');
    expect(picker).toContain('Nie znaleziono produktu.');
    expect(picker).toContain('Skanuj produkt');
    expect(picker).toContain('to="/products/add"');
    expect(picker).not.toContain('Nie znalazłeś produktu?');
    // The rule changed twice on 2026-08-24 and this guard now pins BOTH halves:
    // the picker searches the whole eligible catalogue, including the products the
    // owner imported or scanned…
    expect(picker).toContain('mapperOnly: false');
    // …and a product still becomes a recipe line only through the current Mapper
    // identity it resolves to.
    expect(picker).toContain('resolveCurrentMapperCatalogSelection');
    expect(picker).toContain('engineIngredientForCatalogSelection');
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
    // End labels removed by the owner reference of 2026-09-03; the axis NAMES
    // are what the contract protects, and they are unchanged.
    for (const label of ['Słodycz', 'Twardość']) expect(panel).toContain(label);
    // Five marks, addressed by visual slot since Twardość is drawn mirrored.
    expect(panel).toContain('const DETENTS = [-2, -1, 0, 1, 2] as const;');
    expect(panel).not.toContain('creaminess');
    expect(panel).not.toContain('intensity');
    expect(panel).not.toContain("['structure',");
    expect(panel).not.toContain("['stability',");
  });

  it('marks Sorbet, Vegan, Protein and quality behavior honestly', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain('role="status"');
    expect(settings).toContain('aria-live="polite"');
    // Sorbet is a fully supported product type: no readiness marker, no
    // preparation gate and no Sorbet-only branch in the settings line.
    expect(settings).not.toContain("visibleProductType === 'sorbet'");
    expect(settings).not.toContain('Sorbet nie blokuje');
    expect(settings).not.toContain("visibleProductType === 'vegan'");
    // Result metrics do not belong inside Settings. Protein uses the shared,
    // compact result component beside Score and inside Monitor.
    expect(settings).not.toContain('<ProteinContentReadout');
    expect(settings).not.toContain('ProteinTargetControl');
    expect(settings).not.toContain('Mapper 2088');
    expect(settings).not.toContain('testid="workbench-quality"');
    expect(settings).toContain('testid="workbench-strategy"');
    expect(settings).toContain("label: 'OPTIMAL'");
    expect(settings).toContain("label: 'ECO'");
    expect(settings).toContain('Priorytet smaku.');
    expect(settings).toContain('Priorytet kosztu.');
    expect(settings).not.toContain('const MODES: ProductMode[]');
    expect(settings).not.toContain('CZĘŚCIOWO PODŁĄCZONE');
  });

  it('hides serving mode for home machines and keeps it for professional machines', () => {
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain("store.machineKind === 'home'");
    expect(settings).toContain('home-machine-capacity');
    expect(settings).toContain('Zalecany wsad na cykl');
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
    // V2.1 §16: one Monitor line — icon | metric | badge | rail | value | chevron.
    expect(theme).toContain('30px minmax(0, 1fr) 46px 114px 96px 14px');
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
    expect(axes).toContain('const DETENTS = [-2, -1, 0, 1, 2] as const;');
    expect(axes).toContain('role="radio"');
    expect(axes).toContain('aria-checked={position === detent}');
    expect(axes).toContain("event.key === 'ArrowRight'");
    /* OWNER 2026-09-03: the chosen position is an orange thumb whose SIZE
       varies with the detent — that size is now the primary statement of
       direction, replacing the numeral entirely (see
       directionDetentContrast.test.ts for what assistive tech gets instead). */
    expect(axes).toContain("rounded-full shadow-[0_0_0_3px_#fff] transition-[left,width,height");
    expect(axes).toContain('const thumbSize = sizeAt(thumbSizes, activeIndex);');
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
    const productionHeader = read(
      'features',
      'production-workspace',
      'ProductionWorkspaceHeader.tsx',
    );
    const dock = read('features', 'pro-workbench', 'WorkbenchRecipeActionDock.tsx');
    const theme = read('styles', 'theme-pro-light.css');
    expect(dock).toContain('WorkbenchIntelligenceHeader');
    expect(header).toContain('Dopasowanie techniczne receptury');
    expect(dock).not.toContain('production.score');
    // §51 SCORE TRUTH — Production presents the live forecast beside the
    // physical vessel state, while the mass cards name plan and vessel separately.
    expect(production).toContain('Przewidywany wynik');
    expect(production).toContain('ScoreRing');
    expect(production).toContain('production-score-ring');
    expect(productionHeader).not.toContain('ScoreRing');
    expect(production).toContain('W naczyniu');
    expect(production).toContain('>Cel</dt>');
    expect(production).not.toContain('Przewidywane dopasowanie partii');
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
    expect(preview).toContain('effectiveAccess?.canAdmin === true');
    expect(preview).toContain('showTechnicalDetails={canViewTechnicalDetails}');
    expect(preview).toContain("'Sprawdź proponowaną korektę.'");
  });

  it('locks the desktop body and provides a mobile cockpit bottom sheet without horizontal scrolling', () => {
    const shell = read('features', 'shell', 'AppShell.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(shell).toContain('xl:h-dvh');
    expect(shell).toContain('xl:overflow-hidden');
    expect(shell).toContain('DESKTOP_WORKBENCH_COLUMNS');
    // The workbench's global elements still sit in column 1 of the shared two-track
    // grid. The condition became unconditional when that grid was promoted to the
    // GLOBAL header geometry (owner parity decision, 2026-09-01) — the guarantee this
    // pins is the column placement, which is unchanged and now applies everywhere.
    // SUPERSEDED, owner 2026-09-02 (option A). The two-track grid moved OFF the
    // header row into a centred, scaled band, so the hamburger, the wordmark and
    // the login keep the page's full width on EVERY route — measured 32 / 96 / 32
    // px identically on Shop and PRO — while HOME | PRO and the module strip stay
    // on the workbench column edge inside that band.
    expect(shell).toContain('xl:col-start-1 xl:row-start-1');
    expect(read('styles', 'theme-pro-light.css')).toContain(
      '@container right-pane (max-width: 420px)',
    );
    expect(read('styles', 'theme-pro-light.css')).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
    expect(surface).toContain('mobile-cockpit-trigger');
    expect(surface).toContain('mobile-cockpit-sheet');
    /* OWNER 2026-09-03 — a real functional defect found in served QA. The sheet
       was `fixed top-0 z-50` and 92dvh tall measured from the VIEWPORT, so on a
       phone it stood over the global header. Monitor and Produkcja open it as
       soon as you visit them, which left the hamburger and HOME | PRO
       unreachable on both routes — the user was trapped under a permanent
       overlay simply by navigating there.

       It now starts at the canonical header offset and fills only its own box,
       so the header stays visible and clickable underneath. Measured live: the
       sheet's top equals the header's bottom to the pixel — 65 / 65 at 390 and
       430, 69 / 69 at 640 — with the hamburger and the switch hit-testing OK on
       all four PRO routes. The viewport-measured height must never come back. */
    expect(surface).toContain('top-[var(--pro-mobile-header-height)]');
    expect(surface).not.toContain(
      'fixed inset-x-0 top-0 bottom-[calc(var(--pro-bottom-nav-height)',
    );
    expect(surface).not.toContain('h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))]');
    // The sheet is a modal state and must keep an explicit way out.
    expect(surface).toContain('Zamknij kokpit');
    expect(read('styles', 'tokens.css')).toContain('--pro-mobile-header-height');
    expect(surface).not.toContain('overflow-x-auto');
  });

  it('keeps transient Friendly Lab moments globally unmounted', () => {
    const app = read('app', 'App.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const recipeCopy = read('features', 'pro-workbench', 'friendlyLabRecipeCopy.ts');
    expect(app).not.toContain('FriendlyLabMomentViewport');
    expect(profile).toContain('announceFriendlyLabMoment(');
    expect(profile).toContain("'apply-complete'");
    expect(surface).not.toContain("'gellatti:friendly-lab-apply-success'");
    expect(surface).not.toContain('mobile-friendly-lab-apply-success');
    expect(recipeCopy).toContain("title: 'Perfetto. Receptura jest gotowa.'");
    expect(recipeCopy).not.toContain('description:');
    expect(recipeCopy).not.toContain('Aktualny balans jest już widoczny');
  });

  it('treats the mobile cockpit as a real modal with keyboard and scroll containment', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(shouldActivateMobileCockpitModal(true, true)).toBe(true);
    expect(shouldActivateMobileCockpitModal(true, false)).toBe(false);
    expect(shouldActivateMobileCockpitModal(false, true)).toBe(false);
    expect(surface).toContain('role="dialog"');
    expect(surface).toContain('aria-modal="true"');
    // The trigger is now the bottom preview bar itself (owner mobile UX §11):
    // each module button is the disclosure control for the cockpit sheet.
    expect(read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx')).toContain(
      "aria-haspopup={bottom && tab.id !== 'profile' ? 'dialog' : undefined}",
    );
    expect(surface).toContain('ref={cockpitPanelRef}');
    expect(surface).toContain('triggerRef={cockpitTriggerRef}');
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
