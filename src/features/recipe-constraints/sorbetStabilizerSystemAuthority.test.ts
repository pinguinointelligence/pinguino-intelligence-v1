import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput } from '@/engine';
import {
  assessSorbetStabilizerSystem,
  projectSorbetStabilizerSystemToWholeGramPreferred,
  SORBET_STABILIZER_SYSTEM_POLICY,
  sorbetStabilizerWholeGramBand,
} from './sorbetStabilizerSystemAuthority';

const line = (id: string, grams: number) => ({
  id,
  ingredient: { ...findDemoIngredient('tara_gum')!, id, canonical_ingredient_id: id },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const recipe = (batch: number, grams: number[], category: RecipeInput['category'] = 'sorbet') => ({
  mode: 'classic' as const,
  category,
  target_temperature_c: -11,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: grams.map((value, index) => line(`gum-${index + 1}`, value)),
});

describe('owner-approved Sorbet aggregate stabilizer-system authority', () => {
  it('pins provenance and all required inward-rounded whole-gram examples', () => {
    expect(SORBET_STABILIZER_SYSTEM_POLICY).toMatchObject({
      provenance: 'owner-approved Gellatti Sorbet formulation policy',
      minPercent: 0.2,
      preferredPercent: 0.4,
      maxPercent: 0.5,
      optionalWhenAbsent: true,
    });
    expect(sorbetStabilizerWholeGramBand(1_000)).toEqual({ minGrams: 2, preferredGrams: 4, maxGrams: 5 });
    expect(sorbetStabilizerWholeGramBand(1_500)).toEqual({ minGrams: 3, preferredGrams: 6, maxGrams: 7 });
    expect(sorbetStabilizerWholeGramBand(1_237)).toEqual({ minGrams: 3, preferredGrams: 5, maxGrams: 6 });
    expect(sorbetStabilizerWholeGramBand(10_000)).toEqual({ minGrams: 20, preferredGrams: 40, maxGrams: 50 });
  });

  it('allows absence, accepts the complete 1000 g band, and rejects fractions/out-of-band totals', () => {
    expect(assessSorbetStabilizerSystem(recipe(1_000, [])).issues).toEqual([]);
    for (const grams of [2, 3, 4, 5]) {
      expect(assessSorbetStabilizerSystem(recipe(1_000, [grams])).issues).toEqual([]);
    }
    expect(assessSorbetStabilizerSystem(recipe(1_000, [1])).issues).toEqual([
      expect.objectContaining({ code: 'aggregate_below_minimum', minGrams: 2 }),
    ]);
    expect(assessSorbetStabilizerSystem(recipe(1_000, [6])).issues).toEqual([
      expect.objectContaining({ code: 'aggregate_above_maximum', maxGrams: 5 }),
    ]);
    expect(assessSorbetStabilizerSystem(recipe(1_000, [1, 2.5])).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'component_not_whole_grams' })]),
    );
  });

  it('treats multiple gums as one aggregate and projects existing systems to the preferred total', () => {
    expect(assessSorbetStabilizerSystem(recipe(1_000, [1, 1])).issues).toEqual([]);
    expect(assessSorbetStabilizerSystem(recipe(1_000, [2, 2, 2])).issues).toEqual([
      expect.objectContaining({ code: 'aggregate_above_maximum' }),
    ]);
    const projected = projectSorbetStabilizerSystemToWholeGramPreferred(recipe(1_000, [0.8]));
    expect(projected.map((item) => item.planned_grams)).toEqual([4]);
  });

  it('does not copy Sorbet policy into Gelato or other profiles', () => {
    for (const category of ['milk_gelato', 'vegan_gelato', 'protein_gelato'] as const) {
      expect(assessSorbetStabilizerSystem(recipe(1_000, [6], category)).applicable).toBe(false);
    }
  });
});
