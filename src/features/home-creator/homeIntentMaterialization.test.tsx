/**
 * OWNER QA 2026-09-06 — a chip and its recipe row must say the same thing.
 *
 * `addByProductId` ignored the chip's role entirely: every element became a recipe line
 * and every line was offered the Crown. So „czekoladowy topping" arrived in the base as
 * a crowned Main, while the chip above it still read TOPPING. The customer was looking at
 * two different answers to the same question.
 *
 * It also added at 0 g unconditionally, which is where the 0 g rows came from.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import type { IntentChip } from './homeDraftStore';

/* A REAL engine ingredient, borrowed from the shared fixtures. A hand-rolled shape
   silently omits fields `addIngredient` depends on, and the test then measures the
   fixture rather than the behaviour. */
vi.mock('./homeIntentResolutionService', async () => {
  const { starterMilkBase } = await import('@/features/recipe-constraints/constraintFixtures');
  const template = starterMilkBase().items[0]!.ingredient;
  return {
    hydrateIngredient: vi.fn(async (productId: string) => ({
      ...template,
      id: productId,
      name: productId === 'prod-banana' ? 'BANANA · Puree' : 'CHOCOLATE · Fabbri Paste',
    })),
    resolveChipTerm: vi.fn(),
  };
});

const chip = (over: Partial<IntentChip>): IntentChip =>
  ({ id: 'c1', label: 'banan', productId: 'prod-banana', role: null, ...over }) as IntentChip;

const { useHomeIntentIngredients } = await import('./useHomeIntentIngredients');

/** The hook is a bag of callbacks; calling them outside React is exactly what we want. */
const hook = () => {
  let api: ReturnType<typeof useHomeIntentIngredients>;
  const Probe = () => {
    api = useHomeIntentIngredients();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return api!;
};

beforeEach(() => {
  useRecipeStore.setState({ items: [], toppings: [] });
});

describe('the role the customer stated is the role the recipe gets', () => {
  it('a topping chip lands in the topping collection, uncrowned', async () => {
    const api = hook();
    await api.addResolvedChip(chip({ id: 'c2', productId: 'prod-choc', role: 'topping' }), 25);
    const store = useRecipeStore.getState();
    expect(store.toppings).toHaveLength(1);
    expect(store.toppings[0]?.planned_grams).toBe(25);
    // The Crown is a Main concept. A topping is not a Main.
    expect('lock_type' in (store.toppings[0] as object)).toBe(false);
    expect(store.items.some((i) => i.ingredient.id === 'prod-choc')).toBe(false);
  });

  it('an ingredient chip becomes a recipe line and is offered the Crown', async () => {
    const api = hook();
    await api.addResolvedChip(chip({ role: 'ingredient' }), 40);
    const store = useRecipeStore.getState();
    const line = store.items.find((i) => i.ingredient.id === 'prod-banana');
    expect(line).toBeDefined();
    expect(line!.planned_grams).toBe(40);
    expect(store.toppings).toHaveLength(0);
  });

  it('a chip with no stated role is treated as an ingredient, never a topping', async () => {
    const api = hook();
    await api.addResolvedChip(chip({ role: null }), 30);
    expect(useRecipeStore.getState().toppings).toHaveLength(0);
    expect(useRecipeStore.getState().items).toHaveLength(1);
  });
});

describe('a confirmed amount is carried, not discarded', () => {
  it('reports needs_amount instead of silently creating a 0 g row', async () => {
    const api = hook();
    const outcome = await api.addResolvedChip(chip({ role: 'topping' }), 0);
    expect(outcome.status).toBe('needs_amount');
  });
});

describe('the same chip is never materialised twice', () => {
  it('a second conversion adds nothing', async () => {
    const api = hook();
    await api.addResolvedChip(chip({ role: 'topping', id: 'c9', productId: 'prod-choc' }), 25);
    await api.addResolvedChip(chip({ role: 'topping', id: 'c9', productId: 'prod-choc' }), 25);
    expect(useRecipeStore.getState().toppings).toHaveLength(1);
  });
});
