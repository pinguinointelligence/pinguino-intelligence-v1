-- 0045_unified_product_intelligence.sql
-- One server-owned behavior authority for locked Mapper ingredients and every
-- immutable shared catalog product version.  This migration does not write to
-- mapper_basement and does not change any Engine formula.

create table if not exists public.product_taxonomy_versions (
  id text primary key,
  version integer not null check (version >= 1),
  status text not null check (status in ('draft','published','retired')),
  source text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (version)
);

create table if not exists public.product_taxonomy_nodes (
  taxonomy_version_id text not null references public.product_taxonomy_versions(id) on delete restrict,
  id text not null,
  parent_id text,
  kind text not null check (kind in ('family','subfamily','form')),
  canonical_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (taxonomy_version_id,id),
  foreign key (taxonomy_version_id,parent_id)
    references public.product_taxonomy_nodes(taxonomy_version_id,id) on delete restrict
);

create table if not exists public.product_taxonomy_aliases (
  taxonomy_version_id text not null,
  node_id text not null,
  language text not null,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  primary key (taxonomy_version_id,node_id,language,normalized_alias),
  foreign key (taxonomy_version_id,node_id)
    references public.product_taxonomy_nodes(taxonomy_version_id,id) on delete cascade
);
create index if not exists product_taxonomy_alias_lookup_idx
  on public.product_taxonomy_aliases(normalized_alias);

create table if not exists public.product_behavior_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version >= 1),
  taxonomy_version_id text not null references public.product_taxonomy_versions(id) on delete restrict,
  status text not null check (status in ('draft','published','retired')),
  product_profile text not null check (product_profile in (
    'milk_gelato','fruit_gelato','nut_gelato','chocolate_gelato','alcohol_gelato',
    'sorbet','vegan_gelato','protein_gelato'
  )),
  family_id text,
  subfamily_id text,
  form_id text,
  exact_mapper_ingredient_id text,
  exact_catalog_product_version_id uuid references public.global_catalog_product_versions(id) on delete restrict,
  main_eligibility text not null check (main_eligibility in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','PROTEIN_CONTRIBUTOR_ONLY',
    'TOPPING_ONLY','NOT_MAIN','MAIN_BLOCKED_POLICY','UNKNOWN'
  )),
  basis text check (basis is null or basis in (
    'FRUIT_EQUIVALENT','NUT_EQUIVALENT','COCOA_SOLIDS_EQUIVALENT','ETHANOL_PERCENT',
    'INFUSION_INPUT_PER_KG','PERCENT_OF_BASE'
  )),
  eco_floor_percent numeric,
  optimal_ceiling_percent numeric,
  hard_limit_percent numeric,
  equivalent_factor numeric,
  approved_mixed_family_ids text[] not null default '{}',
  requires_liquid_dairy_carrier boolean not null default false,
  liquid_dairy_carrier_floor_percent numeric,
  evidence_status text not null check (evidence_status in ('owner_provisional','verified','reference_only')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (policy_key,version),
  check (
    (main_eligibility not in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'))
    or (
      basis is not null
      and eco_floor_percent is not null
      and optimal_ceiling_percent is not null
      and hard_limit_percent is not null
      and equivalent_factor is not null
      and equivalent_factor > 0
      and eco_floor_percent >= 0
      and eco_floor_percent <= optimal_ceiling_percent
      and optimal_ceiling_percent <= hard_limit_percent
      and hard_limit_percent <= 100
    )
  ),
  check (
    (not requires_liquid_dairy_carrier and liquid_dairy_carrier_floor_percent is null)
    or (requires_liquid_dairy_carrier and liquid_dairy_carrier_floor_percent between 0 and 100)
  )
);
create unique index if not exists product_behavior_policy_one_published_idx
  on public.product_behavior_policy_versions(policy_key) where status='published';
create index if not exists product_behavior_policy_resolver_idx
  on public.product_behavior_policy_versions(
    status,product_profile,exact_catalog_product_version_id,exact_mapper_ingredient_id,
    subfamily_id,form_id,family_id
  );

create table if not exists public.mapper_product_behavior_bindings (
  id uuid primary key default gen_random_uuid(),
  mapper_ingredient_id text not null,
  mapper_dataset_version text not null,
  taxonomy_version_id text not null references public.product_taxonomy_versions(id) on delete restrict,
  family_id text,
  subfamily_id text,
  form_id text,
  form_hint text,
  main_eligibility text not null check (main_eligibility in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','PROTEIN_CONTRIBUTOR_ONLY',
    'TOPPING_ONLY','NOT_MAIN','MAIN_BLOCKED_POLICY','UNKNOWN'
  )),
  vegan_eligibility text not null check (vegan_eligibility in ('verified','false','unknown','conflict')),
  protein_behavior text not null check (protein_behavior in ('contributor','neutral','unknown')),
  approved_liquid_dairy_carrier boolean not null default false,
  profile_permissions jsonb not null default '{}'::jsonb,
  process_behavior jsonb not null default '{}'::jsonb,
  raw_evidence jsonb not null default '{}'::jsonb,
  classifier_version text not null,
  classified_at timestamptz not null default now(),
  is_current boolean not null default true,
  unique (mapper_ingredient_id,mapper_dataset_version,classifier_version)
);
create unique index if not exists mapper_product_behavior_current_idx
  on public.mapper_product_behavior_bindings(mapper_ingredient_id) where is_current;

