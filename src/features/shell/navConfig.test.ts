import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { NAV_ITEMS, NAV_PLACEHOLDER_ROUTES } from './navConfig';

describe('navConfig (top navigation, Phase 6C)', () => {
  it('exposes the seven required top-level items, in order', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      'start',
      'calculator',
      'recipes',
      'label',
      'api',
      'subscription',
      'ingredient',
    ]);
  });

  it('every item declares its own size, layout and a routable target', () => {
    for (const item of NAV_ITEMS) {
      expect(item.size, item.id).toBeTruthy();
      expect(item.layout, item.id).toBeTruthy();
      expect(item.to.startsWith('/'), item.id).toBe(true);
      expect(item.label.length, item.id).toBeGreaterThan(0);
    }
  });


  it('PI Calculator surfaces the engine label (legacy unrouted config)', () => {
    const calc = NAV_ITEMS.find((item) => item.id === 'calculator');
    expect(calc?.engineLabel).toBe(copy.nav.engineLabel);
    // Owner P0 repair: `copy.studio.engineTag` no longer exists — the CANONICAL surface derives
    // its engine label from the resolved route (engineRouteLabel). This legacy config is unrouted.
    expect(typeof copy.nav.engineLabel).toBe('string');
  });

  it('routes PI Calculator straight to Advanced Studio (Slice 3)', () => {
    const calc = NAV_ITEMS.find((item) => item.id === 'calculator');
    expect(calc?.to).toBe('/studio');
    // every functional Calculator submenu link lands on /studio (none on /calculator)
    for (const link of calc?.groups?.[0]?.links ?? []) {
      if (link.to) expect(link.to).toBe('/studio');
    }
  });

  it('points the Recipes "My Recipes" link at the saved-recipes page (Slice 3)', () => {
    const recipes = NAV_ITEMS.find((item) => item.id === 'recipes');
    const mine = recipes?.groups?.[0]?.links.find((l) => l.label === copy.nav.recipes.mine);
    expect(mine?.to).toBe('/my-recipes');
    expect(recipes?.to).toBe('/recipes'); // top-level Recipes → the dark hub
  });

  it('uses distinct menu sizes across the items (variable mega-menu footprint)', () => {
    const sizes = new Set(NAV_ITEMS.map((item) => item.size));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('declares the placeholder destination routes for Slice 1', () => {
    expect([...NAV_PLACEHOLDER_ROUTES]).toEqual([
      '/calculator',
      '/label',
      '/api',
            '/subscription',
      '/create-ingredient',
    ]);
  });

  it('contains no banned / reference-brand terms in any nav string', () => {
    const banned = [/tesla/i, /\bdemo\b/i];
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') strings.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(NAV_ITEMS);
    for (const text of strings) {
      for (const re of banned) expect(re.test(text), text).toBe(false);
    }
  });
});
