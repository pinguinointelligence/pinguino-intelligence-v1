-- Deterministic rollback for 20260912183500_route_slot_eligibility_explicit_approval.sql.
-- Restores the previous function from migration 20260904110935 verbatim.

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
     and lower(coalesce(mapper.verification_status, '')) like 'verified%'
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