create table if not exists public.catalog_product_behavior_bindings (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.global_catalog_products(id) on delete cascade,
  catalog_product_version_id uuid not null references public.global_catalog_product_versions(id) on delete restrict,
  mapper_ingredient_id text,
  taxonomy_version_id text not null references public.product_taxonomy_versions(id) on delete restrict,
  family_id text,
  subfamily_id text,
  form_id text,
  main_eligibility text not null check (main_eligibility in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','PROTEIN_CONTRIBUTOR_ONLY',
    'TOPPING_ONLY','NOT_MAIN','MAIN_BLOCKED_POLICY','UNKNOWN'
  )),
  vegan_eligibility text not null check (vegan_eligibility in ('verified','false','unknown','conflict')),
  protein_behavior text not null check (protein_behavior in ('contributor','neutral','unknown')),
  approved_liquid_dairy_carrier boolean not null default false,
  profile_permissions jsonb not null default '{}'::jsonb,
  process_behavior jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  block_reasons text[] not null default '{}',
  classifier_version text not null,
  classified_at timestamptz not null default now(),
  is_current boolean not null default true,
  unique (catalog_product_version_id,classifier_version)
);
create unique index if not exists catalog_product_behavior_current_idx
  on public.catalog_product_behavior_bindings(catalog_product_id) where is_current;

create table if not exists public.product_behavior_classification_runs (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('mapper','catalog_product_version')),
  entity_id text not null,
  classifier_version text not null,
  taxonomy_version_id text not null,
  policy_fingerprint text not null,
  outcome text not null check (outcome in ('classified','unknown_requires_review','blocked')),
  evidence jsonb not null default '{}'::jsonb,
  binding_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

-- One intake ledger proves every adapter crossed the same server boundary.
-- The concrete catalog core/version remains global_catalog_products/
-- global_catalog_product_versions; legacy public.products is only owned source
-- evidence or an internal_subproduct workspace row.
create table if not exists public.unified_product_ingest_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in (
    'ocr','barcode','manual','admin','catalog_import','retailer_feed','spreadsheet',
    'supplier_specification','shop','franchise','internal_subproduct','future_integration'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  source_product_id uuid references public.products(id) on delete set null,
  catalog_product_id uuid references public.global_catalog_products(id) on delete set null,
  catalog_product_version_id uuid references public.global_catalog_product_versions(id) on delete set null,
  payload_fingerprint text not null,
  idempotency_key text not null,
  status text not null check (status in ('accepted','duplicate','blocked','review','failed')),
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source,idempotency_key)
);

insert into public.product_taxonomy_versions(id,version,status,source,published_at)
values ('pinguino-product-taxonomy-v1',1,'published','owner-unified-product-intelligence-2026-08-12',now())
on conflict (id) do nothing;

insert into public.product_taxonomy_nodes(taxonomy_version_id,id,parent_id,kind,canonical_name)
values
  ('pinguino-product-taxonomy-v1','fruit',null,'family','Fruit'),
  ('pinguino-product-taxonomy-v1','berry','fruit','subfamily','Berry'),
  ('pinguino-product-taxonomy-v1','kiwi','fruit','subfamily','Kiwi'),
  ('pinguino-product-taxonomy-v1','banana','fruit','subfamily','Banana'),
  ('pinguino-product-taxonomy-v1','nut',null,'family','Nut'),
  ('pinguino-product-taxonomy-v1','chocolate_cocoa',null,'family','Chocolate / cocoa'),
  ('pinguino-product-taxonomy-v1','coffee',null,'family','Coffee'),
  ('pinguino-product-taxonomy-v1','tea_infusion',null,'family','Tea / infusion'),
  ('pinguino-product-taxonomy-v1','alcohol',null,'family','Alcohol'),
  ('pinguino-product-taxonomy-v1','fresh',null,'form','Fresh'),
  ('pinguino-product-taxonomy-v1','frozen',null,'form','Frozen'),
  ('pinguino-product-taxonomy-v1','puree',null,'form','Puree'),
  ('pinguino-product-taxonomy-v1','pure_nut_paste',null,'form','Pure nut paste'),
  ('pinguino-product-taxonomy-v1','sweetened_compound_paste',null,'form','Sweetened compound paste'),
  ('pinguino-product-taxonomy-v1','cocoa_powder',null,'form','Cocoa powder'),
  ('pinguino-product-taxonomy-v1','cocoa_mass',null,'form','Cocoa mass'),
  ('pinguino-product-taxonomy-v1','dark_chocolate',null,'form','Dark chocolate'),
  ('pinguino-product-taxonomy-v1','milk_chocolate',null,'form','Milk chocolate'),
  ('pinguino-product-taxonomy-v1','espresso',null,'form','Espresso'),
  ('pinguino-product-taxonomy-v1','infusion_input',null,'form','Infusion input'),
  ('pinguino-product-taxonomy-v1','alcoholic_beverage',null,'form','Alcoholic beverage')
