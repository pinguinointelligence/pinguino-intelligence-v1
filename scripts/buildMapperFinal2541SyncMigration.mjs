#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const INPUT = resolve(ROOT, 'docs/ingredients/validation/mapper_basement.csv');
const OUTPUT = resolve(ROOT, 'supabase/migrations/20260911120000_mapper_search_final_2541_sync.sql');
const EXPECTED_SHA = 'a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6';
const CLASSIFIER = 'mapper-final-2541-2026-09-11-v1';

function parseCsv(source) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += character;
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

const source = readFileSync(INPUT, 'utf8');
const actualSha = createHash('sha256').update(source).digest('hex');
if (actualSha !== EXPECTED_SHA) throw new Error(`Mapper SHA mismatch ${actualSha}`);
const table = parseCsv(source);
const headers = table[0];
const rows = table.slice(1).filter((row) => row.some(Boolean));
if (headers.length !== 62 || rows.length !== 2541) throw new Error('Expected FINAL Mapper 2541x62');
if (new Set(rows.map((row) => row[0])).size !== 2541) throw new Error('Duplicate Mapper identity');

const boolColumns = new Set(['approved_for_base', 'approved_for_engines']);
const lowercaseTextColumns = new Set(['contains_alcohol', 'dairy_free', 'gluten_free', 'vegan']);
const dateColumns = new Set(['verification_date', 'last_reviewed_at']);
const integerColumns = new Set(['data_confidence_percent']);
const numericColumns = new Set([
  'water_percent','total_solids_percent','fat_percent','saturated_fat_percent','milk_fat_percent',
  'non_fat_milk_solids_percent','protein_percent','aerating_protein_percent','carbohydrate_percent',
  'total_sugars_percent','sucrose_percent','dextrose_percent','glucose_percent','fructose_percent',
  'lactose_percent','polyol_percent','fiber_percent','salt_percent','alcohol_percent','ash_percent',
  'acidity_percent','brix','dry_matter_percent','pod_value','pac_value','de_value','sweetness_factor',
  'freezing_factor','stabilizer_activity','recommended_dosage_percent_min',
  'recommended_dosage_percent_max','kcal_per_100g','cost_per_kg','shelf_life_days',
]);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rawTuples = rows.map((row) => `(${row.map(quote).join(',')})`).join(',\n');
const rawColumns = headers.map((header) => `${header} text`).join(',\n  ');
const typed = (header) => {
  if (boolColumns.has(header)) return `lower(${header})='true'`;
  if (lowercaseTextColumns.has(header)) return `lower(${header})`;
  if (dateColumns.has(header)) return `nullif(${header},'')::date`;
  if (integerColumns.has(header)) return `nullif(${header},'')::integer`;
  if (numericColumns.has(header)) return `nullif(${header},'')::numeric`;
  return header;
};
const updates = headers.slice(1).map((header) => `${header}=excluded.${header}`).join(',\n  ');
const verified = [
  'Verified','Verified / Basis Check Needed','Verified / Exact Product Specification / PI Calculated',
  'Verified / Global Reference','Verified / Official Food Composition',
  'Verified / Official Product Label / PI Calculated','Verified / PI Calculated',
  'Verified / Public Label','Verified / Public Label / PI Calculated',
];
const statuses = [...new Set(rows.map((row) => row[headers.indexOf('verification_status')]))].sort();
const storage = [...new Set(rows.map((row) => row[headers.indexOf('storage_type')]))].sort();
const list = (values) => `array[${values.map(quote).join(',')}]::text[]`;

