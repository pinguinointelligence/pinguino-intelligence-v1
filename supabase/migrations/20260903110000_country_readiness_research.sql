-- ============================================================================
-- GLOBAL COUNTRY READINESS — the research and verification record.
--
-- `shop_country_components` already answers "what should a customer buy here".
-- It cannot answer the questions this goal asks: was that link VERIFIED, does
-- the retailer actually ship to that country, what is on the label, and can the
-- Engine use the product at all. Those are research facts with provenance and a
-- date, not presentation fields, so they live in their own table.
--
-- The completeness ladder is explicit because "we have a link" and "a customer
-- can make ice cream" are very different claims:
--
--   IDENTIFIED / PURCHASE_VERIFIED / TECHNICAL_DATA_PARTIAL /
--   TECHNICAL_DATA_COMPLETE / CANONICAL_MAPPING_VERIFIED / ENGINE_READY /
--   REVIEW_REQUIRED / BLOCKED
--
-- A country is never READY because links exist. It is READY when the products
-- its default base needs are ENGINE_READY and the Engine has accepted the base.
-- ============================================================================
create table if not exists public.country_local_products (
  id uuid primary key default gen_random_uuid(),
  country_iso2 text not null references public.shop_countries(iso2) on delete cascade,
  component_product_id uuid references public.shop_products(id) on delete set null,
  canonical_ingredient_id text,
  role text not null default 'STARTER_PACK' check (role in ('STARTER_PACK', 'FRESH_BASE')),
  option_rank text not null default 'PRIMARY' check (option_rank in ('PRIMARY', 'BACKUP')),
  brand text, product_name text, manufacturer text, gtin text,
  package_size_value numeric, package_size_unit text,
  retailer text, purchase_url text, backup_purchase_url text, image_url text,
  ships_to_country boolean, availability text, price numeric, currency text,
  shipping_note text, verified_at timestamptz, evidence_url text, evidence_note text,
  ingredients_text text, allergens_text text,
  energy_kj numeric, energy_kcal numeric, fat_g numeric, saturated_fat_g numeric,
  carbohydrate_g numeric, sugars_g numeric, fibre_g numeric, protein_g numeric, salt_g numeric,
  physical_form text, functional_role text, total_solids_g numeric, water_g numeric,
  lactose_g numeric, sucrose_g numeric, dextrose_g numeric, fructose_g numeric, inulin_g numeric,
  vegan_eligible boolean, base_eligible boolean, topping_eligible boolean, technical_source text,
  status text not null default 'IDENTIFIED' check (status in (
    'IDENTIFIED','PURCHASE_VERIFIED','TECHNICAL_DATA_PARTIAL','TECHNICAL_DATA_COMPLETE',
    'CANONICAL_MAPPING_VERIFIED','ENGINE_READY','REVIEW_REQUIRED','BLOCKED')),
  review_note text, active boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists country_local_products_country_idx
  on public.country_local_products (country_iso2, role, option_rank, sort_order);
create index if not exists country_local_products_status_idx on public.country_local_products (status);
alter table public.country_local_products enable row level security;
drop policy if exists country_local_products_public_read on public.country_local_products;
create policy country_local_products_public_read on public.country_local_products
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
drop policy if exists country_local_products_admin_write on public.country_local_products;
create policy country_local_products_admin_write on public.country_local_products
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- Per PROFILE, never one shared formulation: Gelato, Sorbet, Vegan and Protein
-- each answer to their own authority, and pretending otherwise is how a vegan
-- base ends up with a dairy carrier.
create table if not exists public.country_default_bases (
  id uuid primary key default gen_random_uuid(),
  country_iso2 text not null references public.shop_countries(iso2) on delete cascade,
  profile text not null default 'GELATO' check (profile in ('GELATO','SORBET','VEGAN','PROTEIN')),
  base_template text, base_version integer not null default 1,
  engine_verified boolean not null default false,
  engine_verified_at timestamptz, engine_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (country_iso2, profile)
);
alter table public.country_default_bases enable row level security;
drop policy if exists country_default_bases_public_read on public.country_default_bases;
create policy country_default_bases_public_read on public.country_default_bases
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
drop policy if exists country_default_bases_admin_write on public.country_default_bases;
create policy country_default_bases_admin_write on public.country_default_bases
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

create table if not exists public.country_base_components (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references public.country_default_bases(id) on delete cascade,
  local_product_id uuid references public.country_local_products(id) on delete set null,
  canonical_ingredient_id text, grams numeric, sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
alter table public.country_base_components enable row level security;
drop policy if exists country_base_components_public_read on public.country_base_components;
create policy country_base_components_public_read on public.country_base_components
  for select to anon, authenticated using (true);
drop policy if exists country_base_components_admin_write on public.country_base_components;
create policy country_base_components_admin_write on public.country_base_components
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
