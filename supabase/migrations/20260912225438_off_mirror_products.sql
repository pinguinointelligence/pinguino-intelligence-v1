create schema if not exists off_mirror;

revoke all on schema off_mirror from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema off_mirror
  revoke all on tables from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema off_mirror
  revoke all on sequences from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema off_mirror
  revoke execute on functions from public, anon, authenticated, service_role;

create table if not exists off_mirror.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  object_path text not null,
  source_size_bytes bigint,
  source_last_modified text,
  status text not null,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table off_mirror.sync_runs
  add column if not exists source_sha256 text,
  add column if not exists source_row_count bigint,
  add column if not exists valid_ean_row_count bigint,
  add column if not exists invalid_ean_row_count bigint,
  add column if not exists duplicate_ean_row_count bigint,
  add column if not exists imported_row_count bigint,
  add column if not exists import_status text,
  add column if not exists import_error text,
  add column if not exists import_started_at timestamptz,
  add column if not exists import_completed_at timestamptz;

comment on table off_mirror.sync_runs is
  'Private audit registry for raw Open Food Facts mirror downloads and imports.';

create or replace function off_mirror.normalize_gtin14(candidate text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  with cleaned as (
    select regexp_replace(btrim(candidate), '[[:space:]-]+', '', 'g') as code
  ), valid as (
    select code
    from cleaned
    where code ~ '^[0-9]+$'
      and char_length(code) in (8, 12, 13, 14)
      and mod(
        (
          select sum(
            substring(code from position for 1)::integer
            * case
                when mod(char_length(code) - position, 2) = 1 then 3
                else 1
              end
          )
          from generate_series(1, char_length(code)) as positions(position)
        ),
        10
      ) = 0
  )
  select lpad(code, 14, '0')
  from valid;
$$;

comment on function off_mirror.normalize_gtin14(text) is
  'Deterministically removes whitespace/hyphen formatting, validates GS1 Mod-10 for GTIN-8/12/13/14, and returns canonical zero-padded GTIN-14.';

create table if not exists off_mirror.products (
  gtin14 text primary key,
  ean text not null unique,
  source_code text not null,
  product_name text,
  brand text,
  manufacturer text,
  quantity text,
  ingredients text,
  allergens text,
  allergens_en text,
  nutrition jsonb not null default '{}'::jsonb,
  nutrition_basis text not null default 'per_100g',
  energy_kj_100g double precision,
  energy_kcal_100g double precision,
  fat_100g double precision,
  saturated_fat_100g double precision,
  carbohydrates_100g double precision,
  sugars_100g double precision,
  fiber_100g double precision,
  proteins_100g double precision,
  salt_100g double precision,
  sodium_100g double precision,
  categories text,
  categories_tags text,
  categories_en text,
  countries_markets text,
  countries_tags text,
  countries_en text,
  off_url text not null,
  off_created_at timestamptz,
  off_modified_at timestamptz,
  off_updated_at timestamptz,
  source_row_number bigint not null,
  import_run_id uuid not null references off_mirror.sync_runs(id) on delete restrict,
  imported_at timestamptz not null default now(),
  constraint off_mirror_products_gtin14_format
    check (gtin14 ~ '^[0-9]{14}$'),
  constraint off_mirror_products_ean_valid
    check (gtin14 = off_mirror.normalize_gtin14(ean)),
  constraint off_mirror_products_nutrition_object
    check (jsonb_typeof(nutrition) = 'object'),
  constraint off_mirror_products_nutrition_basis
    check (nutrition_basis = 'per_100g'),
  constraint off_mirror_products_source_row_number
    check (source_row_number > 1)
);

comment on table off_mirror.products is
  'Private, provenance-preserving Open Food Facts mirror. It is intentionally independent of GELLATTI PR, PI, Mapper, Scanner, and application query paths.';

comment on column off_mirror.products.ean is
  'Validated, formatting-free EAN/GTIN exactly as selected from the OFF source row.';

comment on column off_mirror.products.gtin14 is
  'Canonical GTIN-14 lookup key; primary-key backed for deterministic cross-format lookup.';

comment on column off_mirror.products.nutrition is
  'All non-empty OFF nutrient fields ending in _100g, preserved as source strings; no image fields are stored.';

comment on column off_mirror.products.import_run_id is
  'Links every product row to off_mirror.sync_runs, which preserves the source object path, URL, size, timestamp, and SHA-256 once per import.';

create index if not exists off_mirror_products_off_updated_at_idx
  on off_mirror.products (off_updated_at desc nulls last);

create index if not exists off_mirror_products_import_run_id_idx
  on off_mirror.products (import_run_id);

alter table off_mirror.sync_runs enable row level security;
alter table off_mirror.products enable row level security;

revoke all on all tables in schema off_mirror
  from public, anon, authenticated, service_role;

revoke all on all sequences in schema off_mirror
  from public, anon, authenticated, service_role;

revoke execute on function off_mirror.normalize_gtin14(text)
  from public, anon, authenticated, service_role;
