import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { planOwnerStabilizerSystemRescale } from './ownerStabilizerRescaleProjection';
import { planSorbetStabilizerSystemRescale } from './sorbetStabilizerRescaleProjection';
import { stabilizerSystemAuthorityFor } from './ownerStabilizerSystemAuthority';

const item = (id: string, grams: number, stabilizer = true): RecipeItem => ({
  id,
  ingredient: {
    ...findDemoIngredient(stabilizer ? 'tara_gum' : 'milk_3_5')!,
    id,
    canonical_ingredient_id: id,
  },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const recipe = (
  category: ProductCategory,
  batch: number,
  stabilizerGrams: readonly number[],
): RecipeInput =>
  ({
    category,
    target_batch_grams: batch,
    items: [
      ...stabilizerGrams.map((grams, index) => item(`stabilizer-${index}`, grams)),
      item(
        'carrier',
        Math.max(0, batch - stabilizerGrams.reduce((sum, grams) => sum + grams, 0)),
        false,
      ),
    ],
  }) as RecipeInput;

const projected = (
  category: ProductCategory,
  sourceGrams: readonly number[],
  targetBatch: number,
) => {
  const source = recipe(category, 1_000, sourceGrams);
  const factor = targetBatch / source.target_batch_grams;
  const scaled = recipe(
    category,
    targetBatch,
    sourceGrams.map((grams) => grams * factor),
  );
  const plan = planOwnerStabilizerSystemRescale(source, scaled);
  return plan === null ? null : [...plan.values()];
};

describe('SOL-041 — role-aware stabilizer rescale projection', () => {
  it.each([
    ['milk_gelato', [3], [2]],
    ['sorbet', [5], [3]],
    ['vegan_gelato', [2], [1]],
    ['protein_gelato', [2], [1]],
  ] as const)('%s uses its own authority for 1000 -> 670', (category, source, expected) => {
    expect(projected(category, source, 670)).toEqual(expected);
    const authority = stabilizerSystemAuthorityFor(category)!;
    const total = expected.reduce((sum, grams) => sum + grams, 0);
    const band = authority.wholeGramBand?.(670) ?? null;
    if (band) {
      expect(total).toBeGreaterThanOrEqual(band.minGrams);
      expect(total).toBeLessThanOrEqual(band.maxGrams);
    } else {
      expect(total).toBeGreaterThan(0);
    }
  });

  it('preserves Sorbet output byte-for-byte through the compatibility entry point', () => {
    const source = recipe('sorbet', 1_000, [2, 3]);
    const scaled = recipe('sorbet', 670, [1.34, 2.01]);
    expect(planSorbetStabilizerSystemRescale(source, scaled)).toEqual(
      planOwnerStabilizerSystemRescale(source, scaled),
    );
  });

  it.each(['vegan_gelato', 'protein_gelato'] as const)(
    '%s keeps multi-component proportions by deterministic largest remainder',
    (category) => {
      expect(projected(category, [1, 2], 670)).toEqual([1, 1]);
    },
  );

  it('does not invent a stabilizer or an authority for an unsupported profile', () => {
    expect(
      planOwnerStabilizerSystemRescale(
        recipe('milk_gelato', 1_000, []),
        recipe('milk_gelato', 670, []),
      ),
    ).toBeNull();
    expect(
      planOwnerStabilizerSystemRescale(recipe('custom', 1_000, [2]), recipe('custom', 670, [1.34])),
    ).toBeNull();
  });
});
