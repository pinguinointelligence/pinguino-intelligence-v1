import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import type { NutritionPer100g, RecipeCosts, RecipeResult } from '@/engine';
import { buildCostBlock, buildPrintableLabelHtml, buildRecipeCsv } from './recipeExport';
import { SAMPLE_LABEL_RESULT } from './sampleLabelRecipe';

const NUTRITION: NutritionPer100g = {
  kcal: 129,
  fat_g: 7,
  saturated_fat_g: null,
  carbohydrate_g: 22,
  sugars_g: 20,
  protein_g: 3.8,
  salt_g: 0.13,
  fiber_g: 0.5,
  alcohol_g: 0,
};

const COMPLETE_COSTS: RecipeCosts = {
  total_cost: 1.2,
  cost_per_kg: 2.4,
  cost_per_serving_60g: 0.14,
  cost_per_serving_70g: 0.17,
  cost_per_serving_80g: 0.19,
  complete: true,
  missing_cost_ingredient_ids: [],
} as unknown as RecipeCosts;

const INCOMPLETE_COSTS: RecipeCosts = {
  total_cost: null,
  cost_per_kg: null,
  cost_per_serving_60g: null,
  cost_per_serving_70g: null,
  cost_per_serving_80g: null,
  complete: false,
  missing_cost_ingredient_ids: ['x'],
} as unknown as RecipeCosts;

const makeResult = (over: {
  items?: Array<{ name: string; effective_grams: number }>;
  nutrition?: NutritionPer100g | null;
  costs?: RecipeCosts | null;
}): RecipeResult =>
  ({
    total_batch_g: 1000,
    items: (over.items ?? [{ name: 'Milk', effective_grams: 1000 }]).map((i) => ({
      ingredient: { name: i.name },
      effective_grams: i.effective_grams,
    })),
    // Respect an EXPLICIT null (distinct from "not provided") for nutrition/costs.
    nutrition_per_100g: 'nutrition' in over ? over.nutrition : NUTRITION,
    costs: 'costs' in over ? over.costs : COMPLETE_COSTS,
  }) as unknown as RecipeResult;

describe('buildCostBlock', () => {
  it('formats complete costs as euro strings', () => {
    const block = buildCostBlock(makeResult({ costs: COMPLETE_COSTS }));
    expect(block[0]?.valueDisplay).toBe('€2.40');
  });
  it('blanks every line (never a fake 0) when the cost is incomplete', () => {
    const block = buildCostBlock(makeResult({ costs: INCOMPLETE_COSTS }));
    expect(block.every((line) => line.valueDisplay === null)).toBe(true);
  });
  it('blanks when there is no cost object at all', () => {
    const block = buildCostBlock(makeResult({ costs: null }));
    expect(block.every((line) => line.valueDisplay === null)).toBe(true);
  });
});

describe('buildRecipeCsv', () => {
  it('is valid RFC-4180: round-trips through parseCsv to a grid with the section headers', () => {
    const csv = buildRecipeCsv(makeResult({}));
    const grid = parseCsv(csv);
    const flat = grid.map((r) => r.join('|'));
    expect(flat).toContain('Ingredient|Grams|Percent');
    expect(flat.some((r) => r.startsWith('Nutrition (per 100 g)|'))).toBe(true);
    expect(flat.some((r) => r.startsWith('Cost|'))).toBe(true);
    // the energy row is present with the kJ/kcal display
    expect(csv).toMatch(/kJ \/ 129 kcal/);
  });

  it('quotes cells containing commas or quotes and recovers them exactly', () => {
    const csv = buildRecipeCsv(makeResult({ items: [{ name: 'Sugar, "raw"', effective_grams: 1000 }] }));
    expect(csv).toContain('"Sugar, ""raw"""');
    const grid = parseCsv(csv);
    expect(grid.some((row) => row[0] === 'Sugar, "raw"')).toBe(true);
  });

  it('writes a blank (never a fabricated number) for incomplete cost cells', () => {
    const grid = parseCsv(buildRecipeCsv(makeResult({ costs: INCOMPLETE_COSTS })));
    const perKg = grid.find((row) => row[0] === 'Per kg');
    expect(perKg?.[1]).toBe('');
  });

  it('exports the real sample recipe without throwing', () => {
    const grid = parseCsv(buildRecipeCsv(SAMPLE_LABEL_RESULT));
    expect(grid.length).toBeGreaterThan(3);
  });
});

describe('buildPrintableLabelHtml', () => {
  it('is a self-contained document with the declaration + no scripts', () => {
    const html = buildPrintableLabelHtml(makeResult({}));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Energy');
    expect(html).toContain('Salt');
    expect(html).not.toContain('<script');
  });

  it('shows "Not available" for a null saturated row (never a fake 0)', () => {
    const html = buildPrintableLabelHtml(makeResult({ nutrition: { ...NUTRITION, saturated_fat_g: null } }));
    expect(html).toContain('Not available');
  });

  it('escapes HTML-significant characters from ingredient names', () => {
    const html = buildPrintableLabelHtml(makeResult({ items: [{ name: 'A & B <x>', effective_grams: 1000 }] }));
    expect(html).toContain('A &amp; B &lt;x&gt;');
    expect(html).not.toContain('<x>');
  });
});
