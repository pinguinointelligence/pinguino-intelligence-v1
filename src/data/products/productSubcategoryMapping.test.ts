/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import { mapProductSubcategory, normalizeSubcategory } from './productSubcategoryMapping';

/** The 12 engine-native categories (src/engine/types.ts IngredientCategory). */
const ENGINE_CATEGORIES = [
  'sugar', 'dairy', 'fat', 'fruit', 'nut_paste', 'chocolate_cocoa',
  'stabilizer', 'flavor', 'alcohol', 'water', 'egg', 'other',
] as const;

const HIGH: Array<[string, string]> = [
  ['Milk', 'dairy'], ['Lactose Free Milk', 'dairy'], ['High Protein Milk', 'dairy'], ['Milk Powder', 'dairy'],
  ['Cream 18%', 'dairy'], ['Cream 35%', 'dairy'], ['Light Cream', 'dairy'],
  ['Greek Yogurt', 'dairy'], ['Greek Yogurt Light', 'dairy'], ['Natural Yogurt', 'dairy'],
  ['Greek Yogurt Stracciatella', 'dairy'], ['Lactose Free Yogurt', 'dairy'],
  ['Kefir', 'dairy'], ['Kefir Drinkable', 'dairy'], ['Mascarpone', 'dairy'],
  ['Dark Chocolate 85%+', 'chocolate_cocoa'], ['Dark Chocolate 70-75%', 'chocolate_cocoa'],
  ['Milk Chocolate', 'chocolate_cocoa'], ['White Chocolate', 'chocolate_cocoa'], ['Sugar Free Chocolate', 'chocolate_cocoa'],
  ['Cocoa Powder Pure', 'chocolate_cocoa'], ['Cocoa Powder Sweetened', 'chocolate_cocoa'],
  ['Almond Ground', 'nut_paste'], ['Almonds Peeled', 'nut_paste'], ['Almonds Whole', 'nut_paste'],
  ['Pistachios', 'nut_paste'], ['Pistachio Cream', 'nut_paste'],
  ['Peanut Butter 100% Crunchy', 'nut_paste'], ['Peanut Butter 100% Smooth', 'nut_paste'],
  ['Blueberries Frozen', 'fruit'], ['Strawberries Frozen', 'fruit'], ['Strawberry+Banana Frozen', 'fruit'],
  ['Forest Fruits Mix', 'fruit'], ['Tropical Mix Frozen', 'fruit'],
  ['Sweetener Erythritol', 'sugar'], ['Sweetener Saccharin', 'sugar'], ['Sweetener Stevia', 'sugar'],
  ['Sweetener Stevia Granular', 'sugar'], ['Vanilla Sugar', 'sugar'],
];

const MEDIUM: Array<[string, string]> = [
  ['Vanilla Aroma', 'flavor'], ['Sugar Free Jam', 'fruit'],
  ['Protein Pudding', 'dairy'], ['Protein Yogurt w/Fruit', 'dairy'],
];

const MANUAL_NULL = [
  'Hazelnut+Cocoa Cream', 'Hazelnut Cream w/Milk', 'Peanut Protein Powder',
  'Protein Drink', 'Protein Drink Choco', 'Protein Drink Mixed Fruit',
  'Coffee Beans Natural', 'Coffee Beans Strong',
  'Ground Coffee Espresso', 'Ground Coffee Mix', 'Ground Coffee Natural',
];

describe('mapProductSubcategory — high confidence', () => {
  it.each(HIGH)('maps "%s" -> %s (high)', (sub, cat) => {
    const r = mapProductSubcategory(sub);
    expect(r.category).toBe(cat);
    expect(r.confidence).toBe('high');
  });
});

describe('mapProductSubcategory — medium confidence', () => {
  it.each(MEDIUM)('maps "%s" -> %s (medium)', (sub, cat) => {
    const r = mapProductSubcategory(sub);
    expect(r.category).toBe(cat);
    expect(r.confidence).toBe('medium');
  });
});

describe('mapProductSubcategory — manual / null (never guessed)', () => {
  it.each(MANUAL_NULL)('leaves "%s" null for manual review', (sub) => {
    const r = mapProductSubcategory(sub);
    expect(r.category).toBeNull();
    expect(r.confidence).toBe('manual');
  });

  it('blank / whitespace / null / undefined -> null', () => {
    for (const v of ['', '   ', '\t', null, undefined]) {
      const r = mapProductSubcategory(v);
      expect(r.category).toBeNull();
      expect(r.confidence).toBe('manual');
    }
  });

  it('unrecognized subcategory -> null (never guessed) and echoes the raw label', () => {
    const r = mapProductSubcategory('Quantum Foam Sorbet');
    expect(r.category).toBeNull();
    expect(r.confidence).toBe('manual');
    expect(r.reason).toContain('Quantum Foam Sorbet');
  });
});

describe('mapProductSubcategory — normalization', () => {
  it('is case / whitespace / punctuation insensitive', () => {
    expect(mapProductSubcategory('  GREEK   Yogurt ').category).toBe('dairy');
    expect(mapProductSubcategory('cream 35%').category).toBe('dairy');
    expect(mapProductSubcategory('PEANUT BUTTER 100% smooth').category).toBe('nut_paste');
    expect(normalizeSubcategory('Dark Chocolate 85%+')).toBe('dark chocolate 85');
    expect(normalizeSubcategory('Strawberry+Banana Frozen')).toBe('strawberry banana frozen');
  });
});

describe('mapProductSubcategory — emitted categories are engine-valid and exact-poolable', () => {
  it('every non-null category is an engine category that mapDatasetCategory resolves EXACTLY', () => {
    for (const [sub] of [...HIGH, ...MEDIUM]) {
      const r = mapProductSubcategory(sub);
      expect(r.category, sub).not.toBeNull();
      expect(ENGINE_CATEGORIES).toContain(r.category!);
      const m = mapDatasetCategory(r.category!);
      expect(m.exact, `${r.category} must pool exactly`).toBe(true);
      expect(m.category).toBe(r.category);
    }
  });
});

describe('productSubcategoryMapping — pure boundary (static source scan)', () => {
  const SRC = readFileSync(join(import.meta.dirname, 'productSubcategoryMapping.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('has no DB / Supabase / service / privileged / env / write access', () => {
    expect(/supabase/i.test(SRC)).toBe(false);
    expect(/service[_-]?role/i.test(SRC)).toBe(false);
    expect(/@\/services\//.test(SRC)).toBe(false);
    expect(/mapper_basement/i.test(SRC)).toBe(false);
    expect(/process\.env|import\.meta\.env/.test(SRC)).toBe(false);
    expect(/saveProductMatchResult|updateProduct|createProduct/.test(SRC)).toBe(false);
    for (const verb of ['.from(', '.insert(', '.update(', '.delete(']) {
      expect(SRC.includes(verb), verb).toBe(false);
    }
  });

  it('imports the engine category only as a TYPE (no engine runtime dependency)', () => {
    expect(/import type \{[^}]*IngredientCategory[^}]*\} from '@\/engine'/.test(SRC)).toBe(true);
  });
});
