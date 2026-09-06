import { describe, expect, it } from 'vitest';
import {
  APP_NAV_ITEMS,
  activeNavId,
  isGroupActive,
  navigationAudience,
  visibleNavItems,
  type NavigationAudience,
} from './appNav';

const loc = (pathname: string, search = '') => ({ pathname, search });
const ids = (audience: NavigationAudience) => visibleNavItems(audience).map((item) => item.id);

describe('plan-aware global navigation', () => {
  it('derives Guest, Home and Pro only from authenticated capabilities', () => {
    expect(
      navigationAudience({
        authenticated: false,
        canSaveRecipes: true,
        canUseProductionMode: true,
      }),
    ).toBe('guest');
    expect(
      navigationAudience({
        authenticated: true,
        canSaveRecipes: true,
        canUseProductionMode: false,
      }),
    ).toBe('home');
    expect(
      navigationAudience({
        authenticated: true,
        canSaveRecipes: true,
        canUseProductionMode: true,
      }),
    ).toBe('pro');
  });

  it('returns the exact shallow Guest menu', () => {
    expect(ids('guest')).toEqual([
      'tryPinguino',
      'howItWorks',
      'guestShop',
      'plans',
      'community',
      'affiliate',
      'franchise',
    ]);
  });

  it('returns the exact shallow Home menu', () => {
    expect(ids('home')).toEqual([
      'homeWorkspace',
      'recipes',
      'howItWorks',
      'products',
      'scanProduct',
      'machine',
      'community',
      'memberShop',
      'affiliate',
      'franchise',
    ]);
  });

  it('returns the exact shallow Pro menu with Production', () => {
    expect(ids('pro')).toEqual([
      'proWorkspace',
      'recipes',
      'howItWorks',
      'production',
      'labels',
      'products',
      'scanProduct',
      'machine',
      'community',
      'memberShop',
      'affiliate',
      'franchise',
    ]);
    expect(ids('pro').filter((id) => !ids('home').includes(id))).toEqual([
      'proWorkspace',
      'production',
      'labels',
    ]);
  });

  it('maps contextual and legacy deep links to their canonical destination', () => {
    expect(activeNavId(loc('/my-recipes'), 'home')).toBe('recipes');
    expect(activeNavId(loc('/create-ingredient'), 'home')).toBe('products');
    expect(activeNavId(loc('/products/import'), 'pro')).toBe('products');
    expect(activeNavId(loc('/profile/machine'), 'home')).toBe('machine');
    expect(activeNavId(loc('/pro/machine'), 'pro')).toBe('machine');
    expect(activeNavId(loc('/pro/production'), 'pro')).toBe('production');
    expect(activeNavId(loc('/pro/history'), 'pro')).toBe('production');
    expect(activeNavId(loc('/community'), 'pro')).toBe('community');
    expect(activeNavId(loc('/top100'), 'pro')).toBe('community');
    expect(activeNavId(loc('/pro/monitor'), 'pro')).toBe('proWorkspace');
    expect(isGroupActive('product', loc('/pro/versions'), 'pro')).toBe(true);
  });

  /* OWNER DECISION (2026-09-06): `/labels` is the one canonical settings
     destination and returns to the exact origin; only Pro exposes it. */
  it('carries one canonical Pro label-settings navigation entry', () => {
    const labels = APP_NAV_ITEMS.filter((item) => item.id === 'labels');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.to).toBe('/labels');
    expect(labels[0]?.audiences).toEqual(['pro']);
    expect(ids('guest')).not.toContain('labels');
    expect(ids('home')).not.toContain('labels');
    expect(ids('pro')).toContain('labels');
  });

  it('reaches Community and Top 100 from one Community destination', () => {
    const community = APP_NAV_ITEMS.find((item) => item.id === 'community');
    expect(community?.to).toBe('/community');
    expect(community?.audiences).toEqual(['guest', 'home', 'pro']);
  });

  it('offers one canonical Dlaczego to działa? entry to every audience', () => {
    const entry = APP_NAV_ITEMS.find((item) => item.id === 'howItWorks');
    expect(entry?.label).toBe('Dlaczego to działa?');
    expect(entry?.to).toBe('/how-it-works');
    expect(entry?.audiences).toEqual(['guest', 'home', 'pro']);
    for (const audience of ['guest', 'home', 'pro'] as const) {
      expect(visibleNavItems(audience).filter((item) => item.id === 'howItWorks')).toHaveLength(1);
    }
  });

  it('never promotes contextual actions, internals or a separate Studio destination', () => {
    const forbidden = [
      '/studio',
      '/api',
      '/create-ingredient',
      '/products/import',
      '/pro/monitor',
      '/pro/versions',
      '/pro/costs',
      '/pro/exports',
      '/pro/tools',
    ];
    expect(APP_NAV_ITEMS.every((item) => !forbidden.includes(item.to))).toBe(true);
    expect(APP_NAV_ITEMS.every((item) => !item.to.startsWith('/dev/'))).toBe(true);
    expect(APP_NAV_ITEMS.every((item) => !item.label.toLowerCase().includes('studio'))).toBe(true);
  });

  it('has unique ids, one plan workspace title, and no duplicate label inside an audience', () => {
    expect(new Set(APP_NAV_ITEMS.map((item) => item.id)).size).toBe(APP_NAV_ITEMS.length);
    for (const audience of ['guest', 'home', 'pro'] as const) {
      const items = visibleNavItems(audience);
      expect(new Set(items.map((item) => item.label)).size).toBe(items.length);
      expect(items.filter((item) => item.workspaceHome)).toHaveLength(audience === 'guest' ? 0 : 1);
    }
  });
});

/* ── COLLABORATION IA (owner decision 2026-09-03) ────────────────────────── */

describe('collaboration information architecture', () => {
  it('exposes exactly TWO collaboration entries: Affiliate and Franchise', () => {
    for (const audience of ['guest', 'home', 'pro'] as const) {
      const audienceIds = ids(audience);
      expect(audienceIds).toContain('affiliate');
      expect(audienceIds).toContain('franchise');
      // Work With Us is retired as a category, and Partner was never a separate
      // user-facing entry — Affiliate is the one name for that programme.
      expect(audienceIds).not.toContain('workWithUs');
      expect(audienceIds.filter((id) => id === 'partner' || id === 'work')).toEqual([]);
    }
  });

  it('no collaboration entry points at an operating format directly', () => {
    // maszyny / wózek / przyczepa are concepts INSIDE Franchise. They keep their
    // detail routes for deep links, but none may become a top-level door.
    const tops = visibleNavItems('guest').map((i) => i.to);
    for (const detail of ['/machines', '/mobile', '/trailer', '/work-with-us']) {
      expect(tops).not.toContain(detail);
    }
  });

  it('Franchise stays the current entry while a visitor reads any of its formats', () => {
    const franchise = visibleNavItems('guest').find((i) => i.id === 'franchise');
    expect(franchise).toBeDefined();
    for (const path of ['/franchise', '/machines', '/mobile', '/trailer', '/work-with-us']) {
      expect(franchise!.isActive(loc(path)), `${path} should mark Franchise current`).toBe(true);
    }
    expect(franchise!.isActive(loc('/affiliate'))).toBe(false);
  });
});