on conflict do nothing;

insert into public.product_taxonomy_aliases(taxonomy_version_id,node_id,language,alias,normalized_alias)
values
  ('pinguino-product-taxonomy-v1','berry','pl','truskawka','truskawka'),
  ('pinguino-product-taxonomy-v1','berry','en','strawberry','strawberry'),
  ('pinguino-product-taxonomy-v1','berry','es','fresa','fresa'),
  ('pinguino-product-taxonomy-v1','berry','de','Erdbeere','erdbeere'),
  ('pinguino-product-taxonomy-v1','berry','it','fragola','fragola'),
  ('pinguino-product-taxonomy-v1','berry','fr','fraise','fraise')
on conflict do nothing;

insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,family_id,subfamily_id,form_id,
  main_eligibility,basis,eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,
  equivalent_factor,requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,evidence,published_at
)
values
  ('main-fruit-fresh-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit',null,'fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',20,35,45,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-fruit-puree-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit',null,'puree','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',20,35,45,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-berry-fresh-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit','berry','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',25,35,45,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-berry-puree-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit','berry','puree','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',25,35,45,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-kiwi-fresh-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit','kiwi','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,15,20,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-banana-fresh-dairy',1,'pinguino-product-taxonomy-v1','published','fruit_gelato','fruit','banana','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,20,30,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12"}',now()),
  ('main-pure-nut-paste-dairy',1,'pinguino-product-taxonomy-v1','published','nut_gelato','nut',null,'pure_nut_paste','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',8,15,15,1,true,30,'owner_provisional','{"ownerPrompt":"2026-08-12","compoundRequiresExactFactor":true}',now())
on conflict (policy_key,version) do nothing;

-- Exhaustive, fail-closed Mapper backfill. Raw category/subcategory and the
-- presentation form hint remain evidence only; they are not silently promoted
-- to a governed family/form policy. Exact structural categories may safely be
-- NOT_MAIN. Every other unreviewed row stays UNKNOWN while preserving its
-- existing Base/Engine approval and process evidence.
insert into public.mapper_product_behavior_bindings(
  mapper_ingredient_id,mapper_dataset_version,taxonomy_version_id,
  family_id,subfamily_id,form_id,form_hint,main_eligibility,
  vegan_eligibility,protein_behavior,profile_permissions,process_behavior,
  approved_liquid_dairy_carrier,raw_evidence,classifier_version
)
select
  m.ingredient_id,m.dataset_version,'pinguino-product-taxonomy-v1',
  null,null,null,
  case
    when lower(coalesce(m.ingredient_subcategory,'')) like '%powder%' then 'powder'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%puree%' then 'puree'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%paste%' then 'paste'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%juice%' then 'juice'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%concentrate%' then 'concentrate'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%frozen%' then 'frozen'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%fresh%' then 'fresh'
    when lower(coalesce(m.ingredient_subcategory,'')) like '%liquid%' then 'liquid'
    else 'other'
  end,
  case
    when lower(m.ingredient_category)='protein' then 'PROTEIN_CONTRIBUTOR_ONLY'
    when lower(m.ingredient_category) in (
      'fruit','fruit_powder','flavor_paste','flavor_powder','flavor_syrup',
      'flavor_concentrate','chocolate','cocoa','nut','nut_paste','coffee',
      'coffee_tea','alcohol','beverage','confectionery_spread'
    ) then 'MAIN_BLOCKED_POLICY'
    else 'NOT_MAIN'
  end,
  case m.vegan when 'true' then 'verified' when 'false' then 'false' else 'unknown' end,
  case when coalesce(m.aerating_protein_percent,0)>0 then 'contributor'
       when coalesce(m.protein_percent,0)=0 then 'neutral' else 'unknown' end,
  jsonb_build_object(
    'BASE_RECIPE',m.approved_for_base and m.approved_for_engines,
    'TOPPING',m.approved_for_base,
    'SUBSTITUTION',m.approved_for_base and m.approved_for_engines,
    'MONITOR',m.approved_for_base and m.approved_for_engines,
    'PRODUCTION',m.approved_for_base and m.approved_for_engines,
    'LABEL',true,
    'NUTRITION',true,
    'COST',true,
    'SAVE',m.approved_for_base
  ),
  jsonb_build_object(
    'decision',coalesce(pm.process_decision,'UNKNOWN'),
    'verificationStatus',coalesce(pm.verification_status,'unknown'),
    'datasetVersion',pm.dataset_version,
    'reasonType',pm.reason_type,
    'heatSensitive',coalesce(pm.heat_sensitive,false),
    'lateAdditionGuidancePl',pm.late_addition_guidance_pl,
    'sourceLabel',pm.source_label,
    'sourceReference',pm.source_reference
  ),
  false,
  jsonb_build_object(
    'ingredientCategory',m.ingredient_category,
    'ingredientSubcategory',m.ingredient_subcategory,
    'verificationStatus',m.verification_status,
    'proteinPercent',m.protein_percent,
    'aeratingProteinPercent',m.aerating_protein_percent,
    'approvedForBase',m.approved_for_base,
    'approvedForEngines',m.approved_for_engines
  ),
  'mapper-exhaustive-fail-closed-v1'
