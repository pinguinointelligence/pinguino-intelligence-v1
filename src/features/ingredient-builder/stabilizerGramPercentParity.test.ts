/**
 * GRAMS AND PERCENT ARE ONE QUANTITY IN TWO REPRESENTATIONS.
 *
 * A user who wants 5 g of stabilizer may say "5 g" or may say "0.5 % of a
 * 1000 g batch". Those are the same request, and the app must not answer them
 * differently — nor may it withhold one control while offering the other.
 *
 * The manufacturer's `recommended_dosage_percent_min/max` is INFORMATIONAL and
 * takes no part in either path (owner decision, 2026-08-23). PINGÜINO's own
 * stabilizer science — the aggregate band and the whole-gram rule — is
 * authoritative and applies identically to both.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  assessOwnerStabilizerSystem,
  clampOwnerStabilizerComponentGrams,
} from '@/features/recipe-constraints/ownerStabilizerSystemAuthority';
import { gelatoStabilizerWholeGramBand } from '@/features/recipe-constraints/gelatoStabilizerSystemAuthority';
import { buildDirectPercentEdit } from './directPercentEdit';
import { useRecipeStore } from '@/stores/recipeStore';

const NONE = { byLineId: {} } as const;
const STABILIZER = 'owner:tara_gum';

/** What the GRAMS control does: PINGÜINO's per-component stabilizer clamp. */
const viaGrams = (input: RecipeInput, requestedGrams: number): number =>
  clampOwnerStabilizerComponentGrams(input, STABILIZER, requestedGrams).grams;

/** What the PERCENT control does: convert against the batch, then the same clamp. */
const viaPercent = (input: RecipeInput, requestedPercent: number): number => {
  const result = buildDirectPercentEdit(input, NONE, STABILIZER, requestedPercent);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`percent edit refused: ${result.code}`);
  return result.gramsByLineId[STABILIZER]!;
};

const asPercentOfBatch = (input: RecipeInput, grams: number): number =>
  (grams / input.target_batch_grams) * 100;

