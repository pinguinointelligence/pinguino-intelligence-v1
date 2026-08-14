-- Canonical Product Root and Ingest v1
--
-- Forward-only consolidation of the owner intake and shared catalog candidates.
-- `public.products` becomes the only writable product identity root. Existing
-- Global Catalog UUIDs and immutable version UUIDs are preserved. The former
-- Global Catalog roots are retained as read-only archives behind compatibility
-- views; they can no longer create an independent identity.
--
-- This migration reads, but never mutates, mapper_basement. It does not change
-- Engine formulas or product science.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Canonical identity root
-- ---------------------------------------------------------------------------

alter table public.products alter column owner_user_id drop not null;
alter table public.products
  add column if not exists product_kind text,
  add column if not exists visibility text,
  add column if not exists owning_account_id uuid references auth.users(id) on delete set null,
  add column if not exists canonical_verification_status text,
  add column if not exists canonical_verification_method text,
  add column if not exists canonical_provenance text,
  add column if not exists explicitly_unbranded boolean not null default false,
  add column if not exists canonical_family text,
  add column if not exists normalized_identity text,
  add column if not exists search_document text not null default '',
  add column if not exists current_version_id uuid,
  add column if not exists current_behavior_binding_id uuid,
  add column if not exists merged_into_product_id uuid references public.products(id) on delete restrict;

update public.products
set product_kind=coalesce(product_kind,'commercial_product'),
    visibility=coalesce(visibility,'account_private'),
    owning_account_id=coalesce(owning_account_id,owner_user_id),
    canonical_verification_status=coalesce(
      canonical_verification_status,
      case when status='pi_verified' then 'verified' else 'blocked' end
    ),
    canonical_verification_method=coalesce(
      canonical_verification_method,
      case when status='pi_verified' then 'human' else 'blocked' end
    ),
    canonical_provenance=coalesce(canonical_provenance,source_type),
    normalized_identity=coalesce(
      nullif(normalized_identity,''),
      case when nullif(ean_code_normalized,'') is not null then 'ean:'||ean_code_normalized
      else 'identity:'||encode(extensions.digest(convert_to(
        lower(trim(coalesce(brand,'')))||'|'||lower(trim(coalesce(product_name_display,product_name_internal,'')))||'|'||lower(trim(coalesce(package_size,''))),
        'utf8'),'sha256'),'hex') end
    ),
    search_document=case when search_document='' then trim(concat_ws(' ',brand,product_name_display,product_name_internal,product_category,product_subcategory,ean_code,barcode)) else search_document end;

alter table public.products
  alter column product_kind set not null,
  alter column visibility set not null,
  alter column canonical_verification_status set not null,
  alter column canonical_verification_method set not null,
  alter column canonical_provenance set not null,
  alter column normalized_identity set not null;

alter table public.products
  add constraint products_canonical_kind_check check (product_kind in (
    'commercial_product','mapper_reference','internal_subproduct','shop_product',
    'franchise_product','internal_admin'
  )),
  add constraint products_canonical_visibility_check check (visibility in ('shared','account_private','internal')),
  add constraint products_canonical_verification_status_check check (canonical_verification_status in ('verified','manual_unverified','blocked')),
  add constraint products_canonical_verification_method_check check (canonical_verification_method in ('automatic','human','manual_unverified','blocked')),
  add constraint products_canonical_privacy_check check (
    (visibility='shared' and owning_account_id is null)
    or (visibility='account_private' and owning_account_id is not null)
    or visibility='internal'
  ),
  add constraint products_canonical_brand_check check (
    canonical_verification_status='blocked'
    or ((brand is not null and not explicitly_unbranded) or (brand is null and explicitly_unbranded))
  );

create index if not exists products_canonical_identity_idx on public.products(normalized_identity) where merged_into_product_id is null;
create unique index if not exists products_shared_ean_uniq
  on public.products(ean_code_normalized)
  where visibility='shared' and product_kind='commercial_product'
    and merged_into_product_id is null and ean_code_normalized<>'';
create index if not exists products_canonical_search_idx on public.products using gin(to_tsvector('simple',search_document));

-- Abort rather than silently merge an impossible UUID collision.
do $$
begin
  if exists (
    select 1 from public.global_catalog_products g
    join public.products p on p.id=g.id
    where p.normalized_identity is distinct from g.normalized_identity
  ) then
    raise exception 'canonical product UUID collision between products and global catalog';
  end if;
end $$;

-- Preserve every shared Global Catalog identity UUID in the canonical root.
insert into public.products(
  id,owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,
  product_category,country,status,source_type,dataset_version,is_active,created_at,updated_at,
  product_kind,visibility,owning_account_id,canonical_verification_status,
  canonical_verification_method,canonical_provenance,explicitly_unbranded,canonical_family,
  normalized_identity,search_document
)
select
  g.id,null,null,g.brand,v.ean,v.ean,g.original_name,g.display_name,
  g.category,g.country_of_origin,
  case when g.status='verified' then 'pi_verified' when g.status='manual_unverified' then 'manual_adjusted' else 'draft' end,
  'catalog_import','canonical-global-catalog-v1',g.is_active,g.created_at,g.updated_at,
  'commercial_product','shared',null,g.status,g.verification_method,g.provenance,
  g.explicitly_unbranded,g.canonical_family,g.normalized_identity,g.search_document
from public.global_catalog_products g
left join lateral (
  select x.ean from public.global_catalog_variants x
  where x.product_id=g.id and x.is_current order by x.created_at desc limit 1
) v on true
on conflict(id) do nothing;

-- Mapper Basement remains scientifically immutable, but every active Mapper
-- identity receives a deterministic canonical reference row. The following
-- 10400 classifier publishes the exact behavior binding; this migration never
-- derives or alters Mapper facts.
do $$
begin
  if exists(
    select 1 from public.mapper_basement m
    join public.products p on p.normalized_identity='mapper:'||m.ingredient_id
    where m.is_active and p.id<>md5(
      'pinguino:mapper-reference:'||m.dataset_version||':'||m.ingredient_id
    )::uuid
  ) then
    raise exception 'canonical Mapper reference UUID collision';
  end if;
end $$;

insert into public.products(
  id,owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,
  product_category,product_subcategory,country,status,source_type,dataset_version,is_active,
  product_kind,visibility,owning_account_id,canonical_verification_status,
  canonical_verification_method,canonical_provenance,explicitly_unbranded,normalized_identity,
  search_document
)
select
  md5('pinguino:mapper-reference:'||m.dataset_version||':'||m.ingredient_id)::uuid,
  null,null,m.brand,m.ean_code,m.ean_code,m.ingredient_name_internal,m.ingredient_name_display,
  m.ingredient_category,m.ingredient_subcategory,m.country,
  case when m.verification_status='verified' then 'pi_verified' else 'manual_adjusted' end,
  'catalog_import',m.dataset_version,true,
  'mapper_reference','internal',null,
  case when m.verification_status='verified' then 'verified' else 'manual_unverified' end,
  case when m.verification_status='verified' then 'human' else 'manual_unverified' end,
  'mapper_basement:'||m.dataset_version,m.brand is null,'mapper:'||m.ingredient_id,
  trim(concat_ws(' ',m.ingredient_id,m.ingredient_name_display,m.ingredient_name_internal,m.brand,
    m.ingredient_category,m.ingredient_subcategory,m.ean_code))
from public.mapper_basement m
where m.is_active
  and not exists(select 1 from public.products p where p.normalized_identity='mapper:'||m.ingredient_id);

-- Source rows already linked to a shared catalog identity remain as immutable
-- provenance rows, but are no longer independent active identities.
update public.products p
set merged_into_product_id=s.catalog_product_id,
    is_active=false
from (
  select distinct on(private_product_id) private_product_id,catalog_product_id
  from public.global_catalog_submissions
  where private_product_id is not null and catalog_product_id is not null
  order by private_product_id,created_at desc
) s
where p.id=s.private_product_id and p.id<>s.catalog_product_id;

-- ---------------------------------------------------------------------------
-- 2. Immutable versions, evidence, behavior, ingest, review and private overlay
-- ---------------------------------------------------------------------------

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version integer not null check(version>=1),
  facts jsonb not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  verification_status text not null check(verification_status in ('verified','manual_unverified','blocked')),
  verification_method text not null check(verification_method in ('automatic','human','manual_unverified','blocked')),
  provenance text not null,
  facts_fingerprint text not null check(facts_fingerprint ~ '^[0-9a-f]{64}$'),
  supersedes uuid references public.product_versions(id) deferrable initially deferred,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(product_id,version),
  unique(id,product_id)
);
create index product_versions_product_idx on public.product_versions(product_id,version desc);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  ean text,
  net_quantity numeric,
  net_unit text check(net_unit is null or net_unit in ('g','kg','ml','l')),
  market text not null default 'GLOBAL',
  package_language text,
  package_revision text,
  original_package_name text,
  image_phashes text[] not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  check(ean is null or ean ~ '^[0-9]{8,14}$'),
  check(net_quantity is null or net_quantity>0)
);
create unique index product_variants_ean_uniq on public.product_variants(ean) where ean is not null;
create index product_variants_product_market_idx on public.product_variants(product_id,market) where is_current;
create index product_variants_phash_idx on public.product_variants using gin(image_phashes);

insert into public.product_variants(
  id,product_id,ean,net_quantity,net_unit,market,package_language,package_revision,
  original_package_name,image_phashes,is_current,created_at
)
select id,product_id,ean,net_quantity,net_unit,market,package_language,package_revision,
  original_package_name,image_phashes,is_current,created_at
from public.global_catalog_variants;

create table public.product_variant_markets (
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  market text not null,
  package_language text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(variant_id,market)
);
insert into public.product_variant_markets select * from public.global_catalog_variant_markets;

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  alias text not null,
  normalized_alias text not null,
  language text,
  kind text not null check(kind in ('original_name','localized_name','canonical_family','synonym','ocr_variant')),
  created_at timestamptz not null default now(),
  unique(product_id,normalized_alias,language)
);
insert into public.product_aliases select * from public.global_catalog_aliases;

create table public.product_retailer_offers (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  retailer text not null,
  market text not null,
  source_url text,
  reference_price numeric,
  currency text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  check(reference_price is null or reference_price>=0),
  check((reference_price is null and currency is null)
    or (reference_price is not null and currency ~ '^[A-Z]{3}$'))
);
create unique index product_retailer_offer_identity_uniq
  on public.product_retailer_offers(variant_id,market,retailer);
insert into public.product_retailer_offers select * from public.global_catalog_retailer_offers;

create table public.product_behavior_bindings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null,
  mapper_ingredient_id text,
  taxonomy_version_id text references public.product_taxonomy_versions(id) on delete restrict,
  family_id text,
  subfamily_id text,
  form_id text,
  main_eligibility text not null check(main_eligibility in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','STRUCTURAL_ONLY',
    'PROTEIN_CONTRIBUTOR_ONLY','TOPPING_ONLY','NOT_MAIN','MAIN_BLOCKED_POLICY','UNKNOWN_REQUIRES_EVIDENCE'
  )),
  vegan_eligibility text not null check(vegan_eligibility in ('verified','false','unknown','conflict')),
  protein_behavior text not null check(protein_behavior in ('contributor','neutral','unknown')),
  approved_liquid_dairy_carrier boolean not null default false,
  profile_permissions jsonb not null default '{}'::jsonb,
  process_behavior jsonb not null default '{}'::jsonb,
  behavior_snapshot jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  block_reasons text[] not null default '{}',
  classifier_version text not null,
  binding_status text not null check(binding_status in ('ready','blocked')),
  classified_at timestamptz not null default now(),
  is_current boolean not null default true,
  foreign key(product_version_id,product_id) references public.product_versions(id,product_id) on delete restrict,
  unique(product_version_id,classifier_version),
  unique(id,product_id,product_version_id)
);
create unique index product_behavior_bindings_current_idx on public.product_behavior_bindings(product_id) where is_current;

create table public.product_ingest_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source text not null check(source in (
    'ocr','barcode','manual','admin','catalog_import','retailer_feed','spreadsheet',
    'supplier_specification','shop','franchise','internal_subproduct','future_integration'
  )),
  idempotency_key text not null,
  payload_fingerprint text not null check(payload_fingerprint ~ '^[0-9a-f]{64}$'),
  product_id uuid references public.products(id) on delete restrict,
  product_version_id uuid references public.product_versions(id) on delete restrict,
  behavior_binding_id uuid references public.product_behavior_bindings(id) on delete restrict,
  status text not null check(status in ('accepted','duplicate','blocked','review','retired')),
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(actor_user_id,source,idempotency_key)
);