from public.mapper_basement m
left join public.mapper_process_metadata pm on pm.ingredient_id=m.ingredient_id
where m.is_active
on conflict (mapper_ingredient_id,mapper_dataset_version,classifier_version) do nothing;

-- Owner-reviewed exact fixture bindings. These are identity-bound exceptions,
-- not lexical classification. Commercial concentrates/pastes with the same
-- flavour remain UNKNOWN until their declared equivalent factor is reviewed.
update public.mapper_product_behavior_bindings set
  family_id='fruit',subfamily_id='berry',form_id='fresh',form_hint='fresh',
  main_eligibility='MAIN_PROFILE_SPECIFIC'
where mapper_ingredient_id='PI-ING-001553' and classifier_version='mapper-exhaustive-fail-closed-v1';
update public.mapper_product_behavior_bindings set
  family_id='fruit',subfamily_id='banana',form_id='fresh',form_hint='fresh',
  main_eligibility='MAIN_PROFILE_SPECIFIC'
where mapper_ingredient_id='PI-ING-000345' and classifier_version='mapper-exhaustive-fail-closed-v1';
update public.mapper_product_behavior_bindings set
  family_id='fruit',subfamily_id='kiwi',form_id='fresh',form_hint='fresh',
  main_eligibility='MAIN_PROFILE_SPECIFIC'
where mapper_ingredient_id='PI-ING-000366' and classifier_version='mapper-exhaustive-fail-closed-v1';

-- Exact owner-reviewed liquid dairy carrier identities. Cream, condensed milk
-- and powders are deliberately not inferred as carriers.
update public.mapper_product_behavior_bindings set approved_liquid_dairy_carrier=true
where mapper_ingredient_id in (
  'PI-ING-000200','PI-ING-000201','PI-ING-000234','PI-ING-000235','PI-ING-000236'
) and classifier_version='mapper-exhaustive-fail-closed-v1';

-- System-owned tables: customers can read published taxonomy and their
-- resolver result, but cannot write classification, policy, mapping or limits.
alter table public.product_taxonomy_versions enable row level security;
alter table public.product_taxonomy_nodes enable row level security;
alter table public.product_taxonomy_aliases enable row level security;
alter table public.product_behavior_policy_versions enable row level security;
alter table public.mapper_product_behavior_bindings enable row level security;
alter table public.catalog_product_behavior_bindings enable row level security;
alter table public.product_behavior_classification_runs enable row level security;
alter table public.unified_product_ingest_events enable row level security;

create policy product_taxonomy_versions_published_read on public.product_taxonomy_versions
  for select to authenticated using (status='published');
create policy product_taxonomy_nodes_published_read on public.product_taxonomy_nodes
  for select to authenticated using (exists (
    select 1 from public.product_taxonomy_versions v
    where v.id=taxonomy_version_id and v.status='published'
  ));
create policy product_taxonomy_aliases_published_read on public.product_taxonomy_aliases
  for select to authenticated using (exists (
    select 1 from public.product_taxonomy_versions v
    where v.id=taxonomy_version_id and v.status='published'
  ));
create policy product_behavior_policy_published_read on public.product_behavior_policy_versions
  for select to authenticated using (status='published');

grant select on public.product_taxonomy_versions,public.product_taxonomy_nodes,
  public.product_taxonomy_aliases,public.product_behavior_policy_versions to authenticated;
revoke all on public.mapper_product_behavior_bindings,
  public.catalog_product_behavior_bindings,
  public.product_behavior_classification_runs,
  public.unified_product_ingest_events from public,anon,authenticated;

