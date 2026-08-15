import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';

const loadRows = (path: string): Array<Record<string, string>> => {
  const grid = parseCsv(readFileSync(resolve(process.cwd(), path), 'utf8'));
  const header = grid[0] ?? [];
  return grid.slice(1).map((cells) => Object.fromEntries(
    header.map((column, index) => [column, cells[index] ?? '']),
  ));
};

describe('Recipe Library required-product manifest', () => {
  const required = loadRows('reports/RECIPE_LIBRARY_REQUIRED_PRODUCTS.csv');
  const existing = loadRows('reports/RECIPE_LIBRARY_EXISTING_PRODUCTS_NEEDING_DATA.csv');

  it('contains all nine explicit required-product rows with every intake column', () => {
    expect(required.map((row) => row.priority)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(required.map((row) => row.required_name)).toEqual([
      'Egg-yolk powder — PINGÜINO Starter Pack',
      'Neutral light wafer crumble',
      'Roasted hazelnut pieces',
      'Milk-chocolate coating/ripple',
      'Roasted almond pieces',
      'Dark cocoa-cookie crumble',
      'Vanilla-cream ripple',
      'Roasted peanut pieces',
      'Milk-chocolate pieces/coating for Knickers',
    ]);
    const mandatory = [
      'required_name', 'exact_form', 'recipes', 'scope', 'required_composition_fields',
      'required_allergens', 'required_process', 'required_price',
      'required_serving_dose_information', 'responsible_party', 'current_status',
      'exact_blocker',
    ];
    for (const row of required) {
      expect(mandatory.every((column) => row[column]?.trim())).toBe(true);
    }
  });

  it('records every egg-yolk powder intake field and never substitutes fresh yolk', () => {
    const powder = required[0]!;
    const serialized = JSON.stringify(powder).toLowerCase();
    for (const term of [
      'product name', 'manufacturer', 'ean/sku', 'ingredients', 'nutrition per 100 g',
      'moisture/water', 'dry matter', 'fat', 'protein', 'carbohydrate', 'sugars',
      'salt', 'allergen', 'dosage', 'reconstitution ratio', 'fresh-yolk equivalence',
      'process/temperature', 'package size', 'purchase price/kg', 'market/country',
      'label/specification evidence',
    ]) {
      expect(serialized).toContain(term);
    }
    const registry = readFileSync(
      resolve(process.cwd(), 'src/data/recipes/executableRecipeLibrary.ts'),
      'utf8',
    );
    expect(registry).not.toContain('PI-ING-001646');
    expect(registry).toContain("'egg_yolk_powder_starter_pack'");
    expect(registry).toMatch(/grams:\s*null/);
  });

  it('keeps milk-chocolate item 9 explicit and conditional instead of silently consolidating it', () => {
    expect(required).toHaveLength(9);
    const milkChocolate = required.find((row) => row.priority === '4')!;
    const conditionalPieces = required.find((row) => row.priority === '9')!;
    expect(milkChocolate.recipes).toContain('Knickers (conditional coverage pending)');
    expect(milkChocolate.exact_blocker).toContain('only after');
    expect(conditionalPieces.current_status).toBe('CONDITIONAL_PENDING_CONSOLIDATION');
    expect(conditionalPieces.exact_blocker).toContain('equivalence is not proven');
  });

  it('lists all eleven existing canonical products and asks for completion, not duplicates', () => {
    expect(existing.map((row) => row.canonical_id)).toEqual([
      'PI-ING-001579', 'PI-ING-001512', 'PI-ING-001705', 'PI-ING-000419',
      'PI-ING-000151', 'PI-ING-000437', 'PI-ING-000118', 'PI-ING-000142',
      'PI-ING-000308', 'PI-ING-000146', 'PI-ING-000309',
    ]);
    expect(existing.every((row) => row.existing === 'YES — canonical Mapper identity')).toBe(true);
    expect(existing.every((row) => (row.missing_fields ?? '').trim().length > 0)).toBe(true);
  });
});
