/**
 * Mapper Basement source-file guards (v1.0).
 *
 * Proves that docs/ingredients/validation/mapper_basement.csv is the canonical
 * v1.0 dataset (2,083 rows, 62 columns) delivered as
 * PINGUINO_MAPPER_BASEMENT_FINAL_CLEAN.csv — IDs are never renumbered
 * (PI-ING-000001 … PI-ING-002108 with intentional gaps), and PAC/POD stay
 * populated. Pure file read (vitest node env); does NOT touch the runtime
 * service, IngredientRow, or the Studio picker.
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

const mb = read(MAPPER_BASEMENT);
const mbHeader = mb[0]!;
const mbData = mb.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));
const col = (name: string) => mbHeader.indexOf(name);

describe('mapper_basement.csv — canonical v1.0 dataset', () => {
  it('has exactly 2083 data rows', () => {
    expect(mbData).toHaveLength(2083);
  });

  it('has exactly 62 columns (header + every row)', () => {
    expect(mbHeader).toHaveLength(62);
    for (const row of mbData) expect(row).toHaveLength(62);
  });

  it('does NOT contain npac_value (no-NPAC model)', () => {
    expect(mbHeader).not.toContain('npac_value');
    expect(col('pac_value')).toBeGreaterThanOrEqual(0);
    expect(col('pod_value')).toBeGreaterThanOrEqual(0);
  });

  it('has approved_for_base and approved_for_engines, never the legacy names', () => {
    expect(mbHeader).toContain('approved_for_base');
    expect(mbHeader).toContain('approved_for_engines');
    expect(mbHeader).not.toContain('approved_for_pinguino_base');
    expect(mbHeader).not.toContain('approved_for_minus_11_engine');
  });

  it('every ingredient_id is unique, PI-ING-prefixed, and never renumbered', () => {
    const ids = mbData.map((r) => r[col('ingredient_id')]!);
    expect(new Set(ids).size).toBe(2083);
    expect(ids.every((id) => id.startsWith('PI-ING-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('PR-ING-'))).toBe(false);
    const sorted = [...ids].sort();
    expect(sorted[0]).toBe('PI-ING-000001');
    expect(sorted[sorted.length - 1]).toBe('PI-ING-002108'); // gaps are intentional
  });

  it('every ingredient_name_internal is unique and non-blank', () => {
    const names = mbData.map((r) => r[col('ingredient_name_internal')]!);
    expect(new Set(names).size).toBe(2083);
    expect(names.every((n) => n.trim() !== '')).toBe(true);
  });

  it('PAC and POD are populated on every row (engine sources of truth)', () => {
    const pac = col('pac_value');
    const pod = col('pod_value');
    for (const row of mbData) {
      expect((row[pac] ?? '').trim() !== '').toBe(true);
      expect((row[pod] ?? '').trim() !== '').toBe(true);
    }
  });
});
