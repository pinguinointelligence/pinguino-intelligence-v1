-- ============================================================================
-- S2 RECIPE-SAVE REPAIR — legacy orphan reconciliation (OWNER-RUN)
-- ============================================================================
-- Context: before the repair, the top-right "Zapisz recepturę" wrote saved_recipes
-- ONLY (no aggregate meta, no immutable version). Those legacy rows are "orphans":
-- they still appear in /my-recipes (which reads saved_recipes directly), so NO DATA
-- IS LOST — but they are not yet versionable under the canonical pro-core model.
--
-- This script is ADDITIVE and IDEMPOTENT: it inserts a saved_recipe_meta row +
-- an immutable v1 for every orphan, and nothing else. It DELETES nothing and can be
-- re-run safely (guards on "missing meta" / "no existing versions").
--
-- On staging as of 2026-07-21 there are exactly TWO orphans, both pro@pro.com:
--   f8b66a9e "a2"  ·  9e26e6c8 "a4"   (engine 0.4.0 / config 0.7.0, batch 1000 g)
--
-- HOW TO RUN (owner / Nicolas): Supabase SQL editor for project
--   tunabqqrwabacxjcxxkz  (staging)  — NEVER the prod project riwipywgqobrulyzrzad.
--   (The Claude auto-mode classifier blocks this write from the agent side.)
-- ============================================================================

with orphans as (
  select sr.* from saved_recipes sr
  left join saved_recipe_meta m on m.recipe_id = sr.id
  where m.recipe_id is null
),
ins_meta as (
  insert into saved_recipe_meta (recipe_id, owner_user_id, workspace_id, archived, latest_version_number)
  select o.id, o.user_id, null, false, 1 from orphans o
  returning recipe_id
),
ins_ver as (
  insert into recipe_versions
    (recipe_id, owner_user_id, version_number, recipe_input, total_batch_g, product_profile,
     temperature_c, engine_version, config_version, mapper_dataset_version, source, created_by)
  select o.id, o.user_id, 1, o.recipe_input, o.batch_grams, o.product_type,
         nullif(o.recipe_input->>'target_temperature_c','')::numeric,
         o.engine_version, o.config_version, null, 'imported', o.user_id
  from orphans o
  where not exists (select 1 from recipe_versions rv where rv.recipe_id = o.id)
  returning recipe_id, version_number
)
select
  (select count(*) from ins_meta) as meta_backfilled,
  (select count(*) from ins_ver)  as versions_backfilled;

-- Verify afterwards (should be 0 orphans):
--   select count(*) from saved_recipes sr
--   left join saved_recipe_meta m on m.recipe_id = sr.id
--   where m.recipe_id is null;
