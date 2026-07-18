-- 0033 — Track F (owner 2026-07-18): DEMO-SAFE search read model for the canonical
-- Mapper Basement ingredient library (Składniki PI).
--
-- WHY: the owner decided catalogue SEARCH is not gated by a paid subscription —
-- only the EXACT GRAMS output is. Demo (including anonymous) visitors may browse
-- and search the approved ingredient library by name/category. The existing 0032
-- view (`mapper_basement_search`) is authenticated-only AND carries engine fields
-- (pac/pod, composition, confidence) that must never reach an anonymous session,
-- so a second, strictly narrower view is needed for the public search path.
--
-- WHAT: a read-only VIEW exposing ONLY safe display fields — identity (id + names),
-- category/subcategory, the four dietary flags, the two approval booleans and the
-- dataset version — filtered to the approved library (`is_active AND
-- approved_for_base`). It deliberately exposes NO pac/pod, NO composition
-- percentages, NO sweetness/freezing factors, NO dosage recommendations, NO
-- confidence/verification internals, NO EAN and NO admin fields. It runs with the
-- view owner's rights (NOT security_invoker) so it is the sanctioned demo-safe
-- read model over the Pro-only base-table RLS, and it is granted to `anon` AND
-- `authenticated` (search for everyone; grams stay gated elsewhere). The base
-- table, its RLS, and the 0032 rich view are UNCHANGED.
--
-- SAFETY: apply to STAGING (tunabqqrwabacxjcxxkz) only. Never to prod
-- (riwipywgqobrulyzrzad) or MOOTOORS (tjntmljkrxbpwjmkautu). Read-only; reversible
-- with `drop view public.mapper_basement_search_demo;`. No scientific Mapper value
-- is changed. Idempotent (create or replace).

create or replace view public.mapper_basement_search_demo
with (security_invoker = false) as
select
  ingredient_id,
  ingredient_name_display,
  ingredient_name_internal,
  ingredient_category,
  ingredient_subcategory,
  vegan,
  dairy_free,
  gluten_free,
  contains_alcohol,
  approved_for_base,
  approved_for_engines,
  dataset_version
from public.mapper_basement
where is_active
  and approved_for_base;

comment on view public.mapper_basement_search_demo is
  'Track F demo-safe search read model: approved Mapper Basement ingredients (Składniki PI), safe display fields only — no engine values, no composition, no confidence, no EAN. Readable by anon and authenticated (search is not subscription-gated; exact grams stay gated). Staging only.';

revoke all on public.mapper_basement_search_demo from public;
grant select on public.mapper_basement_search_demo to anon;
grant select on public.mapper_basement_search_demo to authenticated;
