import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { starterMilkBase } from './constraintFixtures';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  assessGelatoStabilizerSystem,
  GELATO_STABILIZER_SYSTEM_POLICY,
  gelatoStabilizerWholeGramBand,
  projectGelatoStabilizerSystemToWholeGramPreferred,
} from './gelatoStabilizerSystemAuthority';

const line = (id: string, grams: number) => ({
  id,
  ingredient: { ...findDemoIngredient('tara_gum')!, id, canonical_ingredient_id: id },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const recipe = (
  batch: number,
  grams: number[],
  category: RecipeInput['category'] = 'milk_gelato',
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: -11,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: grams.map((value, index) => line(`gum-${index + 1}`, value)),
});

describe('owner-approved Gelato aggregate stabilizer-system authority', () => {
  it('pins truthful provenance and exact whole-gram rounding for required batch sizes', () => {
    expect(GELATO_STABILIZER_SYSTEM_POLICY).toMatchObject({
      version: 1,
      provenance: 'owner-approved Gellatti formulation policy',
      minPercent: 0.2,
      preferredPercent: 0.3,
      maxPercent: 0.5,
    });
    expect(gelatoStabilizerWholeGramBand(1_000)).toEqual({
      minGrams: 2,
      preferredGrams: 3,
      maxGrams: 5,
    });
    expect(gelatoStabilizerWholeGramBand(1_500)).toEqual({
      minGrams: 3,
      preferredGrams: 5,
      maxGrams: 7,
    });
    expect(gelatoStabilizerWholeGramBand(10_000)).toEqual({
      minGrams: 20,
      preferredGrams: 30,
      maxGrams: 50,
    });
  });

  it.each([2, 3, 4, 5])('accepts %s g total for a 1000 g Gelato base', (grams) => {
    expect(assessGelatoStabilizerSystem(recipe(1_000, [grams])).issues).toEqual([]);
  });

  it('projects an existing generated system to the preferred whole-gram total', () => {
    const projected = projectGelatoStabilizerSystemToWholeGramPreferred(
      recipe(1_000, [1, 1, 5]),
    );
    expect(projected.map((item) => item.planned_grams)).toEqual([1, 1, 1]);
    expect(projected.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(3);

    const raised = projectGelatoStabilizerSystemToWholeGramPreferred(recipe(1_000, [1.9]));
    expect(raised.map((item) => item.planned_grams)).toEqual([3]);
  });

  it('accepts individual 1 g gums in a legal blend and rejects total 6 g', () => {
    expect(assessGelatoStabilizerSystem(recipe(1_000, [1, 1, 1])).issues).toEqual([]);
    expect(assessGelatoStabilizerSystem(recipe(1_000, [2, 2, 2])).issues).toEqual([
      expect.objectContaining({ code: 'aggregate_above_maximum', totalGrams: 6, maxGrams: 5 }),
    ]);
  });

  it('rejects fractional component grams and does not copy the policy to other profiles', () => {
    expect(assessGelatoStabilizerSystem(recipe(1_000, [1, 2.5])).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'component_not_whole_grams' })]),
    );
    for (const category of ['sorbet', 'vegan_gelato', 'protein_gelato'] as const) {
      expect(assessGelatoStabilizerSystem(recipe(1_000, [6], category)).applicable).toBe(false);
    }
  });

  it.each([
    [1_000, 3],
    [1_500, 5],
    [10_000, 30],
  ])('makes the Gelato formulation seed a whole-gram preferred total for %i g', (batch, target) => {
    const base = starterMilkBase();
    const input: RecipeInput = {
      ...base,
      target_batch_grams: batch,
      items: base.items.map((item) => ({ ...item, planned_grams: 0 })),
    };
    const result = buildOptimizePreview(input, { byLineId: {} }, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stabilizers = result.preview.proposedInput.items.filter(
      (item) => resolveFunctionalRole(item.ingredient) === 'stabilizer',
    );
    expect(stabilizers.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
    expect(stabilizers.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(target);
    expect(assessGelatoStabilizerSystem(result.preview.proposedInput).issues).toEqual([]);
  });
});
