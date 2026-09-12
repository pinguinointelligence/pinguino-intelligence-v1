#!/usr/bin/env node
/**
 * Deterministic importer for the OFFICIAL Gellatti Recipe Library (177 recipes).
 *
 * Source authority (owner workstream 2026-09-11):
 *   - GELLATTI_RECEPTURY.xlsx, sheets 01_RECEPTURY + 03_SKLAD_RECEPTUR
 *     (recipes, ingredient lines, statuses, stages, process notices);
 *   - the FINAL 2541 × 62 mapper_basement.csv, used ONLY as a referential
 *     check: every mapped line must name a PI that exists there. Ingredient
 *     identity is the PI, never a name — the workbook's older "Exact Mapper
 *     name" is audited (drift report) and NOT imported;
 *   - the owner image set: five collection folders holding NNN.png recipe
 *     images plus one collection hero each. The NUMBER is the only authority:
 *     NNN.png belongs to recipe #NNN / GEL-NNN. Never a name, OCR or look.
 *
 * Fail-closed: any count, header, total, status, stage, identity or image
 * mismatch aborts the import. Nothing is guessed, dropped or renumbered.
 *
 * Usage:
 *   node scripts/importOfficialRecipeLibrary.mjs \
 *     --workbook=<GELLATTI_RECEPTURY.xlsx> --mapper=<mapper_basement.csv> --images=<dir>
 *   ... --check   re-derive from the sources and compare with the committed
 *                 files (no writes; images are verified by SHA-256, not re-encoded)
 *
 * Writes:
 *   src/data/recipes/official/officialRecipeLibrary.generated.ts
 *   src/data/recipes/official/officialRecipeLibrary.manifest.json
 *   public/recipes/official/GEL-NNN-480.webp, GEL-NNN-960.webp
 *   public/recipes/official/collections/<collection>-960.webp, -1672.webp
 *
 * Image encoding needs `cwebp` (libwebp) on PATH; the version is recorded.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'xlsx';

const XLSX = pkg;
const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DATA_DIR = join(REPO_ROOT, 'src', 'data', 'recipes', 'official');
const GENERATED_PATH = join(DATA_DIR, 'officialRecipeLibrary.generated.ts');
const MANIFEST_PATH = join(DATA_DIR, 'officialRecipeLibrary.manifest.json');
const IMAGE_DIR = join(REPO_ROOT, 'public', 'recipes', 'official');
const HERO_DIR = join(IMAGE_DIR, 'collections');

const LIBRARY_VERSION = 'official-177-v1';
const RECIPE_SHEET = '01_RECEPTURY';
const LINE_SHEET = '03_SKLAD_RECEPTUR';
const HEADER_ROW = 5; // 1-based; data starts on the next row

const RECIPE_HEADER = [
  'Nr',
  'Foto ID',
  'Recipe ID',
  'Receptura',
  'Kolekcja',
  'Podkategoria',
  'Pochodzenie',
  'Kontynent',
  'Typ produktu',
  'Status źródłowy',
  'Suma g',
  'BRAK linie',
  'BRAK składniki',
  'Status audytu globalnego',
  'Linie składników',
  'Zadania robocze',
  'PR-ING wymagany',
  'PR-ING gotowy',
  'Odgazowanie',
  'Komunikat procesowy',
  'Status zdjęcia',
  'Następny krok',
  'Uwagi',
];
const LINE_HEADER = [
  'Nr wiersza',
  'Nr receptury',
  'Recipe ID',
  'Receptura',
  'Kolekcja',
  'Linia',
  'Etap',
  'Składnik',
  'g / 1000g',
  'ID status',
  'PINGÜINO ID',
  'Exact Mapper name',
  'Audyt rynku?',
  'Status globalny składnika',
  'Ostrzeżenie procesowe',
  'Uwagi linii',
];

/** Collection order, source names, image folders and hero files (owner assets). */
const COLLECTIONS = [
  { id: 'classics', source: 'Classics', folder: 'Classics', hero: 'Classics.png' },
  { id: 'icons', source: 'Icons', folder: 'Icons', hero: 'Icons.png' },
  {
    id: 'cocktails_spirits',
    source: 'Cocktails & Spirits',
    folder: 'Cocktails & Spirits',
    hero: 'Cocktails_Spirits.png',
  },
  {
    id: 'lost_legendary',
    source: 'Lost & Legendary',
    folder: 'Lost & Legendary',
    hero: 'Lost_Legendary.png',
  },
  {
    id: 'technical_bases',
    source: 'Technical Bases',
    folder: 'Technical Bases',
    hero: 'Technical_Bases.png',
  },
];

