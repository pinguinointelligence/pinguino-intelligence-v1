import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildOptimizePreview } from './applyPipeline';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const triState = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (triState.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const rows = new Map(
  grid.slice(1).map((row) => {
    const parsed = Object.fromEntries(
      header.map((name, index) => [name, cell(row[index] ?? '', name)]),
    ) as unknown as IngredientRow;
    return [parsed.ingredient_id, parsed] as const;
  }),
);
const ingredient = (id: string, price?: number) => {
  const row = rows.get(id);
  if (!row) throw new Error(`missing Mapper row ${id}`);
  const mapped = ingredientRowToEngineIngredient(row);
  return price === undefined
    ? mapped
    : { ...mapped, cost_per_kg: price, cost_currency: 'EUR' as const, cost_source: 'private' as const };
};

const colina = (milkId: 'PI-ING-000201' | 'PI-ING-000235'): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'eco',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
  items: [
    ['milk', milkId, 589],
    ['cream', 'PI-ING-000180', 113],
    ['smp', 'PI-ING-000270', 31],
    ['sucrose', 'PI-ING-000514', 113],
    ['dextrose', 'PI-ING-000494', 61],
    ['tara', 'PI-ING-000492', 5],
    ['strawberry', 'PI-ING-001553', 88],
  ].map(([id, mapperId, grams]) => ({
    id: String(id),
    ingredient: ingredient(String(mapperId), mapperId === 'PI-ING-001553' ? 10 : undefined),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
});

describe('served Owner Colina ECO regression', () => {
  it.each(['PI-ING-000201', 'PI-ING-000235'] as const)(
    'never returns BLOCKED for the exact seven-line 1000 g draft (%s)',
    (milkId) => {
      const input = colina(milkId);
      const calculatedBefore = calculateRecipe(input);
      const nativeBefore = detectViolations(calculatedBefore);
      const directionBefore = recipeDirectionViolations(input);
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-14T00:00:00.000Z');

      expect(
        result.ok || result.code === 'already_clean',
        JSON.stringify({
          milkId,
          nativeBefore: nativeBefore.map((violation) => violation.metric),
          directionBefore: directionBefore.map((violation) => violation.metric),
          result,
        }),
      ).toBe(true);
      if (!result.ok) return;
      expect(result.preview.violationsAfter).toBeLessThanOrEqual(nativeBefore.length);
      expect(recipeDirectionViolations(result.preview.proposedInput).length).toBeLessThanOrEqual(
        directionBefore.length,
      );
    },
  );
});
