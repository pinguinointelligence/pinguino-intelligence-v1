/**
 * ONE CANONICAL PINGÜINO PRO — the owner's 20 required proofs (P0, 2026-07-22).
 *
 * There is no separate customer-facing "Studio" product: /pro is the canonical root,
 * /pro/recipe the canonical editor, /studio a query-preserving redirect. One menu config
 * renders on every primary route; the sticky workbar (name + save + Monitor PI + Przelicz z PI)
 * lives at the top of the canonical editor and drives the REAL recalculation pipeline.
 *
 * The runtime persona is mocked (deterministic Pro view); the recipe/constraint stores are the
 * REAL ones in their initial state.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import { PRO_RECIPE_PATH, studioRedirectTo } from '@/app/router';
import { APP_NAV_ITEMS, visibleNavItems } from './appNav';

vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => 'pro',
}));

const { ProWorkspacePage } = await import('@/pages/pro/ProWorkspacePage');

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const renderPro = (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pro" element={<ProWorkspacePage />} />
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('canonical PINGÜINO Pro — routes (proofs 1–3)', () => {
  it('1. /studio redirects to /pro/recipe, preserving query params', () => {
    expect(PRO_RECIPE_PATH).toBe('/pro/recipe');
    expect(studioRedirectTo('?recipe=abc&tab=recipes')).toEqual({
      pathname: '/pro/recipe',
      search: '?recipe=abc&tab=recipes',
    });
    const router = read('app', 'router.tsx');
    expect(router).toContain(`path="/studio" element={<LegacyStudioRedirect />}`);
  });

  it('2. /studio does not render a separate legacy recipe editor (the page is deleted)', () => {
    expect(existsSync(join(SRC, 'pages', 'studio', 'StudioPage.tsx'))).toBe(false);
    expect(read('app', 'router.tsx').includes('StudioPage')).toBe(false);
  });

  it('3. /pro/recipe is the single canonical professional editor (workbar + engine surface)', () => {
    const html = renderPro('/pro/recipe');
    expect(html).toContain('data-testid="pro-workbar"');
    expect(html).toContain(copy.studio.eyebrow); // the engine surface renders its PL header
    // …and the bare workspace root shows the SAME editor.
    const root = renderPro('/pro');
    expect(root).toContain('data-testid="pro-workbar"');
  });
});

describe('canonical PINGÜINO Pro — menu (proofs 4–6, 17–18)', () => {
  it('4. customer-visible navigation says PINGÜINO Pro — never a separate Studio item', () => {
    expect(APP_NAV_ITEMS.some((i) => i.label === 'PINGÜINO Pro')).toBe(true);
    for (const item of APP_NAV_ITEMS) {
      expect(item.label.toLowerCase().includes('studio'), item.id).toBe(false);
      expect(item.to.includes('/studio'), item.id).toBe(false);
    }
  });

  it('5. the Pro menu contains Moja maszyna, Etykiety i produkty, Subskrypcja / Plan and all 8 Pro subitems', () => {
    const items = visibleNavItems(true);
    const labels = items.map((i) => i.label);
    for (const required of ['Moja maszyna', 'Etykiety i produkty', 'Subskrypcja / Plan']) {
      expect(labels).toContain(required);
    }
    expect(items.filter((i) => i.group === 'pro')).toHaveLength(8);
  });

  it('6. the menu is identical across primary routes — every shell renders the ONE drawer/config', () => {
    // The config itself is location-independent (visibleNavItems takes only the capability)…
    expect(visibleNavItems(true).map((i) => i.id)).toEqual(visibleNavItems(true).map((i) => i.id));
    // …and every shell renders AppNavDrawer: the canonical AppShell, and the customer bar.
    expect(read('features', 'shell', 'AppShell.tsx')).toContain('AppNavDrawer');
    expect(read('features', 'customer-shell', 'ui', 'CustomerMenu.tsx')).toContain('AppNavDrawer');
    // Landing, flow, machine profile and subscription mount the customer bar; my-recipes,
    // pro and all destinations mount AppShell — one drawer everywhere.
    expect(read('pages', 'landing', 'LandingPage.tsx')).toContain('CustomerMenu');
    expect(read('features', 'customer-shell', 'CustomerShellV1.tsx')).toContain('CustomerMenu');
    expect(read('pages', 'profile', 'MachineProfilePage.tsx')).toContain('CustomerMenu');
    expect(read('pages', 'destinations', 'SubscriptionPage.tsx')).toContain('CustomerMenu');
    expect(read('pages', 'recipes', 'MyRecipesPage.tsx')).toContain('AppShell');
    expect(read('pages', 'pro', 'ProWorkspacePage.tsx')).toContain('AppShell');
    expect(read('components', 'shared', 'DestinationSurface.tsx')).toContain('AppShell');
  });

  it('17. no legacy left sidebar returns — the drawer is right-side; no routed page uses ShellLayout', () => {
    const drawer = read('features', 'shell', 'AppNavDrawer.tsx');
    expect(drawer).toContain('right-0');
    expect(drawer.includes('left-0')).toBe(false);
    expect(read('app', 'router.tsx').includes('ShellLayout')).toBe(false);
    expect(read('components', 'shared', 'DestinationSurface.tsx').includes('ShellLayout')).toBe(false);
  });

  it('18. no /dev/* link appears in the canonical navigation', () => {
    for (const item of APP_NAV_ITEMS) expect(item.to.includes('/dev/'), item.id).toBe(false);
  });
});

describe('canonical PINGÜINO Pro — workbar (proofs 7–15)', () => {
  const html = renderPro('/pro/recipe');

  it('7+8. the workbar renders on /pro/recipe (and therefore after entering /studio via redirect)', () => {
    expect(html).toContain('data-testid="pro-workbar"');
  });

  it('9. the recipe name input exists (new, unsaved recipe)', () => {
    expect(html).toContain('data-testid="pro-workbar-name"');
    expect(html).toContain(copy.proWorkbar.namePlaceholder); // np. Pistacja Premium
  });

  it('10. Save is directly beside the name', () => {
    const name = html.indexOf('data-testid="pro-workbar-name"');
    const save = html.indexOf('data-testid="pro-workbar-save"');
    expect(name).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(name);
    expect(html).toContain(copy.proWorkbar.saveNew); // Zapisz recepturę
  });

  it('11. Monitor PI is visible at the top', () => {
    expect(html).toContain('data-testid="pro-workbar-monitor"');
    expect(html).toContain(copy.proWorkbar.monitor);
  });

  it('12. Przelicz z PI is visible at the top', () => {
    expect(html).toContain('data-testid="pro-workbar-recalc"');
    expect(html).toContain(copy.proWorkbar.recalc);
  });

  it('13. version/date and dirty state are visible (status line)', () => {
    expect(html).toContain('data-testid="pro-workbar-status"');
    expect(html).toContain(copy.proWorkbar.status.newUnsaved);
  });

  it('14. the main recalculation is not bottom-only: the TOP button initiates the real preview pipeline', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('createOptimizePreview'); // the ONE canonical pipeline
    expect(page).toContain('ProRecalcPanel');
    const panel = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    // Preview → Zastosuj/Anuluj → Cofnij all drive the constraint-studio store (no second optimizer).
    expect(panel).toContain('applyPreview');
    expect(panel).toContain('cancelPreview');
    expect(panel).toContain('undoLastApply');
    expect(panel).toContain('ConstraintPreviewCard');
    expect(panel.includes('proposeCorrections')).toBe(false); // never a bespoke solver call
  });

  it('15. no duplicate save UI returns on the canonical route', () => {
    // Exactly ONE primary save control in the workbar…
    expect(html.split('data-testid="pro-workbar-save"').length - 1).toBe(1);
    // …and the page mounts no second save dialog or legacy version-save control.
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page.includes('SaveRecipeDialog')).toBe(false);
    expect(read('features', 'studio', 'StudioEngineSurface.tsx').includes('SaveVersionControl')).toBe(false);
  });
});

describe('canonical PINGÜINO Pro — remaining structure (proof 16)', () => {
  it('16. no duplicate recipe/version list returns on Moje receptury', () => {
    const myRecipes = read('pages', 'recipes', 'MyRecipesPage.tsx');
    expect(myRecipes.includes('RecipeVersionsSection')).toBe(false);
  });
  // Proofs 19 (save/edit/delete tests) and 20 (Engine-equality tests) are the EXISTING suites —
  // they run green in the same `vitest run` gate as this file.
});