/** Owner-verified audit. A different source must change these deliberately. */
const EXPECTED = {
  recipes: 177,
  lines: 1510,
  sourceTotalGrams: 1000,
  mappedLines: 1458,
  brakLines: 52,
  recipesWithBrak: 41,
  dynamicMainLines: 3,
  uniquePi: 113,
  collections: {
    classics: [1, 77],
    icons: [78, 102],
    cocktails_spirits: [103, 150],
    lost_legendary: [151, 165],
    technical_bases: [166, 177],
  },
};

const STATUSES = new Set([
  'NEW_TO_ENGINE',
  'ENGINE_BASE_VALID_BLOCKED',
  'CORRECTION_TO_ENGINE',
  'VERIFIED_EXISTING',
  'SCAFFOLD_RECALC_BY_MAIN',
]);
const STAGES = new Set([
  'MIX',
  'LATE ADD',
  'SWIRL',
  'CHOCOLATE THIRD',
  'VANILLA THIRD',
  'STRAWBERRY THIRD',
]);
const PRODUCT_TYPES = new Set([
  'Standard Gelato',
  'Chocolate Gelato',
  'Sorbet',
  'Vegan Gelato',
  'Cocktail Sorbet',
  'Spirit Gelato',
  'Heritage Gelato / Sorbet',
  'Technical Base',
]);
const DYNAMIC_MAIN_LABEL = 'Wybrany owoc / Main';
const PUBLIC_LABEL_ONLY_NOTE = 'Public display is generic; exact Mapper product remains internal.';
const LOCAL_RAW_MATERIAL = 'NIE — SUROWIEC LOKALNY';
const PI_PATTERN = /^PI-ING-\d{6}$/;
const IMAGE_SIZES = [480, 960];
const HERO_SIZES = [960, 1672];
const WEBP_QUALITY = 80;

const fail = (message) => {
  throw new Error(`[official-recipe-library] ${message}`);
};
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const pad3 = (value) => String(value).padStart(3, '0');
const text = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};
const placeholderToNull = (value) => (text(value) === '—' ? null : text(value));

function parseArgs(argv) {
  const args = new Map();
  for (const entry of argv) {
    const [key, ...rest] = entry.split('=');
    args.set(key, rest.length ? rest.join('=') : true);
  }
  const need = (key) => {
    const value = args.get(key);
    if (typeof value !== 'string' || value === '') fail(`missing ${key}=<path>`);
    return resolve(value);
  };
  return {
    workbook: need('--workbook'),
    mapper: need('--mapper'),
    images: need('--images'),
    check: args.has('--check'),
  };
}

