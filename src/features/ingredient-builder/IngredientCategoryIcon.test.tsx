import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import {
  ingredientCategoryMatchesFilter,
  ingredientCategorySymbolFor,
} from './ingredientCategorySymbols';

describe('shared ingredient category symbols', () => {
  it('resolves the primary row symbol from category authority with a controlled fallback', () => {
    expect(ingredientCategorySymbolFor({ category: 'dairy', form: 'chilled' })).toBe('dairy');
    expect(ingredientCategorySymbolFor({ category: 'chocolate_cocoa' })).toBe('chocolate');
    expect(ingredientCategorySymbolFor({ category: 'fruit', form: 'purée' })).toBe('fruit');
    expect(ingredientCategorySymbolFor({ category: 'nut_paste' })).toBe('nuts');
    expect(ingredientCategorySymbolFor({ category: 'stabilizer', form: 'powder' })).toBe('dry');
    expect(ingredientCategorySymbolFor({ category: null, form: 'fresh herb' })).toBe('fresh');
    expect(ingredientCategorySymbolFor({ category: 'unmapped_family' })).toBe('other');
  });

  it('uses the same mapping for filters while allowing form affinity', () => {
    const fruitPuree = { category: 'fruit', form: 'fruit_puree', favorite: true };
    expect(ingredientCategoryMatchesFilter(fruitPuree, 'all')).toBe(true);
    expect(ingredientCategoryMatchesFilter(fruitPuree, 'favorites')).toBe(true);
    expect(ingredientCategoryMatchesFilter(fruitPuree, 'fruit')).toBe(true);
    expect(ingredientCategoryMatchesFilter(fruitPuree, 'paste')).toBe(true);
    expect(ingredientCategoryMatchesFilter(fruitPuree, 'dairy')).toBe(false);
  });

  it('renders every repo-native SVG as decorative and non-focusable', () => {
    const html = renderToStaticMarkup(<IngredientCategoryIcon symbol="fruit" className="size-5" />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain('data-category-symbol="fruit"');
    expect(html).not.toContain('<title');
  });

  it('uses one apple-grapes-citrus category mark for every Fresh Fruit product', () => {
    const freshFruits = ['Banana', 'Cranberry', 'Watermelon', 'Strawberry', 'Mango'].map(
      (name) => ({ name, category: 'fruit', form: 'Fresh Fruit' }),
    );
    const symbols = freshFruits.map(({ category, form }) =>
      ingredientCategorySymbolFor({ category, form }),
    );

    expect(new Set(symbols)).toEqual(new Set(['fruit']));

    const renderedMarks = symbols.map((symbol) =>
      renderToStaticMarkup(<IngredientCategoryIcon symbol={symbol} />),
    );
    expect(new Set(renderedMarks).size).toBe(1);
    expect(renderedMarks[0]).toContain('data-fruit-category-symbol="apple-grapes-citrus"');

    const iconSource = readFileSync(
      new URL('../../components/icons/PinguinoIcons.tsx', import.meta.url),
      'utf8',
    );
    const fruitIconSource = iconSource.slice(
      iconSource.indexOf('export function FruitsIcon'),
      iconSource.indexOf('/** Nuts'),
    );
    expect(fruitIconSource).not.toMatch(/strawberry/i);
  });

  it('drives both picker chips and product result marks without letter avatars', () => {
    const picker = readFileSync(new URL('./ProductPickerPopover.tsx', import.meta.url), 'utf8');
    expect(picker).toContain('<IngredientCategoryIcon symbol={discoveryFilterIcon(filter)} />');
    expect(picker).toContain('symbol={ingredientCategorySymbolFor({');
    expect(picker).toContain('matchesProductDiscoveryFilter(');
    expect(picker).not.toContain('.slice(0, 1)');
  });
});
