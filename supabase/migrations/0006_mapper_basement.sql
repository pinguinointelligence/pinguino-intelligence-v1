-- Mapper Basement — the locked PINGÜINO reference ingredient table (v0.95, no-NPAC).
--
-- `public.mapper_basement` is the locked reference base (the "brain") for the
-- Mapper: the approved PINGÜINO base ingredients/products and their technical
-- values. It is NEVER automatically modified — it changes only by an approved
-- internal version replacement, and it is not used for customer uploads.
-- Source of truth on disk: docs/ingredients/validation/mapper_basement.csv
-- (542 rows). Loaded by supabase/seed/mapper_basement_v0_95.sql.
--
-- No-NPAC model: there is deliberately NO ingredient-level NPAC value.
--   • `pac_value` is the ingredient freezing-power source of truth.
--   • `pod_value` is the ingredient sweetness source of truth.
--   • recipe-level PAC/POD/NPAC are computed by the deterministic engine.
--
-- Column naming: `approved_for_base` (accepted into the locked base set) and
-- `approved_for_engines` (composition is universal across PI recipe engines,
-- not −11°C-only) — replacing the older base / engine approval column names.
--
-- Access model:
--   • anon                : NO access (no grant, no policy).
--   • authenticated FREE  : NO rows (the only SELECT policy is PI Pro-gated).
--   • PI Pro              : may READ active, base-approved rows.
--   • writes              : admin/server-side only (no user insert/update/delete).
--
-- Rollback: the legacy tables `public.ingredients_final_v0_95_no_npac` (0005)
-- and `public.ingredients` (0004) are kept for ROLLBACK ONLY and are NOT dropped.
-- The app keeps querying the legacy table until a later slice switches it over.
--
-- Apply in the Supabase SQL editor or via `supabase db push`, then load
-- supabase/seed/mapper_basement_v0_95.sql. No privileged key here.

create table if not exists public.mapper_basement (
  -- identity
  ingredient_id text primary key,                          -- stable, unique, never reused
  ingredient_name_internal text not null,
  ingredient_name_display text not null,
  brand text,
  supplier text,
  country text,
  ean_code text,
  ingredient_category text not null,
  ingredient_subcategory text,
  -- approval & verification
  approved_for_base boolean not null default false,
  approved_for_engines boolean not null default false,
  verification_status text not null default 'draft'
    check (verification_status in (
      'draft', 'internet_data', 'label_data', 'supplier_data',
      'external_reference_data', 'needs_review', 'verified', 'rejected'
    )),
  verification_source text,
  verification_date date,
  data_confidence_percent integer check (data_confidence_percent between 0 and 100),
  -- composition (per 100 g; blank in source stays NULL — never invented as 0)
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
  -- engine values — pac_value is the freezing-power source of truth.
  -- NOTE: there is deliberately NO ingredient-level NPAC column (v0.95 no-NPAC
  -- model); recipe-level NPAC is derived by the engine.
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
  -- food safety / usage
  allergens text,
  vegan text check (vegan in ('true', 'false', 'unknown')),
  dairy_free text check (dairy_free in ('true', 'false', 'unknown')),
  gluten_free text check (gluten_free in ('true', 'false', 'unknown')),
  contains_alcohol text check (contains_alcohol in ('true', 'false', 'unknown')),
  storage_type text check (storage_type in ('ambient', 'chilled', 'frozen', 'dry', 'unknown')),
  shelf_life_days numeric,
  usage_notes text,
  engine_notes text,
  source_url text,
  screenshot_reference text,
  last_reviewed_by text,
  last_reviewed_at date,
  -- dataset / lifecycle metadata
  dataset_version text not null default 'v0.95',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mapper_basement_category_idx
  on public.mapper_basement (ingredient_category);
create index if not exists mapper_basement_active_approved_idx
  on public.mapper_basement (is_active, approved_for_base);
create index if not exists mapper_basement_engine_approved_idx
  on public.mapper_basement (approved_for_engines);

-- keep updated_at fresh (reuses the function from migration 0001)
drop trigger if exists mapper_basement_touch on public.mapper_basement;
create trigger mapper_basement_touch
  before update on public.mapper_basement
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security: PI Pro read-only; no public/free/write access ─────────
alter table public.mapper_basement enable row level security;

-- The ONLY policy: a PI Pro member may read active, base-approved ingredients.
-- Free/authenticated users match the policy role but the subscription check
-- yields zero rows; anon matches no policy at all. There is deliberately NO
-- insert/update/delete policy — writes are admin/server-side only.
create policy mapper_basement_select_pro on public.mapper_basement
  for select
  to authenticated
  using (
    is_active
    and approved_for_base
    and exists (
      select 1
      from public.subscriptions s
      where s.user_id = auth.uid()
        and (
          s.subscription_status in ('active', 'trialing')
          or (s.subscription_status = 'past_due' and s.current_period_end > now())
        )
    )
  );

-- ── Grants: SELECT for authenticated only (RLS narrows it to Pro). No anon.
--    No insert/update/delete to anyone — the import runs server-side only. ─────
grant usage on schema public to authenticated;
grant select on public.mapper_basement to authenticated;
