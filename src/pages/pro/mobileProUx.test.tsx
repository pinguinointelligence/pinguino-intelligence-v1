/**
 * MOBILE PRO UX + GLOBAL UI UNIFICATION — the owner's proofs (2026-08-23).
 *
 * The Pro workbench at `/pro/production` is the visual master. These proofs pin
 * what the owner asked for and what a future change must not silently undo:
 *
 *  1. ONE SHELL — the canonical hamburger is the FIRST header element on every
 *     authenticated screen, and the page origin / gutters / width come from one
 *     shared geometry module instead of per-page numbers.
 *  2. COLLAPSED MOBILE RECIPE — below `lg` a line shows name · % · g and
 *     nothing else; the five-column table is hidden rather than squeezed.
 *  3. INGREDIENT SHEET — identity + `?` + price + Main role at the top, the
 *     `%` / `g` steppers in the bottom thumb zone, and the SAME options list
 *     the desktop ••• dialog renders.
 *  4. BOTTOM PREVIEW BAR — Receptura | Monitor | Produkcja | Etykieta, where
 *     tapping the open module collapses it, above the safe-area inset.
 *
 * Source-level assertions follow the existing lock-test convention in this
 * folder: they are viewport-independent and survive the SSR snapshot.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/features/shell/AppShell';
import {
  APP_HEADER_ROW,
  APP_PAGE_WORKSPACE,
  APP_SHELL_MAX_WIDTH_CLASS,
} from '@/features/shell/shellGeometry';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('one application shell', () => {
  it('puts the canonical hamburger FIRST on every authenticated screen', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    const trigger = html.indexOf('data-testid="app-nav-trigger"');
    const brand = html.indexOf('aria-label="GELLATTI"');
    expect(trigger).toBeGreaterThanOrEqual(0);
    expect(brand).toBeGreaterThan(trigger);
    // ONE header row recipe — the workbench branch only ADDS the workbench grid.
    const shell = read('features', 'shell', 'AppShell.tsx');
    expect(shell).toContain('APP_HEADER_ROW');
    expect(shell).not.toContain('viewportLock ? <AppNavDrawer /> : null');
  });

  it('measures every page from the Production master, not from per-page numbers', () => {
    expect(APP_SHELL_MAX_WIDTH_CLASS).toBe('max-w-[1776px]');
    expect(APP_HEADER_ROW).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(APP_PAGE_WORKSPACE).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(APP_PAGE_WORKSPACE).toContain('max-w-[1776px]');
    // The geometry tokens are global, so a non-workbench screen can use them.
    const tokens = read('styles', 'tokens.css');
    for (const token of [
      '--pro-page-gutter',
      '--pro-workbench-gap',
      '--pro-app-max-width',
      '--pro-mobile-gutter',
      '--pro-header-height',
      '--pro-bottom-nav-height',
    ]) {
      expect(tokens, token).toContain(token);
    }
    expect(read('styles', 'theme-pro-light.css')).not.toContain('--pro-page-gutter:');
  });

  it('normalizes the non-workbench screens onto the shared workspace', () => {
    for (const parts of [
      ['components', 'shared', 'DestinationSurface.tsx'],
      ['pages', 'recipes', 'MyRecipesPage.tsx'],
      ['pages', 'pro', 'ProWorkspacePage.tsx'],
    ] as const) {
      const source = read(...parts);
      expect(source, parts.join('/')).toContain('APP_PAGE_WORKSPACE');
      expect(source.includes('max-w-6xl px-6'), parts.join('/')).toBe(false);
    }
    for (const parts of [
      ['components', 'shared', 'DestinationSurface.tsx'],
      ['pages', 'recipes', 'MyRecipesPage.tsx'],
      ['pages', 'NotFoundPage.tsx'],
    ] as const) {
      expect(read(...parts), parts.join('/')).toContain('pro-studio-radius-system theme-pro-light');
    }
  });
});

describe('collapsed mobile recipe line', () => {
  const controls = read('features', 'ingredient-builder', 'IngredientLineControls.tsx');
  const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');

  it('shows name, % and g — and no editing control', () => {
    expect(controls).toContain('data-testid={`row-mobile-percent-${item.id}`}');
    expect(controls).toContain('data-testid={`row-mobile-grams-${item.id}`}');
    // The collapsed line carries no stepper, no lock, no price cell, no ••• menu.
    const line = controls.slice(
      controls.indexOf('export function MobileIngredientLine'),
      controls.indexOf('function SheetSectionLabel'),
    );
    expect(line).not.toContain('DirectNumberControl');
    expect(line).not.toContain('IngredientPriceCell');
    expect(line).not.toContain('•••');
  });

  it('replaces the five-column table below lg instead of squeezing it', () => {
    expect(row).toContain('<div className="lg:hidden">');
    expect(row).toContain('<div className="hidden lg:block">');
    expect(row).toContain('<MobileIngredientLine');
  });

  it('reads the marker from explicit latest-Recalculate session evidence', () => {
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('useRecalculatedIngredientLines()');
    expect(builder).not.toContain('useChangedIngredientLines(');
    expect(builder).not.toContain('priceDirtyByLineId');
  });

  it('keeps marker evidence session-only, so reopen and hydration cannot fake a change', () => {
    const store = read('features', 'ingredient-builder', 'ingredientChangeStore.ts');
    expect(store).toContain('changedByLastRecalculation');
    expect(store).toContain('clearRecalculation');
    expect(store).not.toContain('persist(');
    expect(store).not.toContain('useRecipeStore');
  });

  it('compares exact Recalculate before/after vectors with a visible-row epsilon', () => {
    const model = read('features', 'ingredient-builder', 'ingredientChangeHighlight.ts');
    expect(model).toContain('recalculatedIngredientLineIds');
    expect(model).toContain('RECALCULATION_MARKER_EPSILON_GRAMS = 0.05');
  });

  it('marks a changed line with the existing attention accent, never a new colour', () => {
    expect(row).toContain("mode === 'recipe' && changed && 'ingredient-line-changed'");
    expect(row).toContain("data-changed={mode === 'recipe' && changed ? 'true' : undefined}");
    const css = read('styles', 'theme-pro-light.css');
    expect(css).toContain('.ingredient-line-changed');
    expect(css).toContain('var(--color-attention)');
    // An inset rail cannot shift the row, so numeric alignment survives.
    expect(css).toContain('box-shadow: inset 2px 0 0 0 var(--color-attention)');
  });
});

describe('mobile ingredient editing sheet', () => {
  const controls = read('features', 'ingredient-builder', 'IngredientLineControls.tsx');

  it('opens as a bottom sheet on the ONE shared modal primitive', () => {
    expect(controls).toContain('placement="bottom"');
    const dialog = read('components', 'ui', 'DialogShell.tsx');
    expect(dialog).toContain('env(safe-area-inset-bottom)');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("event.key === 'Escape'");
    expect(dialog).toContain("body.style.overflow = 'hidden'");
    // ToppingRow and IngredientRow must keep using that one primitive.
    expect(read('features', 'ingredient-builder', 'IngredientRow.tsx')).toContain(
      "import { DialogShell } from '@/components/ui/DialogShell'",
    );
  });

  it('shows the WHOLE catalog name in the detail view (real names exceed a phone line)', () => {
    // Found in served staging QA: "CREAM 30% · Mlekovita Cream · Chilled" was
    // truncated in the sheet header too, so the full name was unreachable.
    const header = controls.slice(controls.indexOf('<h2'), controls.indexOf('</h2>'));
    expect(header).toContain('break-words');
    expect(header).not.toContain('truncate');
  });

  it('keeps identity and category visible above the shared compact panel', () => {
    expect(controls).toContain('categoryLabelPl(item.ingredient.category)');
    expect(controls).toContain('{panelContent}');
    expect(controls).not.toContain('row-mobile-main-toggle');
    expect(controls).not.toContain('row-mobile-price');
    expect(controls).not.toContain('row-mobile-help');
    expect(controls).toContain('after:-inset-y-2.5');
  });

  it('puts the % and g steppers in the thumb zone, using the desktop control', () => {
    const thumb = controls.slice(controls.indexOf('THUMB ZONE'));
    expect(thumb.match(/softDanger=\{missingAmount\}/g)).toHaveLength(2);
    expect(thumb).toContain('<DirectNumberControl');
    expect(thumb).toContain('widthPreset="fluid"');
    expect(thumb).toContain('lockSegment');
    expect(controls).toContain('sticky bottom-0');
  });

  it('renders the SAME compact action model as the desktop ••• dialog', () => {
    expect(controls).toContain('panelContent: ReactNode');
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('const articlePanelContent = (');
    expect(row).toContain('panelContent={articlePanelContent}');
    // ONE definition, two consumers — never a second, divergent menu.
    expect(row.match(/const articlePanelContent = \(/g)).toHaveLength(1);
    expect(row.match(/\{articlePanelContent\}/g)).toHaveLength(2);
    expect(controls).not.toContain('Więcej opcji składnika');
  });
});

describe('mobile preview navigation', () => {
  const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
  const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

  it('offers the four modules in one component, in both placements', () => {
    for (const label of ['Receptura', 'Monitor', 'Produkcja', 'Etykieta']) {
      expect(tabs).toContain(`label: '${label}'`);
    }
    expect(tabs).toContain("variant?: 'header' | 'bottom'");
    expect(surface).toContain('variant="bottom"');
  });

  it('collapses the open module when it is tapped again', () => {
    expect(tabs).toContain('if (bottom && expanded && tab === activeTab)');
    expect(tabs).toContain('onCollapse?.()');
    expect(surface).toContain('onCollapse={collapseMobileCockpit}');
    // Read-only modules still collapse to Recipe. An in-progress Production
    // route stays mounted so its execution rows remain reachable underneath.
    expect(surface).toContain('collapsedMobileCockpitRoute(');
    expect(surface).toContain(
      "activeTab === 'production' && production.session?.status === 'in_progress'",
    );
    expect(surface).toContain(
      'if (routeAfterCollapse !== activeTab) onTabChange(routeAfterCollapse)',
    );
  });

  it('a BLOCKING dialog outranks the bottom stack it blocks', () => {
    // The bar (z-60) was introduced after the recalculation overlay (z-50) and
    // silently covered it on mobile — the PI dialog appeared behind Przelicz.
    const recalc = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    const dialog = read('components', 'ui', 'DialogShell.tsx');
    expect(recalc).toContain('<DialogShell');
    expect(dialog).toContain('z-[70]');
    expect(surface).toContain('z-[60]');
  });

  it('never covers the bar it is toggled from, and respects the safe area', () => {
    const labelWorkspace = read('features', 'master-label', 'LabelWorkspace.tsx');
    expect(tabs).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(surface).toContain(
      'bottom-[calc(var(--pro-bottom-nav-height)+env(safe-area-inset-bottom))]',
    );
    expect(surface).toContain(
      'pb-[calc(var(--pro-bottom-nav-height)+4.75rem+env(safe-area-inset-bottom))]',
    );
    expect(surface).toContain('[--label-workspace-bottom-inset:4.75rem]');
    expect(labelWorkspace).toContain('bottom-[var(--label-workspace-bottom-inset,0px)]');
  });

  it('retires the old „Otwórz kokpit receptury" button and the duplicate tab row', () => {
    expect(surface).not.toContain('Otwórz kokpit receptury');
    expect(surface).toContain('showTabs={false}');
    // The score / Przelicz dock is shown once: bottom stack on mobile, toolbar on xl.
    expect(read('features', 'ingredient-builder', 'IngredientBuilder.tsx')).toContain(
      'pro-workbench-action-dock ml-auto hidden min-w-0',
    );
  });
});