create table public.product_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid references public.product_versions(id) on delete restrict,
  ingest_event_id uuid references public.product_ingest_events(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete set null,
  evidence_kind text not null,
  evidence jsonb not null default '{}'::jsonb,
  evidence_fingerprint text not null check(evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index product_evidence_product_idx on public.product_evidence(product_id,created_at desc);

create table public.product_review_cases (
  id uuid primary key default gen_random_uuid(),
  consolidation_key text not null unique,
  product_id uuid references public.products(id) on delete restrict,
  product_version_id uuid references public.product_versions(id) on delete restrict,
  kind text not null check(kind in ('manual_unverified','duplicate_dispute','verification_failed','correction','conflict','suspicious')),
  status text not null default 'open' check(status in ('open','needs_evidence','in_review','resolved','rejected')),
  priority text not null default 'normal' check(priority in ('normal','high','urgent')),
  submission_count integer not null default 1 check(submission_count>=1),
  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',
  duplicate_candidates jsonb not null default '[]'::jsonb,
  latest_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_product_relations (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  favorite boolean not null default false,
  recently_used_at timestamptz,
  private_price numeric check(private_price is null or private_price>=0),
  currency text check(currency is null or currency ~ '^[A-Z]{3}$'),
  supplier text,
  notes text,
  stock numeric check(stock is null or stock>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,product_id)
);

-- Immutable Mapper reference snapshots are an exact copy of the already
-- accepted Mapper row plus its stable join key. They are not new science and
-- Mapper Basement itself is never written.
insert into public.product_versions(
  product_id,version,facts,evidence_snapshot,verification_status,verification_method,
  provenance,facts_fingerprint,effective_at,created_at
)
select p.id,1,f.facts,'{}'::jsonb,p.canonical_verification_status,p.canonical_verification_method,
  p.canonical_provenance,encode(extensions.digest(convert_to(f.facts::text,'utf8'),'sha256'),'hex'),
  m.updated_at,m.created_at
from public.mapper_basement m
join public.products p on p.product_kind='mapper_reference'
  and p.normalized_identity='mapper:'||m.ingredient_id
cross join lateral (
  select jsonb_strip_nulls(to_jsonb(m)||jsonb_build_object(
    'mapperIngredientId',m.ingredient_id,'mapperDatasetVersion',m.dataset_version
  )) facts
) f;

update public.products p set current_version_id=v.id
from public.product_versions v
where p.product_kind='mapper_reference' and v.product_id=p.id and v.version=1;

-- Every pre-catalog private product gets one conservative immutable version.
insert into public.product_versions(
  product_id,version,facts,evidence_snapshot,verification_status,verification_method,
  provenance,facts_fingerprint,effective_at,created_at
)
select p.id,1,f.facts,'{}'::jsonb,p.canonical_verification_status,p.canonical_verification_method,
  p.canonical_provenance,
  encode(extensions.digest(convert_to(f.facts::text,'utf8'),'sha256'),'hex'),p.updated_at,p.created_at
from public.products p
cross join lateral (
  select jsonb_strip_nulls(to_jsonb(p)-array[
    'owner_user_id','created_by','owning_account_id','supplier','cost_per_kg','currency',
    'usage_notes','engine_notes','product_image_url','detected_text','extracted_json',
    'reviewed_by','review_notes','current_version_id','current_behavior_binding_id'
  ]) facts
) f
where p.product_kind<>'mapper_reference'
  and not exists(select 1 from public.global_catalog_products g where g.id=p.id);

-- Preserve Global Catalog version UUIDs, numbers and supersedes chains exactly.
insert into public.product_versions(
  id,product_id,version,facts,evidence_snapshot,verification_status,verification_method,
  provenance,facts_fingerprint,supersedes,effective_at,created_at
)
select v.id,v.product_id,v.version,v.snapshot,'{}'::jsonb,
  case
    when coalesce(v.snapshot->>'status','')='verified' or v.verification_method in ('automatic','human') then 'verified'
    when coalesce(v.snapshot->>'status','')='manual_unverified' or v.verification_method='manual_unverified' then 'manual_unverified'
    else 'blocked'
  end,
  case when v.verification_method in ('automatic','human','manual_unverified','blocked') then v.verification_method else 'blocked' end,
  v.provenance,encode(extensions.digest(convert_to(v.snapshot::text,'utf8'),'sha256'),'hex'),
  v.supersedes,v.effective_at,v.created_at
from public.global_catalog_product_versions v;

update public.products p
set current_version_id=coalesce(g.current_version_id,(
  select v.id from public.product_versions v where v.product_id=p.id order by v.version desc limit 1
))
from public.global_catalog_products g
where p.id=g.id;
update public.products p
set current_version_id=(select v.id from public.product_versions v where v.product_id=p.id order by v.version desc limit 1)
where current_version_id is null;

-- Preserve every existing catalog behavior binding UUID.
insert into public.product_behavior_bindings(
  id,product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,family_id,subfamily_id,form_id,
  main_eligibility,vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,
  profile_permissions,process_behavior,behavior_snapshot,warnings,block_reasons,classifier_version,
  binding_status,classified_at,is_current
)
select b.id,b.catalog_product_id,b.catalog_product_version_id,b.mapper_ingredient_id,b.taxonomy_version_id,
  b.family_id,b.subfamily_id,b.form_id,
  case when b.main_eligibility='UNKNOWN' then 'UNKNOWN_REQUIRES_EVIDENCE' else b.main_eligibility end,
  b.vegan_eligibility,b.protein_behavior,b.approved_liquid_dairy_carrier,
  b.profile_permissions,b.process_behavior,
  jsonb_build_object(
    'familyId',b.family_id,'subfamilyId',b.subfamily_id,'formId',b.form_id,
    'mainEligibility',b.main_eligibility,'profilePermissions',b.profile_permissions,
    'processBehavior',b.process_behavior
  ),
  b.warnings,b.block_reasons,b.classifier_version,
  case when p.canonical_verification_status='blocked' then 'blocked' else 'ready' end,
  b.classified_at,b.is_current
from public.catalog_product_behavior_bindings b
join public.products p on p.id=b.catalog_product_id;

-- No canonical product may be published without a binding. Missing legacy
-- behavior becomes explicitly blocked; no policy or Engine fact is invented.
insert into public.product_behavior_bindings(
  product_id,product_version_id,taxonomy_version_id,main_eligibility,vegan_eligibility,
  protein_behavior,profile_permissions,behavior_snapshot,warnings,block_reasons,
  classifier_version,binding_status,is_current
)
select p.id,p.current_version_id,
  (select id from public.product_taxonomy_versions where status='published' order by version desc limit 1),
  'UNKNOWN_REQUIRES_EVIDENCE','unknown','unknown','{}'::jsonb,
  jsonb_build_object('state','blocked','reason','canonical_behavior_backfill_required'),
  array['Behavior requires canonical classification.'],array['behavior_classification_required'],
  'canonical-backfill-v1','blocked',true
from public.products p
where p.current_version_id is not null
and p.product_kind<>'mapper_reference'
and not exists(select 1 from public.product_behavior_bindings b where b.product_id=p.id and b.is_current);

update public.products p set current_behavior_binding_id=b.id
from public.product_behavior_bindings b
where b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current;

-- Version/evidence recovery from both previous histories.
insert into public.product_evidence(product_id,product_version_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint,created_at)
select v.product_id,v.id,null,'legacy_global_version',v.evidence_snapshot,
  encode(extensions.digest(convert_to(v.evidence_snapshot::text,'utf8'),'sha256'),'hex'),v.created_at
from public.global_catalog_product_versions v where v.evidence_snapshot<>'{}'::jsonb;

insert into public.product_evidence(product_id,product_version_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint,created_at)
select s.product_id,p.current_version_id,s.owner_user_id,'legacy_product_snapshot',to_jsonb(s),
  encode(extensions.digest(convert_to(to_jsonb(s)::text,'utf8'),'sha256'),'hex'),s.created_at
from public.product_snapshots s join public.products p on p.id=s.product_id;

-- Private facts are never copied into shared product versions.
insert into public.user_product_relations(user_id,product_id,favorite,recently_used_at,private_price,currency,supplier,notes,stock)
select p.owner_user_id,coalesce(p.merged_into_product_id,p.id),false,null,p.cost_per_kg,p.currency,p.supplier,p.usage_notes,null
from public.products p where p.owner_user_id is not null
on conflict(user_id,product_id) do update set
  private_price=coalesce(excluded.private_price,user_product_relations.private_price),
  currency=coalesce(excluded.currency,user_product_relations.currency),
  supplier=coalesce(excluded.supplier,user_product_relations.supplier),
  notes=coalesce(excluded.notes,user_product_relations.notes),updated_at=now();

insert into public.user_product_relations(user_id,product_id,private_price,currency,supplier,notes,stock)
select user_id,catalog_product_id,private_price,currency,supplier,notes,stock from public.account_catalog_product_data
on conflict(user_id,product_id) do update set
  private_price=coalesce(excluded.private_price,user_product_relations.private_price),
  currency=coalesce(excluded.currency,user_product_relations.currency),
  supplier=coalesce(excluded.supplier,user_product_relations.supplier),
  notes=coalesce(excluded.notes,user_product_relations.notes),
  stock=coalesce(excluded.stock,user_product_relations.stock),updated_at=now();

insert into public.user_product_relations(user_id,product_id,favorite)
select user_id,catalog_product_id,true from public.global_catalog_favorites where catalog_product_id is not null
on conflict(user_id,product_id) do update set favorite=true,updated_at=now();

insert into public.user_product_relations(user_id,product_id,recently_used_at)
select user_id,catalog_product_id,last_used_at from public.global_catalog_recent_usage where catalog_product_id is not null
on conflict(user_id,product_id) do update set recently_used_at=greatest(user_product_relations.recently_used_at,excluded.recently_used_at),updated_at=now();

insert into public.product_review_cases(
  id,consolidation_key,product_id,product_version_id,kind,status,priority,submission_count,
  missing_fields,duplicate_candidates,latest_evidence,created_at,updated_at
)
select c.id,c.consolidation_key,c.catalog_product_id,p.current_version_id,c.kind,c.status,c.priority,c.submission_count,
  c.missing_fields,c.duplicate_candidates,c.latest_evidence,c.created_at,c.updated_at
from public.global_catalog_review_cases c left join public.products p on p.id=c.catalog_product_id;

-- Canonical current pointers are cross-product safe.
alter table public.products
  add constraint products_current_version_fk foreign key(current_version_id,id)
    references public.product_versions(id,product_id) deferrable initially deferred,
  add constraint products_current_behavior_binding_fk foreign key(current_behavior_binding_id,id,current_version_id)
    references public.product_behavior_bindings(id,product_id,product_version_id) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- 3. RLS and the single write boundary
-- ---------------------------------------------------------------------------

-- The version/backfill FKs are deliberately DEFERRABLE so the immutable
-- supersedes graph and current pointers can be copied in one transaction.
-- PostgreSQL will not ALTER a table while those constraint-trigger events are
-- still pending, so validate/flush them before enabling RLS.
set constraints all immediate;

alter table public.product_versions enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_markets enable row level security;
alter table public.product_aliases enable row level security;
alter table public.product_retailer_offers enable row level security;
alter table public.product_behavior_bindings enable row level security;
alter table public.product_ingest_events enable row level security;
alter table public.product_evidence enable row level security;
alter table public.product_review_cases enable row level security;
alter table public.user_product_relations enable row level security;

drop policy if exists products_select_own on public.products;
drop policy if exists products_insert_own on public.products;
drop policy if exists products_update_own on public.products;
drop policy if exists products_delete_own on public.products;
create policy products_canonical_read on public.products for select to authenticated using (
  merged_into_product_id is null and is_active and (
    owning_account_id=auth.uid() or created_by=auth.uid()
  )
);
create policy product_versions_canonical_read on public.product_versions for select to authenticated using (
  exists(select 1 from public.products p where p.id=product_id and p.merged_into_product_id is null and p.is_active
    and ((p.visibility='shared' and p.canonical_verification_status<>'blocked') or p.owning_account_id=auth.uid()
      or p.created_by=auth.uid()))
);
create policy product_behavior_bindings_canonical_read on public.product_behavior_bindings for select to authenticated using (
  exists(select 1 from public.products p where p.id=product_id and p.merged_into_product_id is null and p.is_active
    and ((p.visibility='shared' and p.canonical_verification_status<>'blocked') or p.owning_account_id=auth.uid()
      or p.created_by=auth.uid()))
);
create policy product_variants_canonical_read on public.product_variants for select to authenticated using (
  exists(select 1 from public.products p where p.id=product_id and p.is_active and p.merged_into_product_id is null
    and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
      or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
    ))
);
create policy product_aliases_canonical_read on public.product_aliases for select to authenticated using (
  exists(select 1 from public.products p where p.id=product_id and p.is_active and p.merged_into_product_id is null
    and p.visibility='shared' and p.canonical_verification_status<>'blocked')
);
create policy product_variant_markets_canonical_read on public.product_variant_markets for select to authenticated using (
  exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id
    where v.id=variant_id and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()))
);
create policy product_retailer_offers_canonical_read on public.product_retailer_offers for select to authenticated using (
  exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id
    where v.id=variant_id and p.is_active and p.merged_into_product_id is null
      and p.visibility='shared' and p.canonical_verification_status<>'blocked')
);
create policy product_ingest_events_own_read on public.product_ingest_events for select to authenticated using(actor_user_id=auth.uid());
create policy product_evidence_own_read on public.product_evidence for select to authenticated using(owner_user_id=auth.uid());
create or replace function public.can_use_product_relation_v1(
  p_user_id uuid,
  p_product_id uuid
) returns boolean
language sql stable security definer
set search_path=public
as $$
  select p_user_id is not null and exists(
    select 1 from public.products p
    where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
      and (
        (p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=p_user_id or p.created_by=p_user_id
        or exists(select 1 from public.product_ingest_events e
          where e.product_id=p.id and e.actor_user_id=p_user_id)
      )
  )
$$;
revoke all on function public.can_use_product_relation_v1(uuid,uuid) from public,anon,authenticated;
create policy user_product_relations_own on public.user_product_relations for all to authenticated
  using(user_id=auth.uid() and public.can_use_product_relation_v1(auth.uid(),product_id))
  with check(user_id=auth.uid() and public.can_use_product_relation_v1(auth.uid(),product_id));

revoke insert,update,delete on public.products from authenticated;
revoke insert on public.product_snapshots from authenticated;
grant select on public.products,public.product_versions,public.product_behavior_bindings,
  public.product_variants,public.product_variant_markets,public.product_aliases,
  public.product_retailer_offers to authenticated;
grant select on public.product_ingest_events,public.product_evidence to authenticated;
grant select,insert,update,delete on public.user_product_relations to authenticated;

-- Legacy ProductRow consumers need to hydrate an ingest result even when the
-- canonical shared identity was created by another account. Never grant broad
-- shared SELECT on the mixed legacy root: return an explicit account projection
-- with raw OCR, submitter and administrator-review fields removed.
create or replace function public.get_canonical_product_for_account_v1(
  p_product_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public
as $$
declare v_row jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select to_jsonb(p)||jsonb_build_object(
    'owner_user_id',auth.uid(),
    'created_by',case when p.created_by=auth.uid() then p.created_by else null end,
    'supplier',r.supplier,
    'cost_per_kg',r.private_price,
    'currency',r.currency,
    'usage_notes',r.note,
    'product_image_url',null,
    'detected_text',null,
    'extracted_json',null,
    'reviewed_by',null,
    'reviewed_at',null,
    'review_notes',null,
    'mapper_notes',null
  ) into v_row
  from public.products p
  left join public.user_product_relations r
    on r.product_id=p.id and r.user_id=auth.uid()
  where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
    and (
      (p.visibility='shared' and p.canonical_verification_status<>'blocked')
      or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
      or exists(select 1 from public.product_ingest_events e
        where e.product_id=p.id and e.actor_user_id=auth.uid())
    );
  return v_row;
end $$;
revoke all on function public.get_canonical_product_for_account_v1(uuid) from public,anon;
grant execute on function public.get_canonical_product_for_account_v1(uuid) to authenticated,service_role;

create or replace function public.canonical_product_write_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('app.canonical_product_ingest',true) is distinct from 'v1' then
    raise exception 'canonical product writes require ingest_product_v1';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger products_canonical_write_guard before insert or update or delete on public.products
for each row execute function public.canonical_product_write_guard();
create trigger product_behavior_bindings_write_guard before insert or update or delete on public.product_behavior_bindings
for each row execute function public.canonical_product_write_guard();
create trigger product_ingest_events_write_guard before insert or update or delete on public.product_ingest_events
for each row execute function public.canonical_product_write_guard();
create trigger product_review_cases_write_guard before insert or update or delete on public.product_review_cases
for each row execute function public.canonical_product_write_guard();

create or replace function public.canonical_product_immutable_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op<>'INSERT' or current_setting('app.canonical_product_ingest',true) is distinct from 'v1' then
    raise exception 'canonical product history is immutable and ingest-owned';
  end if;
  return new;
end;
$$;
create trigger product_versions_immutable before insert or update or delete on public.product_versions
for each row execute function public.canonical_product_immutable_guard();
create trigger product_evidence_immutable before insert or update or delete on public.product_evidence
for each row execute function public.canonical_product_immutable_guard();
create trigger product_variants_write_guard before insert or update or delete on public.product_variants
for each row execute function public.canonical_product_write_guard();
create trigger product_variant_markets_write_guard before insert or update or delete on public.product_variant_markets
for each row execute function public.canonical_product_write_guard();
create trigger product_aliases_write_guard before insert or update or delete on public.product_aliases
for each row execute function public.canonical_product_write_guard();
create trigger product_retailer_offers_write_guard before insert or update or delete on public.product_retailer_offers
for each row execute function public.canonical_product_write_guard();

-- Durable, cheap reservation before an adapter downloads, decodes, archives or
-- sends evidence to a paid verifier. This transaction commits independently of
-- the later canonical ingest, so malformed retries cannot roll the quota back.
create or replace function public.preflight_product_ingest_v1(
  p_actor_user_id uuid,
  p_source text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false,
  p_ocr_session_id uuid default null,
  p_duplicate_decision text default null,
  p_review_escalation boolean default false
) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_action text;
  v_result jsonb;
  v_dispute jsonb;
  v_review jsonb;
  v_completed jsonb;
  v_is_admin boolean;
begin
  if p_actor_user_id is null or p_source not in (
    'ocr','barcode','manual','admin','catalog_import','retailer_feed','spreadsheet',
    'supplier_specification','shop','franchise','internal_subproduct','future_integration'
  ) then raise exception 'invalid product ingest preflight'; end if;
  if p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid product ingest preflight hash'; end if;
  select exists(select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_is_admin;
  if p_source in ('admin','retailer_feed','supplier_specification','shop','franchise','future_integration')
    and not v_is_admin then
    raise exception 'privileged product source requires an active administrator';
  end if;
  if p_source='ocr' and not exists(
    select 1 from public.ocr_intake_sessions s
    where s.id=p_ocr_session_id and s.user_id=p_actor_user_id
      and s.state in ('ready_to_save','duplicate_blocked','saved')
      and exists(select 1 from public.ocr_intake_images i
        where i.session_id=s.id and i.state='ready')
  ) then raise exception 'owned saveable OCR session not found'; end if;
  if p_duplicate_decision is not null and p_duplicate_decision not in ('same','different') then
    raise exception 'invalid duplicate decision';
  end if;
  -- A barcode label supplied by a browser is not server evidence. Until the
  -- adapter can prove a scanner event it receives the conservative manual
  -- candidate quota; only an owned ready OCR session earns OCR capacity.
  v_action:=case when p_source='ocr' then 'ocr_scan' else 'manual_candidate' end;
  v_result:=public.reserve_global_catalog_rate_slot(
    p_actor_user_id,v_action,p_idempotency_key,p_payload_hash,
    p_ip_hash,p_device_hash,p_risk_challenge_passed
  );
  if not coalesce((v_result->>'allowed')::boolean,false) then return v_result; end if;
  select e.result_snapshot||jsonb_build_object('idempotent',true) into v_completed
  from public.product_ingest_events e
  where e.actor_user_id=p_actor_user_id and e.source=p_source
    and e.idempotency_key=p_idempotency_key;
  if found then
    return v_result||jsonb_build_object('completedResult',v_completed);
  end if;
  if p_duplicate_decision='different' then
    v_dispute:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'duplicate_dispute',left('duplicate:'||p_idempotency_key,160),p_payload_hash,
      p_ip_hash,p_device_hash,p_risk_challenge_passed
    );
    if not coalesce((v_dispute->>'allowed')::boolean,false) then return v_dispute; end if;
    v_result:=v_result||jsonb_build_object('disputeReservationId',v_dispute->>'reservationId');
  end if;
  if p_review_escalation then
    v_review:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'review_escalation',left('review:'||p_idempotency_key,160),p_payload_hash,
      p_ip_hash,p_device_hash,p_risk_challenge_passed
    );
    if not coalesce((v_review->>'allowed')::boolean,false) then return v_review; end if;
    v_result:=v_result||jsonb_build_object('reviewReservationId',v_review->>'reservationId');
  end if;
  return v_result;
end;
$$;
revoke all on function public.preflight_product_ingest_v1(
  uuid,text,text,text,text,text,boolean,uuid,text,boolean
) from public,anon,authenticated;
grant execute on function public.preflight_product_ingest_v1(
  uuid,text,text,text,text,text,boolean,uuid,text,boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. One service-role transactional authority
-- ---------------------------------------------------------------------------

create or replace function public.ingest_product_v1(
  p_actor_user_id uuid,
  p_source text,
  p_idempotency_key text,
  p_input jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_private_overlay jsonb default '{}'::jsonb,
  p_risk jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_payload_fingerprint text;
  v_prior public.product_ingest_events%rowtype;
  v_rate jsonb;
  v_dispute_rate jsonb;
  v_action text;
  v_kind text;
  v_visibility text;
  v_name text;
  v_brand text;
  v_unbranded boolean:=coalesce((p_input->>'explicitlyUnbranded')::boolean,false);
  v_ean text:=nullif(regexp_replace(coalesce(nullif(p_input->>'ean',''),p_input->>'barcode',''),'\D','','g'),'');
  v_identity text;
  v_facts jsonb;
  v_facts_fingerprint text;
  v_missing text[]:='{}';
  v_invalid text[]:='{}';
  v_status text;
  v_method text;
  v_product_id uuid;
  v_existing public.products%rowtype;
  v_version_id uuid;
  v_binding_id uuid;
  v_event_id uuid;
  v_review_id uuid;
  v_review_key text;
  v_next_version integer;
  v_result jsonb;
  v_outcome text;
  v_label_ready boolean:=false;
  v_behavior_status text;
  v_duplicate_decision text:=nullif(p_input->>'duplicateDecision','');
  v_duplicate_product_id uuid;
  v_disputed_product_id uuid;
  v_pending_candidate_id uuid;
  v_same_from_candidate boolean:=false;
  v_likely_duplicate boolean:=false;
  v_duplicate_candidates jsonb:='[]'::jsonb;
  v_image_phashes text[]:='{}';
  v_quantity numeric;
  v_unit text;
  v_variant_id uuid;
  v_operation text:=coalesce(nullif(p_input->>'operation',''),'upsert');
  v_requested_product_id uuid;
  v_expected_status_not text:=nullif(p_input->>'expectedStatusNot','');
  v_has_existing boolean:=false;
  v_is_admin boolean:=false;
  v_evidence_record jsonb:=p_evidence;
  v_match_count integer:=0;
  v_attested boolean:=false;
  v_expected_attested_fields jsonb;
  v_can_mutate_existing boolean:=false;
  v_lifecycle_decision text:=nullif(p_input->>'lifecycleDecision','');
  v_review_evidence jsonb:=coalesce(p_input->'reviewEvidence','{}'::jsonb);
  v_mapper_decision jsonb:=coalesce(p_input->'mapperDecision','{}'::jsonb);
  v_mapper_candidate jsonb:=coalesce(p_input->'mapperCandidate','{}'::jsonb);
  v_mapper_ingredient_id text;
  v_review_signoff_id uuid;
  v_rate_reservation_id uuid;
  v_dispute_reservation_id uuid;
  v_review_reservation_id uuid;
  v_rate_payload_hash text:=nullif(p_risk->>'preflightPayloadHash','');
begin
  if p_actor_user_id is null then raise exception 'authenticated actor is required'; end if;
  if p_source not in ('ocr','barcode','manual','admin','catalog_import','retailer_feed','spreadsheet',
    'supplier_specification','shop','franchise','internal_subproduct','future_integration') then
    raise exception 'unsupported product ingest source';
  end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 160 then raise exception 'invalid idempotency key'; end if;
  if jsonb_typeof(coalesce(p_input,'null'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_evidence,'null'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_private_overlay,'null'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_risk,'null'::jsonb))<>'object' then
    raise exception 'ingest payload blocks must be JSON objects';
  end if;
  if p_input ? 'facts' and jsonb_typeof(p_input->'facts')<>'object' then
    raise exception 'product facts must be a JSON object';
  end if;
  if v_duplicate_decision is not null and v_duplicate_decision not in ('same','different') then
    raise exception 'invalid duplicate decision';
  end if;
  if v_operation not in ('upsert','retire') then raise exception 'invalid product ingest operation'; end if;
  if v_lifecycle_decision is not null and v_lifecycle_decision not in (
    'draft','pi_calculated','pi_generated','manual_adjusted','pi_verified','rejected'
  ) then raise exception 'invalid product lifecycle decision'; end if;
  if v_lifecycle_decision is not null and jsonb_typeof(v_review_evidence)<>'object' then
    raise exception 'review evidence must be a JSON object';
  end if;
  if jsonb_typeof(v_mapper_decision)<>'object' or jsonb_typeof(v_mapper_candidate)<>'object' then
    raise exception 'Mapper decision and candidate must be JSON objects';
  end if;
  if nullif(p_input->>'productId','') is not null then
    begin v_requested_product_id:=(p_input->>'productId')::uuid;
    exception when invalid_text_representation then raise exception 'invalid product id'; end;
  end if;
  if nullif(p_input->>'duplicateProductId','') is not null then
    begin v_duplicate_product_id:=(p_input->>'duplicateProductId')::uuid;
    exception when invalid_text_representation then raise exception 'invalid duplicate product id'; end;
  end if;
  v_disputed_product_id:=coalesce(v_duplicate_product_id,v_requested_product_id);
  if v_requested_product_id is not null and v_duplicate_product_id is not null
    and v_requested_product_id<>v_duplicate_product_id then
    if v_duplicate_decision='same' then
      select exists(
        select 1 from public.product_review_cases r
        where r.product_id=v_requested_product_id and r.status<>'resolved'
          and exists(select 1 from jsonb_array_elements(r.duplicate_candidates) c
            where c->>'productId'=v_duplicate_product_id::text)
          and exists(select 1 from public.product_ingest_events e
            where e.product_id=v_requested_product_id and e.actor_user_id=p_actor_user_id)
      ) into v_same_from_candidate;
      if not v_same_from_candidate then raise exception 'duplicate candidate decision is not bound to review evidence'; end if;
      v_pending_candidate_id:=v_requested_product_id;
      v_requested_product_id:=null;
    elsif v_duplicate_decision='different' then
      -- The requested row is the separate pending candidate; the second UUID
      -- remains only the disputed comparison target.
      v_duplicate_product_id:=null;
    else
      raise exception 'productId and duplicateProductId conflict';
    end if;
  end if;
  if v_duplicate_product_id is not null and v_duplicate_decision is null then
    raise exception 'duplicate product id requires a duplicate decision';
  end if;
  if v_operation='retire' and v_requested_product_id is null then
    raise exception 'retire requires productId';
  end if;
  select exists(select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_is_admin;
  if p_source in ('admin','retailer_feed','supplier_specification','shop','franchise','future_integration')
    and not v_is_admin then
    raise exception 'privileged product source requires an active administrator';
  end if;
  if p_input->>'productKind'='internal_admin' and not v_is_admin then
    raise exception 'administrator internal product kind required';
  end if;
  if p_source='barcode' and (v_ean is null or not public.global_catalog_valid_gtin(v_ean)) then
    raise exception 'barcode source requires a valid GTIN';
  end if;
  select coalesce(array_agg(lower(value)),'{}'::text[]) into v_image_phashes
  from jsonb_array_elements_text(case when jsonb_typeof(p_evidence->'imagePhashes')='array'
    then p_evidence->'imagePhashes' else '[]'::jsonb end) h(value)
  where value ~* '^[0-9a-f]{16}$';

  v_payload_fingerprint:=encode(extensions.digest(convert_to(
    jsonb_build_object('source',p_source,'input',p_input,'evidence',p_evidence,'privateOverlay',p_private_overlay)::text,
    'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext('product-ingest:'||p_actor_user_id::text||':'||p_source||':'||p_idempotency_key));
  select * into v_prior from public.product_ingest_events
  where actor_user_id=p_actor_user_id and source=p_source and idempotency_key=p_idempotency_key;
  if found then
    if v_prior.payload_fingerprint<>v_payload_fingerprint then raise exception 'idempotency key payload mismatch'; end if;
    return v_prior.result_snapshot||jsonb_build_object('idempotent',true);
  end if;

  v_action:=case when p_source='ocr' then 'ocr_scan' else 'manual_candidate' end;
  begin v_rate_reservation_id:=(p_risk->>'rateReservationId')::uuid;
  exception when invalid_text_representation then raise exception 'invalid preprocessing rate reservation'; end;
  if v_rate_reservation_id is null or v_rate_payload_hash is null or not exists(
    select 1 from public.global_catalog_rate_events e
    where e.id=v_rate_reservation_id and e.user_id=p_actor_user_id
      and e.action=v_action and e.idempotency_key=p_idempotency_key
      and e.payload_hash=v_rate_payload_hash
  ) then raise exception 'valid preprocessing rate reservation required'; end if;
  update public.global_catalog_rate_events set consumed_at=coalesce(consumed_at,now())
  where id=v_rate_reservation_id;
  if v_duplicate_decision='different' then
    if coalesce(p_input->'distinguishingEvidence','{}'::jsonb)='{}'::jsonb then
      raise exception 'distinguishing duplicate evidence is required';
    end if;
    begin v_dispute_reservation_id:=(p_risk->>'disputeReservationId')::uuid;
    exception when invalid_text_representation then raise exception 'invalid duplicate dispute reservation'; end;
    if v_dispute_reservation_id is null or not exists(
      select 1 from public.global_catalog_rate_events e
      where e.id=v_dispute_reservation_id and e.user_id=p_actor_user_id
        and e.action='duplicate_dispute'
        and e.idempotency_key=left('duplicate:'||p_idempotency_key,160)
        and e.payload_hash=v_rate_payload_hash
    ) then raise exception 'valid duplicate dispute reservation required'; end if;
    update public.global_catalog_rate_events set consumed_at=coalesce(consumed_at,now())
    where id=v_dispute_reservation_id;
  end if;
  if v_lifecycle_decision is not null or v_mapper_decision<>'{}'::jsonb
    or v_mapper_candidate<>'{}'::jsonb then
    begin v_review_reservation_id:=(p_risk->>'reviewReservationId')::uuid;
    exception when invalid_text_representation then raise exception 'invalid review escalation reservation'; end;
    if v_review_reservation_id is null or not exists(
      select 1 from public.global_catalog_rate_events e
      where e.id=v_review_reservation_id and e.user_id=p_actor_user_id
        and e.action='review_escalation'
        and e.idempotency_key=left('review:'||p_idempotency_key,160)
        and e.payload_hash=v_rate_payload_hash
    ) then raise exception 'valid review escalation reservation required'; end if;
    update public.global_catalog_rate_events set consumed_at=coalesce(consumed_at,now())
    where id=v_review_reservation_id;
  end if;

  perform set_config('app.canonical_product_ingest','v1',true);
  -- Version-bound Mapper authorization is an administrator decision. A client
  -- match may be submitted separately as `mapperCandidate`, but it can create
  -- review evidence only and never reaches this branch.
  if v_mapper_decision<>'{}'::jsonb then
    if not v_is_admin then raise exception 'administrator Mapper decision required'; end if;
    if v_requested_product_id is null then raise exception 'Mapper decision requires productId'; end if;
    if not (v_mapper_decision ? 'mapperIngredientId') then
      raise exception 'Mapper decision requires mapperIngredientId, including explicit null for revocation';
    end if;
    v_mapper_ingredient_id:=nullif(trim(coalesce(v_mapper_decision->>'mapperIngredientId','')),'');
    if nullif(trim(coalesce(v_review_evidence->>'reviewedBy','')),'') is null
      or nullif(trim(coalesce(v_review_evidence->>'reviewNotes','')),'') is null then
      raise exception 'Mapper decision requires reviewer and review notes';
    end if;
    if nullif(v_review_evidence->>'reviewSignoffId','') is not null then
      begin v_review_signoff_id:=(v_review_evidence->>'reviewSignoffId')::uuid;
      exception when invalid_text_representation then raise exception 'invalid Mapper review signoff id'; end;
    end if;
    if v_mapper_ingredient_id is not null and v_review_signoff_id is null
      and not coalesce((v_review_evidence->>'independentProvenance')::boolean,false) then
      raise exception 'Mapper authorization requires a verified signoff or independent provenance';
    end if;
    if v_mapper_ingredient_id is not null and not exists(
      select 1 from public.mapper_basement m where m.ingredient_id=v_mapper_ingredient_id
        and m.is_active and m.approved_for_base and m.approved_for_engines
        and m.verification_status='verified'
    ) then raise exception 'Mapper authorization target is not active, approved and verified'; end if;
    if v_review_signoff_id is not null and not exists(
      select 1 from public.verification_signoffs s
      join public.verification_cases c on c.id=s.case_id
      where s.id=v_review_signoff_id and s.status='pi_verified' and c.state='verified'
        and s.revision=c.revision and s.policy_version=c.policy_version
        and (c.product_id=v_requested_product_id::text or exists(
          select 1 from public.products source_product
          where source_product.id::text=c.product_id
            and source_product.merged_into_product_id=v_requested_product_id
        ))
        and (v_mapper_ingredient_id is null or s.final_fields->>'matched_basement_id'=v_mapper_ingredient_id
          or exists(select 1 from jsonb_array_elements(
            case when jsonb_typeof(s.final_fields)='array' then s.final_fields else '[]'::jsonb end
          ) x where coalesce(x->>'field_key',x->>'key') in ('matched_basement_id','mapper_ingredient_id')
            and coalesce(x->>'normalized_value',x->>'value')=v_mapper_ingredient_id))
    ) then raise exception 'Mapper review signoff does not authorize this mapping'; end if;

    select * into v_existing from public.products p
    where p.id=v_requested_product_id and p.product_kind<>'mapper_reference'
      and p.merged_into_product_id is null and p.is_active for update;
    if not found then raise exception 'active canonical product not found for Mapper decision'; end if;
    v_product_id:=v_existing.id;
    v_version_id:=v_existing.current_version_id;
    v_binding_id:=v_existing.current_behavior_binding_id;
    if v_version_id is null or v_binding_id is null or not exists(
      select 1 from public.product_behavior_bindings b
      where b.id=v_binding_id and b.product_id=v_product_id
        and b.product_version_id=v_version_id and b.is_current
    ) then raise exception 'Mapper decision requires an exact current version and behavior binding'; end if;
    if v_expected_status_not is not null and
      (v_existing.status=v_expected_status_not or v_existing.canonical_verification_status=v_expected_status_not) then
      raise exception 'product status guard refused operation';
    end if;

    update public.product_behavior_bindings set is_current=false
    where product_id=v_product_id and is_current;
    insert into public.product_behavior_bindings(
      product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,family_id,subfamily_id,form_id,
      main_eligibility,vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,
      profile_permissions,process_behavior,behavior_snapshot,warnings,block_reasons,
      classifier_version,binding_status,is_current
    )
    select b.product_id,b.product_version_id,v_mapper_ingredient_id,b.taxonomy_version_id,
      b.family_id,b.subfamily_id,b.form_id,'UNKNOWN_REQUIRES_EVIDENCE',b.vegan_eligibility,
      b.protein_behavior,false,'{}'::jsonb,b.process_behavior,
      b.behavior_snapshot||jsonb_build_object(
        'mappingDecision','pending_reclassification','mapperIngredientId',v_mapper_ingredient_id,
        'reviewSignoffId',v_review_signoff_id
      ),b.warnings,array['behavior_reclassification_required'],
      'admin-mapper-decision:'||left(v_payload_fingerprint,24),'blocked',true
    from public.product_behavior_bindings b where b.id=v_binding_id
    returning id into v_binding_id;
    update public.products set current_behavior_binding_id=v_binding_id where id=v_product_id;
    -- 10400 replaces this provisional binding synchronously. Failure rolls the
    -- mapping decision, evidence and all current pointers back together.
    v_binding_id:=public.classify_catalog_product_behavior_v2(
      v_version_id,'mapper-decision:'||left(v_payload_fingerprint,24)
    );
    update public.products set
      mapper_status=case when v_mapper_ingredient_id is null then 'rejected' else 'matched' end,
      matched_basement_id=v_mapper_ingredient_id,
      match_method='manual_mapping',
      match_confidence=case when v_mapper_ingredient_id is null then 'rejected' else 'high' end,
      needs_review_reason=case when v_mapper_ingredient_id is null
        then 'Mapper candidate rejected by authorized reviewer.' else null end,
      mapper_notes=v_review_evidence->>'reviewNotes',
      reviewed_by=p_actor_user_id,reviewed_at=now(),updated_at=now()
    where id=v_product_id;
    insert into public.product_ingest_events(
      actor_user_id,source,idempotency_key,payload_fingerprint,product_id,product_version_id,
      behavior_binding_id,status,result_snapshot
    ) values(
      p_actor_user_id,p_source,p_idempotency_key,v_payload_fingerprint,v_product_id,v_version_id,
      v_binding_id,'accepted','{}'::jsonb
    ) returning id into v_event_id;
    v_evidence_record:=p_evidence||jsonb_build_object(
      'mapperDecision',v_mapper_decision,'reviewEvidence',v_review_evidence
    );
    insert into public.product_evidence(
      product_id,product_version_id,ingest_event_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint
    ) values(
      v_product_id,v_version_id,v_event_id,p_actor_user_id,'admin_mapper_decision',v_evidence_record,
      encode(extensions.digest(convert_to(v_evidence_record::text,'utf8'),'sha256'),'hex')
    );
    v_result:=jsonb_build_object(
      'schemaVersion',1,'kind','updated','productId',v_product_id,
      'productVersionId',v_version_id,'behaviorBindingId',v_binding_id,
      'ingestEventId',v_event_id,'productCode',v_existing.product_code,
      'status',v_existing.canonical_verification_status,
      'verificationMethod',v_existing.canonical_verification_method,
      'mapperIngredientId',v_mapper_ingredient_id,
      'autoFavorited',coalesce((select favorite from public.user_product_relations
        where user_id=p_actor_user_id and product_id=v_product_id),false),
      'reviewCaseKey',null,'idempotent',false,'missingFields',jsonb_build_array(),
      'invalidFields',jsonb_build_array(),'duplicateCandidates',jsonb_build_array()
    );
    update public.product_ingest_events set result_snapshot=v_result where id=v_event_id;
    return v_result;
  end if;

  -- Administrative lifecycle is a narrow decision path through the same
  -- authority; clients can neither set canonical GREEN nor write the root.
  if v_lifecycle_decision is not null then
    if not v_is_admin then raise exception 'administrator lifecycle decision required'; end if;
    if v_requested_product_id is null then raise exception 'lifecycle decision requires productId'; end if;
    select * into v_existing from public.products p
    where p.id=v_requested_product_id and p.merged_into_product_id is null and p.is_active for update;
    if not found then raise exception 'product not found for lifecycle decision'; end if;
    if v_expected_status_not is not null and
      (v_existing.status=v_expected_status_not or v_existing.canonical_verification_status=v_expected_status_not) then
      raise exception 'product status guard refused operation';
    end if;
    if nullif(trim(coalesce(v_review_evidence->>'reviewedBy','')),'') is null
      or nullif(trim(coalesce(v_review_evidence->>'reviewNotes','')),'') is null then
      raise exception 'lifecycle decision requires reviewer and review notes';
    end if;
    if v_lifecycle_decision='pi_verified' and not (
      coalesce((v_review_evidence->>'independentProvenance')::boolean,false)
      and coalesce((v_review_evidence->>'redFlagsClear')::boolean,false)
    ) then raise exception 'PI Verified lifecycle decision requires independent provenance and clean red flags'; end if;
    v_product_id:=v_existing.id;
    v_version_id:=v_existing.current_version_id;
    v_binding_id:=v_existing.current_behavior_binding_id;
    if v_version_id is null or v_binding_id is null then
      raise exception 'lifecycle decision requires an exact current version and behavior binding';
    end if;
    if v_lifecycle_decision in ('pi_verified','rejected') and (
      (v_lifecycle_decision='pi_verified' and v_existing.canonical_verification_status<>'verified')
      or (v_lifecycle_decision='rejected' and v_existing.canonical_verification_status<>'blocked')
    ) then
      select coalesce(max(version),0)+1 into v_next_version
      from public.product_versions where product_id=v_product_id;
      insert into public.product_versions(
        product_id,version,facts,evidence_snapshot,verification_status,verification_method,
        provenance,facts_fingerprint,supersedes
      )
      select v_product_id,v_next_version,v.facts,'{}'::jsonb,
        case when v_lifecycle_decision='pi_verified' then 'verified' else 'blocked' end,
        case when v_lifecycle_decision='pi_verified' then 'human' else 'blocked' end,
        'admin_lifecycle',v.facts_fingerprint,v.id
      from public.product_versions v where v.id=v_version_id and v.product_id=v_product_id
      returning id into v_version_id;
      update public.product_behavior_bindings set is_current=false
      where product_id=v_product_id and is_current;
      insert into public.product_behavior_bindings(
        product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,family_id,subfamily_id,form_id,
        main_eligibility,vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,
        profile_permissions,process_behavior,behavior_snapshot,warnings,block_reasons,
        classifier_version,binding_status,is_current
      )
      select v_product_id,v_version_id,b.mapper_ingredient_id,b.taxonomy_version_id,b.family_id,b.subfamily_id,b.form_id,
        case when v_lifecycle_decision='rejected' then 'NOT_MAIN' else b.main_eligibility end,
        b.vegan_eligibility,b.protein_behavior,b.approved_liquid_dairy_carrier,
        case when v_lifecycle_decision='rejected' then '{}'::jsonb else b.profile_permissions end,
        b.process_behavior,b.behavior_snapshot||jsonb_build_object(
          'lifecycleDecision',v_lifecycle_decision,'reviewedAt',now()
        ),b.warnings,
        case when v_lifecycle_decision='rejected' then array_append(b.block_reasons,'product_rejected')
          else b.block_reasons end,
        'admin-lifecycle-v1:'||v_version_id::text,
        case when v_lifecycle_decision='rejected' then 'blocked' else b.binding_status end,true
      from public.product_behavior_bindings b where b.id=v_binding_id and b.product_id=v_product_id
      returning id into v_binding_id;
      update public.products set
        current_version_id=v_version_id,current_behavior_binding_id=v_binding_id,
        canonical_verification_status=case
          when v_lifecycle_decision='pi_verified' then 'verified' else 'blocked' end,
        canonical_verification_method=case
          when v_lifecycle_decision='pi_verified' then 'human' else 'blocked' end
      where id=v_product_id;
      v_binding_id:=public.classify_catalog_product_behavior_v2(
        v_version_id,'lifecycle-decision:'||left(v_payload_fingerprint,24)
      );
    end if;
    update public.products set
      status=v_lifecycle_decision,
      canonical_verification_status=case
        when v_lifecycle_decision='pi_verified' then 'verified'
        when v_lifecycle_decision='rejected' then 'blocked'
        else canonical_verification_status end,
      canonical_verification_method=case
        when v_lifecycle_decision='pi_verified' then 'human'
        when v_lifecycle_decision='rejected' then 'blocked'
        else canonical_verification_method end,
      reviewed_by=p_actor_user_id,reviewed_at=now(),review_notes=v_review_evidence->>'reviewNotes',updated_at=now()
      ,current_version_id=v_version_id,current_behavior_binding_id=v_binding_id
    where id=v_product_id;
    v_outcome:=case when v_lifecycle_decision='rejected' then 'blocked' else 'accepted' end;
    insert into public.product_ingest_events(
      actor_user_id,source,idempotency_key,payload_fingerprint,product_id,product_version_id,
      behavior_binding_id,status,result_snapshot
    ) values(
      p_actor_user_id,p_source,p_idempotency_key,v_payload_fingerprint,v_product_id,v_version_id,
      v_binding_id,v_outcome,'{}'::jsonb
    ) returning id into v_event_id;
    insert into public.product_evidence(
      product_id,product_version_id,ingest_event_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint
    ) values(
      v_product_id,v_version_id,v_event_id,p_actor_user_id,'admin_lifecycle',v_review_evidence,
      encode(extensions.digest(convert_to(v_review_evidence::text,'utf8'),'sha256'),'hex')
    );
    v_result:=jsonb_build_object(
      'schemaVersion',1,'kind','updated','productId',v_product_id,
      'productVersionId',v_version_id,'behaviorBindingId',v_binding_id,
      'ingestEventId',v_event_id,'productCode',v_existing.product_code,
      'status',(select canonical_verification_status from public.products where id=v_product_id),
      'lifecycleStatus',v_lifecycle_decision,
      'verificationMethod',(select canonical_verification_method from public.products where id=v_product_id),
      'autoFavorited',coalesce((select favorite from public.user_product_relations
        where user_id=p_actor_user_id and product_id=v_product_id),false),
      'reviewCaseKey',null,'idempotent',false,'missingFields',jsonb_build_array(),
      'invalidFields',jsonb_build_array(),'duplicateCandidates',jsonb_build_array()
    );
    update public.product_ingest_events set result_snapshot=v_result where id=v_event_id;
    return v_result;
  end if;

  -- Retirement is a canonical soft delete: identity, versions, behavior and
  -- evidence remain immutable. A customer may retire only an account-private
  -- product they own. Shared/internal retirement is an explicit admin action.
  if v_operation='retire' then
    select * into v_existing from public.products p
    where p.id=v_requested_product_id and p.merged_into_product_id is null and p.is_active
      and ((p.visibility='account_private' and p.owning_account_id=p_actor_user_id) or v_is_admin)
    for update;
    if not found then raise exception 'product not found or retirement is not authorized'; end if;
    if v_expected_status_not is not null and
      (v_existing.status=v_expected_status_not or v_existing.canonical_verification_status=v_expected_status_not) then
      raise exception 'product status guard refused operation';
    end if;
    v_product_id:=v_existing.id;
    v_version_id:=v_existing.current_version_id;
    v_binding_id:=v_existing.current_behavior_binding_id;
    update public.products set is_active=false,updated_at=now() where id=v_product_id;
    insert into public.product_ingest_events(
      actor_user_id,source,idempotency_key,payload_fingerprint,product_id,product_version_id,
      behavior_binding_id,status,result_snapshot
    ) values(
      p_actor_user_id,p_source,p_idempotency_key,v_payload_fingerprint,v_product_id,v_version_id,
      v_binding_id,'retired','{}'::jsonb
    ) returning id into v_event_id;
    insert into public.product_evidence(
      product_id,product_version_id,ingest_event_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint
    ) values(
      v_product_id,v_version_id,v_event_id,p_actor_user_id,p_source||'_retire',p_evidence,
      encode(extensions.digest(convert_to(p_evidence::text,'utf8'),'sha256'),'hex')
    );
    v_result:=jsonb_build_object(
      'schemaVersion',1,'kind','retired','productId',v_product_id,
      'productVersionId',v_version_id,'behaviorBindingId',v_binding_id,
      'ingestEventId',v_event_id,'productCode',v_existing.product_code,
      'status',v_existing.canonical_verification_status,
      'verificationMethod',v_existing.canonical_verification_method,
      'autoFavorited',coalesce((select favorite from public.user_product_relations
        where user_id=p_actor_user_id and product_id=v_product_id),false),
      'reviewCaseKey',null,'idempotent',false,'missingFields',jsonb_build_array(),
      'invalidFields',jsonb_build_array(),'duplicateCandidates',jsonb_build_array()
    );
    update public.product_ingest_events set result_snapshot=v_result where id=v_event_id;
    return v_result;
  end if;

  v_kind:=case
    when p_source='internal_subproduct' then 'internal_subproduct'
    when p_source='shop' then 'shop_product'
    when p_source='franchise' then 'franchise_product'
    when p_source='admin' and p_input->>'productKind'='internal_admin' then 'internal_admin'
    else 'commercial_product' end;
  v_visibility:=case when v_kind in ('internal_subproduct','internal_admin') then
    case when v_kind='internal_admin' then 'internal' else 'account_private' end else 'shared' end;
  v_name:=nullif(trim(coalesce(p_input->>'displayName',p_input->>'originalName','')),'');
  v_brand:=nullif(trim(coalesce(p_input->>'brand','')),'');
  if v_ean is not null and v_ean !~ '^[0-9]{8,14}$' then
    v_invalid:=array_append(v_invalid,'ean');
    v_ean:=null;
  end if;
  if v_name is null then v_missing:=array_append(v_missing,'product_name'); end if;
  if v_brand is null and not v_unbranded then v_missing:=array_append(v_missing,'brand_or_unbranded'); end if;
  if v_brand is not null and v_unbranded then v_invalid:=array_append(v_invalid,'brand_unbranded_conflict'); end if;
  v_identity:=case when v_ean is not null then 'ean:'||v_ean else
    'identity:'||encode(extensions.digest(convert_to(
      lower(coalesce(v_brand,''))||'|'||lower(coalesce(v_name,''))||'|'||
      lower(coalesce(p_input->>'category',''))||'|'||
      lower(coalesce(p_input->>'packageSize',p_input#>>'{facts,packageSize}','')),
      'utf8'),'sha256'),'hex') end;
  if v_duplicate_decision='different' then
    v_identity:=v_identity||':variant:'||left(v_payload_fingerprint,16);
    -- A confirmed distinct variant must become its own candidate. The disputed
    -- product remains evidence for review; it is never used as the write target.
    if v_requested_product_id is null then v_duplicate_product_id:=null; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('canonical-product-identity:'||v_identity));

  if v_requested_product_id is not null then
    select * into v_existing from public.products p where p.id=v_requested_product_id
      and p.is_active and p.merged_into_product_id is null
      and (p.owning_account_id=p_actor_user_id or p.created_by=p_actor_user_id or v_is_admin)
    for update;
    if not found then raise exception 'product not found or update is not authorized'; end if;
  elsif v_duplicate_product_id is not null then
    select * into v_existing from public.products p where p.id=v_duplicate_product_id
      and p.is_active and p.merged_into_product_id is null
      and (p.visibility='shared' or p.owning_account_id=p_actor_user_id or v_is_admin)
    for update;
    if not found then raise exception 'duplicate product candidate is not accessible'; end if;
  else
    select count(*) into v_match_count from public.products p
    where p.is_active and p.merged_into_product_id is null
      and ((v_visibility='shared' and p.visibility='shared') or (v_visibility<>'shared' and p.owning_account_id=p_actor_user_id))
      and ((v_ean is not null and p.ean_code_normalized=v_ean) or p.normalized_identity=v_identity);
    if v_match_count>1 then raise exception 'canonical product identity is ambiguous'; end if;
    select * into v_existing from public.products p
    where p.is_active and p.merged_into_product_id is null
      and ((v_visibility='shared' and p.visibility='shared') or (v_visibility<>'shared' and p.owning_account_id=p_actor_user_id))
      and ((v_ean is not null and p.ean_code_normalized=v_ean) or p.normalized_identity=v_identity)
    order by (v_ean is not null and p.ean_code_normalized=v_ean) desc,p.created_at limit 1
    for update;
  end if;
  v_has_existing:=found;
  if not v_has_existing and v_duplicate_decision is null and cardinality(v_image_phashes)>0
    and v_visibility='shared' then
    with distances as (
      select pv.product_id,min(public.global_catalog_phash_distance(incoming.hash,stored.hash)) as distance
      from public.product_variants pv
      cross join lateral unnest(pv.image_phashes) stored(hash)
      cross join lateral unnest(v_image_phashes) incoming(hash)
      join public.products p on p.id=pv.product_id and p.is_active and p.merged_into_product_id is null
        and p.visibility='shared' and p.canonical_verification_status<>'blocked'
      where pv.is_current and public.global_catalog_phash_distance(incoming.hash,stored.hash)<=4
      group by pv.product_id
    ), candidates as (
      select p.id,p.product_name_display,p.brand,d.distance,pv.ean,pv.net_quantity,pv.net_unit,pv.market
      from distances d join public.products p on p.id=d.product_id
      left join lateral (
        select x.ean,x.net_quantity,x.net_unit,x.market from public.product_variants x
        where x.product_id=p.id and x.is_current order by x.created_at desc,x.id limit 1
      ) pv on true
      order by d.distance,p.product_name_display,p.id limit 5
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId',id,'displayName',product_name_display,'brand',brand,'ean',ean,
      'netQuantity',case when net_quantity is null then null else net_quantity::text||coalesce(net_unit,'') end,
      'market',market,'score',round(greatest(0,1-distance::numeric/64),4),
      'reasons',jsonb_build_array('image_phash')
    )),'[]'::jsonb) into v_duplicate_candidates from candidates;
    if jsonb_array_length(v_duplicate_candidates)>0 then
      v_likely_duplicate:=true;
      v_status:='blocked';
      v_method:='blocked';
      if not 'duplicate_confirmation'=any(v_missing) then
        v_missing:=array_append(v_missing,'duplicate_confirmation');
      end if;
      v_identity:=v_identity||':candidate:'||left(v_payload_fingerprint,16);
      perform pg_advisory_xact_lock(hashtext('canonical-product-identity:'||v_identity));
    end if;
  end if;
  v_can_mutate_existing:=v_has_existing and (
    v_is_admin or v_existing.owning_account_id=p_actor_user_id or v_existing.created_by=p_actor_user_id
  );
  if v_has_existing and v_expected_status_not is not null and
    (v_existing.status=v_expected_status_not or v_existing.canonical_verification_status=v_expected_status_not) then
    raise exception 'product status guard refused operation';
  end if;
  if v_requested_product_id is not null and exists(
    select 1 from public.products p where p.id<>v_requested_product_id
      and p.is_active and p.merged_into_product_id is null
      and ((v_existing.visibility='shared' and p.visibility='shared')
        or (v_existing.visibility<>'shared' and p.owning_account_id=p_actor_user_id))
      and ((v_ean is not null and p.ean_code_normalized=v_ean) or p.normalized_identity=v_identity)
  ) then
    raise exception 'canonical identity belongs to another product';
  end if;
  if v_duplicate_decision='same' and v_duplicate_product_id is not null and not v_same_from_candidate and not (
    (v_ean is not null and v_existing.ean_code_normalized=v_ean)
    or v_existing.normalized_identity=v_identity
  ) then
    raise exception 'duplicate product decision does not match canonical identity';
  end if;

  -- Public version facts are an explicit server allowlist. The caller cannot
  -- smuggle account-private data, prices or technical/behavior meaning into a
  -- cross-account immutable product version through an open JSON object.
  v_facts:=jsonb_strip_nulls(jsonb_build_object(
    'packageSize',p_input#>'{facts,packageSize}',
    'netQuantityText',p_input#>'{facts,netQuantityText}',
    'ingredientsText',p_input#>'{facts,ingredientsText}',
    'allergensText',p_input#>'{facts,allergensText}',
    'declaredAllergens',case when jsonb_typeof(p_input#>'{facts,declaredAllergens}')='array'
      then p_input#>'{facts,declaredAllergens}' else null end,
    'mayContainAllergens',case when jsonb_typeof(p_input#>'{facts,mayContainAllergens}')='array'
      then p_input#>'{facts,mayContainAllergens}' else null end,
    'nutrition',case when jsonb_typeof(p_input#>'{facts,nutrition}')='object' then
      jsonb_strip_nulls(jsonb_build_object(
        'basis',p_input#>'{facts,nutrition,basis}',
        'energyKcal',p_input#>'{facts,nutrition,energyKcal}',
        'fat',p_input#>'{facts,nutrition,fat}',
        'saturatedFat',p_input#>'{facts,nutrition,saturatedFat}',
        'carbohydrate',p_input#>'{facts,nutrition,carbohydrate}',
        'sugars',p_input#>'{facts,nutrition,sugars}',
        'protein',p_input#>'{facts,nutrition,protein}',
        'salt',p_input#>'{facts,nutrition,salt}',
        'fibre',p_input#>'{facts,nutrition,fibre}'
      )) else null end,
    'vegan',case when jsonb_typeof(p_input#>'{facts,vegan}')='boolean'
      then p_input#>'{facts,vegan}' else null end,
    'dairyFree',case when jsonb_typeof(p_input#>'{facts,dairyFree}')='boolean'
      then p_input#>'{facts,dairyFree}' else null end,
    'glutenFree',case when jsonb_typeof(p_input#>'{facts,glutenFree}')='boolean'
      then p_input#>'{facts,glutenFree}' else null end,
    'displayName',v_name,'originalName',nullif(trim(coalesce(p_input->>'originalName','')),''),
    'originalLanguage',nullif(trim(coalesce(p_input->>'originalLanguage','')),''),
    'brand',v_brand,'explicitlyUnbranded',v_unbranded,
    'category',p_input->>'category','countryOfOrigin',p_input->>'countryOfOrigin','ean',v_ean,
    'market',p_input->>'market','retailer',p_input->>'retailer','packageLanguage',p_input->>'packageLanguage'
  ));

  if not (
    nullif(trim(coalesce(v_facts->>'packageSize','')),'') is not null
    or nullif(trim(coalesce(v_facts->>'netQuantityText','')),'') is not null
    or nullif(trim(coalesce(v_facts->>'ingredientsText','')),'') is not null
    or nullif(trim(coalesce(v_facts->>'allergensText','')),'') is not null
    or (jsonb_typeof(v_facts->'nutrition')='object' and v_facts->'nutrition'<>'{}'::jsonb)
    or v_facts ? 'vegan' or v_facts ? 'dairyFree' or v_facts ? 'glutenFree'
  ) then
    v_missing:=array_append(v_missing,'product_facts');
  end if;

  -- Manual/adapter evidence is checked with the same deterministic label
  -- coherence rules used by GREEN. Incomplete data stays RED; impossible data
  -- can never become a shared BLUE label/Topping fact set.
  if jsonb_typeof(v_facts->'nutrition')='object' and v_facts->'nutrition'<>'{}'::jsonb then
    if coalesce(v_facts#>>'{nutrition,basis}','') not in ('per_100g','per_100ml') then
      v_invalid:=array_append(v_invalid,'nutrition_basis');
    end if;
    if jsonb_typeof(v_facts#>'{nutrition,energyKcal}')<>'number' then v_missing:=array_append(v_missing,'nutrition_energy'); end if;
    if jsonb_typeof(v_facts#>'{nutrition,fat}')<>'number' then v_missing:=array_append(v_missing,'nutrition_fat'); end if;
    if jsonb_typeof(v_facts#>'{nutrition,carbohydrate}')<>'number' then v_missing:=array_append(v_missing,'nutrition_carbohydrate'); end if;
    if jsonb_typeof(v_facts#>'{nutrition,protein}')<>'number' then v_missing:=array_append(v_missing,'nutrition_protein'); end if;
    if jsonb_typeof(v_facts#>'{nutrition,salt}')<>'number' then v_missing:=array_append(v_missing,'nutrition_salt'); end if;
    foreach v_unit in array array['saturatedFat','sugars','fibre'] loop
      if v_facts->'nutrition' ? v_unit
        and jsonb_typeof(v_facts#>array['nutrition',v_unit])<>'number' then
        v_invalid:=array_append(v_invalid,'nutrition_'||lower(v_unit)||'_type');
      end if;
    end loop;
    if jsonb_typeof(v_facts#>'{nutrition,energyKcal}')='number'
      and (v_facts#>>'{nutrition,energyKcal}')::numeric not between 0 and 1000 then
      v_invalid:=array_append(v_invalid,'nutrition_energy_range');
    end if;
    foreach v_unit in array array['fat','carbohydrate','protein','salt','saturatedFat','sugars','fibre'] loop
      if jsonb_typeof(v_facts#>array['nutrition',v_unit])='number'
        and (v_facts#>>array['nutrition',v_unit])::numeric not between 0 and 100 then
        v_invalid:=array_append(v_invalid,'nutrition_'||lower(v_unit)||'_range');
      end if;
    end loop;
    if jsonb_typeof(v_facts#>'{nutrition,saturatedFat}')='number'
      and jsonb_typeof(v_facts#>'{nutrition,fat}')='number'
      and (v_facts#>>'{nutrition,saturatedFat}')::numeric>(v_facts#>>'{nutrition,fat}')::numeric+0.01 then
      v_invalid:=array_append(v_invalid,'nutrition_saturated_fat_conflict');
    end if;
    if jsonb_typeof(v_facts#>'{nutrition,sugars}')='number'
      and jsonb_typeof(v_facts#>'{nutrition,carbohydrate}')='number'
      and (v_facts#>>'{nutrition,sugars}')::numeric>(v_facts#>>'{nutrition,carbohydrate}')::numeric+0.01 then
      v_invalid:=array_append(v_invalid,'nutrition_sugars_conflict');
    end if;
    if jsonb_typeof(v_facts#>'{nutrition,fat}')='number'
      and jsonb_typeof(v_facts#>'{nutrition,carbohydrate}')='number'
      and jsonb_typeof(v_facts#>'{nutrition,protein}')='number'
      and jsonb_typeof(v_facts#>'{nutrition,salt}')='number' then
      if (v_facts#>>'{nutrition,fat}')::numeric
        +(v_facts#>>'{nutrition,carbohydrate}')::numeric
        +(v_facts#>>'{nutrition,protein}')::numeric
        +case when jsonb_typeof(v_facts#>'{nutrition,fibre}')='number'
          then (v_facts#>>'{nutrition,fibre}')::numeric else 0 end
        +(v_facts#>>'{nutrition,salt}')::numeric>105 then
        v_invalid:=array_append(v_invalid,'nutrition_macro_mass_conflict');
      end if;
      if jsonb_typeof(v_facts#>'{nutrition,energyKcal}')='number' and abs(
        (v_facts#>>'{nutrition,energyKcal}')::numeric-(
          (v_facts#>>'{nutrition,fat}')::numeric*9
          +(v_facts#>>'{nutrition,carbohydrate}')::numeric*4
          +(v_facts#>>'{nutrition,protein}')::numeric*4
          +case when jsonb_typeof(v_facts#>'{nutrition,fibre}')='number'
            then (v_facts#>>'{nutrition,fibre}')::numeric*2 else 0 end
        )
      )>greatest(35,(
          (v_facts#>>'{nutrition,fat}')::numeric*9
          +(v_facts#>>'{nutrition,carbohydrate}')::numeric*4
          +(v_facts#>>'{nutrition,protein}')::numeric*4
          +case when jsonb_typeof(v_facts#>'{nutrition,fibre}')='number'
            then (v_facts#>>'{nutrition,fibre}')::numeric*2 else 0 end
        )*0.25) then
        v_invalid:=array_append(v_invalid,'nutrition_energy_macro_conflict');
      end if;
    end if;
  end if;
  v_missing:=array(select distinct x from unnest(v_missing) x order by x);
  v_invalid:=array(select distinct x from unnest(v_invalid) x order by x);
  v_status:=case when cardinality(v_missing)=0 and cardinality(v_invalid)=0 then 'manual_unverified' else 'blocked' end;
  v_method:=case when v_status='manual_unverified' then 'manual_unverified' else 'blocked' end;

  -- The optional external verifier can mint GREEN only when an independently
  -- stored, actor/session-bound attestation agrees with every published label
  -- field and with the exact ready-image set. Browser/user evidence alone can
  -- never satisfy this branch. Unsupported identity/category claims are not
  -- copied into the GREEN fact snapshot.
  v_expected_attested_fields:=jsonb_strip_nulls(jsonb_build_object(
    'productName',v_name,
    'brand',v_brand,
    'explicitlyUnbranded',v_unbranded,
    'ean',v_ean,
    'netQuantityText',coalesce(v_facts->>'netQuantityText',v_facts->>'packageSize'),
    'market',p_input->>'market',
    'nutritionBasis',v_facts#>>'{nutrition,basis}',
    'nutrition',(v_facts->'nutrition')-'basis',
    'ingredientsText',v_facts->>'ingredientsText',
    'allergensText',v_facts->>'allergensText'
  ));
  if p_source='ocr' and nullif(p_evidence->>'serverAttestationId','') is not null
    and nullif(p_evidence->>'ocrSessionId','') is not null
    and cardinality(v_missing)=0 and cardinality(v_invalid)=0 then
    select exists(
      select 1 from public.global_catalog_server_ocr_attestations a
      join public.ocr_intake_sessions s on s.id=a.ocr_session_id
      where a.id::text=p_evidence->>'serverAttestationId'
        and a.actor_user_id=p_actor_user_id and s.user_id=p_actor_user_id
        and a.source_session_key::text=p_evidence->>'ocrSessionId'
        and a.ocr_session_id=s.id and a.overall_confidence>=85
        and a.image_checksums<@array(select jsonb_array_elements_text(coalesce(p_evidence->'imageChecksums','[]'::jsonb)))
        and a.image_checksums@>array(select jsonb_array_elements_text(coalesce(p_evidence->'imageChecksums','[]'::jsonb)))
        and a.archived_image_paths<@array(select jsonb_array_elements_text(coalesce(p_evidence->'archivedImagePaths','[]'::jsonb)))
        and a.archived_image_paths@>array(select jsonb_array_elements_text(coalesce(p_evidence->'archivedImagePaths','[]'::jsonb)))
        and cardinality(a.image_checksums)>0 and cardinality(a.archived_image_paths)>0
        and not exists(select 1 from unnest(a.image_checksums) c(checksum)
          where not exists(select 1 from public.ocr_intake_images i
            where i.session_id=s.id and i.state='ready' and i.checksum_sha256=c.checksum))
        and not exists(select 1 from public.ocr_intake_images i
          where i.session_id=s.id and i.state='ready'
            and (i.checksum_sha256 is null or not i.checksum_sha256=any(a.image_checksums)))
        and cardinality(a.image_checksums)=(select count(*) from public.ocr_intake_images i
          where i.session_id=s.id and i.state='ready')
        and (a.verified_fields-'sourceProductSnapshotSha256')=v_expected_attested_fields
        and coalesce(a.verified_fields->>'sourceProductSnapshotSha256','') ~ '^[0-9a-f]{64}$'
        and exists(select 1 from public.ocr_intake_images i where i.session_id=s.id and i.state='ready'
          and i.role='front' and i.checksum_sha256=any(a.image_checksums))
        and exists(select 1 from public.ocr_intake_images i where i.session_id=s.id and i.state='ready'
          and i.role in ('nutrition_table','back') and i.checksum_sha256=any(a.image_checksums))
        and (v_ean is null or public.global_catalog_valid_gtin(v_ean))
        and nullif(substring(replace(coalesce(v_expected_attested_fields->>'netQuantityText',''),',','.')
          from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric>0
        and lower(substring(coalesce(v_expected_attested_fields->>'netQuantityText','') from '(kg|ml|g|l)'))
          in ('g','kg','ml','l')
        and nullif(trim(coalesce(v_expected_attested_fields->>'market','')),'') is not null
        and v_expected_attested_fields->>'nutritionBasis' in ('per_100g','per_100ml')
        and jsonb_typeof(v_expected_attested_fields#>'{nutrition,energyKcal}')='number'
        and jsonb_typeof(v_expected_attested_fields#>'{nutrition,fat}')='number'
        and jsonb_typeof(v_expected_attested_fields#>'{nutrition,carbohydrate}')='number'
        and jsonb_typeof(v_expected_attested_fields#>'{nutrition,protein}')='number'
        and jsonb_typeof(v_expected_attested_fields#>'{nutrition,salt}')='number'
        and (v_expected_attested_fields#>>'{nutrition,energyKcal}')::numeric between 0 and 1000
        and (v_expected_attested_fields#>>'{nutrition,fat}')::numeric between 0 and 100
        and (v_expected_attested_fields#>>'{nutrition,carbohydrate}')::numeric between 0 and 100
        and (v_expected_attested_fields#>>'{nutrition,protein}')::numeric between 0 and 100
        and (v_expected_attested_fields#>>'{nutrition,salt}')::numeric between 0 and 100
        and (v_expected_attested_fields#>'{nutrition,saturatedFat}' is null or (
          (v_expected_attested_fields#>>'{nutrition,saturatedFat}')::numeric between 0 and 100
          and (v_expected_attested_fields#>>'{nutrition,saturatedFat}')::numeric
            <=(v_expected_attested_fields#>>'{nutrition,fat}')::numeric+0.01
        ))
        and (v_expected_attested_fields#>'{nutrition,sugars}' is null or (
          (v_expected_attested_fields#>>'{nutrition,sugars}')::numeric between 0 and 100
          and (v_expected_attested_fields#>>'{nutrition,sugars}')::numeric
            <=(v_expected_attested_fields#>>'{nutrition,carbohydrate}')::numeric+0.01
        ))
        and (v_expected_attested_fields#>'{nutrition,fibre}' is null
          or (v_expected_attested_fields#>>'{nutrition,fibre}')::numeric between 0 and 100)
        and coalesce((v_expected_attested_fields#>>'{nutrition,fat}')::numeric,0)
          +coalesce((v_expected_attested_fields#>>'{nutrition,carbohydrate}')::numeric,0)
          +coalesce((v_expected_attested_fields#>>'{nutrition,protein}')::numeric,0)
          +coalesce((v_expected_attested_fields#>>'{nutrition,fibre}')::numeric,0)
          +coalesce((v_expected_attested_fields#>>'{nutrition,salt}')::numeric,0)<=105
        and abs((v_expected_attested_fields#>>'{nutrition,energyKcal}')::numeric-(
          (v_expected_attested_fields#>>'{nutrition,fat}')::numeric*9
          +(v_expected_attested_fields#>>'{nutrition,carbohydrate}')::numeric*4
          +(v_expected_attested_fields#>>'{nutrition,protein}')::numeric*4
          +coalesce((v_expected_attested_fields#>>'{nutrition,fibre}')::numeric,0)*2
        ))<=greatest(35,(
          (v_expected_attested_fields#>>'{nutrition,fat}')::numeric*9
          +(v_expected_attested_fields#>>'{nutrition,carbohydrate}')::numeric*4
          +(v_expected_attested_fields#>>'{nutrition,protein}')::numeric*4
          +coalesce((v_expected_attested_fields#>>'{nutrition,fibre}')::numeric,0)*2
        )*0.25)
        and nullif(trim(coalesce(v_expected_attested_fields->>'ingredientsText','')),'') is not null
        and nullif(trim(coalesce(v_expected_attested_fields->>'allergensText','')),'') is not null
    ) into v_attested;
  end if;
  if v_attested then
    v_status:='verified';
    v_method:='automatic';
    v_facts:=jsonb_strip_nulls(jsonb_build_object(
      'displayName',v_name,'brand',v_brand,'explicitlyUnbranded',v_unbranded,'ean',v_ean,
      'market',p_input->>'market','netQuantityText',v_expected_attested_fields->>'netQuantityText',
      'nutritionBasis',v_expected_attested_fields->>'nutritionBasis',
      'nutrition',jsonb_build_object('basis',v_expected_attested_fields->>'nutritionBasis')
        ||coalesce(v_expected_attested_fields->'nutrition','{}'::jsonb),
      'ingredientsText',v_expected_attested_fields->>'ingredientsText',
      'allergensText',v_expected_attested_fields->>'allergensText'
    ));
  end if;
  v_facts_fingerprint:=encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex');
  v_evidence_record:=p_evidence||jsonb_build_object(
    'proposedFacts',v_facts,
    'duplicateDecision',v_duplicate_decision,
    'distinguishingEvidence',coalesce(p_input->'distinguishingEvidence','{}'::jsonb)
  );
  v_label_ready:=v_status<>'blocked'
    and coalesce(v_facts->>'nutritionBasis',v_facts#>>'{nutrition,basis}')='per_100g'
    and jsonb_typeof(v_facts#>'{nutrition,energyKcal}')='number'
    and jsonb_typeof(v_facts#>'{nutrition,fat}')='number'
    and jsonb_typeof(v_facts#>'{nutrition,carbohydrate}')='number'
    and jsonb_typeof(v_facts#>'{nutrition,protein}')='number'
    and jsonb_typeof(v_facts#>'{nutrition,salt}')='number'
    and nullif(trim(coalesce(v_facts->>'ingredientsText','')),'') is not null
    and nullif(trim(coalesce(v_facts->>'allergensText','')),'') is not null;

  if v_has_existing then
    v_product_id:=v_existing.id;
    select v.id into v_version_id from public.product_versions v
    where v.id=v_existing.current_version_id and v.facts_fingerprint=v_facts_fingerprint;
    if v_duplicate_decision='different' then
      -- A caller assertion cannot rewrite a possible duplicate. The current
      -- product remains untouched while the distinguishing evidence is queued.
      v_version_id:=v_existing.current_version_id;
      v_binding_id:=v_existing.current_behavior_binding_id;
      v_outcome:='review';
      v_review_key:='product:'||v_product_id::text||':duplicate-dispute';
    elsif v_version_id is not null then
      v_outcome:='duplicate';
      v_binding_id:=v_existing.current_behavior_binding_id;
    elsif v_existing.canonical_verification_status='verified' or not v_can_mutate_existing then
      -- An unattested adapter may never replace a verified or non-owned shared
      -- current version. Its proposed facts are retained only as review evidence.
      v_version_id:=v_existing.current_version_id;
      v_binding_id:=v_existing.current_behavior_binding_id;
      v_outcome:='review';
      v_review_key:='product:'||v_product_id::text||':correction';
    else
      select coalesce(max(version),0)+1 into v_next_version from public.product_versions where product_id=v_product_id;
      select id into v_version_id from public.product_versions where product_id=v_product_id order by version desc limit 1;
      insert into public.product_versions(product_id,version,facts,evidence_snapshot,verification_status,verification_method,provenance,facts_fingerprint,supersedes)
      values(v_product_id,v_next_version,v_facts,'{}'::jsonb,v_status,v_method,coalesce(nullif(p_input->>'provenance',''),p_source),v_facts_fingerprint,v_version_id)
      returning id into v_version_id;
      update public.product_behavior_bindings set is_current=false where product_id=v_product_id and is_current;
      update public.products set
        brand=v_brand,ean_code=v_ean,barcode=v_ean,product_name_internal=coalesce(nullif(trim(coalesce(p_input->>'originalName','')),''),v_name),
        product_name_display=v_name,product_category=p_input->>'category',country=p_input->>'countryOfOrigin',
        explicitly_unbranded=v_unbranded,canonical_family=null,normalized_identity=v_identity,
        search_document=trim(concat_ws(' ',v_brand,v_name,p_input->>'category',v_ean)),updated_at=now()
      where id=v_product_id;
      v_outcome:=case when v_status='blocked' then 'blocked' else 'accepted' end;
    end if;
  else
    insert into public.products(
      owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,
      product_category,country,status,source_type,is_active,product_kind,visibility,owning_account_id,
      canonical_verification_status,canonical_verification_method,canonical_provenance,
      explicitly_unbranded,canonical_family,normalized_identity,search_document
    ) values(
      case when v_visibility='account_private' then p_actor_user_id else null end,p_actor_user_id,v_brand,v_ean,v_ean,
      v_name,v_name,p_input->>'category',p_input->>'countryOfOrigin',
      case when v_status='manual_unverified' then 'manual_adjusted' else 'draft' end,
      case when p_source in ('ocr','barcode') then 'label_scan' when p_source in ('catalog_import','spreadsheet','retailer_feed','supplier_specification') then 'catalog_import' when p_source='future_integration' then 'api' else 'manual' end,
      true,v_kind,v_visibility,case when v_visibility='account_private' then p_actor_user_id else null end,
      v_status,v_method,coalesce(nullif(p_input->>'provenance',''),p_source),v_unbranded,null,v_identity,
      trim(concat_ws(' ',v_brand,v_name,p_input->>'category',v_ean))
    ) returning id into v_product_id;
    insert into public.product_versions(product_id,version,facts,evidence_snapshot,verification_status,verification_method,provenance,facts_fingerprint)
    values(v_product_id,1,v_facts,'{}'::jsonb,v_status,v_method,coalesce(nullif(p_input->>'provenance',''),p_source),v_facts_fingerprint)
    returning id into v_version_id;
    v_outcome:=case when v_status='blocked' then 'blocked' else 'accepted' end;
  end if;
  if v_likely_duplicate then
    v_outcome:='blocked';
    v_review_key:='product:'||v_product_id::text||':likely-duplicate';
  end if;

  begin
    v_quantity:=nullif(substring(replace(coalesce(v_facts->>'netQuantityText',v_facts->>'packageSize',''),',','.')
      from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric;
  exception when invalid_text_representation then v_quantity:=null; end;
  v_unit:=lower(substring(coalesce(v_facts->>'netQuantityText',v_facts->>'packageSize','') from '(kg|ml|g|l)'));
  if v_outcome in ('accepted','blocked') and v_version_id is not null then
    if v_ean is not null then
      insert into public.product_variants(
        product_id,ean,net_quantity,net_unit,market,package_language,original_package_name,image_phashes
      ) values(
        v_product_id,v_ean,v_quantity,v_unit,coalesce(nullif(p_input->>'market',''),'GLOBAL'),
        nullif(p_input->>'packageLanguage',''),v_name,v_image_phashes
      ) on conflict(ean) where ean is not null do update set
        net_quantity=excluded.net_quantity,net_unit=excluded.net_unit,market=excluded.market,
        package_language=excluded.package_language,original_package_name=excluded.original_package_name,
        image_phashes=excluded.image_phashes
      where product_variants.product_id=excluded.product_id
      returning id into v_variant_id;
      if v_variant_id is null then raise exception 'EAN belongs to another canonical product'; end if;
    elsif not exists(select 1 from public.product_variants pv where pv.product_id=v_product_id and pv.is_current
      and pv.market=coalesce(nullif(p_input->>'market',''),'GLOBAL')
      and pv.net_quantity is not distinct from v_quantity and pv.net_unit is not distinct from v_unit) then
      insert into public.product_variants(
        product_id,net_quantity,net_unit,market,package_language,original_package_name,image_phashes
      ) values(
        v_product_id,v_quantity,v_unit,coalesce(nullif(p_input->>'market',''),'GLOBAL'),
        nullif(p_input->>'packageLanguage',''),v_name,v_image_phashes
      ) returning id into v_variant_id;
    else
      select pv.id into v_variant_id from public.product_variants pv
      where pv.product_id=v_product_id and pv.is_current
        and pv.market=coalesce(nullif(p_input->>'market',''),'GLOBAL')
        and pv.net_quantity is not distinct from v_quantity and pv.net_unit is not distinct from v_unit
      order by pv.created_at desc,pv.id limit 1;
    end if;
    if v_variant_id is not null then
      insert into public.product_variant_markets(variant_id,market,package_language)
      values(v_variant_id,coalesce(nullif(p_input->>'market',''),'GLOBAL'),nullif(p_input->>'packageLanguage',''))
      on conflict(variant_id,market) do update set
        package_language=coalesce(excluded.package_language,product_variant_markets.package_language),
        last_seen_at=now();
      if nullif(trim(coalesce(p_input->>'retailer','')),'') is not null then
        insert into public.product_retailer_offers(variant_id,retailer,market)
        values(v_variant_id,trim(p_input->>'retailer'),coalesce(nullif(p_input->>'market',''),'GLOBAL'))
        on conflict(variant_id,market,retailer) do update set observed_at=now();
      end if;
    end if;
  end if;

  if v_outcome='accepted' then
    insert into public.product_aliases(product_id,alias,normalized_alias,language,kind)
    select v_product_id,label,
      trim(regexp_replace(extensions.unaccent(lower(label)),'[^a-z0-9]+',' ','g')),
      nullif(p_input->>'originalLanguage',''),kind
    from (values
      (nullif(trim(coalesce(p_input->>'originalName','')),''),'original_name'),
      (v_name,'localized_name')
    ) x(label,kind)
    where label is not null
    on conflict(product_id,normalized_alias,language) do nothing;
  end if;

  if v_binding_id is null then
    v_behavior_status:=case when v_label_ready then 'ready' else 'blocked' end;
    insert into public.product_behavior_bindings(
      product_id,product_version_id,taxonomy_version_id,main_eligibility,vegan_eligibility,
      protein_behavior,profile_permissions,behavior_snapshot,warnings,block_reasons,
      classifier_version,binding_status,is_current
    ) values(
      v_product_id,v_version_id,(select id from public.product_taxonomy_versions where status='published' order by version desc limit 1),
      case when v_label_ready then 'NOT_MAIN' else 'UNKNOWN_REQUIRES_EVIDENCE' end,'unknown','unknown',
      case when v_label_ready then jsonb_build_object(
        'SEARCH',true,'BASE_RECIPE',false,'MAIN',false,'OPTIMAL',false,'ECO',false,
        'TOPPING',true,'SUBSTITUTION',false,'COST',true,'MONITOR',false,
        'PRODUCTION',true,'SUMMARY',true,'LABEL',true,'MASTER_LABEL',true,
        'NUTRITION',true,'ALLERGENS',true,'SAVE',true,'RECIPE_VERSION',true,
        'RESTORE',true,'EXPORT',true,'PROCESS',false,'BATCH_RESCUE',false
      ) else '{}'::jsonb end,
      jsonb_build_object('state',v_behavior_status,'labelOnly',v_label_ready),
      case when v_label_ready then '{}'::text[] else array['Product behavior requires classification.'] end,
      case when v_label_ready then '{}'::text[] else array['behavior_classification_required'] end,
      'canonical-ingest-v1',v_behavior_status,true
    ) returning id into v_binding_id;
    update public.products set current_version_id=v_version_id,current_behavior_binding_id=v_binding_id,
      canonical_verification_status=v_status,canonical_verification_method=v_method,
      canonical_provenance=coalesce(nullif(p_input->>'provenance',''),p_source)
    where id=v_product_id;
  end if;

  -- Classification is an ingest responsibility, not eventual best effort.
  -- 10400 is present before this service is exposed; any classifier failure
  -- rolls the identity, version, relation and provisional binding back together.
  if v_outcome in ('accepted','blocked') then
    v_binding_id:=public.classify_catalog_product_behavior_v2(
      v_version_id,'canonical-ingest-v2:'||left(v_payload_fingerprint,24)
    );
    update public.product_behavior_reclassification_queue set
      status='succeeded',result_binding_id=v_binding_id,completed_at=now(),
      progress='{"stage":"published","completed":1,"total":1}'::jsonb,updated_at=now()
    where entity_kind='catalog_product_version' and entity_id=v_version_id::text
      and status in ('pending','running')
      and source_fingerprint=public.product_behavior_entity_fingerprint_v1(
        'catalog_product_version',v_version_id::text
      );
  end if;

  if v_status='blocked' and v_review_key is null then v_review_key:='product:'||v_product_id::text||':verification'; end if;
  if v_status='manual_unverified' and v_outcome='accepted' and v_review_key is null then
    v_review_key:='product:'||v_product_id::text||':manual-verification';
  end if;
  if v_review_key is not null then
    insert into public.product_review_cases(
      consolidation_key,product_id,product_version_id,kind,missing_fields,invalid_fields,
      duplicate_candidates,latest_evidence
    ) values(
      v_review_key,v_product_id,v_version_id,
      case when v_likely_duplicate or v_duplicate_decision='different' then 'duplicate_dispute'
        when v_outcome='review' then 'correction'
        when v_status='manual_unverified' then 'manual_unverified'
        else 'verification_failed' end,
      v_missing,v_invalid,
      case when v_likely_duplicate then v_duplicate_candidates
        when v_duplicate_decision='different' and v_disputed_product_id is not null
        then jsonb_build_array(v_disputed_product_id) else '[]'::jsonb end,
      v_evidence_record
    ) on conflict(consolidation_key) do update set
      submission_count=product_review_cases.submission_count+1,
      missing_fields=excluded.missing_fields,invalid_fields=excluded.invalid_fields,
      duplicate_candidates=excluded.duplicate_candidates,
      latest_evidence=excluded.latest_evidence,updated_at=now()
    returning id into v_review_id;
  end if;

  if v_mapper_candidate<>'{}'::jsonb then
    update public.products set
      mapper_status='needs_review',
      match_method=nullif(v_mapper_candidate->>'match_method',''),
      match_confidence=nullif(v_mapper_candidate->>'match_confidence',''),
      mapper_notes=coalesce(nullif(v_mapper_candidate->>'mapper_notes',''),mapper_notes),
      normalized_name=coalesce(nullif(v_mapper_candidate->>'normalized_name',''),normalized_name),
      normalized_category=coalesce(nullif(v_mapper_candidate->>'normalized_category',''),normalized_category),
      needs_review_reason=coalesce(
        nullif(v_mapper_candidate->>'needs_review_reason',''),
        'Mapper candidate requires an independently verified sign-off.'
      ),
      candidate_count=case when jsonb_typeof(v_mapper_candidate->'candidate_ids')='array'
        then jsonb_array_length(v_mapper_candidate->'candidate_ids') else candidate_count end,
      updated_at=now()
    where id=v_product_id;
    insert into public.product_review_cases(
      consolidation_key,product_id,product_version_id,kind,missing_fields,latest_evidence
    ) values(
      'product:'||v_product_id::text||':mapper-candidate',v_product_id,v_version_id,'conflict',
      array['mapper_authorization_required'],
      jsonb_build_object('mapperCandidate',v_mapper_candidate,'source',p_source)
    ) on conflict(consolidation_key) do update set
      submission_count=product_review_cases.submission_count+1,
      missing_fields=excluded.missing_fields,latest_evidence=excluded.latest_evidence,updated_at=now();
    v_review_key:=coalesce(v_review_key,'product:'||v_product_id::text||':mapper-candidate');
  end if;

  insert into public.product_ingest_events(
    actor_user_id,source,idempotency_key,payload_fingerprint,product_id,product_version_id,
    behavior_binding_id,status,result_snapshot
  ) values(
    p_actor_user_id,p_source,p_idempotency_key,v_payload_fingerprint,v_product_id,v_version_id,
    v_binding_id,v_outcome,'{}'::jsonb
  ) returning id into v_event_id;

  insert into public.product_evidence(
    product_id,product_version_id,ingest_event_id,owner_user_id,evidence_kind,evidence,evidence_fingerprint
  ) values(
    v_product_id,v_version_id,v_event_id,p_actor_user_id,p_source,v_evidence_record,
    encode(extensions.digest(convert_to(v_evidence_record::text,'utf8'),'sha256'),'hex')
  );

  if p_source='ocr' and nullif(p_evidence->>'ocrSessionId','') is not null then
    update public.ocr_intake_sessions
    set saved_product_id=v_product_id::text,updated_at=now()
    where id=(p_evidence->>'ocrSessionId')::uuid and user_id=p_actor_user_id
      and state in ('ready_to_save','duplicate_blocked','saved');
    if not found then raise exception 'owned OCR session link could not be persisted'; end if;
  end if;

  insert into public.user_product_relations(
    user_id,product_id,favorite,private_price,currency,supplier,notes,stock
  ) values(
    p_actor_user_id,v_product_id,
    case when p_private_overlay ? 'favorite' then coalesce((p_private_overlay->>'favorite')::boolean,false)
      else (select canonical_verification_status<>'blocked' from public.products where id=v_product_id) end,
    nullif(p_private_overlay->>'privatePrice','')::numeric,nullif(upper(p_private_overlay->>'currency'),''),
    nullif(p_private_overlay->>'supplier',''),nullif(p_private_overlay->>'notes',''),
    nullif(p_private_overlay->>'stock','')::numeric
  ) on conflict(user_id,product_id) do update set
    favorite=case when p_private_overlay ? 'favorite' then excluded.favorite else user_product_relations.favorite or excluded.favorite end,
    private_price=coalesce(excluded.private_price,user_product_relations.private_price),
    currency=coalesce(excluded.currency,user_product_relations.currency),
    supplier=coalesce(excluded.supplier,user_product_relations.supplier),
    notes=coalesce(excluded.notes,user_product_relations.notes),
    stock=coalesce(excluded.stock,user_product_relations.stock),updated_at=now();

  if v_same_from_candidate and v_pending_candidate_id is not null then
    update public.products set is_active=false,merged_into_product_id=v_product_id,updated_at=now()
    where id=v_pending_candidate_id and canonical_verification_status='blocked';
    update public.product_review_cases set status='resolved',updated_at=now()
    where product_id=v_pending_candidate_id and status<>'resolved';
  end if;

  v_result:=jsonb_build_object(
    'schemaVersion',1,
    'kind',case when v_likely_duplicate then 'likely_duplicate' when v_outcome='duplicate' then 'existing'
      when v_outcome='review' then 'existing' when v_outcome='blocked' then 'blocked'
      when not v_has_existing then 'created' else 'updated' end,
    'productId',v_product_id,'productVersionId',v_version_id,'behaviorBindingId',v_binding_id,
    'ingestEventId',v_event_id,
    'productCode',(select product_code from public.products where id=v_product_id),
    'status',(select canonical_verification_status from public.products where id=v_product_id),
    'verificationMethod',(select canonical_verification_method from public.products where id=v_product_id),
    'autoFavorited',(select favorite from public.user_product_relations where user_id=p_actor_user_id and product_id=v_product_id),
    'reviewCaseKey',v_review_key,'idempotent',false,'missingFields',to_jsonb(v_missing),
    'invalidFields',to_jsonb(v_invalid),'duplicateCandidates',v_duplicate_candidates
  );
  update public.product_ingest_events set result_snapshot=v_result where id=v_event_id;
  return v_result;
end;
$$;
revoke all on function public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Retire the second writable identity root; keep read compatibility only
-- ---------------------------------------------------------------------------

drop trigger if exists global_catalog_version_classify_v1 on public.global_catalog_product_versions;
drop trigger if exists global_catalog_products_touch on public.global_catalog_products;
drop trigger if exists global_catalog_review_cases_touch on public.global_catalog_review_cases;

alter table public.global_catalog_products rename to global_catalog_products_archive_20260813;
alter table public.global_catalog_product_versions rename to global_catalog_product_versions_archive_20260813;
alter table public.catalog_product_behavior_bindings rename to catalog_product_behavior_bindings_archive_20260813;
alter table public.unified_product_ingest_events rename to unified_product_ingest_events_archive_20260813;
alter table public.global_catalog_review_cases rename to global_catalog_review_cases_archive_20260813;
alter table public.global_catalog_retailer_offers rename to global_catalog_retailer_offers_archive_20260813;
alter table public.global_catalog_variant_markets rename to global_catalog_variant_markets_archive_20260813;
alter table public.global_catalog_aliases rename to global_catalog_aliases_archive_20260813;
alter table public.global_catalog_variants rename to global_catalog_variants_archive_20260813;

revoke all on public.global_catalog_products_archive_20260813,
  public.global_catalog_product_versions_archive_20260813,
  public.catalog_product_behavior_bindings_archive_20260813,
  public.unified_product_ingest_events_archive_20260813,
  public.global_catalog_review_cases_archive_20260813,
  public.global_catalog_retailer_offers_archive_20260813,
  public.global_catalog_variant_markets_archive_20260813,
  public.global_catalog_aliases_archive_20260813,
  public.global_catalog_variants_archive_20260813
from public,anon,authenticated,service_role;

create or replace function public.canonical_product_archive_readonly_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'archived product roots are read-only';
end;
$$;

create trigger global_catalog_products_archive_readonly before insert or update or delete
on public.global_catalog_products_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();
create trigger global_catalog_versions_archive_readonly before insert or update or delete
on public.global_catalog_product_versions_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();
create trigger global_catalog_variants_archive_readonly before insert or update or delete
on public.global_catalog_variants_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();
create trigger global_catalog_aliases_archive_readonly before insert or update or delete
on public.global_catalog_aliases_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();
create trigger global_catalog_variant_markets_archive_readonly before insert or update or delete
on public.global_catalog_variant_markets_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();
create trigger global_catalog_retailer_offers_archive_readonly before insert or update or delete
on public.global_catalog_retailer_offers_archive_20260813 for each row execute function public.canonical_product_archive_readonly_guard();

-- These compatibility projections intentionally run with the migration owner
-- so the underlying mixed canonical root can keep its stricter owner/creator
-- RLS. Every exposed row/column is an explicit non-blocked shared-data
-- allowlist; raw OCR, submitter/admin data and evidence hashes stay hidden.
create view public.global_catalog_products with (security_invoker=false,security_barrier=true) as
select
  p.id,p.canonical_verification_status status,p.canonical_verification_method verification_method,
  p.canonical_provenance provenance,p.product_name_display display_name,p.product_name_internal original_name,
  v.facts->>'originalLanguage' original_language,p.brand,p.explicitly_unbranded,p.canonical_family,
  p.product_category category,b.mapper_ingredient_id,p.country country_of_origin,p.normalized_identity,
  v.facts_fingerprint composition_fingerprint,
  coalesce((select array_agg(x.value) from jsonb_array_elements_text(coalesce(v.facts->'missingFields','[]'::jsonb)) x(value)),'{}') missing_fields,
  coalesce((select array_agg(x.value) from jsonb_array_elements_text(coalesce(v.facts->'invalidFields','[]'::jsonb)) x(value)),'{}') invalid_fields,
  coalesce(v.facts->'public_data',v.facts) public_data,p.search_document,p.is_active,p.created_at,p.updated_at,
  p.current_version_id,null::timestamptz verified_at,null::text verified_source_version
from public.products p
left join public.product_versions v on v.id=p.current_version_id
left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
where p.visibility='shared' and p.canonical_verification_status<>'blocked'
  and p.merged_into_product_id is null;

create view public.global_catalog_product_versions with (security_invoker=false,security_barrier=true) as
select id,product_id,version,facts snapshot,'{}'::jsonb evidence_snapshot,provenance,verification_method,
  effective_at,supersedes,created_at from public.product_versions v
where exists(select 1 from public.products p where p.id=v.product_id and p.is_active
  and p.visibility='shared' and p.canonical_verification_status<>'blocked');

create view public.global_catalog_variants with (security_invoker=false,security_barrier=true) as
select id,product_id,ean,net_quantity,net_unit,market,package_language,package_revision,
  original_package_name,'{}'::text[] image_phashes,is_current,created_at
from public.product_variants
where exists(select 1 from public.products p where p.id=product_id and p.is_active
  and p.visibility='shared' and p.canonical_verification_status<>'blocked');
create view public.global_catalog_variant_markets with (security_invoker=false,security_barrier=true) as
select vm.* from public.product_variant_markets vm
where exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id
  where v.id=vm.variant_id and p.is_active and p.visibility='shared'
    and p.canonical_verification_status<>'blocked');
create view public.global_catalog_aliases with (security_invoker=false,security_barrier=true) as
select a.* from public.product_aliases a
where exists(select 1 from public.products p where p.id=a.product_id and p.is_active
  and p.visibility='shared' and p.canonical_verification_status<>'blocked');
create view public.global_catalog_retailer_offers with (security_invoker=false,security_barrier=true) as
select o.* from public.product_retailer_offers o
where exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id
  where v.id=o.variant_id and p.is_active and p.visibility='shared'
    and p.canonical_verification_status<>'blocked');

create view public.catalog_product_behavior_bindings with (security_invoker=false,security_barrier=true) as
select id,product_id catalog_product_id,product_version_id catalog_product_version_id,mapper_ingredient_id,
  taxonomy_version_id,family_id,subfamily_id,form_id,
  case when main_eligibility='UNKNOWN_REQUIRES_EVIDENCE' then 'UNKNOWN' else main_eligibility end main_eligibility,
  vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,profile_permissions,process_behavior,
  warnings,block_reasons,classifier_version,classified_at,is_current
from public.product_behavior_bindings b
where exists(select 1 from public.products p where p.id=b.product_id and p.is_active
  and p.visibility='shared' and p.canonical_verification_status<>'blocked');

create view public.unified_product_ingest_events with (security_invoker=true,security_barrier=true) as
select id,source,actor_user_id,null::uuid source_product_id,product_id catalog_product_id,
  product_version_id catalog_product_version_id,payload_fingerprint,idempotency_key,
  case when status='accepted' then 'accepted' when status='duplicate' then 'duplicate' when status='blocked' then 'blocked' else 'review' end status,
  result_snapshot,created_at from public.product_ingest_events;

create view public.global_catalog_review_cases with (security_invoker=true,security_barrier=true) as
select id,consolidation_key,product_id catalog_product_id,kind,status,priority,submission_count,
  '{}'::text[] markets,missing_fields,duplicate_candidates,'{}'::jsonb normalized_data,
  latest_evidence,created_at,updated_at from public.product_review_cases;

revoke all on public.global_catalog_products,public.global_catalog_product_versions,
  public.catalog_product_behavior_bindings,public.unified_product_ingest_events,
  public.global_catalog_review_cases,public.global_catalog_variants,
  public.global_catalog_variant_markets,public.global_catalog_aliases,
  public.global_catalog_retailer_offers from public,anon,authenticated,service_role;
grant select on public.global_catalog_products,public.global_catalog_product_versions,
  public.catalog_product_behavior_bindings,public.global_catalog_variants,
  public.global_catalog_variant_markets,public.global_catalog_aliases,
  public.global_catalog_retailer_offers to authenticated,service_role;

-- Replace the legacy search function after the old roots become views. Search
-- now reads the canonical version/binding and the caller's canonical private
-- relation. Historical variants/aliases remain read-only discovery evidence;
-- they are never identity writers. Mapper mapping is exposed only while the
-- referenced Mapper row remains active and approved.
drop function if exists public.search_global_catalog(text,text[],boolean,integer);
create function public.search_global_catalog(
  p_query text,p_market text[] default '{}',p_favorites_only boolean default false,p_limit integer default 100
) returns table(
  id uuid,current_version_id uuid,status text,verification_method text,display_name text,original_name text,
  original_language text,brand text,canonical_family text,category text,mapped_ingredient_id text,
  markets text[],retailers text[],eans text[],aliases text[],favorite boolean,recently_used_at timestamptz,
  missing_fields text[],invalid_fields text[],public_data jsonb,private_price numeric,private_currency text
) language sql stable security definer set search_path=public,extensions as $$
  with q as (
    select trim(regexp_replace(extensions.unaccent(lower(coalesce(p_query,''))),'[^a-z0-9]+',' ','g')) value
  ), canonical as (
    select p.id,p.current_version_id,p.canonical_verification_status status,
      p.canonical_verification_method verification_method,p.product_name_display display_name,
      p.product_name_internal original_name,v.facts->>'originalLanguage' original_language,
      p.brand,p.canonical_family,p.product_category category,
      case when m.ingredient_id is not null and m.is_active and m.approved_for_base
        and m.approved_for_engines and m.verification_status='verified' then b.mapper_ingredient_id end mapped_ingredient_id,
      array(select distinct x from unnest(array_remove(array[
        v.facts->>'market',v.facts#>>'{public_data,market}'
      ]||coalesce((select array_agg(coalesce(vm.market,gv.market)) from public.product_variants gv
        left join public.product_variant_markets vm on vm.variant_id=gv.id
        where gv.product_id=p.id and gv.is_current),'{}'::text[]),null)) x) markets,
      array(select distinct x from unnest(array_remove(array[
        v.facts->>'retailer',v.facts#>>'{public_data,retailer}'
      ]||coalesce((select array_agg(o.retailer) from public.product_variants gv
        join public.product_retailer_offers o on o.variant_id=gv.id
        where gv.product_id=p.id and gv.is_current),'{}'::text[]),null)) x) retailers,
      array(select distinct x from unnest(array_remove(array[p.ean_code_normalized]
        ||coalesce((select array_agg(gv.ean) from public.product_variants gv
          where gv.product_id=p.id and gv.is_current),'{}'::text[]),null)) x) eans,
      array(select distinct x from unnest(array_remove(array[
        p.product_name_display,p.product_name_internal,p.canonical_family
      ]||coalesce((select array_agg(a.alias) from public.product_aliases a
        where a.product_id=p.id),'{}'::text[]),null)) x) aliases,
      coalesce((select array_agg(x.value) from jsonb_array_elements_text(
        coalesce(v.facts->'missingFields','[]'::jsonb)) x(value)),'{}') missing_fields,
      coalesce((select array_agg(x.value) from jsonb_array_elements_text(
        coalesce(v.facts->'invalidFields','[]'::jsonb)) x(value)),'{}') invalid_fields,
      coalesce(v.facts->'public_data',v.facts) public_data,p.search_document
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    where p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid()
        or exists(select 1 from public.product_ingest_events e
          where e.product_id=p.id and e.actor_user_id=auth.uid()))
  )
  select c.id,c.current_version_id,c.status,c.verification_method,c.display_name,c.original_name,
    c.original_language,c.brand,c.canonical_family,c.category,c.mapped_ingredient_id,
    c.markets,c.retailers,c.eans,c.aliases,coalesce(r.favorite,false),r.recently_used_at,
    c.missing_fields,c.invalid_fields,c.public_data,r.private_price,r.currency
  from canonical c cross join q
  left join public.user_product_relations r on r.user_id=auth.uid() and r.product_id=c.id
  where auth.uid() is not null
    and (q.value='' or to_tsvector('simple',c.search_document) @@
      to_tsquery('simple',regexp_replace(q.value,' +',':* & ','g')||':*')
      or exists(select 1 from unnest(c.aliases) a where
        trim(regexp_replace(extensions.unaccent(lower(a)),'[^a-z0-9]+',' ','g')) like q.value||'%')
      or exists(select 1 from unnest(c.eans) e where e=regexp_replace(p_query,'\D','','g')))
    and (cardinality(p_market)=0 or c.markets&&p_market)
    and (not p_favorites_only or coalesce(r.favorite,false))
  order by coalesce(r.favorite,false) desc,r.recently_used_at desc nulls last,
    c.status='verified' desc,c.display_name
  limit least(greatest(p_limit,1),500);
$$;
revoke all on function public.search_global_catalog(text,text[],boolean,integer) from public,anon;
grant execute on function public.search_global_catalog(text,text[],boolean,integer) to authenticated;

-- Old authorities may still exist for forensic compatibility, but no runtime
-- role may execute a writer against the archived roots.
revoke execute on function public.begin_global_catalog_submission(uuid,uuid,text,text,text,text,boolean) from service_role;
revoke execute on function public.submit_owned_product_to_global_catalog_v2(uuid,uuid,uuid,text,text,text,text,text[],text[],text,jsonb,text,text,uuid,uuid) from service_role;
revoke execute on function public.authorize_global_catalog_engine_mapping(uuid,uuid,text) from service_role;
revoke execute on function public.classify_catalog_product_behavior_v1(uuid,text) from service_role;

-- Rebind the exact-product policy FK to the canonical immutable version table.
alter table public.product_behavior_policy_versions
  drop constraint if exists product_behavior_policy_versions_exact_catalog_product_version_id_fkey;
alter table public.product_behavior_policy_versions
  add constraint product_behavior_policy_versions_exact_product_version_id_fkey
  foreign key(exact_catalog_product_version_id) references public.product_versions(id) on delete restrict;

-- Commercial relations moved to `user_product_relations`. The legacy tables
-- remain writable only for the PI Base branch, whose text Mapper identities do
-- not belong in the UUID-keyed canonical commercial relation.
drop policy if exists global_catalog_favorites_own on public.global_catalog_favorites;
create policy global_catalog_favorites_pi_base_own on public.global_catalog_favorites
for all to authenticated using(user_id=auth.uid() and entity_kind='pi_base')
with check(user_id=auth.uid() and entity_kind='pi_base' and catalog_product_id is null
  and mapper_ingredient_id is not null and exists(
    select 1 from public.mapper_basement m where m.ingredient_id=mapper_ingredient_id
      and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified'
  ));
drop policy if exists global_catalog_recent_own on public.global_catalog_recent_usage;
create policy global_catalog_recent_pi_base_own on public.global_catalog_recent_usage
for all to authenticated using(user_id=auth.uid() and entity_kind='pi_base')
with check(user_id=auth.uid() and entity_kind='pi_base' and catalog_product_id is null
  and mapper_ingredient_id is not null and exists(
    select 1 from public.mapper_basement m where m.ingredient_id=mapper_ingredient_id
      and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified'
  ));
grant select,insert,update,delete on public.global_catalog_favorites,public.global_catalog_recent_usage to authenticated;
revoke insert,update,delete on public.account_catalog_product_data from authenticated;

-- Final hard assertions: no active canonical product may lack its exact current
-- version/binding, and every preserved shared identity/version UUID must exist.
do $$
begin
  if exists(select 1 from public.products where merged_into_product_id is null and is_active
    and product_kind<>'mapper_reference'
    and (current_version_id is null or current_behavior_binding_id is null)) then
    raise exception 'canonical product backfill left a product without version or behavior';
  end if;
  if exists(select 1 from public.global_catalog_products_archive_20260813 g
    where not exists(select 1 from public.products p where p.id=g.id)) then
    raise exception 'global catalog product identity was not preserved';
  end if;
  if exists(select 1 from public.global_catalog_product_versions_archive_20260813 v
    where not exists(select 1 from public.product_versions p where p.id=v.id and p.product_id=v.product_id and p.version=v.version)) then
    raise exception 'global catalog product version was not preserved';
  end if;
end $$;
