/**
 * Mapper Basement source-file guards (Slice A).
 *
 * Proves that docs/ingredients/validation/mapper_basement.csv is the v0.95
 * (no-NPAC) dataset with ONLY the two column headers renamed — values unchanged
 * from v0.95 except the column names. Pure file read (vitest node env); does NOT
 * touch the runtime service, IngredientRow, or the Studio picker (those stay on
 * the old table/columns until Slice B).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** RFC-4180-ish parser: quotes, escaped quotes, embedded commas, CRLF, BOM. */
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
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const read = (rel: string) => parseCsv(readFileSync(resolve(process.cwd(), rel), 'utf8'));

const MAPPER_BASEMENT = 'docs/ingredients/validation/mapper_basement.csv';
const MAPPER_BASEMENT_SNAPSHOT = 'docs/ingredients/validation/mapper_basement_v0_95.csv';
const V095 = 'docs/ingredients/validation/pinguino_base_ingredients_cleaned_v0_95_no_npac.csv';

const mb = read(MAPPER_BASEMENT);
const mbHeader = mb[0]!;
const mbData = mb.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));

describe('mapper_basement.csv — locked source dataset', () => {
  it('has exactly 542 data rows', () => {
    expect(mbData).toHaveLength(542);
  });

  it('has exactly 62 columns (header + every row)', () => {
    expect(mbHeader).toHaveLength(62);
    for (const row of mbData) expect(row).toHaveLength(62);
  });

  it('does NOT contain npac_value (no-NPAC model)', () => {
    expect(mbHeader).not.toContain('npac_value');
  });

  it('has approved_for_base and approved_for_engines', () => {
    expect(mbHeader).toContain('approved_for_base');
    expect(mbHeader).toContain('approved_for_engines');
  });

  it('does NOT have the legacy approval column names', () => {
    expect(mbHeader).not.toContain('approved_for_pinguino_base');
    expect(mbHeader).not.toContain('approved_for_minus_11_engine');
  });

  it('values are unchanged from v0.95 except the two renamed column headers', () => {
    const old = read(V095);
    const oldHeader = old[0]!;
    const oldData = old.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));

    // exactly the two header positions differ — the documented renames
    const headerDiffs = oldHeader
      .map((h, i) => (h === mbHeader[i] ? null : `${i}:${h}->${mbHeader[i]}`))
      .filter(Boolean);
    expect(headerDiffs).toEqual([
      '9:approved_for_pinguino_base->approved_for_base',
      '10:approved_for_minus_11_engine->approved_for_engines',
    ]);

    // every data cell is byte-identical (no numeric or any value changed)
    expect(mbData.length).toBe(oldData.length);
    let cellDiffs = 0;
    for (let r = 0; r < oldData.length; r++) {
      for (let c = 0; c < oldHeader.length; c++) {
        if ((oldData[r]![c] ?? '') !== (mbData[r]![c] ?? '')) cellDiffs++;
      }
    }
    expect(cellDiffs).toBe(0);
  });

  it('the versioned snapshot is byte-identical to the active file (provenance copy)', () => {
    expect(readFileSync(resolve(process.cwd(), MAPPER_BASEMENT_SNAPSHOT), 'utf8')).toBe(
      readFileSync(resolve(process.cwd(), MAPPER_BASEMENT), 'utf8'),
    );
  });
});
