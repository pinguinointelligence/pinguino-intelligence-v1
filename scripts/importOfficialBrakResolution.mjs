#!/usr/bin/env node
/**
 * Imports the owner BRAK crosswalk and the FINAL-2541 approval state of the
 * referenced PIs for the OFFICIAL Gellatti Recipe Library readiness model.
 *
 * Sources:
 *   - GELLATTI_75_COUNTRIES_MISSING_INGREDIENTS_SEARCH_WORKLIST_v1.xlsx,
 *     sheet 05_BRAK_RESOLUTION_44 — the owner crosswalk: one row per BRAK
 *     label with its resolution class, queue article(s) or existing PI;
 *   - src/data/recipes/official/officialRecipeLibrary.manifest.json — the
 *     PIs the library references;
 *   - docs/ingredients/validation/mapper_basement.csv — FINAL 2541: approval of
 *     every referenced PI and of every crosswalk target PI.
 *
 * Nothing here changes a recipe: a USE_EXISTING_PI row is a proposal that is
 * applied only at landing, and the library line keeps its BRAK identity.
 * Fail-closed on layout drift, an unknown class, a duplicate label, or a
 * target PI missing from FINAL 2541.
 *
 * Usage:
 *   node scripts/importOfficialBrakResolution.mjs --worklist=<xlsx> [--mapper=<csv>] [--check]
 *
 * Writes:
 *   src/data/recipes/official/officialBrakResolution.generated.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'xlsx';

const XLSX = pkg;
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = resolve(ROOT, 'src/data/recipes/official/officialBrakResolution.generated.ts');
const MANIFEST = resolve(ROOT, 'src/data/recipes/official/officialRecipeLibrary.manifest.json');
const DEFAULT_MAPPER = resolve(ROOT, 'docs/ingredients/validation/mapper_basement.csv');
const SHEET = '05_BRAK_RESOLUTION_44';
const EXPECTED_ROWS = 44;
const HEADER = [
  'Original BRAK',
  'Affected recipes',
  'Resolution class',
  'Action bucket',
  'Queue ID(s)',
  'Preferred solution',
  'Current / source ID',
  'Target ID after action',
  'Exactness',
  'Engine / process action',
  'Source URL',
  'Separate search target?',
];
const CLASSES = [
  'NO_ACTION',
  'USE_EXISTING_PI',
  'INTERNAL_SUBRECIPE',
  'SCAN_PL_LIST',
  'BUY_PL_SCAN',
  'EU_IMPORT_REFORMULATE',
];
const PI_PATTERN = /^PI-ING-\d{6}$/;

function fail(message) {
  process.stderr.write(`importOfficialBrakResolution: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) values.set(match[1], match[2]);
    else if (arg === '--check') flags.add('check');
    else fail(`unknown argument ${arg}`);
  }
  if (!values.get('worklist')) fail('missing --worklist=<xlsx>');
  return {
    worklist: resolve(values.get('worklist')),
    mapper: resolve(values.get('mapper') ?? DEFAULT_MAPPER),
    check: flags.has('check'),
  };
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clean = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text === '' || text === '—' ? null : text;
};

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCrosswalk(workbookPath) {
  const workbook = XLSX.read(readFileSync(workbookPath), { type: 'buffer' });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) fail(`sheet ${SHEET} not found`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = rows.findIndex((row) => row && clean(row[0]) === HEADER[0]);
  if (headerIndex < 0) fail(`${SHEET}: header row not found`);
  const header = HEADER.map((_, index) => clean(rows[headerIndex][index]));
  if (JSON.stringify(header) !== JSON.stringify(HEADER)) {
    fail(`${SHEET} header changed: ${JSON.stringify(header)}`);
  }
  const entries = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const label = clean(row?.[0]);
    if (!label) continue;
    const resolutionClass = clean(row[2]);
    if (!CLASSES.includes(resolutionClass)) fail(`${label}: unknown resolution class ${resolutionClass}`);
    const sourceId = clean(row[6]);
    const targetPi = sourceId && PI_PATTERN.test(sourceId) ? sourceId : null;
    if ((resolutionClass === 'USE_EXISTING_PI') !== (targetPi !== null)) {
      fail(`${label}: class ${resolutionClass} with source id ${sourceId}`);
    }
    entries.push({
      label,
      resolutionClass,
      actionBucket: clean(row[3]),
      queueIds: (clean(row[4]) ?? '')
        .split(/[;,]/)
        .map((id) => id.trim())
        .filter(Boolean),
      targetPi,
      exactness: clean(row[8]),
    });
  }
  if (entries.length !== EXPECTED_ROWS) fail(`${SHEET}: ${entries.length} rows, expected ${EXPECTED_ROWS}`);
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.label)) fail(`duplicate BRAK label ${entry.label}`);
    seen.add(entry.label);
  }
  return entries;
}

function readMapper(mapperPath) {
  const grid = parseCsv(readFileSync(mapperPath, 'utf8'));
  const header = grid[0];
  const index = (name) => {
    const i = header.indexOf(name);
    if (i < 0) fail(`mapper column ${name} missing`);
    return i;
  };
  const id = index('ingredient_id');
  const base = index('approved_for_base');
  const engines = index('approved_for_engines');
  const status = index('verification_status');
  const rows = new Map();
  for (const cells of grid.slice(1)) {
    if (cells.length !== header.length) continue;
    rows.set(cells[id], {
      approved: cells[base] === 'TRUE' && cells[engines] === 'TRUE',
      verificationStatus: cells[status],
    });
  }
  return rows;
}

function render({ worklistName, worklistSha, mapperSha, entries, blocked }) {
  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Official Gellatti Recipe Library — owner BRAK crosswalk + FINAL-2541 approval
 * state of the referenced PIs. Regenerate / verify with
 * scripts/importOfficialBrakResolution.mjs.
 *
 * Crosswalk workbook : ${worklistName} (sheet ${SHEET})
 * Crosswalk SHA-256  : ${worklistSha}
 * Mapper projection  : docs/ingredients/validation/mapper_basement.csv
 * Mapper SHA-256     : ${mapperSha}
 *
 * The class is the owner's. A USE_EXISTING_PI row is a proposal applied only at
 * landing — the library line keeps its BRAK identity until then.
 */