/** Minimal RFC-4180 parser (quotes, commas and newlines inside quotes). */
function parseCsv(input) {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
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

function sheetRows(workbook, name, expectedHeader) {
  const sheet = workbook.Sheets[name];
  if (!sheet) fail(`sheet ${name} is missing`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const header = rows[HEADER_ROW - 1] ?? [];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    fail(`sheet ${name} header changed: ${JSON.stringify(header)}`);
  }
  return rows
    .map((cells, index) => ({ sheetRow: index + 1, cells }))
    .slice(HEADER_ROW)
    .filter(({ cells }) => cells.some((value) => text(value) !== null))
    .map(({ sheetRow, cells }) => ({
      sheetRow,
      record: Object.fromEntries(expectedHeader.map((column, index) => [column, cells[index]])),
    }));
}

function readRecipes(workbookPath) {
  const workbook = XLSX.read(readFileSync(workbookPath), { type: 'buffer' });
  const recipeRows = sheetRows(workbook, RECIPE_SHEET, RECIPE_HEADER);
  const lineRows = sheetRows(workbook, LINE_SHEET, LINE_HEADER);
  if (recipeRows.length !== EXPECTED.recipes) {
    fail(`expected ${EXPECTED.recipes} recipes, found ${recipeRows.length}`);
  }
  if (lineRows.length !== EXPECTED.lines) {
    fail(`expected ${EXPECTED.lines} ingredient lines, found ${lineRows.length}`);
  }

  const collectionBySource = new Map(COLLECTIONS.map((entry) => [entry.source, entry]));
  const linesByRecipe = new Map();
  lineRows.forEach(({ record }, index) => {
    if (record['Nr wiersza'] !== index + 1) fail(`line row ${index + 1} is out of order`);
    const list = linesByRecipe.get(record['Nr receptury']) ?? [];
    list.push(record);
    linesByRecipe.set(record['Nr receptury'], list);
  });

  const recipeIds = new Set();
  const recipes = recipeRows.map(({ sheetRow, record }, index) => {
    const number = record.Nr;
    if (number !== index + 1) fail(`recipe numbering broken at sheet row ${sheetRow}`);
    const photoId = text(record['Foto ID']);
    if (photoId !== `GEL-${pad3(number)}`) fail(`recipe ${number} has Foto ID ${photoId}`);
    const recipeId = text(record['Recipe ID']);
    if (!recipeId || recipeIds.has(recipeId)) fail(`recipe ${number} id is missing or duplicate`);
    recipeIds.add(recipeId);
    const collection = collectionBySource.get(text(record.Kolekcja));
    if (!collection) fail(`recipe ${number} has unknown collection ${record.Kolekcja}`);
    const [first, last] = EXPECTED.collections[collection.id];
    if (number < first || number > last) fail(`recipe ${number} is outside ${collection.id}`);
    const productType = text(record['Typ produktu']);
    if (!PRODUCT_TYPES.has(productType)) fail(`recipe ${number} product type ${productType}`);
    const sourceStatus = text(record['Status źródłowy']);
    if (!STATUSES.has(sourceStatus)) fail(`recipe ${number} status ${sourceStatus}`);
    const degassing = text(record.Odgazowanie);
    if (degassing !== 'TAK' && degassing !== 'NIE') fail(`recipe ${number} degassing ${degassing}`);

    const sourceLines = linesByRecipe.get(number) ?? [];
    if (sourceLines.length !== record['Linie składników']) {
      fail(
        `recipe ${number} declares ${record['Linie składników']} lines, has ${sourceLines.length}`,
      );
    }
    const lines = sourceLines.map((line, lineIndex) => {
      if (line.Linia !== lineIndex + 1) fail(`recipe ${number} line order broken`);
      if (text(line['Recipe ID']) !== recipeId || text(line.Receptura) !== text(record.Receptura)) {
        fail(`line ${line['Nr wiersza']} does not belong to recipe ${number}`);
      }
      if (text(line.Kolekcja) !== collection.source) fail(`line ${line['Nr wiersza']} collection`);
      const stage = text(line.Etap);
      if (!STAGES.has(stage)) fail(`line ${line['Nr wiersza']} stage ${stage}`);
      const label = text(line['Składnik']);
      if (!label) fail(`line ${line['Nr wiersza']} has no ingredient label`);
      const grams = line['g / 1000g'];
      if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
        fail(`line ${line['Nr wiersza']} grams ${grams}`);
      }
      const idStatus = text(line['ID status']);
      const pi = text(line['PINGÜINO ID']);
      let identity;
      if (idStatus === 'OK') {
        if (!PI_PATTERN.test(pi ?? '')) fail(`line ${line['Nr wiersza']} has OK without a PI`);
        identity = { kind: 'mapped', mapperIngredientId: pi };
      } else if (idStatus === 'BRAK') {
        if (pi !== null && pi !== 'BRAK') fail(`line ${line['Nr wiersza']} is BRAK with PI ${pi}`);
        identity =
          sourceStatus === 'SCAFFOLD_RECALC_BY_MAIN' && label === DYNAMIC_MAIN_LABEL
            ? { kind: 'dynamic_main', sourceIdStatus: 'BRAK' }
            : { kind: 'unresolved', sourceIdStatus: 'BRAK' };
      } else {
        fail(`line ${line['Nr wiersza']} ID status ${idStatus}`);
      }
      const audit = text(line['Audyt rynku?']);
      if (audit !== 'TAK' && audit !== LOCAL_RAW_MATERIAL) {
        fail(`line ${line['Nr wiersza']} market audit ${audit}`);
      }
      const note = text(line['Uwagi linii']);
      return {
        line: line.Linia,
        sourceRow: line['Nr wiersza'],
        label,
        stage,
        grams,
        identity,
        marketAudit: audit === 'TAK' ? 'required' : 'local_raw_material',
        processWarning: text(line['Ostrzeżenie procesowe']),
        publicLabelOnly: note === PUBLIC_LABEL_ONLY_NOTE,
        note,
        // Audit-only; stripped before the runtime module is written.
        historicalMapperName: text(line['Exact Mapper name']),
      };
    });
    const total = lines.reduce((sum, line) => sum + line.grams, 0);
    if (Math.abs(total - EXPECTED.sourceTotalGrams) > 1e-9 || record['Suma g'] !== total) {
      fail(`recipe ${number} totals ${total} g (declared ${record['Suma g']} g)`);
    }
    const brakCount = lines.filter((line) => line.identity.kind !== 'mapped').length;
    if (brakCount !== (record['BRAK linie'] ?? 0)) {
      fail(`recipe ${number} declares ${record['BRAK linie']} BRAK lines, has ${brakCount}`);
    }
    return {
      recipeId,
      number,
      photoId,
      name: text(record.Receptura),
      collection: collection.id,
      subcategory: text(record.Podkategoria),
      origin: placeholderToNull(record.Pochodzenie),
      continent: placeholderToNull(record.Kontynent),
      productType,
      sourceStatus,
      sourceTotalGrams: total,
      degassingRequired: degassing === 'TAK',
      processNotice: text(record['Komunikat procesowy']),
      sourceRow: sheetRow,
      lines,
    };
  });

  for (const collection of COLLECTIONS) {
    const [first, last] = EXPECTED.collections[collection.id];
    const numbers = recipes.filter((r) => r.collection === collection.id).map((r) => r.number);
    const expectedNumbers = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) {
      fail(`collection ${collection.id} numbers are not ${first}…${last}`);
    }
  }
  return recipes;
}