create or replace function public.classify_catalog_product_behavior_v1(
  p_catalog_product_version_id uuid,
  p_classifier_version text default 'unified-product-classifier-v1'
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_product_id uuid;
  v_product public.global_catalog_products%rowtype;
  v_mapping text;
  v_taxonomy text := 'pinguino-product-taxonomy-v1';
  v_family text;
  v_subfamily text;
  v_form text;
  v_main text := 'MAIN_BLOCKED_POLICY';
  v_base boolean := false;
  v_topping boolean := false;
  v_liquid_dairy_carrier boolean := false;
  v_binding uuid;
  v_key text;
begin
  select product_id into v_product_id
  from public.global_catalog_product_versions
  where id=p_catalog_product_version_id;
  if v_product_id is null then raise exception 'catalog product version not found'; end if;
  select * into v_product from public.global_catalog_products where id=v_product_id and is_active;
  if not found then raise exception 'active catalog product not found'; end if;
  select gm.mapper_ingredient_id into v_mapping
  from public.global_catalog_engine_mappings gm
  join public.mapper_basement m on m.ingredient_id=gm.mapper_ingredient_id
  where gm.catalog_product_id=v_product_id
    and gm.catalog_version_id=p_catalog_product_version_id
    and m.is_active and m.approved_for_base and m.approved_for_engines
  limit 1;
  v_family := nullif(v_product.canonical_family,'');
  -- Product form and concentration are mandatory for automatic Main. A
  -- catalog status or family name alone never grants a policy.
  v_subfamily := nullif(v_product.public_data->>'subfamilyId','');
  v_form := nullif(v_product.public_data->>'formId','');
  v_base := v_product.status <> 'blocked' and v_mapping is not null;
  v_topping := v_product.status <> 'blocked'
    and coalesce(v_product.public_data->>'ingredientsText','') <> ''
    and coalesce(v_product.public_data->>'allergensText','') <> ''
    and jsonb_typeof(v_product.public_data->'nutrition')='object';
  select coalesce(b.approved_liquid_dairy_carrier,false) into v_liquid_dairy_carrier
  from public.mapper_product_behavior_bindings b
  where b.mapper_ingredient_id=v_mapping and b.is_current;
  if v_family is not null and v_form is not null and exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published' and p.taxonomy_version_id=v_taxonomy
      and p.family_id=v_family and p.form_id=v_form
  ) then v_main := 'MAIN_PROFILE_SPECIFIC';
  elsif v_family is not null then v_main := 'MAIN_BLOCKED_POLICY';
  else v_main := case when v_mapping is not null then 'STANDARD_ONLY' else 'MAIN_BLOCKED_POLICY' end;
  end if;
  update public.catalog_product_behavior_bindings set is_current=false
  where catalog_product_id=v_product_id and is_current;
  insert into public.catalog_product_behavior_bindings(
    catalog_product_id,catalog_product_version_id,mapper_ingredient_id,taxonomy_version_id,
    family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,protein_behavior,
    approved_liquid_dairy_carrier,
    profile_permissions,process_behavior,warnings,block_reasons,classifier_version
  ) values (
    v_product_id,p_catalog_product_version_id,v_mapping,v_taxonomy,
    v_family,v_subfamily,v_form,v_main,
    case when v_product.public_data->>'vegan'='true' then 'verified'
         when v_product.public_data->>'vegan'='false' then 'false' else 'unknown' end,
    case when coalesce((v_product.public_data->'nutrition'->>'protein')::numeric,0)>0
         then 'contributor' else 'unknown' end,v_liquid_dairy_carrier,
    jsonb_build_object(
      'SEARCH',v_product.status<>'blocked','BASE_RECIPE',v_base,'MAIN',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'OPTIMAL',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),'ECO',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'TOPPING',v_topping,'SUBSTITUTION',v_base,'COST',true,'MONITOR',v_base,
      'PRODUCTION',v_base or v_topping,'LABEL',v_topping,'NUTRITION',v_topping,'SAVE',v_base or v_topping
    ),
    jsonb_build_object('BASE_FORMULATION',v_base,'POST_PROCESS_ADDON',v_topping),
    case when v_product.status='manual_unverified' then array['catalog_manual_unverified'] else '{}'::text[] end,
    array_remove(array[
      case when not v_base then 'base_technical_authority_missing' end,
      case when v_main='MAIN_BLOCKED_POLICY' then 'main_policy_missing' end
    ],null),p_classifier_version
  ) returning id into v_binding;
  v_key := 'catalog:'||p_catalog_product_version_id::text||':'||p_classifier_version;
  insert into public.product_behavior_classification_runs(
    entity_kind,entity_id,classifier_version,taxonomy_version_id,policy_fingerprint,
    outcome,evidence,binding_id,idempotency_key
  ) values (
    'catalog_product_version',p_catalog_product_version_id::text,p_classifier_version,v_taxonomy,
    encode(extensions.digest(coalesce(v_product.public_data,'{}'::jsonb)::text,'sha256'),'hex'),
    'classified',
    jsonb_build_object('catalogStatus',v_product.status,'mapperIngredientId',v_mapping),v_binding,v_key
  ) on conflict (idempotency_key) do nothing;
  if v_main='MAIN_BLOCKED_POLICY' then
    insert into public.global_catalog_review_cases(
      consolidation_key,catalog_product_id,kind,missing_fields,normalized_data,latest_evidence
    ) values (
      'behavior:'||v_product_id::text,v_product_id,'conflict',array['main_policy'],
      jsonb_build_object('productVersionId',p_catalog_product_version_id,'familyId',v_family,'formId',v_form),
      jsonb_build_object('classifierVersion',p_classifier_version)
    ) on conflict (consolidation_key) do update set
      submission_count=public.global_catalog_review_cases.submission_count+1,
      latest_evidence=excluded.latest_evidence,
      updated_at=now();
  end if;
  return v_binding;
