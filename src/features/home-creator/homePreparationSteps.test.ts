import { describe, expect, it } from 'vitest';
import type { RecipeItem } from '@/engine';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { homePreparationComplete, homePreparationSteps } from './homePreparationSteps';

const item = (id: string, name: string, grams: number): RecipeItem =>
  ({
    id,
    ingredient: { id: `ing-${id}`, name } as RecipeItem['ingredient'],
    planned_grams: grams,
    actual_grams: null,
    lock_type: 'none',
  }) as RecipeItem;

const topping = (id: string, name: string, grams: number): RecipeToppingItem =>
  ({
    id,
    ingredient: { id: `ing-${id}`, name } as RecipeToppingItem['ingredient'],
    planned_grams: grams,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: 0,
  }) as RecipeToppingItem;

describe('the order the customer weighs a recipe out in (SOL-040)', () => {
  const items = [item('l1', 'MILK 3.5%', 670), item('l2', 'SUCROSE SUGAR', 130)];
  const toppings = [topping('t1', 'Crunchy Sante Naturalne', 0)];

  it('base lines keep the recipe order, add-ons come last', () => {
    const steps = homePreparationSteps(items, toppings);
    expect(steps.map((s) => [s.name, s.stage])).toEqual([
      ['MILK 3.5%', 'base'],
      ['SUCROSE SUGAR', 'base'],
      ['Crunchy Sante Naturalne', 'topping'],
    ]);
  });

  it('a line the recipe holds at 0 g asks for no amount — none is invented', () => {
    const steps = homePreparationSteps(items, toppings);
    expect(steps.map((s) => s.grams)).toEqual([670, 130, null]);
  });

  it('done means every step weighed; an empty recipe is never done', () => {
    const steps = homePreparationSteps(items, toppings);
    expect(homePreparationComplete(steps, new Set(['l1', 'l2']))).toBe(false);
    expect(homePreparationComplete(steps, new Set(['l1', 'l2', 't1']))).toBe(true);
    expect(homePreparationComplete([], new Set())).toBe(false);
  });
});