const sql = `-- Owner-approved minimal staging sync from certified FINAL Mapper 2541x62.
-- Source SHA-256: ${EXPECTED_SHA}
-- PROCESS_METADATA_452 = DEFERRED_TO_PROCESSING_WORKSTREAM
begin;
set local role postgres;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtextextended('mapper-search-final-2541-2026-09-11',0));
select set_config('app.canonical_product_ingest','v1',true);

do $$ begin
  if (select count(*) from public.mapper_basement where is_active) <> 2147 then
    raise exception 'Unexpected Mapper prestate: expected 2147 active rows';
  end if;
  if exists(select 1 from public.mapper_basement where is_active and ingredient_id > 'PI-ING-002172') then
    raise exception 'Unexpected active Mapper identity beyond certified staging prestate';
  end if;
  if (select count(*) from public.mapper_process_metadata) <> 2089 then
    raise exception 'Processing metadata prestate drifted; refusing out-of-scope mutation';
  end if;
end $$;

create temp table mapper_final_source(
  ${rawColumns}
) on commit drop;
insert into mapper_final_source(${headers.join(',')}) values
${rawTuples};

do $$ begin
  if (select count(*) from mapper_final_source)<>2541
    or (select count(distinct ingredient_id) from mapper_final_source)<>2541 then
    raise exception 'FINAL Mapper source census mismatch';
  end if;
  if exists(select 1 from public.mapper_basement m where m.is_active and not exists(
    select 1 from mapper_final_source s where s.ingredient_id=m.ingredient_id
  )) then raise exception 'Live Mapper contains identity outside FINAL'; end if;
  if (select count(*) from mapper_final_source s where not exists(
    select 1 from public.mapper_basement m where m.ingredient_id=s.ingredient_id
  ))<>394 then raise exception 'Expected exactly 394 Mapper inserts'; end if;
  if (select count(*) from mapper_final_source where lower(approved_for_base)='true')<>2491 then
    raise exception 'FINAL Base-selectable census mismatch';
  end if;
end $$;

alter table public.mapper_basement drop constraint if exists mapper_basement_verification_status_check;
alter table public.mapper_basement drop constraint if exists mapper_basement_storage_type_check;

insert into public.mapper_basement(${headers.join(',')},dataset_version,is_active)
select ${headers.map(typed).join(',')},'v1.0',true from mapper_final_source
on conflict(ingredient_id) do update set
  ${updates},dataset_version='v1.0',is_active=true,updated_at=now();

alter table public.mapper_basement add constraint mapper_basement_verification_status_check
  check(verification_status=any(${list(statuses)}));
alter table public.mapper_basement add constraint mapper_basement_storage_type_check
  check(storage_type=any(${list(storage)}));

do $$ begin
  if exists(select 1 from public.products occupied join mapper_final_source s
    on occupied.product_code=s.ingredient_id
    where occupied.id<>md5('pinguino:mapper-reference:v1.0:'||s.ingredient_id)::uuid)
  then raise exception 'PI article identity collision'; end if;
end $$;

insert into public.products(
  id,owner_user_id,created_by,brand,supplier,ean_code,barcode,product_name_internal,
  product_name_display,product_category,product_subcategory,country,status,source_type,
  dataset_version,is_active,product_kind,visibility,owning_account_id,
  canonical_verification_status,canonical_verification_method,canonical_provenance,
  explicitly_unbranded,normalized_identity,search_document,product_code,merged_into_product_id
)
select md5('pinguino:mapper-reference:v1.0:'||m.ingredient_id)::uuid,null,null,nullif(m.brand,''),nullif(m.supplier,''),
  m.ean_code,m.ean_code,m.ingredient_name_internal,m.ingredient_name_display,m.ingredient_category,
  m.ingredient_subcategory,m.country,
  case when m.verification_status=any(${list(verified)}) then 'pi_verified' else 'manual_adjusted' end,
  'catalog_import','v1.0',true,'mapper_reference','internal',null,
  case when m.verification_status=any(${list(verified)}) then 'verified' else 'manual_unverified' end,
  case when m.verification_status=any(${list(verified)}) then 'human' else 'manual_unverified' end,
  'mapper_basement:v1.0',coalesce(nullif(m.brand,''),'')='', 'mapper:'||m.ingredient_id,
  trim(concat_ws(' ',m.ingredient_id,m.ingredient_name_display,m.ingredient_name_internal,m.brand,
    m.ingredient_category,m.ingredient_subcategory,m.ean_code)),m.ingredient_id,null
from public.mapper_basement m where m.is_active
on conflict(id) do update set
  brand=excluded.brand,supplier=excluded.supplier,ean_code=excluded.ean_code,barcode=excluded.barcode,
  product_name_internal=excluded.product_name_internal,product_name_display=excluded.product_name_display,
  product_category=excluded.product_category,product_subcategory=excluded.product_subcategory,
  country=excluded.country,status=excluded.status,source_type=excluded.source_type,
  dataset_version=excluded.dataset_version,is_active=true,canonical_verification_status=excluded.canonical_verification_status,
  canonical_verification_method=excluded.canonical_verification_method,
  canonical_provenance=excluded.canonical_provenance,explicitly_unbranded=excluded.explicitly_unbranded,
  normalized_identity=excluded.normalized_identity,search_document=excluded.search_document,
  product_code=excluded.product_code,merged_into_product_id=null,updated_at=now();

create temp table mapper_release_versions on commit drop as
select p.id product_id,p.current_version_id previous_version_id,
  jsonb_strip_nulls(to_jsonb(m)-'created_at'-'updated_at'||jsonb_build_object(
    'mapperIngredientId',m.ingredient_id,'mapperDatasetVersion',m.dataset_version
  )) facts
from public.mapper_basement m join public.products p
  on p.product_kind='mapper_reference' and p.normalized_identity='mapper:'||m.ingredient_id
where m.is_active;
alter table mapper_release_versions add column facts_fingerprint text;
update mapper_release_versions set facts_fingerprint=encode(
  extensions.digest(convert_to(facts::text,'utf8'),'sha256'),'hex'
);

insert into public.product_versions(product_id,version,facts,evidence_snapshot,verification_status,
  verification_method,provenance,facts_fingerprint,supersedes,effective_at,created_at)
select r.product_id,coalesce((select max(v.version)+1 from public.product_versions v where v.product_id=r.product_id),1),
  r.facts,'{}'::jsonb,p.canonical_verification_status,p.canonical_verification_method,
  p.canonical_provenance,r.facts_fingerprint,r.previous_version_id,now(),now()
from mapper_release_versions r join public.products p on p.id=r.product_id
left join public.product_versions current on current.id=r.previous_version_id
where current.id is null or current.facts_fingerprint is distinct from r.facts_fingerprint
  or current.facts is distinct from r.facts;

update public.products p set current_version_id=v.id,updated_at=now()
from mapper_release_versions r join public.product_versions v on v.product_id=r.product_id
  and v.facts_fingerprint=r.facts_fingerprint and v.facts=r.facts
where p.id=r.product_id and p.current_version_id is distinct from v.id
  and v.version=(select max(v2.version) from public.product_versions v2 where v2.product_id=r.product_id
    and v2.facts_fingerprint=r.facts_fingerprint and v2.facts=r.facts);

do $$ declare row record; begin
  for row in select ingredient_id from public.mapper_basement where is_active order by ingredient_id loop
    perform public.classify_mapper_product_behavior_v2(row.ingredient_id,${quote(CLASSIFIER)});
  end loop;
end $$;

-- Remove only transaction-created asynchronous duplicates; direct classification above is authoritative.
delete from public.product_behavior_reclassification_queue
where status='queued' and reason='mapper_basement_changed' and queued_at>=transaction_timestamp();

-- Central resolver owns semantic expansion. Server keeps raw query and exact EAN/article precedence.
do $patch_search$ declare signature regprocedure:=to_regprocedure(
  'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
); definition text; old text; replacement text; begin
  if signature is null then raise exception 'search_products_v1 authority missing'; end if;
  select pg_get_functiondef(signature) into definition;
  old:=$old$  ), expanded as (
    select i.*,array(
      select distinct term from (
        select i.q term
        union all
        select public.gellatti_search_root(i.q)
        union all
        select a.normalized_alias from public.product_aliases a
        where i.q<>'' and (
          (a.normalized_alias % i.q and extensions.similarity(a.normalized_alias,i.q)>=0.45)
          or a.normalized_alias like i.q||'%'
          or i.q like a.normalized_alias||'%'
        )
      ) candidate_terms
      where term<>''
    )::text[] terms
    from input i
$old$;
  replacement:=$new$  ), expanded as (
    select i.*,array(
      select distinct term from (
        select i.q term
        union all
        select jsonb_array_elements_text(value) term
        from jsonb_array_elements(coalesce(p_token_groups,'[]'::jsonb)) groups(value)
      ) governed_terms where term<>''
    )::text[] terms
    from input i
$new$;
  if strpos(definition,old)=0 then raise exception 'search expansion definition drifted'; end if;
  definition:=replace(definition,old,replacement);
  definition:=replace(definition,$x$lower(coalesce(m.verification_status,'')) like 'verified%'$x$,
    $x$m.verification_status=any(${list(verified)})$x$);
  definition:=replace(definition,$x$lower(coalesce(m.verification_status,'')) not like 'verified%'$x$,
    $x$not (m.verification_status=any(${list(verified)}))$x$);
  execute definition;
end $patch_search$;

do $$ begin
  if (select count(*) from public.mapper_basement where is_active)<>2541
    or (select count(distinct ingredient_id) from public.mapper_basement where is_active)<>2541
    then raise exception 'Mapper FINAL census incomplete'; end if;
  if (select count(*) from public.products p where p.product_kind='mapper_reference' and p.is_active
    and p.merged_into_product_id is null)<>2541 then raise exception 'Mapper roots incomplete'; end if;
  if (select count(*) from public.products p join public.product_versions v
    on v.id=p.current_version_id and v.product_id=p.id where p.product_kind='mapper_reference'
    and p.is_active and p.merged_into_product_id is null)<>2541 then raise exception 'Mapper versions incomplete'; end if;
  if (select count(*) from public.mapper_product_behavior_bindings b where b.is_current)<>2541
    then raise exception 'Mapper behavior bindings incomplete'; end if;
  if (select count(*) from public.products p join public.product_behavior_bindings b
    on b.id=p.current_behavior_binding_id and b.product_id=p.id and b.product_version_id=p.current_version_id
    and b.is_current where p.product_kind='mapper_reference' and p.is_active and p.merged_into_product_id is null)<>2541
    then raise exception 'Canonical Mapper behavior bindings incomplete'; end if;
  if (select count(*) from public.mapper_process_metadata)<>2089
    then raise exception 'PROCESS_METADATA_452 out-of-scope table changed'; end if;
end $$;
commit;
`;

writeFileSync(OUTPUT, sql, 'utf8');
console.log(JSON.stringify({ output: OUTPUT, bytes: Buffer.byteLength(sql), rows: rows.length, columns: headers.length, sourceSha256: actualSha }, null, 2));
