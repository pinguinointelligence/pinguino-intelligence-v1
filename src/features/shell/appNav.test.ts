/**
 * Canonical navigation config contract — capability filtering, active states, honest links.
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
]);

const loc = (pathname: string, search = '') => ({ pathname, search });

describe('canonical appNav config', () => {
  it('Pro sees the full 8-item PINGÜINO Pro group; the upsell is hidden', () => {
    const ids = visibleNavItems(true).map((i) => i.id);
    for (const id of ['proRecipe', 'proMonitor', 'proVersions', 'proProduction', 'proHistory', 'proCosts', 'proExports', 'proSettings']) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain('proUpsell');
  });

  it('non-Pro sees ONE safe PINGÜINO Pro upsell and NONE of the Pro subroutes', () => {
    const ids = visibleNavItems(false).map((i) => i.id);
    expect(ids).toContain('proUpsell');
    for (const id of ['proRecipe', 'proMonitor', 'proProduction', 'proExports', 'proSettings']) {
      expect(ids).not.toContain(id);
    }
  });

  it('computes active state for top-level + nested Pro (?tab=) routes, deep-links and refresh', () => {
    expect(activeNavId(loc('/'), false)).toBe('home');
    expect(activeNavId(loc('/start'), false)).toBe('start');
    expect(activeNavId(loc('/my-recipes'), true)).toBe('myRecipes');
    expect(activeNavId(loc('/subscription'), true)).toBe('subscription');
    // nested Pro workspace via the stable ?tab= contract (restored on direct-link + refresh)
    expect(activeNavId(loc('/pro', '?tab=monitor'), true)).toBe('proMonitor');
    expect(activeNavId(loc('/pro', '?tab=production'), true)).toBe('proProduction');
    expect(activeNavId(loc('/pro'), true)).toBe('proRecipe'); // default tab
  });

  it('marks the PINGÜINO Pro group active on any Pro subroute', () => {
    expect(isGroupActive('pro', loc('/pro', '?tab=costs'), true)).toBe(true);
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
    const banned = ['Start', 'Recipes', 'My Recipes', 'Subscription', 'Save recipe', 'Sign out', 'Settings', 'Production', 'Costs', 'Exports', 'Back to landing'];
    for (const item of APP_NAV_ITEMS) {
      expect(banned, item.id).not.toContain(item.label);
    }
  });
});
