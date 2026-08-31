import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, ProductCategory, RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  hasVerifiedMapperSubstitutionAuthorization,
  substitutionIngredientFingerprint,
  verifiedRecipeSubstituteCandidates,
} from './recipeSubstitution';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const TRI_STATE_COLUMNS = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (TRI_STATE_COLUMNS.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const rows = grid.slice(1).map(
  (row) =>
    ({
      ...Object.fromEntries(header.map((name, index) => [name, cell(row[index] ?? '', name)])),
      // Lifecycle metadata lives in Supabase. The frozen 2088-row validation
      // export contains only active reference rows.
      is_active: true,
    }) as unknown as IngredientRow,
);

const row = (id: string): IngredientRow => {
  const match = rows.find((candidate) => candidate.ingredient_id === id);
  expect(match).toBeDefined();
  return match!;
};

const inputFor = (
  source: IngredientRow | EngineIngredient,
  category: ProductCategory = 'milk_gelato',
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    {
      id: 'source-line',
      ingredient:
        'ingredient_id' in source ? ingredientRowToEngineIngredient(source) : source,
      planned_grams: 1000,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
});

describe('verified Mapper recipe substitute catalogue', () => {
  it('keeps Estimated Mapper provenance informational for a technically complete substitute', () => {
    const watermelon = row('PI-ING-000405');
    expect(watermelon.verification_status).toBe('Estimated');
    const candidates = verifiedRecipeSubstituteCandidates(
      inputFor(row('PI-ING-001553')),
      'source-line',
      rows,
      200,
    );
    const estimated = candidates.find((candidate) => candidate.id === watermelon.ingredient_id);
    expect(estimated).toBeDefined();
    expect(estimated?.ingredient?.is_verified).toBe(false);
    expect(estimated?.ingredient?.source_type).toBe('ai_estimated');
    expect(hasVerifiedMapperSubstitutionAuthorization(estimated?.authorization)).toBe(true);
  });
  it('returns real normal candidates with an unforgeable, exact Mapper authorization', () => {
    const candidates = verifiedRecipeSubstituteCandidates(
      inputFor(row('PI-ING-001553')),
      'source-line',
      rows,
      20,
    );
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.id).toMatch(/^PI-ING-\d{6}$/);
      expect(hasVerifiedMapperSubstitutionAuthorization(candidate.authorization)).toBe(true);
      expect(candidate.authorization?.ingredientFingerprint).toBe(
        substitutionIngredientFingerprint(candidate.ingredient!),
      );
    }
  });

  it('keeps Vegan candidates within verified Vegan eligibility', () => {
    const source = rows.find((candidate) => {
      if (candidate.vegan !== 'true') return false;
      return (
        verifiedRecipeSubstituteCandidates(
          inputFor(candidate, 'vegan_gelato'),
          'source-line',
          rows,
          2,
        ).length > 0
      );
    });
    expect(source).toBeDefined();
    const candidates = verifiedRecipeSubstituteCandidates(
      inputFor(source!, 'vegan_gelato'),
      'source-line',
      rows,
      20,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.authorization?.veganEligibility === 'VEGAN_VERIFIED')).toBe(true);
  });

  it('supports a real WPC protein row without changing its milk-allergen declaration', () => {
    const candidates = verifiedRecipeSubstituteCandidates(
      inputFor(row('PI-ING-000264'), 'protein_gelato'),
      'source-line',
      rows,
      20,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.authorization?.allergensFingerprint === 'milk')).toBe(true);
  });

  it('accepts real alcohol candidates whose mass closure includes alcohol', () => {
    const candidates = verifiedRecipeSubstituteCandidates(
      inputFor(row('PI-ING-000038')),
      'source-line',
      rows,
      100,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((candidate) => candidate.ingredient!.composition.alcohol_percent > 30)).toBe(true);
  });

  it('never exposes generic same-role substitutes for template-controlled Tara', () => {
    expect(
      verifiedRecipeSubstituteCandidates(
        inputFor(row('PI-ING-000492')),
        'source-line',
        rows,
        100,
      ),
    ).toEqual([]);
  });

  it('does not silently change allergens and returns an honest empty state when no safe role match exists', () => {
    const milkCandidates = verifiedRecipeSubstituteCandidates(
      inputFor(row('PI-ING-000264')),
      'source-line',
      rows,
      100,
    );
    expect(milkCandidates.every((candidate) => candidate.authorization?.allergensFingerprint === 'milk')).toBe(true);

    const privateEgg: EngineIngredient = {
      id: 'private-egg-source',
      canonical_ingredient_id: 'private-egg-source',
      name: 'Private egg source',
      category: 'egg',
      composition: {
        water_percent: 75,
        solids_percent: 25,
        fat_percent: 10,
        protein_percent: 12,
        carbohydrate_percent: 1,
        sugar_percent: 1,
        sucrose_percent: 0,
        glucose_percent: 0,
        dextrose_percent: 0,
        fructose_percent: 0,
        lactose_percent: 0,
        polyol_percent: 0,
        fiber_percent: 0,
        salt_percent: 1,
        alcohol_percent: 0,
        kcal_per_100g: 140,
      },
      pod_value: null,
      pac_value: null,
      de_value: null,
      cost_per_kg: null,
      confidence_score: 0,
      source_type: 'manual',
      is_verified: false,
    };
    expect(
      verifiedRecipeSubstituteCandidates(inputFor(privateEgg), 'source-line', rows, 20),
    ).toEqual([]);
  });
});
