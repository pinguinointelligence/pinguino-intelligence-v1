-- Republish every catalog/customer binding that the topping-only NUTRITION
-- derivation had left in the `PRODUCTION=true, NUTRITION=false` state.
--
-- This runs the canonical reclassification path only —
-- `enqueue_product_behavior_reclassification_v1` followed by
-- `process_product_behavior_reclassification_queue_v1`. No row of
-- `profile_permissions` is written by hand.
--
-- One detail decides whether this does anything at all. The classifier upserts
-- `on conflict(product_version_id,classifier_version) do update set
-- classified_at=now()`, and the enqueue helper derives its default classifier
-- version from the ENTITY fingerprint, which has not changed. Re-running under
-- the default version would therefore hit the conflict and bump a timestamp
-- while leaving the wrong permissions in place. An explicit classifier version
-- is passed instead: the classifier's derivation genuinely changed, so it is a
-- new classifier version, it inserts a new binding row, and the entity
-- fingerprint stays in the string for traceability.
--
-- Publishing a new binding id/version is also what lets recipes already saved
-- against the broken binding recover: their frozen snapshots become
-- `behavior_binding_version_stale`, which is a refreshable lifecycle reason the
-- working-copy refresh already knows how to cure.
--
-- Deactivated products are out of scope: the classifier refuses them and they
-- cannot reach a recipe. On staging that is exactly PR-ING-007140 (a superseded
-- duplicate of the owner's Cacao Puro), which keeps its historical binding.
--
-- Products whose own label evidence is genuinely incomplete are re-run through
-- the same path, correctly keep NUTRITION blocked, and lose PRODUCTION -- which
-- they could never have completed. They keep SAVE, BASE_RECIPE and MONITOR, so
-- they stay visible and usable in a recipe. All of that is asserted below, not
-- assumed.

select pg_advisory_xact_lock(hashtextextended('reclassify-base-only-nutrition-v1',0));

do $reclassify$
declare
  v_row record;
  v_before integer := 0;
  v_enqueued integer := 0;
  v_result jsonb;
  v_failed integer;
  v_regressed integer;
  v_uncured integer;
begin
  if strpos(
    pg_get_functiondef('public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure),
    $check$'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)$check$
  ) = 0 then
    raise exception 'refusing to reclassify: corrected NUTRITION derivation is not published';
  end if;

  create temporary table _base_only_nutrition_before on commit drop as
  select p.id as product_id,
         p.product_code,
         p.current_version_id as version_id,
         -- the classifier's own evidence predicate, evaluated here only to
         -- record which products SHOULD gain NUTRITION and which must not
         (p.canonical_verification_status <> 'blocked'
          and nullif(trim(coalesce(v.facts->>'ingredientsText','')),'') is not null
          and nullif(trim(coalesce(v.facts->>'allergensText','')),'') is not null
          and jsonb_typeof(v.facts->'nutrition') = 'object') as label_evidence_complete
  from public.products p
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  join public.product_versions v on v.id = p.current_version_id
  where p.product_kind <> 'mapper_reference'
    and p.merged_into_product_id is null
    -- `classify_catalog_product_behavior_v2` refuses a deactivated product
    -- ("active canonical product not found"), and a deactivated product cannot
    -- reach a recipe, so it is deliberately out of scope rather than forced.
    and p.is_active
    and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean, false)
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean, false);

  select count(*) into v_before from _base_only_nutrition_before;
  raise notice 'base-only NUTRITION bindings before: %', v_before;

  for v_row in select * from _base_only_nutrition_before order by product_code loop
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version',
      v_row.version_id::text,
      'base_only_nutrition_permission_fix',
      null,
      'base-only-nutrition-label-v1:' || left(
        public.product_behavior_entity_fingerprint_v1(
          'catalog_product_version', v_row.version_id::text
        ), 16
      )
    );
    v_enqueued := v_enqueued + 1;
  end loop;
  raise notice 'enqueued: %', v_enqueued;

  v_result := public.process_product_behavior_reclassification_queue_v1(
    greatest(v_enqueued, 1)
  );
  raise notice 'queue result: %', v_result;

  select count(*) into v_failed
  from public.product_behavior_reclassification_queue
  where reason = 'base_only_nutrition_permission_fix' and status <> 'succeeded';
  if v_failed > 0 then
    raise exception 'reclassification left % job(s) unfinished', v_failed;
  end if;

  -- Every product whose label evidence is complete must now hold NUTRITION.
  select count(*) into v_uncured
  from _base_only_nutrition_before before
  join public.products p on p.id = before.product_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where before.label_evidence_complete
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean, false);
  if v_uncured > 0 then
    raise exception '% product(s) with complete label evidence still lack NUTRITION', v_uncured;
  end if;

  -- Evidence was not weakened: incomplete products must still be blocked.
  select count(*) into v_regressed
  from _base_only_nutrition_before before
  join public.products p on p.id = before.product_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where not before.label_evidence_complete
    and coalesce((b.profile_permissions->>'NUTRITION')::boolean, false);
  if v_regressed > 0 then
    raise exception '% product(s) without label evidence were granted NUTRITION', v_regressed;
  end if;

  -- A complete product keeps Production; an incomplete one loses it, because
  -- Production completion requires the nutrition gate it cannot pass.
  select count(*) into v_uncured
  from _base_only_nutrition_before before
  join public.products p on p.id = before.product_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where before.label_evidence_complete
    and not coalesce((b.profile_permissions->>'PRODUCTION')::boolean, false);
  if v_uncured > 0 then
    raise exception '% complete product(s) lost PRODUCTION', v_uncured;
  end if;

  select count(*) into v_regressed
  from _base_only_nutrition_before before
  join public.products p on p.id = before.product_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where not before.label_evidence_complete
    and coalesce((b.profile_permissions->>'PRODUCTION')::boolean, false);
  if v_regressed > 0 then
    raise exception '% product(s) without label evidence kept PRODUCTION', v_regressed;
  end if;

  -- An incomplete product must stay visible and usable where that is safe.
  select count(*) into v_regressed
  from _base_only_nutrition_before before
  join public.products p on p.id = before.product_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where not before.label_evidence_complete
    and not (coalesce((b.profile_permissions->>'SAVE')::boolean, false)
      and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean, false)
      and coalesce((b.profile_permissions->>'MONITOR')::boolean, false));
  if v_regressed > 0 then
    raise exception '% incomplete product(s) lost SAVE/BASE_RECIPE/MONITOR', v_regressed;
  end if;

  -- The contradictory executable state must not survive anywhere.
  select count(*) into v_regressed
  from public.products p
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where p.merged_into_product_id is null
    and p.is_active
    and coalesce((b.profile_permissions->>'PRODUCTION')::boolean, false)
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean, false);
  if v_regressed > 0 then
    raise exception '% selectable binding(s) still grant PRODUCTION without NUTRITION', v_regressed;
  end if;
end $reclassify$;

-- Mapper-reference bindings are classified by a different function and must not
-- have moved. 2089 of them hold NUTRITION unconditionally.
do $verify_mapper_untouched$
declare
  v_mapper_blocked integer;
begin
  select count(*) into v_mapper_blocked
  from public.products p
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where p.product_kind = 'mapper_reference'
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean, false);
  if v_mapper_blocked > 0 then
    raise exception 'mapper-reference NUTRITION changed for % product(s)', v_mapper_blocked;
  end if;
end $verify_mapper_untouched$;
