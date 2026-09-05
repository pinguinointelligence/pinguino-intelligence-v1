-- BASE_ONLY catalog products could never publish nutrition or label facts.
--
-- `classify_catalog_product_behavior_v2` derived the NUTRITION and LABEL
-- permissions exclusively from the TOPPING acceptance path:
--
--     'LABEL',    v_product_behavior_topping_accepted and v_topping
--     'NUTRITION',v_product_behavior_topping_accepted and v_topping
--
-- `v_product_behavior_topping_accepted` requires
-- productBehaviorAuthority.toppingEligible = true. A product whose owner-approved
-- intendedUsageRole is BASE_ONLY (a cocoa powder, a drinking milk) is therefore
-- structurally incapable of ever holding NUTRITION, no matter how complete its
-- own label is — while the same classifier grants it PRODUCTION, MONITOR,
-- BASE_RECIPE and SAVE from the base path.
--
-- The result was the executable contradiction `PRODUCTION=true, NUTRITION=false`.
-- `buildCurrentRecipeResultAuthority` gates on MONITOR+NUTRITION+COST+SUMMARY
-- together, so the recipe could never become CURRENT, `recordCalculatedRecipe`
-- was never reached, and Recalculate → Apply → "recalculate again" never
-- terminated. `completeProductionSession` requires the NUTRITION gate too, so
-- the batch could not be completed either.
--
-- The fix adds the BASE acceptance path to both permissions and changes nothing
-- else. The evidence requirement is untouched: `v_topping` remains a required
-- conjunct on every branch, so ingredientsText + allergensText + a nutrition
-- object must still be present and the product must not be verification-blocked.
-- A product with genuinely missing label evidence stays blocked exactly as
-- before. The topping branch is byte-identical to the previous expression, so
-- TOPPING_ONLY products are unaffected, and mapper-reference products never
-- passed through this function at all.
--
-- `resolve_product_behavior_evidence_gate_v1` keeps its independent second
-- gate (`v_has_nutrition` / `v_has_allergens`), which is deliberately not
-- touched here: permission and frozen-facts completeness stay two separate
-- checks.

select pg_advisory_xact_lock(hashtextextended('base-only-nutrition-label-permission-v1',0));

do $patch_classifier$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_marker text;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched := v_definition;

  v_marker := $marker$'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)$marker$;

  v_old := $old$      'LABEL',v_product_behavior_topping_accepted and v_topping,
      'NUTRITION',v_product_behavior_topping_accepted and v_topping,$old$;

  v_new := $new$      'LABEL',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),
      'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),$new$;

  if strpos(v_patched, v_marker) = 0 then
    if strpos(v_patched, v_old) = 0 then
      raise exception 'catalog behaviour permission anchor drifted';
    end if;
    v_patched := replace(v_patched, v_old, v_new);
    execute v_patched;
  end if;
end $patch_classifier$;

-- Fail closed if the published derivation is not the intended one.
do $verify_classifier$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  if strpos(v_definition,
    $check$'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)$check$) = 0 then
    raise exception 'NUTRITION base path not published';
  end if;
  if strpos(v_definition,
    $check$'LABEL',(v_product_behavior_accepted and v_base and v_topping)$check$) = 0 then
    raise exception 'LABEL base path not published';
  end if;
  -- The topping branch must survive untouched.
  if strpos(v_definition,
    $check$'TOPPING',v_product_behavior_topping_accepted and v_topping$check$) = 0 then
    raise exception 'TOPPING derivation drifted';
  end if;
  -- Evidence completeness must remain a required conjunct on every branch.
  if strpos(v_definition,
    $check$or (v_product_behavior_topping_accepted and v_topping),$check$) = 0 then
    raise exception 'evidence conjunct missing from published derivation';
  end if;
end $verify_classifier$;
