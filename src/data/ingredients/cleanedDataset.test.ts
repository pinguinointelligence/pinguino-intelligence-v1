/// <reference types="node" />
/**
 * The internally-confirmed PI Base Ingredients v0.95 (no-NPAC) dataset is the
 * ACTIVE source of truth for the import. It must stay schema-faithful and
 * engine-mappable, and must NOT carry an ingredient-level npac_value column.
 * (The v0.94 CSV remains on disk for rollback but is no longer the active set.)
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INGREDIENT_INTAKE_HEADERS } from './ingredientIntakeColumns';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const CSV = readFileSync(
  join(
    REPO,
    'docs',
    'ingredients',
    'validation',
    'pinguino_base_ingredients_cleaned_v0_95_no_npac.csv',
  ),
  'utf8',
);

/** Minimal RFC-4180 parser (handles quoted fields with commas). */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const parsed = parseCsv(CSV);
const headers = parsed[0]!;
const dataRows = parsed
  .slice(1)
  .filter((r) => !(r.length === 1 && r[0] === '') && r.some((c) => c !== ''));
const col = (name: string) => headers.indexOf(name);

describe('PI Base cleaned dataset v0.95 (no-NPAC)', () => {
  it('has exactly 542 rows and 62 columns', () => {
    expect(dataRows.length).toBe(542);
    expect(headers.length).toBe(62);
    for (const row of dataRows) expect(row.length).toBe(62);
  });

  it('headers still match the frozen Hermes schema', () => {
    expect(headers).toEqual([...INGREDIENT_INTAKE_HEADERS]);
  });

  it('has no ingredient-level npac_value column (v0.95 no-NPAC)', () => {
    expect(headers).not.toContain('npac_value');
    expect(col('pac_value')).toBeGreaterThanOrEqual(0); // pac_value is the freezing source of truth
  });

  it('every ingredient_id is unique', () => {
    const ids = dataRows.map((r) => r[col('ingredient_id')]);
    expect(new Set(ids).size).toBe(dataRows.length);
    expect(ids.every((id) => id && id.trim() !== '')).toBe(true);
  });

  it('every row has a non-blank ingredient_category (row-creation required field)', () => {
    // NOTE: v0.94 uses a richer category vocabulary (e.g. chocolate, nut,
    // base_mix, sweetener, coconut…) than the engine's IngredientCategory union.
    // Mapping these to engine categories is Slice 2 (the mapper), not Slice 1.
    const idx = col('ingredient_category');
    for (const row of dataRows) {
      expect((row[idx] ?? '').trim() !== '', `blank category in ${row[col('ingredient_id')]}`).toBe(
        true,
      );
    }
  });

  it('every row is approved for PINGÜINO Base and the −11°C Engine, and verified', () => {
    const base = col('approved_for_pinguino_base');
    const eng = col('approved_for_minus_11_engine');
    const status = col('verification_status');
    for (const row of dataRows) {
      expect(row[base]).toBe('true');
      expect(row[eng]).toBe('true');
      expect(row[status]).toBe('verified');
    }
  });
});
