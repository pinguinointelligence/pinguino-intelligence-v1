import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import {
  PROTEIN_STABILIZER_SYSTEM_AUTHORITY,
  VEGAN_STABILIZER_SYSTEM_AUTHORITY,
  assessOwnerStabilizerSystem,
  clampOwnerStabilizerComponentGrams,
  ownerStabilizerSystemApplies,
  stabilizerSystemAuthorityFor,
} from './ownerStabilizerSystemAuthority';

const line = (id: string, grams: number, stabilizer = true): RecipeItem => ({
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

const recipe = (category: ProductCategory, grams: number): RecipeInput =>
  ({
    category,
    target_batch_grams: 1_000,
    items: [line('stabilizer', grams), line('carrier', 1_000 - grams, false)],
  }) as RecipeInput;

describe('SOL-041 — one role-aware stabilizer authority contract', () => {
  it.each([
    ['milk_gelato', 'gelato', 'percentage_band'],
    ['fruit_gelato', 'gelato', 'percentage_band'],
    ['sorbet', 'sorbet', 'percentage_band'],
    ['vegan_gelato', 'vegan', 'presence_only'],
    ['protein_gelato', 'protein', 'presence_only'],
  ] as const)('routes %s only to its %s authority', (category, role, aggregateRule) => {
    const authority = stabilizerSystemAuthorityFor(category);
    expect(authority).toMatchObject({ role, aggregateRule, gramSemantics: 'whole_grams' });
    expect(ownerStabilizerSystemApplies(category)).toBe(true);
  });

  it('keeps the four authorities distinct and never promotes a Gelato/Sorbet band to Vegan/Protein', () => {
    const gelato = stabilizerSystemAuthorityFor('milk_gelato')!;
    const sorbet = stabilizerSystemAuthorityFor('sorbet')!;
    const vegan = stabilizerSystemAuthorityFor('vegan_gelato')!;
    const protein = stabilizerSystemAuthorityFor('protein_gelato')!;

    expect(new Set([gelato.policyId, sorbet.policyId, vegan.policyId, protein.policyId]).size).toBe(
      4,
    );
    expect(gelato.wholeGramBand?.(1_000)).toEqual({
      minGrams: 2,
      preferredGrams: 3,
      maxGrams: 5,
    });
    expect(sorbet.wholeGramBand?.(1_000)).toEqual({
      minGrams: 2,
      preferredGrams: 4,
      maxGrams: 5,
    });
    expect(vegan).toBe(VEGAN_STABILIZER_SYSTEM_AUTHORITY);
    expect(protein).toBe(PROTEIN_STABILIZER_SYSTEM_AUTHORITY);
    expect(vegan.wholeGramBand).toBeNull();
    expect(protein.wholeGramBand).toBeNull();
  });

  it.each([
    ['milk_gelato', 5],
    ['sorbet', 5],
    ['vegan_gelato', 9],
    ['protein_gelato', 9],
  ] as const)('%s clamps through its own ceiling semantics', (category, expected) => {
    expect(clampOwnerStabilizerComponentGrams(recipe(category, 2), 'stabilizer', 9).grams).toBe(
      expected,
    );
  });

  it.each(['vegan_gelato', 'protein_gelato'] as const)(
    '%s keeps its presence-only assessment without an invented aggregate range',
    (category) => {
      expect(assessOwnerStabilizerSystem(recipe(category, 2))).toEqual({
        applicable: true,
        present: true,
        totalGrams: 2,
        lineIds: ['stabilizer'],
        band: null,
        issues: [],
      });
      expect(assessOwnerStabilizerSystem(recipe(category, 1.4)).issues).toEqual([
        expect.objectContaining({
          code: 'component_not_whole_grams',
          lineIds: ['stabilizer'],
          minGrams: null,
          maxGrams: null,
        }),
      ]);
      expect(
        clampOwnerStabilizerComponentGrams(recipe(category, 2), 'stabilizer', 1.4),
      ).toMatchObject({
        grams: 1,
        clamped: true,
        reason: 'whole_gram',
      });
    },
  );

  it('declines unsupported custom recipes without borrowing any authority', () => {
    expect(stabilizerSystemAuthorityFor('custom')).toBeNull();
    expect(ownerStabilizerSystemApplies('custom')).toBe(false);
    expect(clampOwnerStabilizerComponentGrams(recipe('custom', 2), 'stabilizer', 1.4).grams).toBe(
      1.4,
    );
  });
});