export const OFFICIAL_BRAK_CROSSWALK_SOURCE = {
  workbook: ${JSON.stringify(worklistName)},
  sheet: ${JSON.stringify(SHEET)},
  sha256: ${JSON.stringify(worklistSha)},
  mapperSha256: ${JSON.stringify(mapperSha)},
} as const;

export type OfficialBrakResolutionClass =
${CLASSES.map((name) => `  | ${JSON.stringify(name)}`).join('\n')};

export interface OfficialBrakResolution {
  readonly label: string;
  readonly resolutionClass: OfficialBrakResolutionClass;
  readonly actionBucket: string | null;
  readonly queueIds: readonly string[];
  /** USE_EXISTING_PI only: the existing canonical PI the owner crosswalk proposes. */
  readonly targetPi: string | null;
  /** FINAL 2541 approves targetPi for Base and Engines (null without a target). */
  readonly targetApproved: boolean | null;
  readonly exactness: string | null;
}

export const OFFICIAL_BRAK_RESOLUTIONS: readonly OfficialBrakResolution[] = ${JSON.stringify(entries, null, 2)};

/** Referenced PIs that FINAL 2541 does not approve for Base and Engines. */
export const OFFICIAL_FINAL_BLOCKED_PIS: readonly {
  readonly pi: string;
  readonly verificationStatus: string;
}[] = ${JSON.stringify(blocked, null, 2)};
`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const worklistBytes = readFileSync(options.worklist);
  const mapperBytes = readFileSync(options.mapper);
  const mapper = readMapper(options.mapper);
  const entries = readCrosswalk(options.worklist).map((entry) => {
    if (entry.targetPi && !mapper.has(entry.targetPi)) fail(`${entry.label}: ${entry.targetPi} not in FINAL 2541`);
    return { ...entry, targetApproved: entry.targetPi ? mapper.get(entry.targetPi).approved : null };
  });
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const referenced = manifest.referencedPi;
  if (!Array.isArray(referenced) || referenced.length === 0) fail('manifest has no referencedPi');
  const blocked = [];
  for (const pi of [...referenced].sort()) {
    const row = mapper.get(pi);
    if (!row) fail(`referenced ${pi} missing from FINAL 2541`);
    if (!row.approved) blocked.push({ pi, verificationStatus: row.verificationStatus });
  }
  const content = render({
    worklistName: basename(options.worklist),
    worklistSha: sha256(worklistBytes),
    mapperSha: sha256(mapperBytes),
    entries,
    blocked,
  });
  if (options.check) {
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== content) fail(`${OUTPUT} drifted from its sources; rerun without --check`);
    process.stdout.write(`OK: ${basename(OUTPUT)} matches its sources\n`);
  } else {
    writeFileSync(OUTPUT, content);
    process.stdout.write(`wrote ${basename(OUTPUT)}\n`);
  }
  const byClass = {};
  for (const entry of entries) byClass[entry.resolutionClass] = (byClass[entry.resolutionClass] ?? 0) + 1;
  process.stdout.write(
    `${JSON.stringify({ labels: entries.length, byClass, finalBlocked: blocked.map((b) => b.pi) })}\n`,
  );
}

main();