describe('stabilizer grams/percent parity', () => {
  it('offers both controls — neither representation is withheld', () => {
    const input = ownerSameInputRecipe();
    expect(buildDirectPercentEdit(input, NONE, STABILIZER, 0.5).ok).toBe(true);
    expect(clampOwnerStabilizerComponentGrams(input, STABILIZER, 5).grams).toBe(5);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'converges on the same executable grams for %i g requested either way',
    (grams) => {
      const input = ownerSameInputRecipe();
      const fromGrams = viaGrams(input, grams);
      const fromPercent = viaPercent(input, asPercentOfBatch(input, grams));
      expect(fromPercent).toBe(fromGrams);
    },
  );

  it('yields the same Engine physics from either path', () => {
    const input = ownerSameInputRecipe();
    const target = 5;
    const gramsResult = viaGrams(input, target);
    const percentResult = viaPercent(input, asPercentOfBatch(input, target));
    expect(percentResult).toBe(gramsResult);

    const withStabilizer = (value: number): RecipeInput => ({
      ...input,
      items: input.items.map((item) =>
        item.id === STABILIZER ? { ...item, planned_grams: value } : item,
      ),
    });
    // Same quantity in, same recipe physics out — not merely a similar number.
    expect(calculateRecipe(withStabilizer(percentResult))).toEqual(
      calculateRecipe(withStabilizer(gramsResult)),
    );
    expect(assessOwnerStabilizerSystem(withStabilizer(percentResult))).toEqual(
      assessOwnerStabilizerSystem(withStabilizer(gramsResult)),
    );
  });

  it('applies PINGÜINO’s whole-gram rule identically to both controls', () => {
    const input = ownerSameInputRecipe();
    // 3.5 g cannot be weighed out. Both controls round it the same way.
    expect(viaGrams(input, 3.5)).toBe(4);
    expect(viaPercent(input, 0.35)).toBe(4);
  });

  it('applies the PINGÜINO aggregate ceiling identically to both controls', () => {
    const input = ownerSameInputRecipe();
    const band = gelatoStabilizerWholeGramBand(input.target_batch_grams);
    const excessive = band.maxGrams + 40;
    expect(viaGrams(input, excessive)).toBe(band.maxGrams);
    expect(viaPercent(input, asPercentOfBatch(input, excessive))).toBe(band.maxGrams);
  });

  it('never lets the manufacturer dosage decide which control may be used', () => {
    const input = ownerSameInputRecipe();
    const band = gelatoStabilizerWholeGramBand(input.target_batch_grams);
    // Tara's Mapper window is 0.2–1 %. 2 % is outside it and 0.1 % is below it;
    // both are accepted by both controls, and are bounded only by PINGÜINO's
    // own band.
    for (const percent of [0.1, 2]) {
      const grams = input.target_batch_grams * (percent / 100);
      expect(viaPercent(input, percent)).toBe(viaGrams(input, grams));
      expect(viaPercent(input, percent)).toBeLessThanOrEqual(band.maxGrams);
    }
  });

  it('keeps the batch coherent when the percent control clamps', () => {
    const input = ownerSameInputRecipe();
    const result = buildDirectPercentEdit(input, NONE, STABILIZER, 5.5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.values(result.gramsByLineId).reduce((sum, grams) => sum + grams, 0)).toBeCloseTo(
      input.target_batch_grams,
      10,
    );
  });

  /**
   * The end-to-end proof the owner asked for. Both controls are driven through
   * the REAL store — the grams control through `setPlannedGrams`, the percent
   * control through `buildDirectPercentEdit` + `setPlannedGramsVector` — and the
   * two must land on the same executable grams. This is where the earlier
   * divergence lived: the vector write refused a draft that was already outside
   * PINGÜINO's aggregate band, while the grams write clamped and accepted it.
   */
  describe('driven through the real store', () => {
    const seed = (input: RecipeInput) =>
      useRecipeStore.setState({
        category: input.category,
        items: input.items.map((item) => ({ ...item })),
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: {},
      });

    const stabilizerGrams = () =>
      useRecipeStore.getState().items.find((item) => item.id === STABILIZER)!.planned_grams;

    it.each([0, 1, 2, 3, 5, 8, 20, 400])(
      'lands on the same grams for %i g requested through either control',
      (requested) => {
        const input = ownerSameInputRecipe();
        const before = useRecipeStore.getState();
        try {
          seed(input);
          useRecipeStore.getState().setPlannedGrams(STABILIZER, requested);
          const fromGrams = stabilizerGrams();

          seed(input);
          const built = buildDirectPercentEdit(
            { ...input, items: useRecipeStore.getState().items },
            NONE,
            STABILIZER,
            asPercentOfBatch(input, requested),
          );
          expect(built.ok).toBe(true);
          if (built.ok) useRecipeStore.getState().setPlannedGramsVector(built.gramsByLineId);
          const fromPercent = stabilizerGrams();

          expect(fromPercent).toBe(fromGrams);
        } finally {
          useRecipeStore.setState(before, true);
        }
      },
    );

    it('still refuses a percent edit that INTRODUCES a stabilizer violation', () => {
      const input = ownerSameInputRecipe();
      const before = useRecipeStore.getState();
      try {
        // Start from a legal stabilizer state, then try to write a vector that
        // breaks PINGÜINO's whole-gram rule. The science still holds.
        seed({
          ...input,
          items: input.items.map((item) =>
            item.id === STABILIZER ? { ...item, planned_grams: 3 } : item,
          ),
        });
        expect(stabilizerGrams()).toBe(3);
        useRecipeStore.getState().setPlannedGramsVector({ [STABILIZER]: 3.5 });
        expect(stabilizerGrams()).toBe(3);
      } finally {
        useRecipeStore.setState(before, true);
      }
    });
  });
});
