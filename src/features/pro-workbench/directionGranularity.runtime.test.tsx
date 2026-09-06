// @vitest-environment jsdom
/**
 * OWNER PROOF 2026-09-03 — granularity and mirrored presentation together.
 *
 * Two things landed on this control in parallel. Staging generalised it over
 * the axis's own detent set, so a profile whose proven authority publishes
 * three targets shows three REAL positions rather than five where -2 would
 * equal -1. The owner's direction made the mark a SIZE RAMP and mirrored
 * Twardość so firmer reads on the LEFT.
 *
 * The load-bearing claim is that the mirror is PRESENTATION ONLY: whatever the
 * count, and whichever end is drawn first, the value written is the one the
 * engine already defines. These tests read the rendered rail and the store, so
 * they fail if either half regresses.
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

const PROFILES = ['gelato', 'sorbet', 'vegan', 'protein'] as const;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const mount = async () => {
  const input = buildRecipeInput(useRecipeStore.getState());
  const plan = buildRecipeDirectionPlan(input);
  await act(async () =>
    root.render(<ProfileDirectionAxes result={{ nutrition_per_100g: null } as never} />),
  );
  return plan;
};

/** The rail's marks, left to right: their canonical value and drawn size. */
const railOf = (axis: 'sweetness' | 'softness') => {
  const group = host.querySelector(`[data-testid="profile-regulator-${axis}"] [role="radiogroup"]`);
  if (!group) return null;
  const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')].map((radio) => ({
    left: Number.parseFloat((radio as HTMLElement).style.left),
    aria: radio.getAttribute('aria-label') ?? '',
    checked: radio.getAttribute('aria-checked') === 'true',
  }));
  const dots = [...group.children]
    .filter((child) => (child as HTMLElement).style.width && child.className.includes('rail-track'))
    .map((child) => ({
      left: Number.parseFloat((child as HTMLElement).style.left),
      px: Number.parseFloat((child as HTMLElement).style.width),
    }));
  radios.sort((a, b) => a.left - b.left);
  dots.sort((a, b) => a.left - b.left);
  return { radios, dots };
};

describe('Direction granularity and mirrored presentation', () => {
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

  it.each(PROFILES)('%s renders the count its own authority publishes', async (profile) => {
    useRecipeStore.getState().startNewRecipe(profile);
    const plan = await mount();
    const hardness = plan.axes.find((axis) => axis.axis === 'softness');
    const rail = railOf('softness');
    expect(rail, `${profile} must render a hardness rail`).not.toBeNull();

    /* The discriminator is the PLAN's own metric, never a product-category
       branch: the three-position rail belongs to whichever authority publishes
       three targets, which today is Protein's approved ice band.

       Both halves are pinned. Deriving the expectation from the metric alone
       would pass even if NO profile ever reached three, so the observed
       mapping is asserted too — measured 2026-09-03: gelato / sorbet / vegan
       publish `npac`, protein publishes `ice_fraction`. If Protein ever stops
       reaching the three-position rail, or another profile starts, this fails
       rather than quietly agreeing with whatever the plan now says. */
    expect(hardness?.metric).toBe(profile === 'protein' ? 'ice_fraction' : 'npac');
    const expected = profile === 'protein' ? 3 : 5;
    expect(hardness?.metric === 'ice_fraction' ? 3 : 5).toBe(expected);
    expect(rail!.radios).toHaveLength(expected);
    expect(rail!.dots).toHaveLength(expected);

    // Sweetness is unaffected by the hardness authority in every profile.
    expect(railOf('sweetness')!.radios).toHaveLength(5);
  });

  it('draws hardness firmer-and-larger on the LEFT at every count', async () => {
    for (const profile of PROFILES) {
      useRecipeStore.getState().startNewRecipe(profile);
      const plan = await mount();
      const rail = railOf('softness')!;
      const count = rail.radios.length;

      // Leftmost says "twarde", rightmost says "miękkie" — the owner's order.
      expect(rail.radios[0]!.aria, `${profile} leftmost`).toMatch(/twarde/);
      expect(rail.radios[count - 1]!.aria, `${profile} rightmost`).toMatch(/miękkie/);

      // ...and the ball shrinks across the rail, largest on the firm end.
      const sizes = rail.dots.map((dot) => dot.px);
      expect(sizes[0], `${profile} largest on the left`).toBeGreaterThan(sizes[count - 1]!);
      for (let i = 1; i < count; i += 1) {
        expect(sizes[i]!, `${profile} monotonic`).toBeLessThan(sizes[i - 1]!);
      }

      // Sweetness ramps the other way, and is never mirrored.
      const sweet = railOf('sweetness')!;
      expect(sweet.radios[0]!.aria).toMatch(/mniej słodkie/);
      expect(sweet.dots[0]!.px).toBeLessThan(sweet.dots[4]!.px);
      void plan;
    }
  });

  it('writes the canonical value the engine defines, not the drawn order', async () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    await mount();
    const rail = railOf('softness')!;
    const group = host.querySelector(
      '[data-testid="profile-regulator-softness"] [role="radiogroup"]',
    )!;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')].sort(
      (a, b) => Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left),
    );

    // Leftmost is drawn as the firmest, and firm is POSITIVE for the engine.
    await act(async () => radios[0]!.click());
    expect(useRecipeStore.getState().direction_targets.softness).toBe(2);

    // Rightmost is the softest, and soft is NEGATIVE.
    await act(async () => radios[rail.radios.length - 1]!.click());
    expect(useRecipeStore.getState().direction_targets.softness).toBe(-2);
  });
});
