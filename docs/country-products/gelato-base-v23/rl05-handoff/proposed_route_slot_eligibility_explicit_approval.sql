-- PROPOSED — NOT APPLIED. Owner-approved narrow correction (2026-09-12) for RL-05 / RL-20.
-- Apply as ONE forward-only migration (e.g. supabase/migrations/<ts>_route_slot_eligibility_explicit_approval.sql)
-- through the normal migration path; never via a generic `supabase db push` of unrelated files.
--
-- OLD gate (private.product_canonical_slot_candidate_is_valid_v1, defined in
-- 20260904110935_product_canonical_slot_review_authority.sql), mapper join:
--     and mapper.is_active
--     and mapper.approved_for_base
--     and mapper.approved_for_engines
--     and lower(coalesce(mapper.verification_status, '')) like 'verified%'
--
-- verification_status is provenance metadata. Since the FINAL-2541 sync it reads
-- 'Estimated / PI Calculated' for MILK (PI-ING-000236), CREAM (PI-ING-000180) and SMP
-- (PI-ING-000270), so every approved country route for them is silently unusable.
--
-- NEW gate: the explicit FINAL approval flags are the Mapper authority —
--     mapper.is_active and mapper.approved_for_base and mapper.approved_for_engines
-- Every other existing guard stays byte-identical.
--
-- Expected effect today: the 3 active slot reviews (PR-ING-007172 PL, -007173 ES, -007174 FR on
-- PI-ING-000236) become valid → the 3 live milk routes resolve.
-- Negative controls (run after applying — all must return false):
--   select private.product_canonical_slot_candidate_is_valid_v1(p.id, p.current_version_id, 'PI-ING-001705')
--     from public.products p where p.product_code = 'PR-ING-007173';   -- FINAL-blocked PI (approved false/false)
--   select private.product_canonical_slot_candidate_is_valid_v1(p.id, p.current_version_id, 'PI-ING-000618')
--     from public.products p where p.product_code = 'PR-ING-007173';   -- FINAL-blocked PI
--   a product whose current binding_status <> 'ready' must stay false for any PI.
-- Positive checks (must return true / the owner-selected product):
--   select private.country_product_slot_assignment_is_usable_v1(a.country_code, a.mapper_ingredient_id, a.product_id)
--     from public.country_product_slot_assignments a;   -- 3 × true
-- Rollback: re-run the OLD definition from 20260904110935 (the only change is the removed line).
create or replace function private.product_canonical_slot_candidate_is_valid_v1(
  p_product_id uuid,
  p_product_version_id uuid,
  p_mapper_ingredient_id text
)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog'
as $function$
  select exists (
    select 1
    from public.products product
    join public.product_versions version
      on version.id = p_product_version_id
     and version.product_id = product.id
     and version.id = product.current_version_id
    join public.product_behavior_bindings binding
      on binding.id = product.current_behavior_binding_id
     and binding.product_id = product.id
     and binding.product_version_id = version.id
     and binding.is_current
    join public.mapper_basement mapper
      on mapper.ingredient_id = btrim(p_mapper_ingredient_id)
     and mapper.is_active
     and mapper.approved_for_base
     and mapper.approved_for_engines
    where product.id = p_product_id
      and product.product_kind in ('commercial_product', 'customer_provisional')
      and product.is_active
      and product.merged_into_product_id is null
      and product.canonical_verification_status <> 'blocked'
      and binding.binding_status = 'ready'
      and coalesce((binding.profile_permissions->>'BASE_RECIPE')::boolean, false)
      and (
        coalesce(version.facts->'public_data', version.facts)
          #>> '{productIntelligence,engineUsable}'
      ) = 'true'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,water}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,totalSolids}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,fat}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,protein}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,carbohydrate}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,sugars}') = 'number'
      and jsonb_typeof(coalesce(version.facts->'public_data', version.facts) #> '{technicalComposition,salt}') = 'number'
  )
$function$;
