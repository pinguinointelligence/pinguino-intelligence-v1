#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SNAPSHOT = resolve(
  ROOT,
  'supabase/.temp/mapper-search-final-2541-rollback-20260911',
);
const SOURCE = resolve(ROOT, 'docs/ingredients/validation/mapper_basement.csv');
const OUTPUT = resolve(
  ROOT,
  'supabase/rollbacks/20260911120000_mapper_search_final_2541_sync.rollback.sql',
);
const EXPECTED_SOURCE_SHA =
  'a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6';
const RELEASE_CLASSIFIER = 'mapper-final-2541-2026-09-11-v1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(JSON.stringify(value))}::jsonb`;

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (row.length || field) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadSnapshot(fileName) {
  const path = resolve(SNAPSHOT, fileName);
  const source = readFileSync(path);
  return { path, source, document: JSON.parse(source) };
}

const manifestFile = loadSnapshot('manifest.json');
const manifest = manifestFile.document;
if (manifest.schemaVersion !== 1 || manifest.readOnly !== true) {
  throw new Error('Rollback snapshot manifest is not the expected read-only v1 contract');
}
for (const entry of manifest.files) {
  const file = loadSnapshot(entry.file);
  if (file.document.rows.length !== entry.rows) {
    throw new Error(`${entry.file}: row count differs from snapshot manifest`);
  }
  if (sha256(file.source) !== entry.sha256) {
    throw new Error(`${entry.file}: SHA-256 differs from snapshot manifest`);
  }
}

const mapperDocument = loadSnapshot('mapper_basement.json').document;
const productsDocument = loadSnapshot('mapper_reference_products.json').document;
const mapperBindingsDocument = loadSnapshot('mapper_behavior_bindings.json').document;
const productBindingsDocument = loadSnapshot(
  'canonical_mapper_behavior_bindings.json',
).document;
const constraintsDocument = loadSnapshot('mapper_constraints.json').document;
const runtimeFunctionsDocument = loadSnapshot('runtime_functions.json').document;
const closureDocument = loadSnapshot('closure_census.json').document;

const mapperRows = mapperDocument.rows.map((row) => row.payload);
const productRows = productsDocument.rows.map((row) => row.payload);
const currentMapperBindings = mapperBindingsDocument.rows
  .map((row) => row.payload)
  .filter((row) => row.is_current === true);
const currentProductBindings = productBindingsDocument.rows
  .map((row) => row.payload)
  .filter((row) => row.is_current === true);
const closure = closureDocument.rows[0]?.payload;

if (
  mapperBindingsDocument.rows.some(
    (row) => row.payload.classifier_version === RELEASE_CLASSIFIER,
  ) ||
  productBindingsDocument.rows.some(
    (row) => row.payload.classifier_version === RELEASE_CLASSIFIER,
  )
) {
  throw new Error('Release-specific bindings unexpectedly existed in the rollback preimage');
}

if (
  mapperRows.length !== 2147 ||
  productRows.length !== 2089 ||
  currentMapperBindings.length !== 2089 ||
  currentProductBindings.length !== 2089 ||
  closure?.active_mapper !== 2147 ||
  closure?.process_metadata !== 2089
) {
  throw new Error('Rollback snapshot census differs from the supervised staging prestate');
}

const csvSource = readFileSync(SOURCE, 'utf8');
if (sha256(csvSource) !== EXPECTED_SOURCE_SHA) {
  throw new Error('Certified FINAL Mapper source SHA-256 mismatch');
}
const csv = parseCsv(csvSource);
const mapperHeaders = csv[0];
const finalIds = csv
  .slice(1)
  .filter((row) => row.some(Boolean))
  .map((row) => row[0]);
if (mapperHeaders.length !== 62 || finalIds.length !== 2541) {
  throw new Error('Certified FINAL Mapper source must be exactly 2541x62');
}

const priorMapperIds = new Set(mapperRows.map((row) => row.ingredient_id));
// PI-ING-002114 was captured with its historical PR article-code defect, but
// its canonical Mapper root identity already existed. Root membership is
// therefore keyed by normalized_identity, never by the mutable article code.
const priorProductIds = new Set(
  productRows.map((row) => row.normalized_identity.replace(/^mapper:/, '')),
);
const insertedMapperIds = finalIds.filter((id) => !priorMapperIds.has(id));
const insertedProductCodes = finalIds.filter((id) => !priorProductIds.has(id));
if (insertedMapperIds.length !== 394 || insertedProductCodes.length !== 452) {
  throw new Error('Rollback insert delta differs from 394 Mapper rows / 452 roots');
}

