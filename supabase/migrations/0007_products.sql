-- Mapper Products — the GROWING product / catalog layer for PINGÜINO.
--
-- public.products is the OPEN, user/catalog-facing product layer: Colin &
-- Mercadona catalogs, customer uploads, label/barcode/EAN scans, OCR/image
-- extraction, manual entry, and API ingestion. It is the OPPOSITE of the LOCKED
-- reference base (migration 0006): products grows continuously and is per-user
-- owned; the locked base is version-replaced and read-only.
--
-- This migration is a SKELETON only: columns + ownership RLS + grants + an
-- updated_at touch trigger. NO seed (products starts empty). NO OCR/camera, NO
-- API ingestion, NO matching logic, NO promotion workflow — those are future
-- slices.
--
-- Engine-ready mirroring: the composition + engine-value columns below mirror
-- the locked reference table verbatim IN TYPE (all numeric, all nullable, never
-- invented as 0), and the food-safety text flags reuse the same CHECK domains,
-- so a future PI-Verified product can later be mapped 1:1 into a reference CSV
-- row. As in the reference table, there is deliberately NO ingredient-level NPAC
-- value (v0.95 no-NPAC): pac_value is the freezing-power source of truth, pod_value the
-- sweetness source of truth, and recipe-level NPAC is derived by the engine.
--
-- NO AUTO-WRITE TO THE LOCKED REFERENCE BASE: this file contains NO trigger,
-- function, foreign key, or insert/update/delete that targets the locked
-- reference table. Its executable SQL never references it. Promotion of a
-- PI-Verified product into the reference base is a FUTURE manual, reviewed,
-- version-replacement step (out of scope here). The promoted_to_basement /
-- promoted_at columns are inert provenance only — no trigger or function reads
-- or acts on them in this migration.
--
-- ean_code / barcode are NOT globally unique: the same commercial product may be
-- scanned or imported by many users / catalogs. Deduplication & matching are
-- future Mapper logic, not this slice.
--
-- Apply in the Supabase SQL editor or via `supabase db push`. No seed, no
-- privileged key. The locked reference base and the 0004/0005 rollback tables
-- are untouched. (Policies are not `if not exists` — on a true re-apply, drop
-- the four products_*_own policies first.)

create table if not exists public.products (
  -- identity / ownership
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  -- product identity (user-supplied; nullable — raw uploads/scans arrive incomplete)
  brand text,
  supplier text,
  ean_code text,
  barcode text,
  product_name_internal text,
  product_name_display text,
  product_category text,
  product_subcategory text,
  country text,
  -- composition (per 100 g) — mirrors the locked reference table in type
  -- (all numeric, nullable; blank stays NULL, never invented as 0)
  water_percent numeric,
  total_solids_percent numeric,
  fat_percent numeric,
  saturated_fat_percent numeric,
  milk_fat_percent numeric,
  non_fat_milk_solids_percent numeric,
  protein_percent numeric,
  aerating_protein_percent numeric,
  carbohydrate_percent numeric,
  total_sugars_percent numeric,
  sucrose_percent numeric,
  dextrose_percent numeric,
  glucose_percent numeric,
  fructose_percent numeric,
  lactose_percent numeric,
  polyol_percent numeric,
  fiber_percent numeric,
  salt_percent numeric,
  alcohol_percent numeric,
  ash_percent numeric,
  acidity_percent numeric,
  brix numeric,
  dry_matter_percent numeric,
  -- engine values — pac_value is the freezing-power source of truth, pod_value
  -- the sweetness source of truth. Deliberately NO ingredient-level NPAC value.
  pod_value numeric,
  pac_value numeric,
  de_value numeric,
  sweetness_factor numeric,
  freezing_factor numeric,
  stabilizer_activity numeric,
  recommended_dosage_percent_min numeric,
  recommended_dosage_percent_max numeric,
  -- nutrition / cost
  kcal_per_100g numeric,
  cost_per_kg numeric,                                      -- NULL = unknown; 0 = verified free
  currency text,
  -- food safety / usage (same CHECK domains as the locked reference table)
  allergens text,
  vegan text check (vegan in ('true', 'false', 'unknown')),
  dairy_free text check (dairy_free in ('true', 'false', 'unknown')),
  gluten_free text check (gluten_free in ('true', 'false', 'unknown')),
  contains_alcohol text check (contains_alcohol in ('true', 'false', 'unknown')),
  storage_type text check (storage_type in ('ambient', 'chilled', 'frozen', 'dry', 'unknown')),
  shelf_life_days numeric,
  usage_notes text,
  engine_notes text,
  -- intake placeholders — COLUMNS ONLY, NO LOGIC this slice
  product_image_url text,                                   -- captured/uploaded label image (no storage logic here)
  detected_text text,                                       -- raw OCR text (no OCR runs in this migration)
  extracted_json jsonb,                                     -- structured extraction payload (no extractor runs here)
  catalog_source text,                                      -- free-text origin label (e.g. mercadona-2026-06); distinct from source_type
  -- lifecycle / classification (two text CHECKs)
  status text not null default 'draft'
    check (status in (
      'draft', 'pi_calculated', 'pi_generated', 'manual_adjusted', 'pi_verified', 'rejected'
    )),
  source_type text not null default 'manual'
    check (source_type in (
      'customer_upload', 'label_scan', 'barcode_ean', 'catalog_import',
      'mercadona', 'colin_catalog', 'manual', 'api'
    )),
  -- review fields (inert; no workflow this slice)
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  -- promotion provenance — INERT columns only; no trigger/function targets the reference base
  promoted_to_basement boolean not null default false,
  promoted_at timestamptz,
  -- dataset / lifecycle metadata
  dataset_version text,                                     -- nullable, no default: products is unversioned at intake
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_owner_user_id_idx on public.products (owner_user_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_source_type_idx on public.products (source_type);
create index if not exists products_ean_code_idx on public.products (ean_code);

-- keep updated_at fresh (reuses public.touch_updated_at() from migration 0001 — NOT redefined here)
drop trigger if exists products_touch on public.products;
create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security: own-row CRUD only (mirrors saved_recipes, 0001) ───────
alter table public.products enable row level security;

create policy products_select_own on public.products
  for select using (auth.uid() = owner_user_id);
create policy products_insert_own on public.products
  for insert with check (auth.uid() = owner_user_id);
create policy products_update_own on public.products
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy products_delete_own on public.products
  for delete using (auth.uid() = owner_user_id);

-- ── Grants: full CRUD for authenticated only (RLS scopes to the owner). No anon
--    table grant, no privileged role grant. Mirrors the 0002 saved_recipes grant.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.products to authenticated;
