import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { NAV_ITEMS, NAV_PLACEHOLDER_ROUTES } from './navConfig';

describe('navConfig (top navigation, Phase 6C)', () => {
  it('exposes the eight required top-level items, in order', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      'start',
      'calculator',
      'recipes',
      'label',
      'api',
      'work',
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

  it('Work With Us is the polished panel with exactly the four offer groups', () => {
    const work = NAV_ITEMS.find((item) => item.id === 'work');
    expect(work?.size).toBe('panel');
    expect(work?.layout).toBe('offers');
    expect(work?.groups).toHaveLength(4);
    expect(work?.groups?.map((g) => g.title)).toEqual([
      copy.nav.work.offers.app.title,
      copy.nav.work.offers.machinesApp.title,
      copy.nav.work.offers.machineMixtures.title,
      copy.nav.work.offers.ingredients.title,
    ]);
    // Each offer is a transparent group with an image placeholder + a Learn more link.
    for (const group of work?.groups ?? []) {
      expect(group.image).toBe(true);
      expect(group.links).toHaveLength(1);
      expect(group.links[0]?.label).toBe(copy.nav.learnMore);
    }
  });

  it('PI Calculator surfaces the −11°C Engine label', () => {
    const calc = NAV_ITEMS.find((item) => item.id === 'calculator');
    expect(calc?.engineLabel).toBe(copy.nav.engineLabel);
    expect(copy.nav.engineLabel).toBe(copy.studio.engineTag);
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
      '/work-with-us',
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
