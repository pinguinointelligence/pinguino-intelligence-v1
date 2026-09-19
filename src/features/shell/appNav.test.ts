import { describe, expect, it } from 'vitest';
import {
  APP_NAV_ITEMS,
  activeNavId,
  isGroupActive,
  navigationAudience,
  visibleNavItems,
  type NavigationAudience,
} from './appNav';
import { PRODUCTION_AREA_SECTIONS } from '@/features/production-area/productionAreaSections';

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
      'guestRecipes',
      'guestShop',
      'plans',
      'affiliate',
      'franchise',
    ]);
  });

  it('sends a guest to the canonical HOME creator, never the legacy /start shell', () => {
    const entry = APP_NAV_ITEMS.find((item) => item.id === 'tryPinguino');
    expect(entry?.to).toBe('/home');
    expect(APP_NAV_ITEMS.some((item) => item.to === '/start')).toBe(false);
    expect(activeNavId(loc('/home'), 'guest')).toBe('tryPinguino');
    expect(activeNavId(loc('/'), 'guest')).toBe('tryPinguino');
    expect(activeNavId(loc('/start'), 'guest')).toBeNull();
  });

  it('gives a guest the Recipes library without changing the signed-in entry', () => {
    const guest = APP_NAV_ITEMS.find((item) => item.id === 'guestRecipes');
    expect(guest?.to).toBe('/recipes');
    expect(guest?.audiences).toEqual(['guest']);
    expect(activeNavId(loc('/recipes'), 'guest')).toBe('guestRecipes');
    const member = APP_NAV_ITEMS.find((item) => item.id === 'recipes');
    expect(member?.to).toBe('/recipes?tab=mine');
    expect(member?.audiences).toEqual(['home', 'pro']);
    expect(ids('home')).not.toContain('guestRecipes');
    expect(ids('pro')).not.toContain('guestRecipes');
  });

  /* OWNER DECISION 2026-09-17 (Produkcja area; GEL-P0-033 navigation clause approved for
     staging 2026-09-18): ONE „Produkcja” entry replaces Produkcja, Produkty, Maszyna and
     Ustawienia etykiety. HOME and PRO now read the same product group. */
  it('returns the exact shallow Home menu with the one Produkcja entry', () => {
    expect(ids('home')).toEqual([
      'homeWorkspace',
      'recipes',
      'howItWorks',
      'production',
      'memberShop',
      'affiliate',
      'franchise',
      'help',
    ]);
  });

  it('returns the exact shallow Pro menu with the one Produkcja entry', () => {
    expect(ids('pro')).toEqual([
      'proWorkspace',
      'recipes',
      'howItWorks',
      'production',
      'memberShop',
      'affiliate',
      'franchise',
      'help',
    ]);
    expect(ids('pro').filter((id) => !ids('home').includes(id))).toEqual(['proWorkspace']);
  });

  it('maps contextual and legacy deep links to their canonical destination', () => {
    expect(activeNavId(loc('/my-recipes'), 'home')).toBe('recipes');
    expect(activeNavId(loc('/create-ingredient'), 'home')).toBe('production');
    expect(activeNavId(loc('/products/import'), 'pro')).toBe('production');
    expect(activeNavId(loc('/profile/machine'), 'home')).toBe('production');
    expect(activeNavId(loc('/pro/machine'), 'pro')).toBe('production');
    // The recipe's own Produkcja tab belongs to the Pro workspace, not to the area.
    expect(activeNavId(loc('/pro/production'), 'pro')).toBe('proWorkspace');
    expect(activeNavId(loc('/pro/history'), 'pro')).toBe('production');
    // DESIGN V3.0 GLOBAL MENU: Community is not a top-level destination any
    // more, so no menu entry claims /community or /top100. The routes stay.
    expect(activeNavId(loc('/community'), 'pro')).toBeNull();
    expect(activeNavId(loc('/top100'), 'pro')).toBeNull();
    expect(activeNavId(loc('/pro/monitor'), 'pro')).toBe('proWorkspace');
    expect(isGroupActive('product', loc('/pro/versions'), 'pro')).toBe(true);
  });

  it('keeps Produkty, Maszyna and Etykiety as sections of Produkcja, not drawer entries', () => {
    const production = APP_NAV_ITEMS.filter((item) => item.id === 'production');
    expect(production).toHaveLength(1);
    expect(production[0]?.to).toBe('/production');
    expect(production[0]?.audiences).toEqual(['home', 'pro']);
    for (const audience of ['guest', 'home', 'pro'] as const) {
      for (const retired of ['products', 'machine', 'labels']) {
        expect(ids(audience)).not.toContain(retired);
      }
    }
    expect(ids('guest')).not.toContain('production');
    expect(PRODUCTION_AREA_SECTIONS.map((section) => [section.id, section.to])).toEqual([
      ['batches', '/production'],
      ['products', '/products'],
      ['machine', '/machine'],
      ['labels', '/labels'],
    ]);
  });

  it('marks Produkcja current on every address of the area, for HOME and PRO', () => {
    const areaRoutes = [
      loc('/production'),
      loc('/production', '?tab=history'),
      loc('/pro/history'),
      loc('/products'),
      loc('/products', '?panel=markets'),
      loc('/products/scan'),
      loc('/products/import'),
      loc('/create-ingredient'),
      loc('/machine'),
      loc('/profile/machine'),
      loc('/pro/machine'),
      loc('/labels'),
      loc('/labels', '?run=r1&labelView=settings'),
      loc('/label'),
    ];
    for (const audience of ['home', 'pro'] as const) {
      for (const route of areaRoutes) {
        expect(activeNavId(route, audience), `${audience} ${route.pathname}${route.search}`).toBe(
          'production',
        );
      }
    }
    expect(activeNavId(loc('/recipes'), 'pro')).toBe('recipes');
  });

  /* DESIGN V3.0 GLOBAL MENU: Community stops being a top-level menu item — it
     belongs inside Receptury (Gellatti · Moje · Community). The /community and
     /top100 ROUTES are untouched; only the duplicate door in the drawer is gone,
     and the in-app buttons (Udostepnij, Community after a batch) still reach it. */
  it('carries no top-level Community entry in any audience', () => {
    expect(APP_NAV_ITEMS.some((item) => item.id === 'community')).toBe(false);
    for (const audience of ['guest', 'home', 'pro'] as const) {
      expect(ids(audience)).not.toContain('community');
    }
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
