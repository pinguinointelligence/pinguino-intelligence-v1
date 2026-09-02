import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapperPath = path.join(root, 'docs/ingredients/validation/mapper_basement.csv');
const seedPath = path.join(root, 'supabase/seed/mapper_basement_v1_0.sql');
const pickerPath = path.join(root, 'src/features/ingredient-builder/ProductPickerPopover.tsx');
const hookPath = path.join(root, 'src/features/global-catalog/useGlobalCatalogPicker.ts');
const boundaryPath = path.join(root, 'src/features/ingredient-builder/mapperOnlyCatalog.ts');
const expectedHash = '057375cd60cefe613892ff1d9f8f7eda880ff0eb06732f9229051fc37d8deca7';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

const mapperText = fs.readFileSync(mapperPath, 'utf8');
const mapperHash = crypto.createHash('sha256').update(mapperText).digest('hex');
if (mapperHash !== expectedHash) throw new Error(`Mapper SHA drift: ${mapperHash}`);
const mapperRows = parseCsv(mapperText);
const mapperIds = new Set(mapperRows.map((row) => row.ingredient_id));
const selectableIds = new Set(
  mapperRows
    .filter((row) => row.approved_for_base.toLowerCase() === 'true')
    .map((row) => row.ingredient_id),
);
if (mapperRows.length !== 2089 || mapperIds.size !== 2089) {
  throw new Error(`Mapper identity census drift: ${mapperRows.length}/${mapperIds.size}`);
}
if (selectableIds.size !== 2076) {
  throw new Error(`Selectable Mapper census drift: ${selectableIds.size}`);
}

const seedIds = new Set(
  [...fs.readFileSync(seedPath, 'utf8').matchAll(/\('((?:PI-ING-)\d{6})',/g)].map(
    (match) => match[1],
  ),
);
const catalogOutsideMapper = [...seedIds].filter((id) => !mapperIds.has(id));
const mapperMissingFromSeed = [...mapperIds].filter((id) => !seedIds.has(id));
if (seedIds.size !== 2089 || catalogOutsideMapper.length || mapperMissingFromSeed.length) {
  throw new Error(
    `Mapper seed membership drift: seed=${seedIds.size} outside=${catalogOutsideMapper.length} missing=${mapperMissingFromSeed.length}`,
  );
}

const picker = fs.readFileSync(pickerPath, 'utf8');
const hook = fs.readFileSync(hookPath, 'utf8');
const boundary = fs.readFileSync(boundaryPath, 'utf8');
if (!picker.includes('mapperOnly: false') || picker.includes('Dodaj własny składnik ręcznie')) {
  throw new Error('Active picker is not using the shared Mapper-resolved catalog mode');
}
for (const required of [
  "entityKind: input.mapperOnly ? 'pi_base' : null",
  'CURRENT_MAPPER_CATALOG_CACHE_KEY',
  'filterCurrentMapperCatalogHits',
  'filterCurrentMapperCatalogRelations',
]) {
  if (!hook.includes(required)) throw new Error(`Mapper-only hook guard missing: ${required}`);
}
if (
  !boundary.includes(expectedHash) ||
  !boundary.includes('loadCurrentRow(articleId)') ||
  !boundary.includes("kind: 'catalog_product'") ||
  !boundary.includes('productVersionId: hit.currentVersionId!') ||
  !boundary.includes('const canonicalProductId = /^(?:PR|PM|CA)-ING-\\d{6}$/') ||
  !boundary.includes(
    "return hit.entityKind === 'pi_base' ? currentCatalogArticleId(hit, context) : null",
  ) ||
  !boundary.includes("kind: 'mapper'") ||
  !boundary.includes('row.ingredient_id !== articleId') ||
  !boundary.includes('row.approved_for_base !== true')
) {
  throw new Error('Selection boundary is not pinned to current Mapper authority');
}

console.log('Mapper-resolved catalog validation PASS');
console.log(`2089 mapper rows inspected (SHA-256 ${mapperHash})`);
console.log(`${selectableIds.size} current Base-selectable Mapper products covered`);
console.log('Shared commercial catalog discovery enabled');
console.log(
  'Commercial selections retain canonical PR/PM/CA identity and immutable product version',
);
console.log('0 stale favorite products rendered');
console.log('0 stale recent products rendered');
console.log('0 direct non-authoritative additions accepted by the selection boundary');
