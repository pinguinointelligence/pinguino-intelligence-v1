/**
 * Canonical navigation config contract (owner P0, 2026-07-22 — one canonical PINGÜINO Pro).
 *
 * Pins: the exact NAWIGACJA order (8 items, „PINGÜINO Pro" third, visible to EVERYONE); the
 * 8 Pro-gated subitems on STABLE `/pro/<section>` paths; no separate „Studio" item anywhere;
 * active states for top-level + nested Pro routes (incl. the parent staying active on /pro/*);
 * no dead links, never `/dev/*`; Polish labels only.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_NAV_ITEMS,
  activeNavId,
  isGroupActive,
  visibleNavItems,
} from './appNav';

// Every route the app actually serves (src/app/router.tsx), used to prove there are no dead links.
const REAL_ROUTES = new Set([
  '/', '/start', '/pro', '/studio', '/recipes', '/my-recipes', '/label', '/api',
  '/work-with-us', '/subscription', '/create-ingredient', '/profile/machine', '/products/import',
  '/pro/recipe', '/pro/monitor', '/pro/versions', '/pro/production', '/pro/history',
  '/pro/costs', '/pro/exports', '/pro/settings',
]);

const loc = (pathname: string, search = '') => ({ pathname, search });

describe('canonical appNav config (one canonical PINGÜINO Pro)', () => {
  it('NAWIGACJA carries the owner-fixed 8 items in order — „PINGÜINO Pro" third, for EVERYONE', () => {
    const mainIdsPro = visibleNavItems(true).filter((i) => i.group === 'main').map((i) => i.id);
    const mainIdsNon = visibleNavItems(false).filter((i) => i.group === 'main').map((i) => i.id);
    const expected = ['home', 'start', 'proHome', 'recipes', 'myRecipes', 'machine', 'labels', 'subscription'];
    expect(mainIdsPro).toEqual(expected);
    expect(mainIdsNon).toEqual(expected); // Moja maszyna / Etykiety i produkty / Subskrypcja never disappear
  });

  it('Pro sees the full 8-item PINGÜINO Pro group on stable /pro/<section> paths', () => {
    const pro = visibleNavItems(true).filter((i) => i.group === 'pro');
    expect(pro.map((i) => i.id)).toEqual([
      'proRecipe', 'proMonitor', 'proVersions', 'proProduction', 'proHistory', 'proCosts', 'proExports', 'proSettings',
    ]);
    expect(pro.map((i) => i.to)).toEqual([
      '/pro/recipe', '/pro/monitor', '/pro/versions', '/pro/production', '/pro/history',
      '/pro/costs', '/pro/exports', '/pro/settings',
    ]);
  });

  it('non-Pro sees NONE of the Pro subroutes (but keeps the honest PINGÜINO Pro entry)', () => {
    const ids = visibleNavItems(false).map((i) => i.id);
    expect(ids).toContain('proHome');
    for (const id of ['proRecipe', 'proMonitor', 'proProduction', 'proExports', 'proSettings']) {
      expect(ids).not.toContain(id);
    }
  });

  it('never shows a separate „Studio" item', () => {
    for (const item of APP_NAV_ITEMS) {
      expect(item.label.toLowerCase().includes('studio'), item.id).toBe(false);
      expect(item.to.includes('/studio'), item.id).toBe(false);
    }
  });

  it('computes active state for top-level + stable Pro section routes (deep-link + refresh)', () => {
    expect(activeNavId(loc('/'), false)).toBe('home');
    expect(activeNavId(loc('/start'), false)).toBe('start');
    expect(activeNavId(loc('/my-recipes'), true)).toBe('myRecipes');
    expect(activeNavId(loc('/profile/machine'), true)).toBe('machine');
    expect(activeNavId(loc('/subscription'), true)).toBe('subscription');
    expect(activeNavId(loc('/pro/monitor'), true)).toBe('proMonitor');
    expect(activeNavId(loc('/pro/production'), true)).toBe('proProduction');
    expect(activeNavId(loc('/pro/recipe'), true)).toBe('proRecipe');
    expect(activeNavId(loc('/pro'), true)).toBe('proRecipe'); // the workspace root shows the editor
    expect(activeNavId(loc('/pro'), false)).toBe('proHome'); // non-Pro: the honest gate entry
  });

  it('keeps the parent „PINGÜINO Pro" visibly active on EVERY /pro/* route', () => {
    const proHome = APP_NAV_ITEMS.find((i) => i.id === 'proHome')!;
    for (const path of ['/pro', '/pro/recipe', '/pro/monitor', '/pro/versions', '/pro/costs', '/pro/settings']) {
      expect(proHome.isActive(loc(path)), path).toBe(true);
    }
    expect(proHome.isActive(loc('/my-recipes'))).toBe(false);
    expect(isGroupActive('pro', loc('/pro/costs'), true)).toBe(true);
    expect(isGroupActive('pro', loc('/my-recipes'), true)).toBe(false);
  });

  it('never links a dead route and never exposes /dev/*', () => {
    for (const item of APP_NAV_ITEMS) {
      const path = item.to.split('?')[0]!;
      expect(item.to.includes('/dev/'), item.id).toBe(false);
      expect(REAL_ROUTES.has(path), `${item.id} → ${path}`).toBe(true);
    }
  });

  it('has Polish labels (none of the banned English shell words)', () => {
    const banned = ['Start', 'Recipes', 'My Recipes', 'Subscription', 'Save recipe', 'Sign out', 'Settings', 'Production', 'Costs', 'Exports', 'Back to landing', 'Studio'];
    for (const item of APP_NAV_ITEMS) {
      expect(banned, item.id).not.toContain(item.label);
    }
  });
});
