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
      'workWithUs',
      'franchise',
    ]);
  });

  it('returns the exact shallow Home menu', () => {
    expect(ids('home')).toEqual([
      'homeWorkspace',
      'recipes',
      'products',
      'machine',
      'memberShop',
      'workWithUs',
      'franchise',
    ]);
  });

  it('returns the exact shallow Pro menu with Production and Labels', () => {
    expect(ids('pro')).toEqual([
      'proWorkspace',
      'recipes',
      'production',
      'products',
      'labels',
      'machine',
      'memberShop',
      'workWithUs',
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
    expect(activeNavId(loc('/label'), 'pro')).toBe('labels');
    expect(activeNavId(loc('/labels'), 'pro')).toBe('labels');
    expect(activeNavId(loc('/pro/monitor'), 'pro')).toBe('proWorkspace');
    expect(isGroupActive('product', loc('/pro/versions'), 'pro')).toBe(true);
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
