/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findIntakeColumn,
  INGREDIENT_INTAKE_COLUMNS,
  INGREDIENT_INTAKE_HEADERS,
} from './ingredientIntakeColumns';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const DOCS = join(REPO, 'docs', 'ingredients');

const firstLine = (file: string) =>
  readFileSync(join(DOCS, file), 'utf8').split(/\r?\n/)[0]!.split(',');

const required = (key: string) => Boolean(findIntakeColumn(key)?.required);

describe('ingredient intake schema', () => {
  it('has no duplicate columns', () => {
    const keys = INGREDIENT_INTAKE_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no ingredient-level npac_value column (v0.95 no-NPAC)', () => {
    expect(findIntakeColumn('npac_value')).toBeUndefined();
    expect(INGREDIENT_INTAKE_HEADERS).not.toContain('npac_value');
    expect(INGREDIENT_INTAKE_HEADERS).toHaveLength(62);
  });

  it('CSV template headers exactly match the TypeScript schema', () => {
    expect(firstLine('pinguino_base_ingredients_template.csv')).toEqual([
      ...INGREDIENT_INTAKE_HEADERS,
    ]);
  });

  it('the example file uses the same headers', () => {
    expect(firstLine('example_pinguino_base_ingredient_row.csv')).toEqual([
      ...INGREDIENT_INTAKE_HEADERS,
    ]);
  });

  it('marks the row-creation columns required', () => {
    for (const key of [
      'ingredient_id',
      'ingredient_name_internal',
      'ingredient_name_display',
      'ingredient_category',
      'verification_status',
    ]) {
      expect(findIntakeColumn(key), key).toBeDefined();
      expect(required(key), key).toBe(true);
    }
  });

  it('also marks water_percent, pod_value and approved_for_minus_11_engine required', () => {
    expect(required('water_percent')).toBe(true);
    expect(required('pod_value')).toBe(true);
    expect(required('approved_for_minus_11_engine')).toBe(true);
  });

  it('verification_status enum includes the trust levels', () => {
    const allowed = findIntakeColumn('verification_status')?.allowedValues ?? [];
    for (const status of ['draft', 'internet_data', 'needs_review', 'verified', 'rejected']) {
      expect(allowed, status).toContain(status);
    }
  });

  it('approval flags default to false', () => {
    expect(findIntakeColumn('approved_for_minus_11_engine')?.defaultValue).toBe(false);
    expect(findIntakeColumn('approved_for_pinguino_base')?.defaultValue).toBe(false);
  });

  it('numeric unknown defaults to null — missing data is NEVER 0', () => {
    for (const column of INGREDIENT_INTAKE_COLUMNS) {
      if (column.type === 'number_or_null') {
        expect(column.defaultValue, column.key).toBeNull();
        expect(column.defaultValue, column.key).not.toBe(0);
      }
    }
  });

  it('cost_per_kg defaults to null', () => {
    expect(findIntakeColumn('cost_per_kg')?.defaultValue).toBeNull();
  });

  it('boolean_or_unknown columns default to unknown', () => {
    for (const column of INGREDIENT_INTAKE_COLUMNS) {
      if (column.type === 'boolean_or_unknown') {
        expect(column.defaultValue, column.key).toBe('unknown');
      }
    }
  });

  it('the schema module is decoupled from the engine (no @/engine import)', () => {
    const source = readFileSync(join(import.meta.dirname, 'ingredientIntakeColumns.ts'), 'utf8');
    expect(/@\/engine/.test(source)).toBe(false);
  });

  it('the example sucrose row stores verified zeros as 0 but unknowns as blank (never 0)', () => {
    const lines = readFileSync(
      join(DOCS, 'example_pinguino_base_ingredient_row.csv'),
      'utf8',
    ).split(/\r?\n/);
    const headers = lines[0]!.split(',');
    const values = lines[1]!.split(',');
    expect(values.length, 'example row column count').toBe(INGREDIENT_INTAKE_HEADERS.length);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));

    // identity + flags
    expect(row.ingredient_id).toBe('sucrose_reference_example');
    expect(row.verification_status).toBe('draft');
    expect(row.approved_for_minus_11_engine).toBe('false');
    expect(row.data_confidence_percent).toBe('0');
    // verified true zeros
    expect(row.fat_percent).toBe('0');
    expect(row.salt_percent).toBe('0');
    expect(row.alcohol_percent).toBe('0');
    // verified composition
    expect(row.total_solids_percent).toBe('100');
    expect(row.sucrose_percent).toBe('100');
    expect(row.pod_value).toBe('100');
    // unknowns must be BLANK, never 0
    expect(row.saturated_fat_percent, 'unknown sat fat must be blank').toBe('');
    expect(row.dextrose_percent, 'unknown dextrose must be blank').toBe('');
    expect(row.cost_per_kg, 'unknown cost must be blank').toBe('');
    // unknown booleans stay unknown
    expect(row.vegan).toBe('unknown');
    expect(row.dairy_free).toBe('unknown');
  });
});