function auditIdentity(recipes, mapperPath) {
  const grid = parseCsv(readFileSync(mapperPath, 'utf8'));
  const header = grid[0];
  const idIndex = header.indexOf('ingredient_id');
  const displayIndex = header.indexOf('ingredient_name_display');
  if (idIndex < 0 || displayIndex < 0) fail('mapper CSV lacks ingredient_id/display columns');
  const rows = grid.slice(1).filter((cells) => cells.length === header.length);
  const displayById = new Map(rows.map((cells) => [cells[idIndex], cells[displayIndex]]));
  if (displayById.size !== rows.length) fail('mapper CSV has duplicate ingredient ids');

  const lines = recipes.flatMap((recipe) => recipe.lines);
  const mapped = lines.filter((line) => line.identity.kind === 'mapped');
  const brak = lines.filter((line) => line.identity.kind !== 'mapped');
  const dynamicMain = lines.filter((line) => line.identity.kind === 'dynamic_main');
  const recipesWithBrak = recipes.filter((r) => r.lines.some((l) => l.identity.kind !== 'mapped'));
  const referenced = [...new Set(mapped.map((line) => line.identity.mapperIngredientId))].sort();
  const missing = referenced.filter((pi) => !displayById.has(pi));

  const check = (label, actual, expected) => {
    if (actual !== expected) fail(`${label}: expected ${expected}, found ${actual}`);
  };
  check('mapped lines', mapped.length, EXPECTED.mappedLines);
  check('BRAK lines', brak.length, EXPECTED.brakLines);
  check('recipes with BRAK', recipesWithBrak.length, EXPECTED.recipesWithBrak);
  check('dynamic Main lines', dynamicMain.length, EXPECTED.dynamicMainLines);
  check('unique referenced PI', referenced.length, EXPECTED.uniquePi);
  check('referenced PI missing from the Mapper', missing.length, 0);

  const drift = new Map();
  for (const line of mapped) {
    const pi = line.identity.mapperIngredientId;
    const current = displayById.get(pi);
    if (line.historicalMapperName === current) continue;
    const entry = drift.get(pi) ?? {
      pi,
      historicalNames: new Set(),
      currentName: current,
      lines: 0,
    };
    entry.historicalNames.add(line.historicalMapperName);
    entry.lines += 1;
    drift.set(pi, entry);
  }
  return {
    mapper: {
      file: basename(mapperPath),
      sha256: sha256(readFileSync(mapperPath)),
      rows: rows.length,
      columns: header.length,
    },
    counts: {
      recipes: recipes.length,
      lines: lines.length,
      mappedLines: mapped.length,
      brakLines: brak.length,
      unresolvedLines: brak.length - dynamicMain.length,
      dynamicMainLines: dynamicMain.length,
      recipesWithBrak: recipesWithBrak.length,
      uniqueReferencedPi: referenced.length,
      referencedPiMissingFromMapper: missing.length,
      collections: Object.fromEntries(
        COLLECTIONS.map((c) => [c.id, recipes.filter((r) => r.collection === c.id).length]),
      ),
    },
    referencedPi: referenced,
    nameDrift: {
      lines: [...drift.values()].reduce((sum, entry) => sum + entry.lines, 0),
      pi: drift.size,
      entries: [...drift.values()]
        .sort((a, b) => a.pi.localeCompare(b.pi))
        .map((entry) => ({
          pi: entry.pi,
          historicalNames: [...entry.historicalNames].sort(),
          currentName: entry.currentName,
          lines: entry.lines,
        })),
    },
  };
}

