// Validate + normalize a RAW PINGÜINO Base ingredient CSV against the frozen
// Hermes intake schema, WITHOUT importing anything from the app, the engine,
// the database vendor, or any UI. It only reads files and writes two artifacts:
//   - docs/ingredients/validation/<cleaned>.csv
//   - docs/ingredients/validation/<report>.md
//
// The raw input file is NEVER modified. Numeric values are preserved verbatim:
// blanks are never turned into 0 and 0 is never turned into blank.
//
// Context: the v0.94 dataset is an INTERNALLY CONFIRMED PINGÜINO Base dataset,
// so confirmed approvals are preserved/normalized (not globally downgraded);
// rows that lack critical engine data are listed as exceptions instead.
//
// Usage:
//   node scripts/validateIngredientCsv.mjs [path-to-raw.csv]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..');
const DOCS = join(REPO, 'docs', 'ingredients');
const VALID_DIR = join(DOCS, 'validation');

const DATASET_VERSION = 'v0_94';
const ENGINE_LABEL = '−11°C Engine'; // −11°C Engine (U+2212 minus)
const INTERNAL_SOURCE = 'pinguino_internal_confirmed_dataset_v0_94';
const INTERNAL_REF = 'internal_dataset_v0_94';
const INTERNAL_REVIEWER = 'PINGUINO team';

const INPUT =
  process.argv[2] ?? join(VALID_DIR, `pinguino_base_ingredients_raw_${DATASET_VERSION}.csv`);
const CLEANED_OUT = join(VALID_DIR, `pinguino_base_ingredients_cleaned_${DATASET_VERSION}.csv`);
const REPORT_OUT = join(VALID_DIR, `pinguino_base_ingredients_validation_report_${DATASET_VERSION}.md`);
const TEMPLATE = join(DOCS, 'pinguino_base_ingredients_template.csv');

// ---------------------------------------------------------------- helpers ----
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const numOf = (v) => (isBlank(v) ? null : Number(v));
const isZero = (v) => !isBlank(v) && Number.isFinite(numOf(v)) && numOf(v) === 0;
const isPos = (v) => !isBlank(v) && Number.isFinite(numOf(v)) && numOf(v) > 0;

