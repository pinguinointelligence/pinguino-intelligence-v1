import { describe, expect, it } from 'vitest';
import type { RecipeResult } from '@/engine';
import { buildIngredientStatement } from './ingredientStatement';
import { SAMPLE_LABEL_RESULT } from './sampleLabelRecipe';

/** Minimal RecipeResult carrying only the fields the builder reads. */
const makeResult = (items: Array<{ name: string; effective_grams: number }>, total: number): RecipeResult =>
  ({
    total_batch_g: total,
    items: items.map((i) => ({ ingredient: { name: i.name }, effective_grams: i.effective_grams })),
  }) as unknown as RecipeResult;

describe('buildIngredientStatement', () => {
  it('orders ingredients by DESCENDING effective grams (EU QUID)', () => {
    const out = buildIngredientStatement(
      makeResult(
        [
          { name: 'Sugar', effective_grams: 200 },
          { name: 'Milk', effective_grams: 500 },
          { name: 'Cream', effective_grams: 300 },
        ],
        1000,
      ),
    );
    expect(out.map((e) => e.name)).toEqual(['Milk', 'Cream', 'Sugar']);
    expect(out.map((e) => e.grams)).toEqual([500, 300, 200]);
    expect(out.map((e) => e.percent)).toEqual([50, 30, 20]);
  });

  it('percentages are share of total batch mass and sum to ~100', () => {
    const out = buildIngredientStatement(
      makeResult(
        [
          { name: 'A', effective_grams: 333 },
          { name: 'B', effective_grams: 667 },
        ],
        1000,
      ),
    );
    const sum = out.reduce((acc, e) => acc + e.percent, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('omits zero-mass lines (not part of the finished product)', () => {
    const out = buildIngredientStatement(
      makeResult(
        [
          { name: 'Present', effective_grams: 400 },
          { name: 'Removed', effective_grams: 0 },
        ],
        400,
      ),
    );
    expect(out.map((e) => e.name)).toEqual(['Present']);
  });

  it('guards a zero total batch (percent 0, never NaN/Infinity)', () => {
    const out = buildIngredientStatement(makeResult([{ name: 'X', effective_grams: 5 }], 0));
    expect(out[0]?.percent).toBe(0);
  });

  it('produces a real, sorted statement for the sample recipe', () => {
    const out = buildIngredientStatement(SAMPLE_LABEL_RESULT);
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1]!.grams).toBeGreaterThanOrEqual(out[i]!.grams);
    }
    expect(out.every((e) => e.grams > 0)).toBe(true);
  });
});
