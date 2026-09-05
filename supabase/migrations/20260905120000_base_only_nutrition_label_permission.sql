-- A BASE_ONLY catalog product could never publish nutrition or label facts, and
-- was granted a Production it could never complete.
--
-- `classify_catalog_product_behavior_v2` derived three permissions like this:
--
--     'PRODUCTION',(v_product_behavior_accepted and v_base)
--                  or (v_product_behavior_topping_accepted and v_topping)
--     'LABEL',     v_product_behavior_topping_accepted and v_topping
--     'NUTRITION', v_product_behavior_topping_accepted and v_topping
--
-- `v_product_behavior_topping_accepted` requires
-- productBehaviorAuthority.toppingEligible = true. A product whose owner-approved
-- intendedUsageRole is BASE_ONLY (a cocoa powder, a drinking milk) is therefore
-- structurally incapable of ever holding NUTRITION, no matter how complete its
-- own label is — while the same classifier grants it PRODUCTION, MONITOR,
-- BASE_RECIPE and SAVE from the base path.
--
-- `PRODUCTION=true, NUTRITION=false` is not an executable state.
-- `buildCurrentRecipeResultAuthority` gates MONITOR+NUTRITION+COST+SUMMARY
-- together, so the recipe could never become CURRENT, `recordCalculatedRecipe`
-- was never reached, and Recalculate -> Apply -> "recalculate again" never
-- terminated. `completeProductionSession` requires the NUTRITION gate too, so
-- the batch could not be completed either.
--
-- Two corrections, both keyed on the SAME evidence predicate:
--
--   1. NUTRITION and LABEL gain the base acceptance path, so a complete
--      BASE_ONLY product can publish its own label facts.
--   2. PRODUCTION's base branch gains the evidence conjunct, so Production is
--      never promised where nutrition cannot follow. A product with genuinely
--      incomplete evidence is refused before it can enter an impossible
--      Production lifecycle, instead of failing at completion.
--
-- No evidence requirement is weakened. `v_topping` — ingredients text,
-- allergens text and a nutrition object, on a product that is not
-- verification-blocked — is now a required conjunct of every branch of all
-- three permissions. A product without that evidence keeps exactly the
-- permissions it had, minus PRODUCTION.
--
-- Deliberately unchanged: SEARCH, BASE_RECIPE, MAIN, OPTIMAL, ECO, TOPPING,
-- SUBSTITUTION, COST, MONITOR and SAVE, so an incomplete product stays visible
-- and usable in a recipe; the topping disjunct, which is byte-identical to the
-- previous expression; `process_behavior`; and
-- `resolve_product_behavior_evidence_gate_v1`, which keeps its independent
-- `v_has_nutrition` / `v_has_allergens` second gate. Mapper-reference products
-- are classified by a different function and never reach this one.

select pg_advisory_xact_lock(hashtextextended('base-only-nutrition-label-permission-v1',0));

do $patch_classifier$
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

  -- 1. Production follows the evidence that Production completion requires.
  if strpos(v_patched,
    $marker$'PRODUCTION',(v_product_behavior_accepted and v_base and v_topping)$marker$) = 0 then
    v_old := $old$      'PRODUCTION',(v_product_behavior_accepted and v_base) or (v_product_behavior_topping_accepted and v_topping),$old$;
    v_new := $new$      'PRODUCTION',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),$new$;
    if strpos(v_patched, v_old) = 0 then
      raise exception 'PRODUCTION permission anchor drifted';
    end if;
    v_patched := replace(v_patched, v_old, v_new);
    v_changed := true;
  end if;

  -- 2. Label and nutrition are publishable from the base path too.
  if strpos(v_patched,
    $marker$'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)$marker$) = 0 then
    v_old := $old$      'LABEL',v_product_behavior_topping_accepted and v_topping,
      'NUTRITION',v_product_behavior_topping_accepted and v_topping,$old$;
    v_new := $new$      'LABEL',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),
      'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),$new$;
    if strpos(v_patched, v_old) = 0 then
      raise exception 'catalog behaviour permission anchor drifted';
    end if;
    v_patched := replace(v_patched, v_old, v_new);
    v_changed := true;
  end if;

  if v_changed then execute v_patched; end if;
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
    $check$'PRODUCTION',(v_product_behavior_accepted and v_base and v_topping)$check$) = 0 then
    raise exception 'PRODUCTION evidence conjunct not published';
  end if;
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
  -- An incomplete product must keep the permissions that stay safe.
  if strpos(v_definition,
    $check$'BASE_RECIPE',v_product_behavior_accepted and v_base,$check$) = 0 then
    raise exception 'BASE_RECIPE derivation drifted';
  end if;
  if strpos(v_definition,
    $check$'MONITOR',v_product_behavior_accepted and v_base,$check$) = 0 then
    raise exception 'MONITOR derivation drifted';
  end if;
  if strpos(v_definition,
    $check$'SAVE',(v_product_behavior_accepted and v_base) or (v_product_behavior_topping_accepted and v_topping)$check$) = 0 then
    raise exception 'SAVE derivation drifted';
  end if;
end $verify_classifier$;
