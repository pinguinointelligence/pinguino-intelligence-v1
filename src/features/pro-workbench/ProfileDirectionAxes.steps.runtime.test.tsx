// @vitest-environment jsdom
/**
 * DESIGN V3.0 correction I — every PRO regulator position is NAMED under its
 * mark, left to right and the same on both axes (−2 · −1 · Optymalne · +1 ·
 * +2), in place of the two end words. Presentation only: the names follow the
 * drawn order, so Twardość keeps its mirror (the leftmost mark still WRITES +2,
 * the engine's firmer end) and the stored values never change meaning.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const mount = async () =>
  act(async () =>
    root.render(<ProfileDirectionAxes result={{ nutrition_per_100g: null } as never} />),
  );

/** The step names under an axis, in DRAWN order (by their `left`). */
const stepsOf = (axis: 'sweetness' | 'softness') =>
  [...host.querySelectorAll<HTMLElement>(`[data-testid="profile-regulator-${axis}-steps"] span`)]
    .map((span) => ({ left: Number.parseFloat(span.style.left), name: span.textContent }))
    .sort((a, b) => a.left - b.left)
    .map((step) => step.name);

/** The marks of an axis, in DRAWN order. */
const marksOf = (axis: 'sweetness' | 'softness') =>
  [
    ...host.querySelectorAll<HTMLButtonElement>(
      `[data-testid="profile-regulator-${axis}"] [role="radio"]`,
    ),
  ].sort((a, b) => Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left));

describe('DESIGN V3.0 correction I — named regulator positions', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('names the five positions the same way on both axes, with no end words', async () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    await mount();
    expect(stepsOf('sweetness')).toEqual(['−2', '−1', 'Optymalne', '+1', '+2']);
    expect(stepsOf('softness')).toEqual(['−2', '−1', 'Optymalne', '+1', '+2']);
    expect(host.textContent).not.toContain('mniej słodkie');
    expect(host.textContent).not.toContain('bardziej miękkie');
    // Each name sits on its own mark.
    const markLefts = marksOf('sweetness').map((mark) => mark.style.left);
    const nameLefts = [
      ...host.querySelectorAll<HTMLElement>(
        '[data-testid="profile-regulator-sweetness-steps"] span',
      ),
    ].map((span) => span.style.left);
    expect(nameLefts).toEqual(markLefts);
  });

  it('keeps Twardość mirrored: the leftmost mark, named „−2", still writes +2 (firmer)', async () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    await mount();
    const leftmost = marksOf('softness')[0]!;
    expect(stepsOf('softness')[0]).toBe('−2');
    await act(async () => leftmost.click());
    expect(useRecipeStore.getState().direction_targets.softness).toBe(2);
    expect(leftmost.getAttribute('aria-label')).toBe('Twardość: znacznie bardziej twarde');

    const sweetLeftmost = marksOf('sweetness')[0]!;
    await act(async () => sweetLeftmost.click());
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(-2);
  });

  it('names a three-position axis by its three real marks', async () => {
    useRecipeStore.getState().startNewRecipe('protein');
    const plan = buildRecipeDirectionPlan(buildRecipeInput(useRecipeStore.getState()));
    await mount();
    const hardness = plan.axes.find((axis) => axis.axis === 'softness');
    const expected =
      hardness?.metric === 'ice_fraction'
        ? ['−1', 'Optymalne', '+1']
        : ['−2', '−1', 'Optymalne', '+1', '+2'];
    expect(stepsOf('softness')).toEqual(expected);
    expect(stepsOf('softness')).toHaveLength(marksOf('softness').length);
  });
});
