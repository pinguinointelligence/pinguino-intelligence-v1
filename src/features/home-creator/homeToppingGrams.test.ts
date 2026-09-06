/**
 * A topping's grams are editable — for real, not just on screen.
 *
 * HOME renders the same amount control on a topping row as on an ingredient row, and the
 * control committed through `setPlannedGrams`. That action looks the line up in
 * `state.items` and returns early when it is not there. Toppings live in `state.toppings`,
 * a separate collection, so every topping edit was found-nothing and silently dropped: the
 * customer typed a number, pressed done, and the row went back to what it was.
 *
 * The store already had `setToppingGrams`. Nothing needed inventing; the row was calling
 * the wrong authority.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import type { RecipeToppingIngredient } from '@/features/recipe-composition/recipeCompositionPersistence';

const SPRINKLES: RecipeToppingIngredient = {
  id: 'PI-ING-000900',
  name: 'Posypka czekoladowa',
  category: 'other',
  water: 0,
  fat: 30,
  msnf: 0,
  other_solids: 70,
  sugars: { sucrose: 60 },
  pac: 0,
  pod: 0,
} as unknown as RecipeToppingIngredient;

const toppingId = () => useRecipeStore.getState().toppings[0]?.id ?? null;

describe('editing a topping amount', () => {
  beforeEach(() => {
    useRecipeStore.setState({ toppings: [] });
    useRecipeStore.getState().addTopping(SPRINKLES, 10);
  });

  it('commits the new amount to the topping', () => {
    const id = toppingId();
    expect(id).not.toBeNull();
    useRecipeStore.getState().setToppingGrams(id!, 25);
    expect(useRecipeStore.getState().toppings[0]?.planned_grams).toBe(25);
  });

  it('is NOT reachable through the ingredient action — the bug this fixes', () => {
    // `setPlannedGrams` only knows `state.items`. Calling it with a topping id is a
    // silent no-op, which is exactly what the customer experienced.
    const id = toppingId();
    useRecipeStore.getState().setPlannedGrams(id!, 25);
    expect(useRecipeStore.getState().toppings[0]?.planned_grams).toBe(10);
  });

  it('leaves the recipe lines alone', () => {
    const before = useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams]);
    useRecipeStore.getState().setToppingGrams(toppingId()!, 40);
    expect(useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams])).toEqual(before);
  });

  it('refuses a negative amount instead of storing one', () => {
    useRecipeStore.getState().setToppingGrams(toppingId()!, -5);
    expect(useRecipeStore.getState().toppings[0]?.planned_grams).toBeGreaterThanOrEqual(0);
  });
});

describe('a topping never carries the Crown', () => {
  it('has no lock_type at all — Crown is a Main concept and a topping is not a Main', () => {
    const topping = useRecipeStore.getState().toppings[0];
    expect(topping).toBeDefined();
    expect('lock_type' in (topping as object)).toBe(false);
  });
});
