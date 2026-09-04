// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientBuilder } from './IngredientBuilder';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useIngredientTableUxStore.getState().reset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  root = null;
  host = null;
});

const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

describe('IngredientBuilder contextual Replace entry', () => {
  it('opens the shared picker from the row menu in REPLACE mode and Milk context', async () => {
    const state = useRecipeStore.getState();
    const calculated = calculateRecipe({
      mode: state.mode,
      category: state.category,
      target_temperature_c: state.target_temperature_c,
      target_batch_grams: state.target_batch_grams,
      machine_capacity_grams: state.machine_capacity_grams,
      goals: { formulation_strategy: state.formulation_strategy },
      items: state.items,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <SurfaceToneContext.Provider value="paper">
            <IngredientBuilder
              items={calculated.items}
              totalBatchG={calculated.total_batch_g}
              targetBatchG={state.target_batch_grams}
              demo
              layout="workbench"
            />
          </SurfaceToneContext.Provider>
        </QueryClientProvider>,
      );
    });
    const milk = calculated.items.find((item) => /milk/i.test(item.ingredient.name))!;

    await click(document.querySelector(`[aria-label="Opcje składnika ${milk.ingredient.name}"]`));
    await click(document.querySelector('[aria-label="Zamień produkt"]'));

    const picker = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Dodaj składnik"]',
    );
    expect(picker).not.toBeNull();
    expect(
      document.querySelector('[data-product-filter="dairy"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(document.querySelector('button[aria-label^="Zamień na "]')).not.toBeNull();
    expect(
      Array.from(picker?.querySelectorAll<HTMLButtonElement>('button') ?? []).filter(
        (button) => button.textContent?.trim() === '+',
      ),
    ).toHaveLength(0);
    expect(picker?.querySelector('[aria-label="Usuń z receptury"]')).toBeNull();
  });
});
