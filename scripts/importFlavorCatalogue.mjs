#!/usr/bin/env node
/**
 * Deterministic build-time importer for the complete flavor-inspiration catalogue.
 *
 * Reads the owner workbook `docs/recipes/PINGUINO_FLAVOR_INSPIRATION_2500.xlsx`
 * (sheet `TOP_2500`) + the served `public/recipes/FL-xxxxxx_*.webp` photos and writes ONE
 * generated manifest: `src/data/recipes/flavorCatalogue.generated.ts`.
 *
 * This script is NOT bundled to the browser — the SheetJS (`xlsx`) parser lives
 * here (a devDependency) and the browser consumes only the generated manifest.
 *
 * Usage:
 *   node scripts/importFlavorCatalogue.mjs          # regenerate the manifest
 *   node scripts/importFlavorCatalogue.mjs --check   # re-derive + compare (CI/owner)
 *   node scripts/importFlavorCatalogue.mjs --summary # print audit, write nothing
 *
 * HONESTY: this imports flavor INSPIRATION metadata only — no grams, no product
 * ids, no verified doses, no Engine-ready recipe. It never invents an image and
 * never reuses another flavor's photo. All business derivation (profile mapping,
 * formula status, flavor tags) happens in TypeScript, not here.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'xlsx';

const XLSX = pkg;

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const RECIPES_DIR = join(REPO_ROOT, 'docs', 'recipes');
const RECIPE_IMAGES_DIR = join(REPO_ROOT, 'public', 'recipes');
const WORKBOOK_FILE = 'PINGUINO_FLAVOR_INSPIRATION_2500.xlsx';
const WORKBOOK_PATH = join(RECIPES_DIR, WORKBOOK_FILE);
const OUTPUT_PATH = join(REPO_ROOT, 'src', 'data', 'recipes', 'flavorCatalogue.generated.ts');

const SOURCE_SHEET = 'TOP_2500';
const CATALOGUE_VERSION = 'inspiration-2500-v1';
const FIRST_RANK = 1;
const LAST_RANK = 2500;
const IMPORT_COUNT = LAST_RANK - FIRST_RANK + 1;

const EXPECTED_COLUMNS = [
  'ID',
  'Popularity Rank',
  'Flavor Name',
  'Main Ingredients',
  'Category',
  'Popularity Score',
  'Product Profile',
  'Season',
  'Tags',
  'World Region',
  'Image Prompt',
];

/* ------------------------------------------------------------------------ *
 * WebP header parsing (VP8 / VP8L / VP8X) — no image library required        *
 * ------------------------------------------------------------------------ */
function parseWebp(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a RIFF/WEBP file');
  }
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') {
    const flags = buf[20];
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height, hasAlpha: (flags & 0x10) !== 0 };
  }
  if (fourcc === 'VP8 ') {
    const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
    const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
    return { width, height, hasAlpha: false };
  }
  if (fourcc === 'VP8L') {
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { width, height, hasAlpha: ((b4 >> 4) & 1) === 1 };
  }
  throw new Error(`unsupported WebP chunk: ${fourcc}`);
}

/* ------------------------------------------------------------------------ *
 * Source workbook                                                            *
 * ------------------------------------------------------------------------ */
