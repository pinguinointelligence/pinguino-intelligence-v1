// Generate an idempotent Supabase seed for the PINGÜINO Base Ingredients table
// from the internally-confirmed cleaned dataset. Reads ONLY the cleaned CSV and
// writes supabase/seed/ingredients_v0_94.sql — it touches no app/engine/db code
// and needs no privileged key (generating SQL ≠ applying it; applying is an
// admin/server step).
//
// Faithful to the frozen contract:
//   • blank numeric / date  -> NULL   (never invented as 0)
//   • blank text            -> ''     (empty string, per the schema's string rule)
//   • '0'                   -> 0      (verified zero preserved)
//   • true/false            -> boolean literals
// plus dataset_version = 'v0.94' and is_active = true on every row.
//
// Usage:
//   node scripts/generateIngredientSeed.mjs [path-to-cleaned.csv]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..');
// Defaults reproduce the v0.94 seed; override via env for the v0.95 no-NPAC table.
// Column emission is driven by the CSV headers, so a CSV without `npac_value`
// simply never emits that column.
const DATASET_VERSION = process.env.SEED_DATASET_VERSION ?? 'v0.94';
const TABLE = process.env.SEED_TABLE ?? 'public.ingredients';

const INPUT =
  process.argv[2] ??
  join(REPO, 'docs', 'ingredients', 'validation', `pinguino_base_ingredients_cleaned_v0_94.csv`);
const OUT_DIR = join(REPO, 'supabase', 'seed');
const OUT = join(OUT_DIR, process.env.SEED_OUT ?? `ingredients_${DATASET_VERSION.replace('.', '_')}.sql`);

// ----------------------------------------------------- column type groups ----
// Booleans, integer, dates; everything else numeric or text (lists below).
// Recognize BOTH the legacy names and the new mapper_basement names
// (approved_for_base / approved_for_engines). Emission is header-driven, so a
// CSV only ever emits the columns it actually contains.
const BOOL_COLS = new Set([
  'approved_for_pinguino_base',
  'approved_for_minus_11_engine',
  'approved_for_base',
  'approved_for_engines',
]);
const INT_COLS = new Set(['data_confidence_percent']);
const DATE_COLS = new Set(['verification_date', 'last_reviewed_at']);
const NUMERIC_COLS = new Set([
  'water_percent', 'total_solids_percent', 'fat_percent', 'saturated_fat_percent',
  'milk_fat_percent', 'non_fat_milk_solids_percent', 'protein_percent', 'aerating_protein_percent',
  'carbohydrate_percent', 'total_sugars_percent', 'sucrose_percent', 'dextrose_percent',
  'glucose_percent', 'fructose_percent', 'lactose_percent', 'polyol_percent', 'fiber_percent',
  'salt_percent', 'alcohol_percent', 'ash_percent', 'acidity_percent', 'brix', 'dry_matter_percent',
  'pod_value', 'pac_value', 'npac_value', 'de_value', 'sweetness_factor', 'freezing_factor',
  'stabilizer_activity', 'recommended_dosage_percent_min', 'recommended_dosage_percent_max',
  'kcal_per_100g', 'cost_per_kg', 'shelf_life_days',
]);
// All remaining frozen columns are plain text.

// ---------------------------------------------------------------- helpers ----
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
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

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const sqlText = (v) => `'${String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/'/g, "''")}'`;

function numericLiteral(raw, col) {
  if (isBlank(raw)) return 'NULL';
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) throw new Error(`Non-numeric value '${raw}' in numeric column ${col}`);
  return String(raw).trim(); // emit verbatim so 104.161 / 0 are preserved exactly
}

function dateLiteral(raw, col) {
  if (isBlank(raw)) return 'NULL';
  const v = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Bad date '${raw}' in ${col}`);
  return `'${v}'`;
}

function literalFor(col, raw) {
  if (BOOL_COLS.has(col)) return String(raw).trim().toLowerCase() === 'true' ? 'true' : 'false';
  if (INT_COLS.has(col)) return numericLiteral(raw, col);
  if (NUMERIC_COLS.has(col)) return numericLiteral(raw, col);
  if (DATE_COLS.has(col)) return dateLiteral(raw, col);
  return sqlText(raw); // text: blank -> '' (empty string), never NULL
}

// ------------------------------------------------------------- read csv ----
const parsed = parseCsv(readFileSync(INPUT, 'utf8'));
const headers = parsed[0];
const dataRows = parsed
  .slice(1)
  .filter((r) => !(r.length === 1 && r[0] === '') && r.some((c) => c !== ''));

const seen = new Set();
for (const r of dataRows) {
  const id = r[0];
  if (seen.has(id)) throw new Error(`Duplicate ingredient_id in source: ${id}`);
  seen.add(id);
}

const SEED_COLUMNS = [...headers, 'dataset_version', 'is_active'];

// ------------------------------------------------------- build value rows ----
const tuples = dataRows.map((cells) => {
  const literals = headers.map((h, i) => literalFor(h, cells[i] ?? ''));
  literals.push(sqlText(DATASET_VERSION)); // dataset_version
  literals.push('true'); // is_active
  return `(${literals.join(', ')})`;
});

// non-PK columns updated on conflict
const updateCols = SEED_COLUMNS.filter((c) => c !== 'ingredient_id');
const updateSet = [
  ...updateCols.map((c) => `  ${c} = excluded.${c}`),
  '  updated_at = now()',
].join(',\n');

const sql = `-- Seed: PINGÜINO Base Ingredients ${DATASET_VERSION} (${dataRows.length} rows).
-- GENERATED by scripts/generateIngredientSeed.mjs from
--   docs/ingredients/validation/pinguino_base_ingredients_cleaned_v0_94.csv
-- Do NOT edit by hand — regenerate. Idempotent upsert keyed on ingredient_id.
-- Blank numeric/date -> NULL (never 0); blank text -> ''; '0' stays 0.

insert into ${TABLE} (
${SEED_COLUMNS.map((c) => `  ${c}`).join(',\n')}
) values
${tuples.join(',\n')}
on conflict (ingredient_id) do update set
${updateSet};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, sql, 'utf8');

console.log('=== ingredient seed generated ===');
console.log(`input        : ${INPUT}`);
console.log(`output       : ${OUT}`);
console.log(`columns      : ${SEED_COLUMNS.length} (${headers.length} frozen + dataset_version + is_active)`);
console.log(`rows         : ${dataRows.length}`);
console.log(`unique ids   : ${seen.size}`);
console.log(`dataset_ver  : ${DATASET_VERSION}`);