const productFields = [
  'brand',
  'supplier',
  'ean_code',
  'barcode',
  'product_name_internal',
  'product_name_display',
  'product_category',
  'product_subcategory',
  'country',
  'status',
  'source_type',
  'dataset_version',
  'is_active',
  'canonical_verification_status',
  'canonical_verification_method',
  'canonical_provenance',
  'explicitly_unbranded',
  'normalized_identity',
  'search_document',
  'product_code',
  'merged_into_product_id',
  'current_version_id',
  'current_behavior_binding_id',
];
const reducedProductRows = productRows.map((row) =>
  Object.fromEntries(['id', ...productFields].map((field) => [field, row[field]])),
);

for (const row of currentProductBindings) {
  const root = productRows.find((product) => product.id === row.product_id);
  if (!root || root.current_behavior_binding_id !== row.id) {
    throw new Error(`Current canonical binding is not the captured root pointer: ${row.id}`);
  }
}

const mapperValues = mapperRows.map((row) => `(${jsonLiteral(row)})`).join(',\n');
const productValues = reducedProductRows
  .map((row) => `(${jsonLiteral(row)})`)
  .join(',\n');
const insertedMapperValues = insertedMapperIds.map((id) => `(${sqlLiteral(id)})`).join(',');
const insertedProductValues = insertedProductCodes
  .map((id) => `(${sqlLiteral(id)})`)
  .join(',');
const mapperBindingValues = currentMapperBindings
  .map((row) => `(${sqlLiteral(row.mapper_ingredient_id)},${sqlLiteral(row.id)}::uuid)`)
  .join(',\n');
const productBindingValues = currentProductBindings
  .map(
    (row) =>
      `(${sqlLiteral(row.product_id)}::uuid,${sqlLiteral(row.product_version_id)}::uuid,${sqlLiteral(row.id)}::uuid)`,
  )
  .join(',\n');

const verificationConstraint = constraintsDocument.rows.find(
  (row) => row.name === 'mapper_basement_verification_status_check',
);
const storageConstraint = constraintsDocument.rows.find(
  (row) => row.name === 'mapper_basement_storage_type_check',
);
if (!verificationConstraint || !storageConstraint) {
  throw new Error('Snapshot lacks the two Mapper constraints changed by the migration');
}

const searchFunction = runtimeFunctionsDocument.rows.find((row) =>
  row.signature.startsWith('search_products_v1('),
);
if (!searchFunction) throw new Error('Snapshot lacks search_products_v1');
const searchFunctionDefinition = searchFunction.definition
  .trim()
  .replace(/[ \t]+$/gm, '');

const mapperAssignments = [
  ...mapperHeaders.slice(1).map((field) => `${field}=restored.${field}`),
  'dataset_version=restored.dataset_version',
  'is_active=restored.is_active',
].join(',\n  ');
const productAssignments = productFields
  .map((field) => `${field}=restored.${field}`)
  .join(',\n  ');

