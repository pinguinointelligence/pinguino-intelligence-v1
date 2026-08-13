-- Phase Ingredients 1 — PINGÜINO Base Ingredients library (v0.94).
--
-- Stores the internally-confirmed PI Base ingredient profiles (the frozen Hermes
-- schema, column-for-column) plus a little provenance metadata. This is reusable
-- DATA, not a recipe and not engine code: nothing here computes recipe numbers.
--
-- Access model (Phase Ingredients 1 decision):
--   • anon                : NO access (no grant, no policy).
--   • authenticated FREE  : NO rows (the only SELECT policy is PI Pro-gated).
--   • PI Pro              : may READ active, PINGÜINO-Base-approved rows.
--   • NOBODY (frontend)   : may insert/update/delete — imports are admin/server
--                           side only (applied with privileged DB credentials
--                           that live solely in the server/CI environment).
--
-- "Pro" reuses the Phase 2B.1 subscriptions cache: active / trialing, plus
-- past_due kept until current_period_end (same rule as access/subscription.ts).
--
-- Apply in the Supabase SQL editor or via `supabase db push`, then load
-- supabase/seed/ingredients_v0_94.sql. No privileged key is referenced here.

-- ── ingredients: one row per confirmed PI Base ingredient profile ────────────
create table if not exists public.ingredients (
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
  approved_for_pinguino_base boolean not null default false,
  approved_for_minus_11_engine boolean not null default false,
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
  -- engine values (sucrose = 100 basis; may exceed 100; NULL = unknown)
  pod_value numeric,
  pac_value numeric,
  npac_value numeric,
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
  dataset_version text not null default 'v0.94',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredients_category_idx on public.ingredients (ingredient_category);
create index if not exists ingredients_active_approved_idx
  on public.ingredients (is_active, approved_for_pinguino_base);
create index if not exists ingredients_engine_approved_idx
  on public.ingredients (approved_for_minus_11_engine);

-- keep updated_at fresh (reuses the function from migration 0001)
drop trigger if exists ingredients_touch on public.ingredients;
create trigger ingredients_touch
  before update on public.ingredients
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security: PI Pro read-only; no public/free/write access ─────────
alter table public.ingredients enable row level security;

-- The ONLY policy: a PI Pro member may read active, approved ingredients.
-- Free/authenticated users match the policy role but the subscription check
-- yields zero rows; anon matches no policy at all. There is deliberately NO
-- insert/update/delete policy — writes are admin/server-side only.
create policy ingredients_select_pro on public.ingredients
  for select
  to authenticated
  using (
    is_active
    and approved_for_pinguino_base
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
grant select on public.ingredients to authenticated;