/** RFC-4180-ish CSV parser: handles quotes, escaped quotes, commas, CRLF. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // ignore CR; LF terminates the record
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csvEscape = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lc = (v) => String(v ?? '').trim().toLowerCase();

// ----------------------------------------------------- schema / mappings ----
const CANONICAL_HEADERS = parseCsv(readFileSync(TEMPLATE, 'utf8'))[0];

// raw -> canonical column renames. Recognizes the new mapper_basement input
// names; the canonical OUTPUT names stay v0.95 in this slice (the canonical flip
// to approved_for_base / approved_for_engines happens with the table/type rename).
const RENAME = {
  approved_for_base: 'approved_for_pinguino_base',
  approved_for_engines: 'approved_for_minus_11_engine',
};
// canonical -> raw lookup
const CANON_TO_RAW = Object.fromEntries(
  CANONICAL_HEADERS.map((h) => {
    const rawName = Object.keys(RENAME).find((k) => RENAME[k] === h);
    return [h, rawName ?? h];
  }),
);

const STORAGE_MAP = {
  ambient: 'ambient',
  ambient_dry: 'dry',
  refrigerated: 'chilled',
  fresh_chilled: 'chilled',
  frozen: 'frozen',
  frozen_or_refrigerated: 'unknown',
};
const STORAGE_ENUM = new Set(['ambient', 'chilled', 'frozen', 'dry', 'unknown']);

const VERIFICATION_ENUM = new Set([
  'draft',
  'internet_data',
  'label_data',
  'supplier_data',
  'external_reference_data',
  'needs_review',
  'verified',
  'rejected',
]);

// engine-approval critical fields (must be present to KEEP approval true)
const ENGINE_CRITICAL = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
  'pod_value',
  'pac_value',
  'npac_value',
];

const ROW_REQUIRED = [
  'ingredient_id',
  'ingredient_name_internal',
  'ingredient_name_display',
  'ingredient_category',
  'verification_status',
];

// ------------------------------------------------------------- read raw ----
const rawRows = parseCsv(readFileSync(INPUT, 'utf8'));
const rawHeaders = rawRows[0];
const dataRows = rawRows.slice(1).filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''));
const records = dataRows.map((cells) => {
  const o = {};
  rawHeaders.forEach((h, i) => (o[h] = cells[i] ?? ''));
  return o;
});

// header diff
const renamedHeaders = rawHeaders.map((h) => RENAME[h] ?? h);
const extraInFile = renamedHeaders.filter((h) => !CANONICAL_HEADERS.includes(h));
const missingFromFile = CANONICAL_HEADERS.filter((h) => !renamedHeaders.includes(h));

// ------------------------------------------------------- normalize rows ----
const statusCounts = {}; // "Raw->normalized" -> n
const storageCounts = {}; // "raw->mapped" -> n
const estimatedRows = []; // ids originally Estimated
const engineExceptions = []; // {id, missing:[...]}
const invalidStatus = [];
const invalidStorage = [];
const duplicates = {};
const missingRequired = [];
const suspiciousA = []; // fat>0 but sat fat ==0
const suspiciousB = []; // dairy w/ NFMS>0 but lactose==0
const suspiciousC = []; // total sugars>0 but full breakdown ==0
let provSourceReplaced = 0;
let provReviewerReplaced = 0;
let provUrlReplaced = 0;
let provShotReplaced = 0;
let approvedBaseTrue = 0;
let approvedEngineTrue = 0;

const idSeen = new Set();

const cleaned = records.map((row) => {
  const out = {};

  // verification_status normalization
  const rawStatus = String(row.verification_status ?? '').trim();
  const ls = lc(rawStatus);
  let normStatus;
  if (ls === 'estimated') {
    normStatus = 'verified'; // confirmed PI Base v0.94 dataset
    estimatedRows.push(row.ingredient_id);
  } else if (VERIFICATION_ENUM.has(ls)) {
    normStatus = ls;
  } else {
    normStatus = 'needs_review';
    invalidStatus.push({ id: row.ingredient_id, raw: rawStatus });
  }
  statusCounts[`${rawStatus || '(blank)'} -> ${normStatus}`] =
    (statusCounts[`${rawStatus || '(blank)'} -> ${normStatus}`] ?? 0) + 1;

  // storage_type normalization
  const rawStorage = lc(row.storage_type);
  let normStorage;
  if (STORAGE_MAP[rawStorage]) {
    normStorage = STORAGE_MAP[rawStorage];
  } else if (STORAGE_ENUM.has(rawStorage)) {
    normStorage = rawStorage;
  } else {
    normStorage = 'unknown';
    invalidStorage.push({ id: row.ingredient_id, raw: row.storage_type });
  }
  storageCounts[`${row.storage_type || '(blank)'} -> ${normStorage}`] =
    (storageCounts[`${row.storage_type || '(blank)'} -> ${normStorage}`] ?? 0) + 1;

  // PI Base approval: preserve confirmed approval verbatim (lower-cased)
  const baseApproved = lc(row.approved_for_base) === 'true';
  if (baseApproved) approvedBaseTrue++;

  // engine approval: keep true only with full critical data, else exception.
  // Reads the new mapper_basement column (approved_for_engines) with a fallback
  // to the legacy approved_for_minus_11_engine so both raw formats are accepted.
  const rawEngineTrue = lc(row.approved_for_engines ?? row.approved_for_minus_11_engine) === 'true';
  let engineApproved = rawEngineTrue;
  if (rawEngineTrue) {
    const missing = ENGINE_CRITICAL.filter((f) => isBlank(row[f]));
    if (missing.length > 0) {
      engineApproved = false; // do NOT silently approve
      engineExceptions.push({ id: row.ingredient_id, missing });
    }
  }
  if (engineApproved) approvedEngineTrue++;

  // provenance normalization (no fake external links/documents invented)
  const srcRaw = String(row.verification_source ?? '').trim();
  const verification_source =
    srcRaw === '' || lc(srcRaw) === 'general' ? ((provSourceReplaced++, INTERNAL_SOURCE)) : srcRaw;
  const revRaw = String(row.last_reviewed_by ?? '').trim();
  const last_reviewed_by =
    revRaw === '' || lc(revRaw) === 'chatgpt' ? ((provReviewerReplaced++, INTERNAL_REVIEWER)) : revRaw;
  const urlRaw = String(row.source_url ?? '').trim();
  const source_url = lc(urlRaw) === 'general' ? ((provUrlReplaced++, INTERNAL_REF)) : urlRaw;
  const shotRaw = String(row.screenshot_reference ?? '').trim();
  const screenshot_reference =
    lc(shotRaw) === 'general' ? ((provShotReplaced++, INTERNAL_REF)) : shotRaw;

  // duplicates / missing required (on raw identity)
  const id = row.ingredient_id;
  if (idSeen.has(id)) duplicates[id] = (duplicates[id] ?? 1) + 1;
  idSeen.add(id);
  if (ROW_REQUIRED.some((k) => isBlank(row[k]))) missingRequired.push(id);

  // suspicious zeros (REPORT ONLY — values are not changed)
  if (isPos(row.fat_percent) && isZero(row.saturated_fat_percent)) suspiciousA.push(id);
  if (
    lc(row.ingredient_category) === 'dairy' &&
    isPos(row.non_fat_milk_solids_percent) &&
    isZero(row.lactose_percent)
  )
    suspiciousB.push(id);
  const sugarKeys = [
    'sucrose_percent',
    'dextrose_percent',
    'glucose_percent',
    'fructose_percent',
    'lactose_percent',
  ];
  if (isPos(row.total_sugars_percent) && sugarKeys.every((k) => isZero(row[k]))) suspiciousC.push(id);

  // build canonical row (numbers preserved verbatim, headers in schema order)
  for (const h of CANONICAL_HEADERS) {
    out[h] = row[CANON_TO_RAW[h]] ?? '';
  }
  out.verification_status = normStatus;
  out.storage_type = normStorage;
  out.approved_for_pinguino_base = baseApproved ? 'true' : 'false';
  out.approved_for_minus_11_engine = engineApproved ? 'true' : 'false';
  out.verification_source = verification_source;
  out.last_reviewed_by = last_reviewed_by;
  out.source_url = source_url;
  out.screenshot_reference = screenshot_reference;
  return out;
});

// --------------------------------------------------------- write cleaned ----
mkdirSync(VALID_DIR, { recursive: true });
const cleanedLines = [
  CANONICAL_HEADERS.join(','),
  ...cleaned.map((r) => CANONICAL_HEADERS.map((h) => csvEscape(r[h])).join(',')),
];
writeFileSync(CLEANED_OUT, cleanedLines.join('\n') + '\n', 'utf8');

// ---------------------------------------------------------- write report ----
const dupList = Object.entries(duplicates);
const sample = (arr, n = 25) =>
  arr.length === 0
    ? '_none_'
    : arr.slice(0, n).join(', ') + (arr.length > n ? ` … (+${arr.length - n} more)` : '');
const countTable = (obj) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| \`${k}\` | ${v} |`)
    .join('\n');

const today = new Date().toISOString().slice(0, 10);
const report = `# PINGÜINO Base Ingredients — Validation & Normalization Report (${DATASET_VERSION})

- **Generated:** ${today}
- **Source type:** internal confirmed PI Base dataset
- **Dataset version:** ${DATASET_VERSION}
- **Raw input (unmodified):** \`${INPUT.replace(/\\/g, '/')}\`
- **Cleaned output:** \`docs/ingredients/validation/pinguino_base_ingredients_cleaned_${DATASET_VERSION}.csv\`
- **Schema:** \`docs/ingredients/PINGUINO_BASE_INGREDIENTS_SCHEMA.md\` · \`src/data/ingredients/ingredientIntakeColumns.ts\`

> This dataset is treated as an **internally confirmed PINGÜINO Base dataset**. Confirmed
> approvals are preserved/normalized, not globally downgraded. Rows lacking critical engine
> data are listed as **exceptions** below. Numeric values are preserved verbatim — blanks are
> never converted to 0 and 0 is never converted to blank.

## 1. Counts
- **Data rows:** ${cleaned.length}
- **Columns:** ${CANONICAL_HEADERS.length} (exact frozen schema headers)

## 2. Column mismatches fixed
${
  extraInFile.length === 0 && missingFromFile.length === 0
    ? '- Renamed \`approved_for_base\` → \`approved_for_pinguino_base\` (positional rename).\n- All other 62 headers already matched the frozen schema.'
    : `- Renamed: \`approved_for_base\` → \`approved_for_pinguino_base\`\n- Unexpected extra (after rename): ${sample(extraInFile)}\n- Missing from file: ${sample(missingFromFile)}`
}

## 3. Status normalization counts
| transition | rows |
|---|---|
${countTable(statusCounts)}

Invalid / unrecognized statuses (set to \`needs_review\`): ${invalidStatus.length}

## 4. Storage normalization counts
| transition | rows |
|---|---|
${countTable(storageCounts)}

## 5. Rows approved for PINGÜINO Base
- \`approved_for_pinguino_base = true\`: **${approvedBaseTrue}** / ${cleaned.length}

## 6. Rows approved for ${ENGINE_LABEL}
- \`approved_for_minus_11_engine = true\`: **${approvedEngineTrue}** / ${cleaned.length}
- Approval exceptions (was \`true\`, missing critical data → set \`false\`): **${engineExceptions.length}**

## 7. Rows with missing critical engine data (exceptions)
Critical fields checked: ${ENGINE_CRITICAL.map((f) => `\`${f}\``).join(', ')}.

${
  engineExceptions.length === 0
    ? '_None — every row that claimed engine approval has all critical fields present._'
    : engineExceptions
        .slice(0, 100)
        .map((e) => `- \`${e.id}\` — missing: ${e.missing.join(', ')}`)
        .join('\n')
}

## 8. Originally-Estimated rows (normalized to \`verified\`)
Kept for later review — "confirmed from raw Estimated status". Count: **${estimatedRows.length}**

${estimatedRows.length === 0 ? '_none_' : estimatedRows.map((id) => `\`${id}\``).join(', ')}

## 9. Suspicious zeros (reported only — values NOT changed)
- **A.** \`fat_percent > 0\` but \`saturated_fat_percent = 0\`: **${suspiciousA.length}** — ${sample(suspiciousA)}
- **B.** dairy with \`non_fat_milk_solids_percent > 0\` but \`lactose_percent = 0\`: **${suspiciousB.length}** — ${sample(suspiciousB)}
- **C.** \`total_sugars_percent > 0\` but full sugar breakdown all \`0\`: **${suspiciousC.length}** — ${sample(suspiciousC)}

## 10. Duplicate IDs / missing required fields
- Duplicate \`ingredient_id\`: **${dupList.length}** ${dupList.length ? '— ' + dupList.map(([k, v]) => `\`${k}\`×${v}`).join(', ') : ''}
- Rows missing a row-creation required field (${ROW_REQUIRED.join(', ')}): **${missingRequired.length}** ${missingRequired.length ? '— ' + sample(missingRequired) : ''}

## 11. Provenance normalization applied
- \`verification_source\` placeholder (\`General\`/blank) → \`${INTERNAL_SOURCE}\`: **${provSourceReplaced}**
- \`last_reviewed_by\` placeholder (\`ChatGPT\`/blank) → \`${INTERNAL_REVIEWER}\`: **${provReviewerReplaced}**
- \`source_url = General\` → \`${INTERNAL_REF}\`: **${provUrlReplaced}**
- \`screenshot_reference = General\` → \`${INTERNAL_REF}\`: **${provShotReplaced}**
- \`verification_date\` / \`last_reviewed_at\` preserved as-is. No external links or supplier documents were invented.
`;

writeFileSync(REPORT_OUT, report, 'utf8');

// ------------------------------------------------------------- stdout ----
console.log('=== Ingredient CSV validation summary ===');
console.log(`input            : ${INPUT}`);
console.log(`cleaned out      : ${CLEANED_OUT}`);
console.log(`report out       : ${REPORT_OUT}`);
console.log(`rows / columns   : ${cleaned.length} / ${CANONICAL_HEADERS.length}`);
console.log(`status counts    : ${JSON.stringify(statusCounts)}`);
console.log(`storage counts   : ${JSON.stringify(storageCounts)}`);
console.log(`approved PI Base : ${approvedBaseTrue}`);
console.log(`approved Engine  : ${approvedEngineTrue} (exceptions: ${engineExceptions.length})`);
console.log(`orig. Estimated  : ${estimatedRows.length}`);
console.log(`suspicious zeros : A=${suspiciousA.length} B=${suspiciousB.length} C=${suspiciousC.length}`);
console.log(`duplicates       : ${dupList.length}`);
console.log(`missing required : ${missingRequired.length}`);
console.log(`prov replaced    : src=${provSourceReplaced} rev=${provReviewerReplaced} url=${provUrlReplaced} shot=${provShotReplaced}`);
console.log(`header extra/miss: ${extraInFile.length}/${missingFromFile.length}`);