function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) fail('image is not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function planImages(recipes, imagesDir) {
  const byNumber = new Map(recipes.map((recipe) => [recipe.number, recipe]));
  const seen = new Map();
  const heroes = [];
  for (const collection of COLLECTIONS) {
    const folder = join(imagesDir, collection.folder);
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(`missing folder ${folder}`);
    const files = readdirSync(folder).filter((name) => !name.startsWith('.'));
    for (const name of files) {
      if (name === collection.hero) continue;
      const match = /^(\d{3})\.png$/.exec(name);
      if (!match) fail(`unexpected file ${collection.folder}/${name}`);
      const number = Number(match[1]);
      const recipe = byNumber.get(number);
      if (!recipe) fail(`image ${collection.folder}/${name} has no recipe #${match[1]}`);
      if (recipe.collection !== collection.id) {
        fail(`image ${collection.folder}/${name} sits outside recipe #${match[1]}'s collection`);
      }
      if (seen.has(number)) fail(`image number ${match[1]} is duplicated`);
      seen.set(number, `${collection.folder}/${name}`);
    }
    if (!files.includes(collection.hero))
      fail(`missing hero ${collection.folder}/${collection.hero}`);
    heroes.push({ collection: collection.id, source: `${collection.folder}/${collection.hero}` });
  }
  const missing = recipes.filter((recipe) => !seen.has(recipe.number)).map((r) => r.photoId);
  if (missing.length > 0) fail(`MISSING recipe images: ${missing.join(', ')}`);
  if (seen.size !== EXPECTED.recipes)
    fail(`expected ${EXPECTED.recipes} images, found ${seen.size}`);

  const images = recipes.map((recipe) => {
    const source = seen.get(recipe.number);
    const buffer = readFileSync(join(imagesDir, source));
    return {
      number: recipe.number,
      photoId: recipe.photoId,
      recipeId: recipe.recipeId,
      collection: recipe.collection,
      source: { file: source, sha256: sha256(buffer), ...pngSize(buffer) },
      outputs: IMAGE_SIZES.map((width) => ({
        width,
        path: `public/recipes/official/${recipe.photoId}-${width}.webp`,
      })),
    };
  });
  const heroPlans = heroes.map((hero) => {
    const buffer = readFileSync(join(imagesDir, hero.source));
    return {
      collection: hero.collection,
      source: { file: hero.source, sha256: sha256(buffer), ...pngSize(buffer) },
      outputs: HERO_SIZES.map((width) => ({
        width,
        path: `public/recipes/official/collections/${hero.collection}-${width}.webp`,
      })),
    };
  });
  return { images, heroes: heroPlans };
}

function encodeWebp(sourcePath, outputPath, width, sourceWidth) {
  const args = ['-quiet', '-q', String(WEBP_QUALITY), '-m', '6', '-metadata', 'none'];
  if (width < sourceWidth) args.push('-resize', String(width), '0');
  execFileSync('cwebp', [...args, sourcePath, '-o', outputPath], { stdio: 'inherit' });
}

function realizeOutputs(plan, imagesDir, { write }) {
  const all = [...plan.images, ...plan.heroes];
  for (const entry of all) {
    for (const output of entry.outputs) {
      const absolute = join(REPO_ROOT, output.path);
      if (write)
        encodeWebp(join(imagesDir, entry.source.file), absolute, output.width, entry.source.width);
      if (!existsSync(absolute)) fail(`output ${output.path} is missing`);
      const buffer = readFileSync(absolute);
      output.sha256 = sha256(buffer);
      output.bytes = buffer.length;
    }
  }
}

