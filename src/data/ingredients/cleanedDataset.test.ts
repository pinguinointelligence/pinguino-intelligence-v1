/// <reference types="node" />
/**
 * The locked Mapper Basement dataset (mapper_basement.csv) is the ACTIVE source
 * of truth for the import. It must stay schema-faithful and engine-mappable, and
 * must NOT carry an ingredient-level npac_value column. (The older v0.94 / v0.95
 * cleaned CSVs remain on disk for rollback but are no longer the active set.)
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
    'mapper_basement.csv',
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

describe('Mapper Basement dataset (mapper_basement.csv)', () => {
  it('has exactly 2083 rows and 62 columns', () => {
    expect(dataRows.length).toBe(2083);
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

  it('approval flags are booleans and every status is in the canonical v1.0 vocabulary', () => {
    const base = col('approved_for_base');
    const eng = col('approved_for_engines');
    const status = col('verification_status');
    const VOCAB = new Set([
      'Blocked',
      'Estimated',
      'Estimated / Needs Label Review',
      'PI Calculated / Needs Label Review',
      'Superseded Duplicate',
      'Verified',
      'Verified / Basis Check Needed',
      'Verified / PI Calculated',
      'Verified / Public Label',
    ]);
    for (const row of dataRows) {
      expect(['true', 'false']).toContain((row[base] ?? '').toLowerCase());
      expect(['true', 'false']).toContain((row[eng] ?? '').toLowerCase());
      expect(VOCAB.has(row[status] ?? ''), `status "${row[status]}" in ${row[col('ingredient_id')]}`).toBe(true);
    }
  });
});
