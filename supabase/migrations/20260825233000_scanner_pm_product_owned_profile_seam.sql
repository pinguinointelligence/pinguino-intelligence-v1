-- Scanner/PM and INTIMPORT/PR already recompute one PRODUCT_PROFILE_V1 at the
-- Edge boundary. Persist that complete immutable authority through their one
-- canonical ingest seam, then distinguish an absent profile from an existing
-- product-owned profile that correctly remains fail-closed on a physics blocker.

select pg_advisory_xact_lock(hashtextextended('scanner-pm-product-owned-profile-seam-v1',0));

do $patch_ingest$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_patched:=v_definition;

  -- Both callers must present the complete server-recomputed authority before
  -- it is snapshotted. Source/origin ownership remains enforced by the existing
  -- PR catalog_import and PM interactive-source branches immediately below.
  v_old:=$old$      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,carbonation,evidence}'),'')<>'array'
      or not ($old$;
  v_new:=$new$      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,carbonation,evidence}'),'')<>'array'
      or coalesce(p_risk#>>'{productProfileAuthority,origin}','') not in ('PR','PM')
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,criticalPhysicsBlockers}'),'')<>'array'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,sweetnessPath}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,evidence}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,productAccuracyAssessment}'),'')<>'object'
      or coalesce(p_risk#>>'{productProfileAuthority,productAccuracyAssessment,authority}','')
        <>'PRODUCT_PRODUCTION_ACCURACY_V1'
      or not ($new$;
  if strpos(v_patched,$marker$p_risk#>>'{productProfileAuthority,origin}','') not in ('PR','PM')$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product profile completeness anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- Keep the established flattened facts for existing consumers and add the
  -- exact immutable server authority as the canonical PR/PM profile snapshot.
  v_old:=$old$        'mapperFingerprint',p_risk#>'{productProfileAuthority,mapperFingerprint}',
        'productBehaviorAuthority',p_risk#>'{productBehaviorAuthority}'$old$;
  v_new:=$new$        'mapperFingerprint',p_risk#>'{productProfileAuthority,mapperFingerprint}',
        'legacyEvidenceAccuracy',p_risk#>'{productProfileAuthority,legacyEvidenceAccuracy}',
        'productAccuracyAssessment',p_risk#>'{productProfileAuthority,productAccuracyAssessment}',
        'productProfileAuthority',p_risk#>'{productProfileAuthority}',
        'productBehaviorAuthority',p_risk#>'{productBehaviorAuthority}'$new$;
  if strpos(v_patched,$marker$'productProfileAuthority',p_risk#>'{productProfileAuthority}'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product profile snapshot anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- A classified ProductBehavior may authorize Base, Topping, or both. The
  -- historical validator accidentally required BASE_RECIPE=true for every
  -- classified authority and therefore rejected a truthful TOPPING_ONLY PM/PR.
  v_old:=$old$      or (
        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'='classified'
        and (
          coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,false)=false
          or nullif(p_risk#>>'{productBehaviorAuthority,referenceMapperIngredientId}','') is null
          or nullif(p_risk#>>'{productBehaviorAuthority,mapperBehaviorBindingId}','') is null
          or not exists(
            select 1 from public.mapper_product_behavior_bindings mb
            where mb.id::text=p_risk#>>'{productBehaviorAuthority,mapperBehaviorBindingId}'
              and mb.mapper_ingredient_id=p_risk#>>'{productBehaviorAuthority,referenceMapperIngredientId}'
              and mb.classifier_version=p_risk#>>'{productBehaviorAuthority,mapperBehaviorClassifierVersion}'
              and mb.is_current
              and coalesce((mb.profile_permissions->>'BASE_RECIPE')::boolean,false)
          )
        )
      )
      or (
        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'<>'classified'
        and coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,true)
      )$old$;
  v_new:=$new$      or coalesce(jsonb_typeof(p_risk#>'{productBehaviorAuthority,toppingEligible}'),'')<>'boolean'
      or (
        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'='classified'
        and (
          not (
            coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,false)
            or coalesce((p_risk#>>'{productBehaviorAuthority,toppingEligible}')::boolean,false)
          )
          or nullif(p_risk#>>'{productBehaviorAuthority,referenceMapperIngredientId}','') is null
          or nullif(p_risk#>>'{productBehaviorAuthority,mapperBehaviorBindingId}','') is null
          or not exists(
            select 1 from public.mapper_product_behavior_bindings mb
            where mb.id::text=p_risk#>>'{productBehaviorAuthority,mapperBehaviorBindingId}'
              and mb.mapper_ingredient_id=p_risk#>>'{productBehaviorAuthority,referenceMapperIngredientId}'
              and mb.classifier_version=p_risk#>>'{productBehaviorAuthority,mapperBehaviorClassifierVersion}'
              and mb.is_current
          )
          or (
            coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,false)
            and not exists(
              select 1 from public.mapper_product_behavior_bindings mb
              where mb.id::text=p_risk#>>'{productBehaviorAuthority,mapperBehaviorBindingId}'
                and mb.mapper_ingredient_id=p_risk#>>'{productBehaviorAuthority,referenceMapperIngredientId}'
                and mb.classifier_version=p_risk#>>'{productBehaviorAuthority,mapperBehaviorClassifierVersion}'
                and mb.is_current
                and coalesce((mb.profile_permissions->>'BASE_RECIPE')::boolean,false)
            )
          )
        )
      )
      or (
        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'<>'classified'
        and (
          coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,true)
          or coalesce((p_risk#>>'{productBehaviorAuthority,toppingEligible}')::boolean,true)
        )
      )$new$;
  if strpos(v_patched,$marker$productBehaviorAuthority,toppingEligible}')::boolean,false)$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior role validation anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_ingest$;

do $patch_classifier$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched:=v_definition;
  if strpos(
    v_patched,
    $marker$v_public_data#>'{productIntelligence,productBehaviorAuthority,classificationReasonCodes}'$marker$
  )=0 then
    raise exception 'trusted ProductBehavior classificationReasonCodes path missing';
  end if;

  v_old:=$old$  v_product_behavior_accepted boolean := false;$old$;
  v_new:=$new$  v_product_behavior_accepted boolean := false;
  v_product_behavior_topping_accepted boolean := false;$new$;
  if strpos(v_patched,'v_product_behavior_topping_accepted boolean')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior topping declaration drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$    );

  -- Taxonomy is server-owned. Customer/public product fields are evidence for$old$;
  v_new:=$new$    );
  v_product_behavior_topping_accepted :=
    v_public_data#>>'{productIntelligence,productBehaviorAuthority,authority}'='PRODUCT_BEHAVIOR_V1'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,validationMode}'='server_recomputed_product_behavior'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,articleIdentity}'='PRODUCT_OWNED'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='classified'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,toppingEligible}'='true'
    and v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}' is null
    and v_behavior_reference is not null
    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
    );

  -- Taxonomy is server-owned. Customer/public product fields are evidence for$new$;
  if strpos(v_patched,'v_product_behavior_topping_accepted :=')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior topping authority anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_patched:=replace(
    v_patched,
    $old$'TOPPING',v_topping,'SUBSTITUTION'$old$,
    $new$'TOPPING',v_product_behavior_topping_accepted and v_topping,'SUBSTITUTION'$new$
  );
  v_patched:=replace(
    v_patched,
    $old$or v_topping,'LABEL',v_topping,'NUTRITION',v_topping,$old$,
    $new$or (v_product_behavior_topping_accepted and v_topping),
      'LABEL',v_product_behavior_topping_accepted and v_topping,
      'NUTRITION',v_product_behavior_topping_accepted and v_topping,$new$
  );
  v_patched:=replace(
    v_patched,
    $old$or v_topping
    ),$old$,
    $new$or (v_product_behavior_topping_accepted and v_topping)
    ),$new$
  );
  v_patched:=replace(
    v_patched,
    $old$'POST_PROCESS_ADDON',v_topping$old$,
    $new$'POST_PROCESS_ADDON',v_product_behavior_topping_accepted and v_topping$new$
  );
  if strpos(v_patched,'v_product_behavior_topping_accepted and v_topping')=0 then
    raise exception 'ProductBehavior topping permission patch incomplete';
  end if;

  -- engineUsable=false means "profile present but not admitted". It must not
  -- be rewritten as "profile missing"; the trusted ProductBehavior authority's
  -- exact criticalPhysicsBlockers are merged into v_reasons by the existing path.
  v_old:=$old$    case when not v_base then 'product_owned_profile_missing' end,
    case when v_explicit_rejection then 'product_rejected' end$old$;
  v_new:=$new$    case when not v_base and (
      coalesce(v_public_data#>>'{productIntelligence,authority}','')<>'PRODUCT_PROFILE_V1'
      or jsonb_typeof(v_public_data->'technicalComposition')<>'object'
      or v_public_data->'technicalComposition'='{}'::jsonb
    ) then 'product_owned_profile_missing' end,
    case when v_explicit_rejection then 'product_rejected' end$new$;
  if strpos(v_patched,$marker$coalesce(v_public_data#>>'{productIntelligence,authority}','')<>'PRODUCT_PROFILE_V1'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product profile missing-reason anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_classifier$;

comment on function public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)
is 'Canonical PR/PM ingest. Persists one complete server-recomputed product-owned profile and ProductBehavior authority without a runtime Mapper identity.';

comment on function public.classify_catalog_product_behavior_v2(uuid,text)
is 'Classifies PR/PM ProductBehavior from their own persisted profile; product_owned_profile_missing is reserved for an actually absent product authority/composition.';
