// @vitest-environment jsdom

/**
 * The default local Pro workspace must stay editable.
 *
 * `IngredientBuilder` wraps `recipeStore.setPlannedGrams` with the BASE_RECIPE
 * product-behavior gate. It used to run that gate unconditionally, so a
 * workspace holding no snapshots at all — signed out, or the demo preset
 * cold-open — had every grams edit refused with
 * "Brak zatwierdzonego uprawnienia BASE_RECIPE dla: milk-base:milk_3_5.",
 * while the percent control on the same row kept editing because it routes
 * through the store vector, which does apply the managed check.
 *
 * The gate itself is unchanged: once the resolver has frozen any snapshot the
 * workspace is managed and a denied line is still refused.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { calculateRecipe } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
} from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { starterLine, starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientBuilder } from './IngredientBuilder';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

const MILK = starterLine('milk_3_5');

const mount = () => {
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
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
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
    ),
  );
  return { container, root };
};

/** The `+` half of the grams stepper for one row. */
const incrementGrams = (container: HTMLElement, lineId: string) => {
  const control = container.querySelector<HTMLElement>(`[data-testid="row-grams-control-${lineId}"]`);
  expect(control).not.toBeNull();
  const step = control!.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]');
  expect(step).not.toBeNull();
  act(() => step!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

const notice = (container: HTMLElement): string | null =>
  container.querySelector('[data-testid="product-picker-notice"]')?.textContent ?? null;

const plannedGrams = (lineId: string): number =>
  useRecipeStore.getState().items.find((item) => item.id === lineId)!.planned_grams;

describe('grams editing on an unresolved product-behavior workspace', () => {
  beforeEach(() => {
    useRecipeStore.getState().loadRecipeInput(starterMilkBase());
    useConstraintStudioStore.getState().resetForTests();
    useIngredientTableUxStore.getState().reset();
  });

  it('accepts a grams edit on the demo preset when no snapshot has been resolved', () => {
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual({});
    const before = plannedGrams(MILK);
    const { container, root } = mount();

    incrementGrams(container, MILK);

    expect(plannedGrams(MILK)).toBe(before + 1);
    expect(notice(container)).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('still refuses the edit once the workspace is managed and the line is not approved', () => {
    const input = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(input);
    // One resolved line makes the workspace managed; the edited line is denied.
    useRecipeStore.setState({
      productBehaviorSnapshots: {
        [starterLine('sucrose')]: snapshots[starterLine('sucrose')]!,
      },
    });
    const before = plannedGrams(MILK);
    const { container, root } = mount();

    incrementGrams(container, MILK);

    expect(plannedGrams(MILK)).toBe(before);
    expect(notice(container)).toBe(
      `Brak zatwierdzonego uprawnienia BASE_RECIPE dla: ${MILK}.`,
    );
    act(() => root.unmount());
    container.remove();
  });

  it('leaves the persistence boundary closed on the very line it lets you edit', () => {
    // The relaxation is scoped to in-memory draft editing. SAVE (and every
    // other publishing module) gates with no managed check, so an unresolved
    // workspace stays unsaveable — editing it locally cannot smuggle a line
    // with no approved snapshot into a stored recipe.
    const state = useRecipeStore.getState();
    expect(state.productBehaviorSnapshots).toEqual({});
    const required = productBehaviorRequiredLineIds({ items: state.items });
    expect(required).toContain(MILK);
    expect(productBehaviorModuleGate(state.productBehaviorSnapshots, 'SAVE', required).ready).toBe(
      false,
    );
  });

  it('accepts the edit when the managed workspace has approved that line', () => {
    const input = starterMilkBase();
    useRecipeStore.setState({ productBehaviorSnapshots: productBehaviorTestSnapshots(input) });
    const before = plannedGrams(MILK);
    const { container, root } = mount();

    incrementGrams(container, MILK);

    expect(plannedGrams(MILK)).toBe(before + 1);
    expect(notice(container)).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