function runtimeRecipes(recipes) {
  return recipes.map((recipe) => ({
    ...recipe,
    lines: recipe.lines.map((line) => {
      const runtimeLine = { ...line };
      delete runtimeLine.historicalMapperName;
      return runtimeLine;
    }),
  }));
}

function generatedModule(recipes, source) {
  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Official Gellatti Recipe Library: ${recipes.length} canonical recipes.
 * Regenerate / verify with scripts/importOfficialRecipeLibrary.mjs.
 *
 * Source workbook : ${source.workbook.file}
 * Source sheets   : ${RECIPE_SHEET} + ${LINE_SHEET}
 * Source SHA-256  : ${source.workbook.sha256}
 * Library version : ${LIBRARY_VERSION}
 *
 * Ingredient identity is the canonical Mapper PI only. The workbook's older
 * "Exact Mapper name" is not carried; current names come from the Mapper
 * runtime by PI. BRAK lines keep their label and grams with no PI.
 */
import type { OfficialRecipe } from './officialRecipeTypes';

export const OFFICIAL_RECIPE_LIBRARY_VERSION = '${LIBRARY_VERSION}';
export const OFFICIAL_RECIPE_SOURCE_WORKBOOK = '${source.workbook.file}';
export const OFFICIAL_RECIPE_SOURCE_SHA256 = '${source.workbook.sha256}';

export const OFFICIAL_RECIPE_SOURCE: readonly OfficialRecipe[] = ${JSON.stringify(
    runtimeRecipes(recipes),
    null,
    2,
  )};
`;
}

function manifestFor(recipes, identity, plan, workbookPath, imagesDir, cwebpVersion) {
  return {
    libraryVersion: LIBRARY_VERSION,
    source: {
      workbook: {
        file: basename(workbookPath),
        sha256: sha256(readFileSync(workbookPath)),
        sheets: [RECIPE_SHEET, LINE_SHEET],
      },
      mapper: identity.mapper,
      images: {
        folder: basename(imagesDir),
        rule: 'NNN.png -> recipe #NNN / GEL-NNN (number is the only authority)',
      },
    },
    counts: {
      ...identity.counts,
      images: plan.images.length,
      imagesMissing: 0,
      collectionHeroes: plan.heroes.length,
    },
    referencedPi: identity.referencedPi,
    nameDrift: identity.nameDrift,
    encoder: { tool: 'cwebp', version: cwebpVersion, quality: WEBP_QUALITY, method: 6 },
    images: plan.images,
    heroes: plan.heroes,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const recipes = readRecipes(options.workbook);
  const identity = auditIdentity(recipes, options.mapper);
  const plan = planImages(recipes, options.images);
  const cwebpVersion = execFileSync('cwebp', ['-version'], { encoding: 'utf8' })
    .split('\n')[0]
    .trim();

  if (!options.check) {
    mkdirSync(IMAGE_DIR, { recursive: true });
    mkdirSync(HERO_DIR, { recursive: true });
  }
  realizeOutputs(plan, options.images, { write: !options.check });
  const workbookSource = {
    workbook: { file: basename(options.workbook), sha256: sha256(readFileSync(options.workbook)) },
  };
  const moduleText = generatedModule(recipes, workbookSource);
  const manifest = manifestFor(
    recipes,
    identity,
    plan,
    options.workbook,
    options.images,
    cwebpVersion,
  );
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.check) {
    const committedModule = readFileSync(GENERATED_PATH, 'utf8');
    const committedManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (committedModule !== moduleText) fail('generated module differs from the sources');
    const comparable = (value) => JSON.stringify({ ...value, encoder: undefined });
    if (comparable(committedManifest) !== comparable(manifest)) {
      fail('manifest differs from the sources or committed images');
    }
    console.log('official recipe library: CHECK PASS');
  } else {
    writeFileSync(GENERATED_PATH, moduleText);
    writeFileSync(MANIFEST_PATH, manifestText);
    console.log('official recipe library: WROTE generated module, manifest and images');
  }
  console.log(JSON.stringify(manifest.counts, null, 2));
  console.log(`name drift: ${manifest.nameDrift.lines} lines / ${manifest.nameDrift.pi} PI`);
}

main();