const sql = `-- Deterministic supervised rollback for 20260911120000 Mapper FINAL 2541 sync.
-- Preimage: ${basename(SNAPSHOT)} (read-only capture ${manifest.capturedAt}).
-- Snapshot manifest SHA-256: ${sha256(manifestFile.source)}
-- Immutable public.product_versions are intentionally retained as audit history.
-- No process metadata, recipe, Engine, vector or commercial-product fact is changed.
begin;
set local role postgres;
set local statement_timeout='0';
set constraints all deferred;
select pg_advisory_xact_lock(hashtextextended('mapper-search-final-2541-2026-09-11',0));
select set_config('app.canonical_product_ingest','v1',true);

do $preflight$
begin
  if (select count(*) from public.mapper_basement where is_active)<>2541
    or (select count(distinct ingredient_id) from public.mapper_basement where is_active)<>2541 then
    raise exception 'Rollback refused: Mapper is not at the expected 2541/2541 post-sync census';
  end if;
  if (select count(*) from public.mapper_process_metadata)<>2089 then
    raise exception 'Rollback refused: process metadata changed outside this workstream';
  end if;
  if (select count(*) from public.mapper_product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)})<>2541
    or (select count(*) from public.mapper_product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)} and is_current)<>2541 then
    raise exception 'Rollback refused: release Mapper binding/current census drifted';
  end if;
  if (select count(*) from public.product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)})<>2541
    or (select count(*) from public.product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)} and is_current)<>2541 then
    raise exception 'Rollback refused: release canonical binding/current census drifted';
  end if;
end
$preflight$;

create temp table mapper_rollback_preimage(payload jsonb not null) on commit drop;
insert into mapper_rollback_preimage(payload) values
${mapperValues};

create temp table mapper_root_rollback_preimage(payload jsonb not null) on commit drop;
insert into mapper_root_rollback_preimage(payload) values
${productValues};

create temp table mapper_rollback_inserted_ids(ingredient_id text primary key) on commit drop;
insert into mapper_rollback_inserted_ids values ${insertedMapperValues};

create temp table mapper_root_rollback_inserted_codes(product_code text primary key) on commit drop;
insert into mapper_root_rollback_inserted_codes values ${insertedProductValues};

create temp table mapper_current_binding_preimage(
  ingredient_id text primary key,
  binding_id uuid not null unique
) on commit drop;
insert into mapper_current_binding_preimage values
${mapperBindingValues};

create temp table mapper_root_current_binding_preimage(
  product_id uuid primary key,
  product_version_id uuid not null,
  binding_id uuid not null unique
) on commit drop;
insert into mapper_root_current_binding_preimage values
${productBindingValues};

do $embedded_preimage$
begin
  if (select count(*) from mapper_rollback_preimage)<>2147
    or (select count(*) from mapper_root_rollback_preimage)<>2089
    or (select count(*) from mapper_rollback_inserted_ids)<>394
    or (select count(*) from mapper_root_rollback_inserted_codes)<>452
    or (select count(*) from mapper_current_binding_preimage)<>2089
    or (select count(*) from mapper_root_current_binding_preimage)<>2089 then
    raise exception 'Embedded rollback preimage census is incomplete';
  end if;
end
$embedded_preimage$;

-- Free the partial unique indexes before restoring the captured current rows.
update public.product_behavior_bindings
set is_current=false
where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)} and is_current;
update public.mapper_product_behavior_bindings
set is_current=false
where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)} and is_current;

-- Restore every field on pre-existing roots that the forward migration changed,
-- including both current pointers. Generated normalized columns remain DB-owned.
with restored as (
  select (jsonb_populate_record(null::public.products,payload)).*
  from mapper_root_rollback_preimage
)
update public.products product
set ${productAssignments}
from restored
where product.id=restored.id;

-- New roots own immutable versions and therefore cannot be physically removed.
-- They are made unreachable while the append-only product_versions remain intact.
update public.products product
set is_active=false,current_behavior_binding_id=null,updated_at=now()
from mapper_root_rollback_inserted_codes inserted
where product.product_code=inserted.product_code
  and product.product_kind='mapper_reference';

update public.product_behavior_bindings binding
set is_current=true
from mapper_root_current_binding_preimage prior
where binding.id=prior.binding_id
  and binding.product_id=prior.product_id
  and binding.product_version_id=prior.product_version_id;

update public.mapper_product_behavior_bindings binding
set is_current=true
from mapper_current_binding_preimage prior
where binding.id=prior.binding_id
  and binding.mapper_ingredient_id=prior.ingredient_id;

-- Delete only bindings minted by the release classifier. A foreign reference
-- fails the whole transaction rather than broadening the deletion boundary.
delete from public.product_behavior_bindings
where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)};
delete from public.mapper_product_behavior_bindings
where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)};

-- Restore the exact captured Mapper facts. Lifecycle timestamps legitimately
-- advance through the existing touch trigger and are excluded from equality QA.
with restored as (
  select (jsonb_populate_record(null::public.mapper_basement,payload)).*
  from mapper_rollback_preimage
)
update public.mapper_basement mapper
set ${mapperAssignments}
from restored
where mapper.ingredient_id=restored.ingredient_id;

-- These rows did not exist in the captured Mapper prestate. Their immutable
-- Product-version evidence remains preserved on the now-inactive roots.
delete from public.mapper_basement mapper
using mapper_rollback_inserted_ids inserted
where mapper.ingredient_id=inserted.ingredient_id;

alter table public.mapper_basement
  drop constraint if exists mapper_basement_verification_status_check;
alter table public.mapper_basement
  drop constraint if exists mapper_basement_storage_type_check;
alter table public.mapper_basement
  add constraint mapper_basement_verification_status_check ${verificationConstraint.definition};
alter table public.mapper_basement
  add constraint mapper_basement_storage_type_check ${storageConstraint.definition};

-- Restore the exact pre-sync central search definition captured from staging.
${searchFunctionDefinition};

-- Remove only queue entries produced by this rollback transaction. Historical
-- queue rows from the snapshot are not rewritten or deleted.
delete from public.product_behavior_reclassification_queue queue
where queue.queued_at>=transaction_timestamp()
  and queue.entity_id in (
    select product_version_id::text from mapper_root_current_binding_preimage
    union
    select ingredient_id from mapper_current_binding_preimage
    union
    select preimage.payload->>'ingredient_id' from mapper_rollback_preimage preimage
    union
    select ingredient_id from mapper_rollback_inserted_ids
  )
  and queue.status in ('pending','queued');

do $postcheck$
begin
  if (select count(*) from public.mapper_basement where is_active)<>2147
    or (select count(distinct ingredient_id) from public.mapper_basement where is_active)<>2147
    or (select max(ingredient_id) from public.mapper_basement where is_active)<>'PI-ING-002172' then
    raise exception 'Rollback failed to restore the 2147/2147 Mapper prestate';
  end if;
  if exists(
    select 1
    from mapper_rollback_preimage preimage
    join public.mapper_basement mapper
      on mapper.ingredient_id=preimage.payload->>'ingredient_id'
    where (to_jsonb(mapper)-'created_at'-'updated_at')
      is distinct from (preimage.payload-'created_at'-'updated_at')
  ) then raise exception 'Rollback Mapper preimage mismatch'; end if;
  if exists(
    select 1 from mapper_rollback_preimage preimage
    where not exists(
      select 1 from public.mapper_basement mapper
      where mapper.ingredient_id=preimage.payload->>'ingredient_id'
    )
  ) then raise exception 'Rollback Mapper identity missing'; end if;
  if exists(
    select 1 from mapper_root_rollback_preimage preimage
    join public.products product on product.id=(preimage.payload->>'id')::uuid
    where not (to_jsonb(product) @> preimage.payload)
  ) then raise exception 'Rollback root preimage mismatch'; end if;
  if (select count(*) from public.products product
      join mapper_root_rollback_inserted_codes inserted using(product_code)
      where product.product_kind='mapper_reference'
        and not product.is_active and product.current_behavior_binding_id is null)<>452 then
    raise exception 'Rollback failed to soft-deactivate the 452 new roots';
  end if;
  if exists(select 1 from public.product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)})
    or exists(select 1 from public.mapper_product_behavior_bindings
      where classifier_version=${sqlLiteral(RELEASE_CLASSIFIER)}) then
    raise exception 'Release-specific bindings remain after rollback';
  end if;
  if (select count(*) from public.mapper_product_behavior_bindings binding
      join mapper_current_binding_preimage prior on prior.binding_id=binding.id
      where binding.is_current)<>2089 then
    raise exception 'Rollback failed to restore prior Mapper current bindings';
  end if;
  if (select count(*) from public.products product
      join mapper_root_current_binding_preimage prior
        on prior.product_id=product.id
       and prior.product_version_id=product.current_version_id
       and prior.binding_id=product.current_behavior_binding_id
      join public.product_behavior_bindings binding
        on binding.id=prior.binding_id and binding.is_current)<>2089 then
    raise exception 'Rollback failed to restore prior root pointers/current bindings';
  end if;
  if (select count(*) from public.mapper_process_metadata)<>2089 then
    raise exception 'Out-of-scope process metadata changed during rollback';
  end if;
end
$postcheck$;

notify pgrst,'reload schema';
commit;
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(OUTPUT, 'utf8');
  if (current !== sql) throw new Error('Rollback SQL is not deterministic; regenerate it');
  console.log(`Rollback SQL deterministic PASS (${Buffer.byteLength(sql)} bytes)`);
} else {
  writeFileSync(OUTPUT, sql, 'utf8');
  console.log(
    JSON.stringify(
      {
        output: OUTPUT,
        bytes: Buffer.byteLength(sql),
        mapperPreimages: mapperRows.length,
        productPreimages: productRows.length,
        insertedMapperRowsRemoved: insertedMapperIds.length,
        insertedRootsSoftDeactivated: insertedProductCodes.length,
        restoredMapperBindings: currentMapperBindings.length,
        restoredCanonicalBindings: currentProductBindings.length,
        immutableProductVersionsDeleted: 0,
      },
      null,
      2,
    ),
  );
}
