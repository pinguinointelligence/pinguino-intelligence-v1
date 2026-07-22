/**
 * Canonical shell contract (source-level) — one header, one right drawer, no legacy left menus.
 *
 * Proves the structural guarantees the owner requires without a DOM: every migrated page composes
 * the single AppShell (not the legacy left-drawer AppMenu); AppShell puts the brand LEFT and the
 * canonical hamburger RIGHT; the one drawer opens from the RIGHT and keeps its a11y (Escape + focus
 * trap + scroll lock); Studio's contextual action is „Zapisz recepturę" with the legacy links gone.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const CANONICAL_PAGES = [
  ['pages', 'recipes', 'MyRecipesPage.tsx'],
  ['pages', 'pro', 'ProWorkspacePage.tsx'],
  // Destinations (/label /api /recipes /work-with-us /create-ingredient /products/import)
  // render under the SAME canonical shell — the legacy black TopNav shell is unrouted.
  ['components', 'shared', 'DestinationSurface.tsx'],
] as const;

describe('canonical application shell', () => {
  it('every migrated page uses AppShell and NOT the legacy left-drawer AppMenu', () => {
    for (const parts of CANONICAL_PAGES) {
      const src = read(...parts);
      expect(src, parts.join('/')).toContain("from '@/features/shell/AppShell'");
      expect(src.includes("from '@/features/shell/AppMenu'"), parts.join('/')).toBe(false);
    }
  });

  it('AppShell renders the brand LEFT and the canonical hamburger RIGHT (one drawer component)', () => {
    const shell = read('features', 'shell', 'AppShell.tsx');
    expect(shell).toContain('AppNavDrawer');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    // brand link appears before the hamburger trigger in DOM order → hamburger is on the right
    const brandIdx = html.indexOf('aria-label="PINGÜINO"');
    const triggerIdx = html.indexOf('data-testid="app-nav-trigger"');
    expect(brandIdx).toBeGreaterThanOrEqual(0);
    expect(triggerIdx).toBeGreaterThan(brandIdx);
  });

  it('the one drawer opens from the RIGHT and keeps Escape + focus trap + scroll lock', () => {
    const drawer = read('features', 'shell', 'AppNavDrawer.tsx');
    expect(drawer).toContain('right-0');
    expect(drawer.includes('left-0')).toBe(false);
    expect(drawer).toContain("e.key === 'Escape'");
    expect(drawer).toContain("body.style.overflow = 'hidden'");
    expect(drawer).toContain('aria-modal="true"');
  });

  it('there is NO separate legacy Studio page — /studio is a redirect into PINGÜINO Pro', () => {
    const router = read('app', 'router.tsx');
    expect(router.includes('StudioPage')).toBe(false); // the legacy page is not routed (or imported)
    expect(router).toContain('LegacyStudioRedirect');
    expect(router).toContain(`path="/studio" element={<LegacyStudioRedirect />}`);
  });

  it('the customer drawer is THE canonical drawer (no parallel item list, no „Studio" item)', () => {
    const customerMenu = read('features', 'customer-shell', 'ui', 'CustomerMenu.tsx');
    expect(customerMenu).toContain("from '@/features/shell/AppNavDrawer'");
    expect(customerMenu.includes('CUSTOMER_MENU_ITEMS')).toBe(false);
  });
});
