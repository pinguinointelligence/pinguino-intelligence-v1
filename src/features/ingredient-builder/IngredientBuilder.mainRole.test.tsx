// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { calculateRecipe } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientBuilder } from './IngredientBuilder';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

describe('IngredientBuilder Main role integration', () => {
  beforeEach(() => {
    const input = starterMilkBase();
    const first = input.items[0]!;
    input.items = input.items.map((item) =>
      item.id === first.id
        ? {
            ...item,
            lock_type: 'main' as const,
            grams_constraint: { grams: item.planned_grams },
          }
        : item,
    );
    useRecipeStore.getState().loadRecipeInput(input);
    useConstraintStudioStore.getState().resetForTests();
    useConstraintStudioStore.setState({
      constraints: {
        byLineId: {
          [first.id]: { mode: 'locked', grams: first.planned_grams },
        },
      },
    });
    useIngredientTableUxStore.getState().reset();
  });

  it('removes the Main crown without deleting an independent exact-gram lock', () => {
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
    const main = calculated.items.find((item) => item.lock_type === 'main')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
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
    ));

    const crown = container.querySelector<HTMLButtonElement>(
      `[data-testid="row-main-toggle-${main.id}"]`,
    );
    expect(crown).not.toBeNull();
    act(() => crown!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(useRecipeStore.getState().items.find((item) => item.id === main.id)).toMatchObject({
      lock_type: 'grams',
      grams_constraint: { grams: main.planned_grams },
    });
    expect(useConstraintStudioStore.getState().constraints.byLineId[main.id]).toEqual({
      mode: 'locked',
      grams: main.planned_grams,
    });
    act(() => root.unmount());
    container.remove();
  });
});