end $$;
revoke all on function public.classify_catalog_product_behavior_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.classify_catalog_product_behavior_v1(uuid,text) to service_role;

create or replace function public.classify_catalog_product_version_after_insert_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_binding uuid;
  v_submission public.global_catalog_submissions%rowtype;
  v_source text;
begin
  v_binding := public.classify_catalog_product_behavior_v1(
    new.id,'unified-product-classifier-v1'
  );
  select * into v_submission from public.global_catalog_submissions
  where catalog_product_id=new.product_id
  order by created_at desc limit 1;
  v_source := case
    when new.provenance in ('ocr_automatic','automatic_verified') then 'ocr'
    when new.provenance='manual_completion' then 'manual'
    when new.provenance='admin_corrected' or new.provenance='human_verified' then 'admin'
    else 'catalog_import' end;
  insert into public.unified_product_ingest_events(
    source,actor_user_id,source_product_id,catalog_product_id,
    catalog_product_version_id,payload_fingerprint,idempotency_key,status,result_snapshot
  ) values (
    v_source,v_submission.submitter_user_id,v_submission.private_product_id,new.product_id,
    new.id,encode(extensions.digest(new.snapshot::text,'sha256'),'hex'),
    'catalog-version:'||new.id::text,
    case when (select main_eligibility from public.catalog_product_behavior_bindings where id=v_binding)='MAIN_BLOCKED_POLICY'
      then 'review' else 'accepted' end,
    jsonb_build_object('behaviorBindingId',v_binding,'catalogVersionId',new.id)
  ) on conflict (source,idempotency_key) do nothing;
  return new;
end $$;

drop trigger if exists global_catalog_version_classify_v1 on public.global_catalog_product_versions;
create trigger global_catalog_version_classify_v1
  after insert on public.global_catalog_product_versions
  for each row execute function public.classify_catalog_product_version_after_insert_v1();

-- Deterministic backfill for every currently active catalog version. The loop
-- is fail-closed: unknown taxonomy/form produces a persisted UNKNOWN binding
-- and consolidated review case, never a guessed Main policy.
do $$
declare v_version uuid;
begin
  for v_version in
    select p.current_version_id from public.global_catalog_products p
    where p.is_active and p.current_version_id is not null
  loop
    if not exists (
      select 1 from public.catalog_product_behavior_bindings b
      where b.catalog_product_version_id=v_version
        and b.classifier_version='unified-product-classifier-v1'
    ) then
      perform public.classify_catalog_product_behavior_v1(v_version,'unified-product-classifier-v1');
    end if;
  end loop;
end $$;

