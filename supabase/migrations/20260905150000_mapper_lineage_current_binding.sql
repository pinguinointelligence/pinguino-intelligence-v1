-- A Mapper republish silently revoked every permission from dependent products.
--
-- `classify_catalog_product_behavior_v2` accepted a catalog product's frozen
-- ProductBehaviour authority only while the exact historical Mapper binding row
-- it was computed against was ITSELF still current:
--
--     and exists(
--       select 1 from public.mapper_product_behavior_bindings authority_binding
--       where authority_binding.id::text=
--           v_public_data#>>'{...,mapperBehaviorBindingId}'
--         and authority_binding.mapper_ingredient_id=v_behavior_reference
--         and authority_binding.is_current
--         and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
--     )
--
-- The 2026-08-29 `canonical-module-eligibility-v1` sweep superseded every row in
-- `mapper_product_behavior_bindings` and re-enqueued dependent catalog versions
-- by `catalog_binding.mapper_ingredient_id` — which is NULL for PR products, so
-- they were never re-linked. Their stored ids still point at the superseded
-- rows, the predicate fails, and reclassifying such a product sets
-- BASE_RECIPE, MONITOR, NUTRITION, PRODUCTION and SAVE all to false.
--
-- Measured on staging before this change: 9 of the 12 active catalog products
-- carrying a Mapper reference were in that state, 7 of them base-capable,
-- including the owner's Cacao Puro (PR-ING-007142). It is a latent landmine on
-- ANY future reclassification, not a property of one workstream.
--
-- A product mapped to PI-ING-001313 does not stop being mapped to PI-ING-001313
-- because the Mapper classifier published a newer behaviour row for it. The
-- stored id is PROVENANCE; current policy must be read from the CURRENT binding
-- for the SAME Mapper ingredient.
--
-- The relationship is not loosened. Acceptance now proves all of:
--   1. the product carries a reference Mapper ingredient;
--   2. that exact ingredient exists and is active in the Mapper;
--   3. the stored provenance row belongs to that SAME ingredient, so a foreign
--      binding can never stand in for it;
--   4. a CURRENT binding exists for that SAME ingredient;
--   5. that current binding carries the required permission.
-- A missing reference, a missing ingredient, incoherent provenance, a missing
-- current binding or a current binding without the permission all fail closed.

select pg_advisory_xact_lock(hashtextextended('mapper-lineage-current-binding-v1',0));

do $patch_lineage$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_changed boolean := false;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched := v_definition;

  -- 1. BASE acceptance. Anchored on the BASE_RECIPE conjunct, which makes this
  --    block unique against the topping block below.
  if strpos(v_patched, $marker$authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)$marker$) > 0 then
    v_old := $old$    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
    );$old$;
    v_new := $new$    and exists(
      select 1 from public.mapper_basement referenced_ingredient
      where referenced_ingredient.ingredient_id=v_behavior_reference
        and referenced_ingredient.is_active
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings provenance_binding
      where provenance_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and provenance_binding.mapper_ingredient_id=v_behavior_reference
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
    );$new$;
    if strpos(v_patched, v_old) = 0 then
      raise exception 'base lineage anchor drifted';
    end if;
    v_patched := replace(v_patched, v_old, v_new);
    v_changed := true;
  end if;

  -- 2. TOPPING acceptance. Once the base block above is rewritten this is the
  --    only remaining historical-id predicate, so the anchor is unambiguous.
  if strpos(v_patched, $marker$authority_binding.id::text=$marker$) > 0 then
    v_old := $old$    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
    );$old$;
    v_new := $new$    and exists(
      select 1 from public.mapper_basement referenced_ingredient
      where referenced_ingredient.ingredient_id=v_behavior_reference
        and referenced_ingredient.is_active
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings provenance_binding
      where provenance_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and provenance_binding.mapper_ingredient_id=v_behavior_reference
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
    );$new$;
    if strpos(v_patched, v_old) = 0 then
      raise exception 'topping lineage anchor drifted';
    end if;
    v_patched := replace(v_patched, v_old, v_new);
    v_changed := true;
  end if;

  if v_changed then execute v_patched; end if;
end $patch_lineage$;

-- Fail closed if the published lineage resolution is not the intended one.
do $verify_lineage$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  -- No acceptance predicate may gate on the historical row still being current.
  if strpos(v_definition, $check$authority_binding.id::text=$check$) > 0 then
    raise exception 'acceptance still gates on the historical binding id';
  end if;
  -- Provenance is still proven, and still bound to the same ingredient.
  if strpos(v_definition,
    $check$provenance_binding.mapper_ingredient_id=v_behavior_reference$check$) = 0 then
    raise exception 'provenance coherence check not published';
  end if;
  -- The referenced Mapper ingredient must exist and be active.
  if strpos(v_definition,
    $check$referenced_ingredient.ingredient_id=v_behavior_reference$check$) = 0 then
    raise exception 'referenced ingredient existence check not published';
  end if;
  -- Current policy is read from a current binding for the SAME ingredient.
  if strpos(v_definition,
    $check$authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)$check$) = 0 then
    raise exception 'current BASE_RECIPE policy check not published';
  end if;
  -- The reference itself is still required.
  if strpos(v_definition, $check$v_behavior_reference is not null$check$) = 0 then
    raise exception 'reference requirement drifted';
  end if;
end $verify_lineage$;
