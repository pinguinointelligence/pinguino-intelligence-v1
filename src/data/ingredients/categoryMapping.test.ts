import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MAPPING,
  DATASET_CATEGORIES_V0_94,
  mapDatasetCategory,
} from './categoryMapping';

/** Engine `IngredientCategory` union (runtime mirror for assertions). */
const ENGINE_CATEGORIES = new Set([
  'sugar', 'dairy', 'fat', 'fruit', 'nut_paste', 'chocolate_cocoa',
  'stabilizer', 'flavor', 'alcohol', 'water', 'egg', 'other',
]);

describe('PI Base category mapping', () => {
  it('covers every one of the 18 v0.94 dataset categories explicitly', () => {
    expect(DATASET_CATEGORIES_V0_94).toHaveLength(18);
    for (const c of DATASET_CATEGORIES_V0_94) {
      expect(CATEGORY_MAPPING[c], `missing explicit mapping for '${c}'`).toBeDefined();
    }
  });

  it('maps every dataset category to a valid engine category', () => {
    for (const c of DATASET_CATEGORIES_V0_94) {
      expect(ENGINE_CATEGORIES.has(mapDatasetCategory(c).category), `${c}`).toBe(true);
    }
  });

  it('uses the agreed explicit mappings', () => {
    const expected: Record<string, string> = {
      dairy: 'dairy', fruit: 'fruit', stabilizer: 'stabilizer', alcohol: 'alcohol', fat: 'fat',
      chocolate: 'chocolate_cocoa', nut: 'nut_paste', sweetener: 'sugar', flavor_paste: 'flavor',
      coffee_tea: 'flavor', emulsifier: 'stabilizer', fiber: 'stabilizer',
      coconut: 'other', vegetable: 'other', protein: 'other',
      base_mix: 'other', bakery: 'other', specialty: 'other',
    };
    for (const [from, to] of Object.entries(expected)) {
      expect(mapDatasetCategory(from).category, from).toBe(to);
    }
  });

  it('marks clean 1:1 mappings exact', () => {
    for (const c of [
      'dairy', 'fruit', 'stabilizer', 'alcohol', 'fat',
      'chocolate', 'nut', 'sweetener', 'flavor_paste',
    ]) {
      expect(mapDatasetCategory(c).exact, c).toBe(true);
    }
  });

  it('documents every approximation/fallback (exact=false with a reason)', () => {
    for (const c of [
      'coffee_tea', 'emulsifier', 'fiber',
      'coconut', 'vegetable', 'protein', 'base_mix', 'bakery', 'specialty',
    ]) {
      const m = mapDatasetCategory(c);
      expect(m.exact, c).toBe(false);
      expect(m.reason.length, c).toBeGreaterThan(0);
    }
  });

  it('never returns a silent unknown — unmapped input is flagged for review', () => {
    const m = mapDatasetCategory('totally_unknown_xyz');
    expect(m.category).toBe('other');
    expect(m.exact).toBe(false);
    expect(/review/i.test(m.reason)).toBe(true);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(mapDatasetCategory('  Chocolate ').category).toBe('chocolate_cocoa');
  });
});
