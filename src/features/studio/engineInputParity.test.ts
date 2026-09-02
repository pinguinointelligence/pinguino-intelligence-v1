/**
 * §9/§15 — DESKTOP AND MOBILE PRODUCE THE SAME NORMALIZED ENGINE INPUT.
 *
 * This uses the REAL production builder (`buildRecipeInput`) and the REAL
 * Engine (`calculateRecipe`) against one canonical store snapshot, so it proves
 * the property rather than restating it — and it does so without exposing any
 * diagnostic global to the served bundle.
 *
 * The argument it completes:
 *   • `useStudioResult` feeds `buildRecipeInput` exclusively from `useRecipeStore`
 *     (pinned by viewportInvariance.test.ts);
 *   • `buildRecipeInput` is pure and takes no viewport argument — proven here by
 *     driving it under a desktop and a mobile `matchMedia`, and under mutated
 *     `innerWidth`, and getting byte-identical output;
 *   • therefore a viewport cannot change the calculation, for any recipe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput, type RecipeInputState } from './buildRecipeInput';

/** One canonical snapshot, shaped exactly as the store holds it. */
const CANONICAL: RecipeInputState = {
  mode: 'classic',
  formulation_strategy: 'eco',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: 1000,
  machine_capacity_source: 'machine',
  flavor_intensity: 'balanced',
  cost_priority: 'balanced',
  direction_targets: { sweetness: 1, softness: -1, creaminess: 0, flavor: 0 },
  direction_targets_active: true,
  items: starterMilkBase().items,
};

/** Pretend the app is being rendered at a given width. */
function atViewport<T>(width: number, run: () => T): T {
  const originalWidth = globalThis.window?.innerWidth;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width:\s*(\d+)/.test(query)
      ? width <= Number(/max-width:\s*(\d+)/.exec(query)![1])
      : width >= 1280,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  if (globalThis.window) globalThis.window.innerWidth = width;
  try {
    return run();
  } finally {
    if (globalThis.window && originalWidth !== undefined)
      globalThis.window.innerWidth = originalWidth;
    vi.unstubAllGlobals();
  }
}

describe('engine input parity across presentations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the normalized Engine input is byte-identical at desktop and mobile widths', () => {
    const desktop = atViewport(1440, () => buildRecipeInput(CANONICAL));
    const mobile = atViewport(390, () => buildRecipeInput(CANONICAL));
    expect(mobile).toEqual(desktop);
    expect(JSON.stringify(mobile)).toBe(JSON.stringify(desktop));
  });

  it('the Engine RESULT is identical too — same input, same physics', () => {
    const desktop = calculateRecipe(atViewport(1440, () => buildRecipeInput(CANONICAL)));
    const mobile = calculateRecipe(atViewport(390, () => buildRecipeInput(CANONICAL)));
    expect(JSON.stringify(mobile)).toBe(JSON.stringify(desktop));
  });

  it.each([
    ['ECO', 'eco'],
    ['OPTIMAL', 'optimal'],
  ])('%s survives the viewport unchanged — the mode is canonical, not presentational', (_l, s) => {
    const state = {
      ...CANONICAL,
      formulation_strategy: s as RecipeInputState['formulation_strategy'],
    };
    const desktop = atViewport(1440, () => buildRecipeInput(state));
    const mobile = atViewport(390, () => buildRecipeInput(state));
    expect(mobile.goals?.formulation_strategy).toBe(desktop.goals?.formulation_strategy);
    expect(mobile).toEqual(desktop);
  });

  it.each([
    ['machine capacity', { machine_capacity_grams: 700 }],
    ['serving temperature', { target_temperature_c: -13 }],
    ['batch', { target_batch_grams: 1500 }],
    ['product type', { category: 'sorbet' as RecipeInputState['category'] }],
    [
      'direction targets',
      { direction_targets: { sweetness: -2, softness: 2, creaminess: 0, flavor: 0 } },
    ],
  ])('M-matrix: %s resolves identically on both presentations', (_label, patch) => {
    const state = { ...CANONICAL, ...(patch as Partial<RecipeInputState>) };
    expect(atViewport(390, () => buildRecipeInput(state))).toEqual(
      atViewport(1440, () => buildRecipeInput(state)),
    );
  });

  it('the builder never reads a viewport — the same state signs the same anywhere', () => {
    const widths = [320, 375, 390, 430, 768, 834, 1024, 1280, 1440, 1920];
    const signatures = widths.map((w) =>
      JSON.stringify(atViewport(w, () => buildRecipeInput(CANONICAL))),
    );
    expect(new Set(signatures).size).toBe(1);
  });
});
