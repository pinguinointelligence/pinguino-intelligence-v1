/// <reference types="node" />
/**
 * Phase Ingredients 1 — the generated seed must faithfully mirror the cleaned
 * dataset: 542 idempotent upserts, blanks preserved as NULL (numeric/date) or
 * '' (text), verified zeros kept as 0, dataset_version stamped, ids unique.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SEED = readFileSync(join(REPO, 'supabase', 'seed', 'ingredients_v0_94.sql'), 'utf8');
const CSV = readFileSync(
  join(REPO, 'docs', 'ingredients', 'validation', 'pinguino_base_ingredients_cleaned_v0_94.csv'),
  'utf8',
);

/** Columns whose blanks the generator turns into NULL (numeric/int/date). */
const NULLABLE_COLS = new Set([
  'data_confidence_percent',
  'water_percent', 'total_solids_percent', 'fat_percent', 'saturated_fat_percent',
  'milk_fat_percent', 'non_fat_milk_solids_percent', 'protein_percent', 'aerating_protein_percent',
  'carbohydrate_percent', 'total_sugars_percent', 'sucrose_percent', 'dextrose_percent',
  'glucose_percent', 'fructose_percent', 'lactose_percent', 'polyol_percent', 'fiber_percent',
  'salt_percent', 'alcohol_percent', 'ash_percent', 'acidity_percent', 'brix', 'dry_matter_percent',
  'pod_value', 'pac_value', 'npac_value', 'de_value', 'sweetness_factor', 'freezing_factor',
  'stabilizer_activity', 'recommended_dosage_percent_min', 'recommended_dosage_percent_max',
  'kcal_per_100g', 'cost_per_kg', 'shelf_life_days',
  'verification_date', 'last_reviewed_at',
]);

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Split a `(a, b, 'c, d', NULL)` SQL value tuple into top-level literals. */
function splitSqlTuple(line: string): string[] {
  const inner = line.trim().replace(/^\(/, '').replace(/\)[,;]?$/, '');
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === "'") { if (inner[i + 1] === "'") { cur += "''"; i++; } else { inStr = false; cur += c; } }
      else cur += c;
    } else if (c === "'") { inStr = true; cur += c; }
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const parsedCsv = parseCsv(CSV);
const csvHeaders = parsedCsv[0]!;
const csvRows = parsedCsv
  .slice(1)
  .filter((r) => !(r.length === 1 && r[0] === '') && r.some((c) => c !== ''));

const SEED_COLUMNS = [...csvHeaders, 'dataset_version', 'is_active'];
const seedIdx = (name: string) => SEED_COLUMNS.indexOf(name);

const tupleLines = SEED.split('\n').filter((l) => l.startsWith('('));
const tuples = tupleLines.map(splitSqlTuple);

describe('PI Base ingredient seed (v0.94)', () => {
  it('contains exactly 542 value rows, each with all 65 columns', () => {
    expect(tupleLines.length).toBe(542);
    for (const t of tuples) expect(t.length).toBe(SEED_COLUMNS.length);
    expect(SEED_COLUMNS.length).toBe(65);
  });

  it('upserts by ingredient_id with no duplicates', () => {
    expect(SEED.includes('on conflict (ingredient_id) do update set')).toBe(true);
    const ids = tuples.map((t) => t[0]);
    expect(new Set(ids).size).toBe(tuples.length);
  });

  it('stamps dataset_version = v0.94 on every row', () => {
    const idx = seedIdx('dataset_version');
    for (const t of tuples) expect(t[idx]).toBe("'v0.94'");
    expect((SEED.match(/'v0\.94'/g) ?? []).length).toBe(542);
  });

  it('preserves NULL for every blank numeric/date cell (never 0)', () => {
    let expectedNull = 0;
    for (const row of csvRows) {
      csvHeaders.forEach((h, i) => {
        if (NULLABLE_COLS.has(h) && (row[i] ?? '').trim() === '') expectedNull++;
      });
    }
    let actualNull = 0;
    for (const t of tuples) for (const lit of t) if (lit === 'NULL') actualNull++;
    expect(expectedNull).toBeGreaterThan(0);
    expect(actualNull).toBe(expectedNull);
  });

  it('keeps verified zeros as 0, blank text as empty string, and booleans intact', () => {
    const first = tuples[0]!;
    expect(first[0]).toBe("'PI-ING-000001'");
    expect(first[seedIdx('saturated_fat_percent')]).toBe('0'); // verified zero stays 0
    expect(first[seedIdx('de_value')]).toBe('NULL'); // blank numeric -> NULL
    expect(first[seedIdx('ean_code')]).toBe("''"); // blank text -> empty string, NOT NULL
    expect(first[seedIdx('fat_percent')]).toBe('12');
    expect(first[seedIdx('approved_for_pinguino_base')]).toBe('true');
    expect(first[seedIdx('approved_for_minus_11_engine')]).toBe('true');
    expect(first[seedIdx('is_active')]).toBe('true');
  });

  it('contains no privileged server-role reference', () => {
    expect(/service[_-]?role/i.test(SEED)).toBe(false);
  });
});