function readWorkbook() {
  const bytes = readFileSync(WORKBOOK_PATH);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const wb = XLSX.read(bytes, { type: 'buffer' });
  if (!wb.SheetNames.includes(SOURCE_SHEET)) {
    throw new Error(`Sheet "${SOURCE_SHEET}" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SOURCE_SHEET], { header: 1, blankrows: false });
  const header = rows[0].map((c) => String(c).trim());
  for (let i = 0; i < EXPECTED_COLUMNS.length; i++) {
    if (header[i] !== EXPECTED_COLUMNS[i]) {
      throw new Error(`Column ${i} mismatch: expected "${EXPECTED_COLUMNS[i]}", got "${header[i]}"`);
    }
  }
  const dataRows = rows.slice(1);
  return { sha256, header, dataRows, spreadsheetRowCount: dataRows.length };
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ------------------------------------------------------------------------ *
 * Image audit — match by exact `FL-xxxxxx` id prefix                         *
 * ------------------------------------------------------------------------ */
function buildImageIndex() {
  const files = readdirSync(RECIPE_IMAGES_DIR).filter((f) => f.toLowerCase().endsWith('.webp'));
  const byId = new Map();
  const shaToIds = new Map();
  for (const file of files.sort()) {
    const match = file.match(/^(FL-\d{6})_/);
    if (!match) continue;
    const id = match[1];
    if (byId.has(id)) {
      throw new Error(`Duplicate image files for ${id}: ${byId.get(id).file}, ${file}`);
    }
    const bytes = readFileSync(join(RECIPE_IMAGES_DIR, file));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const dims = parseWebp(bytes);
    byId.set(id, {
      status: 'present',
      file,
      ext: extname(file),
      width: dims.width,
      height: dims.height,
      hasAlpha: dims.hasAlpha,
      bytes: bytes.length,
      sha256,
    });
    if (!shaToIds.has(sha256)) shaToIds.set(sha256, []);
    shaToIds.get(sha256).push(id);
  }
  const duplicateGroups = [...shaToIds.values()].filter((ids) => ids.length > 1);
  return { byId, duplicateGroups, fileCount: files.length };
}

function missingAudit() {
  return { status: 'missing', file: null, ext: null, width: null, height: null, hasAlpha: null, bytes: null, sha256: null };
}

/* ------------------------------------------------------------------------ *
 * Build the immutable source records                                        *
 * ------------------------------------------------------------------------ */
function buildRecords(workbook, images) {
  const records = [];
  const missingIds = [];
  const mappedIds = [];
  for (let rank = FIRST_RANK; rank <= LAST_RANK; rank++) {
    const rowIndex = rank - 1; // 0-based within dataRows
    const row = workbook.dataRows[rowIndex];
    const expectedId = `FL-${String(rank).padStart(6, '0')}`;
    const id = String(row[0]).trim();
    const popularityRank = Number(row[1]);
    if (id !== expectedId) {
      throw new Error(`Row ${rowIndex + 2}: expected id ${expectedId}, got ${id} — catalogue order is not deterministic`);
    }
    if (popularityRank !== rank) {
      throw new Error(`Row ${rowIndex + 2} (${id}): expected Popularity Rank ${rank}, got ${popularityRank}`);
    }
    const image = images.byId.get(id) ?? missingAudit();
    if (image.status === 'present') mappedIds.push(id);
    else missingIds.push(id);
    records.push({
      id,
      popularityRank,
      flavorName: String(row[2]).trim(),
      mainIngredients: splitList(row[3]),
      category: String(row[4]).trim(),
      popularityScore: Number(row[5]),
      productProfile: String(row[6]).trim(),
      season: String(row[7]).trim(),
      tags: splitList(row[8]),
      worldRegion: String(row[9]).trim(),
      sourceRow: rowIndex + 2, // 1-based incl header
      image,
    });
  }
  return { records, missingIds, mappedIds };
}

/* ------------------------------------------------------------------------ *
 * Emit the generated manifest                                               *
 * ------------------------------------------------------------------------ */
function renderManifest({ records, sha256, spreadsheetRowCount }) {
  const body = JSON.stringify(records, null, 2);
  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Complete flavor INSPIRATION catalogue (metadata only — not recipes).
 * Regenerate with:  npm run recipes:import
 * Validate with:    npm run recipes:validate
 *
 * Source workbook : docs/recipes/${WORKBOOK_FILE}
 * Source sheet    : ${SOURCE_SHEET}
 * Source SHA-256  : ${sha256}
 * Row range       : ${FIRST_RANK}..${LAST_RANK} (Popularity Rank), 1-based sheet rows 2..${LAST_RANK + 1}
 * Spreadsheet rows: ${spreadsheetRowCount}
 * Catalogue ver.  : ${CATALOGUE_VERSION}
 *
 * The generated records hold VERBATIM source columns + a deterministic image
 * audit. All business derivation (profile mapping, formula status, flavor tags)
 * lives in ./flavorProfileMapping.ts.
 */
import type { FlavorSourceRecord } from './flavorCatalogueTypes';

export const SOURCE_WORKBOOK = '${WORKBOOK_FILE}';
export const SOURCE_SHEET = '${SOURCE_SHEET}';
export const SOURCE_SHA256 = '${sha256}';
export const CATALOGUE_VERSION = '${CATALOGUE_VERSION}';
export const SPREADSHEET_ROW_COUNT = ${spreadsheetRowCount};
export const SOURCE_ROW_RANGE = { firstRank: ${FIRST_RANK}, lastRank: ${LAST_RANK}, count: ${IMPORT_COUNT} } as const;

export const FLAVOR_CATALOGUE_SOURCE: readonly FlavorSourceRecord[] = ${body};
`;
}

/* ------------------------------------------------------------------------ *
 * Main                                                                      *
 * ------------------------------------------------------------------------ */
function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has('--check');
  const summaryOnly = args.has('--summary');

  const workbook = readWorkbook();
  const images = buildImageIndex();
  const { records, missingIds, mappedIds } = buildRecords(workbook, images);

  if (images.duplicateGroups.length > 0) {
    throw new Error(`Duplicate image hashes detected: ${JSON.stringify(images.duplicateGroups)}`);
  }

  const manifest = renderManifest({ records, sha256: workbook.sha256, spreadsheetRowCount: workbook.spreadsheetRowCount });

  const summary = [
    `Source workbook : docs/recipes/${WORKBOOK_FILE}`,
    `Source SHA-256  : ${workbook.sha256}`,
    `Spreadsheet rows: ${workbook.spreadsheetRowCount}`,
    `Imported        : ${records.length} (ranks ${FIRST_RANK}..${LAST_RANK})`,
    `Image files     : ${images.fileCount}`,
    `Mapped images   : ${mappedIds.length}`,
    `Missing images  : ${missingIds.length}${missingIds.length > 0 ? ` (first 20: ${missingIds.slice(0, 20).join(', ')})` : ''}`,
    `Duplicate hashes: ${images.duplicateGroups.length}`,
  ].join('\n');

  if (summaryOnly) {
    process.stdout.write(summary + '\n');
    return;
  }

  if (check) {
    let onDisk = '';
    try {
      onDisk = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      process.stderr.write(`FAIL: generated manifest missing at ${OUTPUT_PATH}\n`);
      process.exit(1);
    }
    // Compare CONTENT, not line endings — git owns EOL policy (autocrlf), so the
    // checked-out file may be CRLF while the importer always emits LF.
    const normalizeEol = (s) => s.replace(/\r\n/g, '\n');
    if (normalizeEol(onDisk) !== normalizeEol(manifest)) {
      process.stderr.write('FAIL: generated manifest is stale — run `npm run recipes:import`.\n');
      process.exit(1);
    }
    process.stdout.write('OK: generated manifest matches the source.\n' + summary + '\n');
    return;
  }

  writeFileSync(OUTPUT_PATH, manifest, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n` + summary + '\n');
}

main();