create or replace function public.resolve_product_behavior_v1(
  p_entity_kind text,
  p_entity_id text,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path=public,extensions
as $$
declare
  v_profile text := coalesce(nullif(p_context->>'productProfile',''),'milk_gelato');
  v_scope text := coalesce(nullif(p_context->>'processScope',''),'BASE_FORMULATION');
  v_role text := coalesce(nullif(p_context->>'requestedRole',''),'STANDARD');
  v_module text := coalesce(nullif(p_context->>'module',''),'SEARCH');
  v_product_id uuid;
  v_version_id uuid;
  v_status text;
  v_source text;
  v_mapping text;
  v_binding_id uuid;
  v_binding_version text;
  v_facts_fingerprint text;
  v_taxonomy text;
  v_family text;
  v_subfamily text;
  v_form text;
  v_main text;
  v_vegan text;
  v_protein text;
  v_liquid_dairy_carrier boolean := false;
  v_permissions jsonb;
  v_process jsonb;
  v_warnings text[];
  v_blocks text[];
  v_policy public.product_behavior_policy_versions%rowtype;
  v_allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if v_scope not in ('BASE_FORMULATION','POST_PROCESS_ADDON')
    or v_role not in ('STANDARD','MAIN') then raise exception 'invalid behavior context'; end if;
  if p_entity_kind='catalog_product_version' then
    v_version_id := p_entity_id::uuid;
    select b.catalog_product_id,b.id,b.classifier_version,
      encode(extensions.digest(v.snapshot::text,'sha256'),'hex'),
      b.mapper_ingredient_id,b.taxonomy_version_id,
      b.family_id,b.subfamily_id,b.form_id,b.main_eligibility,b.vegan_eligibility,b.protein_behavior,
      b.approved_liquid_dairy_carrier,
      b.profile_permissions,b.process_behavior,b.warnings,b.block_reasons,p.status,p.provenance
    into v_product_id,v_binding_id,v_binding_version,v_facts_fingerprint,v_mapping,v_taxonomy,
      v_family,v_subfamily,v_form,v_main,v_vegan,v_protein,v_liquid_dairy_carrier,
      v_permissions,v_process,v_warnings,v_blocks,v_status,v_source
    from public.catalog_product_behavior_bindings b
    join public.global_catalog_products p on p.id=b.catalog_product_id and p.is_active
    join public.global_catalog_product_versions v on v.id=b.catalog_product_version_id
    where b.catalog_product_version_id=v_version_id and b.is_current
      and p.current_version_id=v_version_id;
  elsif p_entity_kind='mapper' then
    select b.id,b.classifier_version,
      encode(extensions.digest((b.mapper_ingredient_id||':'||b.mapper_dataset_version||':'||b.raw_evidence::text),'sha256'),'hex'),
      b.mapper_ingredient_id,b.taxonomy_version_id,
      b.family_id,b.subfamily_id,b.form_id,b.main_eligibility,b.vegan_eligibility,b.protein_behavior,
      b.approved_liquid_dairy_carrier,
      b.profile_permissions,b.process_behavior,'{}'::text[],'{}'::text[]
    into v_binding_id,v_binding_version,v_facts_fingerprint,v_mapping,v_taxonomy,
      v_family,v_subfamily,v_form,v_main,v_vegan,v_protein,v_liquid_dairy_carrier,
      v_permissions,v_process,v_warnings,v_blocks
    from public.mapper_product_behavior_bindings b
    join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    where b.mapper_ingredient_id=p_entity_id and b.is_current
      and m.is_active and m.approved_for_base;
    v_status := 'pi_base'; v_source := 'mapper'; v_version_id := null;
  else raise exception 'unsupported entity kind';
  end if;
  if v_binding_id is null then
    return jsonb_build_object(
      'schemaVersion',1,'entityKind',p_entity_kind,'entityId',p_entity_id,
      'state','blocked','module',v_module,'reasons',jsonb_build_array('behavior_binding_missing')
    );
  end if;
  select * into v_policy from public.product_behavior_policy_versions p
  where p.status='published' and p.taxonomy_version_id=v_taxonomy and p.product_profile=v_profile
    and (p.exact_catalog_product_version_id is null or p.exact_catalog_product_version_id=v_version_id)
    and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapping)
    and (p.family_id is null or p.family_id=v_family)
    and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
    and (p.form_id is null or p.form_id=v_form)
  order by
    (p.exact_catalog_product_version_id is not null) desc,
    (p.exact_mapper_ingredient_id is not null) desc,
    (p.subfamily_id is not null) desc,
    (p.family_id is not null) desc
  limit 1;
  v_allowed := case
    when v_status='blocked' then false
    when v_module='SEARCH' then true
    when v_module in ('TOPPING','LABEL','NUTRITION') then coalesce((v_permissions->>v_module)::boolean,(v_permissions->>'TOPPING')::boolean,false)
    when v_module='COST' then coalesce((v_permissions->>'COST')::boolean,false)
    when v_module in ('BASE_RECIPE','SUBSTITUTION','MONITOR','PRODUCTION','SAVE')
      then coalesce((v_permissions->>'BASE_RECIPE')::boolean,false) and v_mapping is not null
    when v_module in ('MAIN','OPTIMAL','ECO') then
      coalesce((v_permissions->>'BASE_RECIPE')::boolean,false)
      and v_mapping is not null
      and v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
      and v_policy.id is not null
    else false end;
  return jsonb_build_object(
    'schemaVersion',1,
    'resolverVersion','unified-product-behavior-v1',
    'entityKind',p_entity_kind,
    'productId',coalesce(v_product_id::text,p_entity_id),
    'productVersionId',coalesce(v_version_id::text,'mapper:'||p_entity_id),
    'factsFingerprint',v_facts_fingerprint,
    'catalogStatus',v_status,
    'provenance',v_source,
    'behaviorBindingId',v_binding_id,
    'behaviorBindingVersion',v_binding_version,
    'taxonomyVersion',v_taxonomy,
    'mapperIngredientId',v_mapping,
    'familyId',v_family,
    'subfamilyId',v_subfamily,
    'formId',v_form,
    'mainEligibility',v_main,
    'veganEligibility',v_vegan,
    'proteinBehavior',v_protein,
    'approvedLiquidDairyCarrier',v_liquid_dairy_carrier,
    'processBehavior',v_process,
    'context',p_context,
    'module',v_module,
    'state',case when v_allowed then 'eligible' else 'blocked' end,
    'moduleEligibility',jsonb_build_object(
      'SEARCH',case when v_status='blocked' then 'blocked' else 'eligible' end,
      'BASE_RECIPE',case when coalesce((v_permissions->>'BASE_RECIPE')::boolean,false) and v_mapping is not null then 'eligible' else 'blocked' end,
      'MAIN',case when v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC') and v_policy.id is not null then 'eligible' else 'blocked' end,
      'OPTIMAL',case when v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC') and v_policy.id is not null then 'eligible' else 'blocked' end,
      'ECO',case when v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC') and v_policy.id is not null then 'eligible' else 'blocked' end,
      'TOPPING',case when coalesce((v_permissions->>'TOPPING')::boolean,false) then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
      'SUBSTITUTION',case when coalesce((v_permissions->>'SUBSTITUTION')::boolean,false) and v_mapping is not null then 'eligible' else 'blocked' end,
      'COST',case when coalesce((v_permissions->>'COST')::boolean,false) then 'eligible' else 'blocked' end,
      'MONITOR',case when coalesce((v_permissions->>'MONITOR')::boolean,false) then 'eligible' else 'blocked' end,
      'PRODUCTION',case when coalesce((v_permissions->>'PRODUCTION')::boolean,false) then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
      'LABEL',case when coalesce((v_permissions->>'LABEL')::boolean,false) then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
      'NUTRITION',case when coalesce((v_permissions->>'NUTRITION')::boolean,false) then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
      'SAVE',case when coalesce((v_permissions->>'SAVE')::boolean,false) then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end
    ),
    'mainPolicy',case when v_policy.id is null then null else jsonb_build_object(
      'policyId',v_policy.policy_key,
      'policyVersion',v_policy.version::text,
      'familyId',v_policy.family_id,
      'subfamilyId',v_policy.subfamily_id,
      'formId',v_policy.form_id,
      'basis',v_policy.basis,
      'ecoFloorPercent',v_policy.eco_floor_percent,
      'optimalCeilingPercent',v_policy.optimal_ceiling_percent,
      'hardLimitPercent',v_policy.hard_limit_percent,
      'mainEquivalentFactor',v_policy.equivalent_factor,
      'requiresLiquidDairyCarrier',v_policy.requires_liquid_dairy_carrier,
      'liquidDairyCarrierFloorPercent',v_policy.liquid_dairy_carrier_floor_percent,
      'approvedMixedFamilyIds',v_policy.approved_mixed_family_ids,
      'evidenceStatus',v_policy.evidence_status
    ) end,
    'warnings',to_jsonb(coalesce(v_warnings,'{}'::text[])),
    'blockReasons',to_jsonb(array_remove(coalesce(v_blocks,'{}'::text[]) || case when v_allowed then '{}'::text[] else array['context_not_approved'] end,null))
  );
