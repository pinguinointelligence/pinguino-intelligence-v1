-- 0032 — Track F (owner 2026-07-17): safe search read model for the canonical
-- Mapper Basement ingredient library (Składniki PI).
--
-- WHY: the customer Product/Ingredient Picker cannot search the 2,083-row
-- `mapper_basement` library because its ONLY SELECT policy
-- (`mapper_basement_select_pro`) is gated on `authenticated` + an ACTIVE
-- subscription + `approved_for_base`. Searching the ingredient library to build a
-- recipe should be available to any eligible (logged-in) user — the subscription
-- gates the EXACT GRAMS output, not the ability to browse the library.
--
-- WHAT: a read-only VIEW exposing ONLY approved, non-administrative fields
-- (identity, category, the composition + PAC/POD the engine needs, dietary flags,
-- dosage, confidence/verification, dataset version), filtered to the approved
-- library (`is_active AND approved_for_base` → ~2,070 rows). It runs with the view
-- owner's rights (NOT security_invoker) so it is the sanctioned "approved read
-- model" that bypasses the Pro-only base-table RLS, and it is granted to
-- `authenticated` only (never `anon`, never `public`). No private admin fields
-- (supplier, verification source/date, source URLs, screenshots, review trail,
-- cost) are exposed. The base table and its RLS are UNCHANGED.
--
-- SAFETY: apply to STAGING (tunabqqrwabacxjcxxkz) only. Never to prod
-- (riwipywgqobrulyzrzad) or MOOTOORS (tjntmljkrxbpwjmkautu). Read-only; reversible
-- with `drop view public.mapper_basement_search;`. No scientific Mapper value is
-- changed. Idempotent (create or replace).

create or replace view public.mapper_basement_search
with (security_invoker = false) as
select
  ingredient_id,
  ingredient_name_display,
  ingredient_name_internal,
  ingredient_category,
  ingredient_subcategory,
  ean_code,
  pac_value,
  pod_value,
  total_solids_percent,
  total_sugars_percent,
  fat_percent,
  non_fat_milk_solids_percent,
  protein_percent,
  alcohol_percent,
  sweetness_factor,
  freezing_factor,
  recommended_dosage_percent_min,
  recommended_dosage_percent_max,
  allergens,
  vegan,
  dairy_free,
  gluten_free,
  contains_alcohol,
  data_confidence_percent,
  verification_status,
  dataset_version,
  approved_for_base,
  approved_for_engines
from public.mapper_basement
where is_active
  and approved_for_base;

comment on view public.mapper_basement_search is
  'Track F safe search read model: approved Mapper Basement ingredients (Składniki PI), non-admin fields only, readable by authenticated users without a subscription. Staging only.';

revoke all on public.mapper_basement_search from public;
revoke all on public.mapper_basement_search from anon;
grant select on public.mapper_basement_search to authenticated;
