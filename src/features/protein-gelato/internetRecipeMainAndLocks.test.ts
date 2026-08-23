import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints/constraintTypes';
import {
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { verifyMainIngredientIdentity } from '@/features/formulation/mainIngredientContract';
import { assessProteinFormulation } from './proteinAuthority';
import { INTERNET_PROTEIN_RECIPES } from './__fixtures__/internetProteinRecipes';
import { MOJA_CENA_OVERRIDES, internetRecipeInput } from './internetRecipeMatrix.report.test';

/**
 * §18 / §19 — MAIN, MULTI-MAIN AND LOCKS ON REAL INTERNET RECIPES.
 *
 * The corpus recipes are flavour bases, so the flavour line of each is promoted
 * to Main here exactly as a user would: the ingredient that gives the product
 * its name. Multi-Main cases pair that flavour with a second real line at a
 * declared ratio.
 *
 * What must hold for every case, whether or not the Direction target is
 * reachable: Main identity survives, a declared Multi-Main ratio survives, an
 * explicit gram lock is honoured byte-exact, no executable 0 g row is produced,
 * the Protein claim is not silently dropped, and Apply either succeeds or is
 * refused for a stated reason — never a stale proof.
 */

const NONE: ConstraintSet = { byLineId: {} };
const AT = '2026-08-23T12:00:00.000Z';
const OPTIONS = { effectivePriceOverrides: MOJA_CENA_OVERRIDES as never };

const recipe = (id: string) => INTERNET_PROTEIN_RECIPES.find((r) => r.id === id)!;

/** Promote the line whose name matches `flavour` to Main. */
const withMain = (
  input: RecipeInput,
  flavour: RegExp,
  weight?: number,
): RecipeInput => ({
  ...input,
  items: input.items.map((item) =>
    flavour.test(item.ingredient.name)
      ? { ...item, lock_type: 'main' as const, ...(weight === undefined ? {} : { main_ratio_weight: weight }) }
      : item,
  ),
});

const mainGrams = (input: RecipeInput): number =>
  input.items.filter((item) => item.lock_type === 'main').reduce((s, i) => s + i.planned_grams, 0);

const ratioOf = (input: RecipeInput, a: RegExp, b: RegExp): number => {
  const ga = input.items.find((i) => a.test(i.ingredient.name))!.planned_grams;
  const gb = input.items.find((i) => b.test(i.ingredient.name))!.planned_grams;
  return ga / gb;
};

/** §18 — six real recipes, each with its flavour line promoted to Main. */
const SINGLE_MAIN = [
  ['pistachio-tastytravelers', /PISTACHIO/i],
  ['raspberry-eatcreami', /RASPBERR/i],
  ['banana-proteinchef', /BANANA/i],
  ['coffee-thatspicychick', /ESPRESSO/i],
  ['hazelnut-deliciouscrescent', /HAZELNUT/i],
  ['coconut-sweetsimplethings', /COCONUT/i],
] as const;

describe('§18 — Main is preserved on real internet recipes', () => {
  it.each(SINGLE_MAIN)('%s keeps its Main identity and grams', (id, flavour) => {
    const base = withMain(internetRecipeInput(recipe(id), -12, 'optimal', 1), flavour);
    const startMain = mainGrams(base);
    expect(startMain).toBeGreaterThan(0);

    const built = buildOptimizePreview(base, NONE, AT, OPTIONS);
    const candidate = built.ok ? built.preview.proposedInput : base;

    // Identity is checked with the SAME call the Apply door uses.
    expect(verifyMainIngredientIdentity(base, candidate, NONE.byLineId).ok).toBe(true);
    // A Main may be raised by the frontier but never silently dropped.
    expect(mainGrams(candidate)).toBeGreaterThan(0);
    expect(candidate.items.filter((i) => i.planned_grams <= 0)).toHaveLength(0);
    expect(assessProteinFormulation(candidate, calculateRecipe(candidate)).applicable).toBe(true);

    if (built.ok && !built.preview.diagnosticOnly) {
      const committed = commitPreview(
        base, NONE, built.preview, AT, `main-${id}`, [], undefined, null, null,
        {
          baseFingerprint: built.preview.baseFingerprint,
          targetFingerprint: directionTargetFingerprint(base),
          candidateFingerprint: workingStateFingerprint(
            built.preview.proposedInput, built.preview.nextConstraints,
          ),
        },
      );
      // Apply either succeeds or is refused with a stated code — never silently.
      if (!committed.ok) expect((committed as { code: string }).code).toBeTruthy();
    }
  }, 120_000);
});

/** §18 — Multi-Main at 1:1 and 2:1 on two real recipes. */
const MULTI_MAIN = [
  ['dark-cocoa-wholesomeyum', /COCOA ALKALIZED/i, /DARK CHOCOLATE/i, 1, 1],
  ['dark-cocoa-wholesomeyum', /COCOA ALKALIZED/i, /DARK CHOCOLATE/i, 2, 1],
  ['high-fat-eatingbirdfood', /BOURBON VANILLA/i, /DARK CHOCOLATE/i, 1, 1],
  ['high-fat-eatingbirdfood', /BOURBON VANILLA/i, /DARK CHOCOLATE/i, 2, 1],
] as const;

describe('§18 — Multi-Main ratio survives Direction', () => {
  it.each(MULTI_MAIN)('%s at %s:%s', (id, first, second, wa, wb) => {
    let base = internetRecipeInput(recipe(id), -12, 'optimal', 1);
    base = withMain(base, first, wa);
    base = withMain(base, second, wb);
    // Seed the declared ratio so the contract has something to preserve.
    const anchor = base.items.find((i) => second.test(i.ingredient.name))!.planned_grams;
    base = {
      ...base,
      items: base.items.map((item) =>
        first.test(item.ingredient.name)
          ? { ...item, planned_grams: Math.round(anchor * (wa / wb)) }
          : item,
      ),
    };
    const startRatio = ratioOf(base, first, second);

    const built = buildOptimizePreview(base, NONE, AT, OPTIONS);
    const candidate = built.ok ? built.preview.proposedInput : base;

    expect(verifyMainIngredientIdentity(base, candidate, NONE.byLineId).ok).toBe(true);
    // The ratio the user declared must survive the solve.
    expect(ratioOf(candidate, first, second)).toBeCloseTo(startRatio, 1);
    expect(candidate.items.filter((i) => i.planned_grams <= 0)).toHaveLength(0);
  }, 120_000);
});

/** §19 — an explicit gram lock is a hard promise. */
describe('§19 — locks are honoured byte-exact', () => {
  it.each(SINGLE_MAIN.slice(0, 4))('%s honours an exact gram lock', (id, flavour) => {
    const base = internetRecipeInput(recipe(id), -12, 'optimal', -1);
    const locked = base.items.find((item) => flavour.test(item.ingredient.name))!;
    const set: ConstraintSet = {
      byLineId: { [locked.id]: { mode: 'locked', grams: locked.planned_grams } },
    };

    const built = buildOptimizePreview(base, set, AT, OPTIONS);
    const candidate = built.ok ? built.preview.proposedInput : base;
    const after = candidate.items.find((item) => item.id === locked.id);

    // The locked line must still exist and weigh EXACTLY what was promised.
    expect(after).toBeDefined();
    expect(after!.planned_grams).toBe(locked.planned_grams);
    expect(candidate.items.filter((i) => i.planned_grams <= 0)).toHaveLength(0);
    // A lock constrains the search; it never licenses an unsafe result.
    if (built.ok && !built.preview.diagnosticOnly) {
      expect(detectViolations(calculateRecipe(candidate))).toEqual([]);
    }
  }, 120_000);
});