end $$;
revoke all on function public.resolve_product_behavior_v1(text,text,jsonb) from public,anon;
grant execute on function public.resolve_product_behavior_v1(text,text,jsonb) to authenticated,service_role;

-- Server-owned audit views enumerate with LEFT JOINs so UNKNOWN rows never
-- disappear. Access is reviewer/service only; no private price/user data.
create or replace view public.mapper_product_behavior_audit_v1 as
select m.ingredient_id,m.dataset_version,m.approved_for_base,m.approved_for_engines,
  b.family_id,b.subfamily_id,b.form_id,b.form_hint,
  coalesce(b.main_eligibility,'UNKNOWN') as main_eligibility,
  coalesce(b.vegan_eligibility,'unknown') as vegan_eligibility,
  coalesce(b.protein_behavior,'unknown') as protein_behavior,
  coalesce(b.approved_liquid_dairy_carrier,false) as approved_liquid_dairy_carrier,
  b.profile_permissions,b.process_behavior,b.classifier_version,
  case when b.id is null then 'UNKNOWN_REQUIRES_REVIEW' else 'BOUND' end as binding_status
from public.mapper_basement m
left join public.mapper_product_behavior_bindings b
  on b.mapper_ingredient_id=m.ingredient_id and b.is_current
where m.is_active;

create or replace view public.catalog_product_behavior_audit_v1 as
select p.id as catalog_product_id,p.current_version_id,p.status,p.verification_method,
  b.mapper_ingredient_id,b.family_id,b.subfamily_id,b.form_id,
  coalesce(b.main_eligibility,'UNKNOWN') as main_eligibility,
  b.profile_permissions,b.process_behavior,b.warnings,b.block_reasons,b.classifier_version,
  b.approved_liquid_dairy_carrier,
  case when b.id is null then 'UNKNOWN_REQUIRES_REVIEW' else 'BOUND' end as binding_status
from public.global_catalog_products p
left join public.catalog_product_behavior_bindings b
  on b.catalog_product_id=p.id and b.is_current
where p.is_active;

revoke all on public.mapper_product_behavior_audit_v1,public.catalog_product_behavior_audit_v1
  from public,anon,authenticated;
grant select on public.mapper_product_behavior_audit_v1,public.catalog_product_behavior_audit_v1
  to service_role;
