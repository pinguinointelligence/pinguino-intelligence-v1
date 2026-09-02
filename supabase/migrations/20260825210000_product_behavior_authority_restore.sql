-- Restore the original ProductBehavior contract without restoring the later
-- PR/PM -> Mapper runtime identity workaround.
--
-- A server-recomputed whole-profile reference may lend its immutable taxonomy,
-- role, permissions and process semantics. The commercial article keeps its
-- own identity and product-version technicalComposition. mapper_basement is
-- read-only throughout this migration.

select pg_advisory_xact_lock(hashtextextended('product-behavior-authority-restore-v1',0));

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

  -- Product-owned articles can no longer be changed into Mapper identities,
  -- even by the historical administrator branch. Human review may publish a
  -- ProductBehavior authority in a future version, but it may not bind physics.
  v_old:=$old$  -- Version-bound Mapper authorization is an administrator decision.$old$;
  v_new:=$new$  if v_mapper_decision<>'{}'::jsonb then
    raise exception 'commercial Mapper runtime identity is retired; publish product-owned ProductBehavior authority';
  end if;

  -- Version-bound Mapper authorization is an administrator decision.$new$;
  if strpos(v_patched,'commercial Mapper runtime identity is retired')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'commercial Mapper writer anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- p_risk is service-only. Validate the complete authority and its exact
  -- current semantic reference before it can enter immutable version facts.
  v_old:=$old$    v_facts:=v_facts||jsonb_strip_nulls(jsonb_build_object($old$;
  v_new:=$new$    if coalesce(p_risk#>>'{productBehaviorAuthority,authority}','')<>'PRODUCT_BEHAVIOR_V1'
      or coalesce(p_risk#>>'{productBehaviorAuthority,validationMode}','')
        <>'server_recomputed_product_behavior'
      or coalesce(p_risk#>>'{productBehaviorAuthority,articleIdentity}','')<>'PRODUCT_OWNED'
      or coalesce(jsonb_typeof(p_risk#>'{productBehaviorAuthority,baseRecipeEligible}'),'')<>'boolean'
      or coalesce(p_risk#>>'{productBehaviorAuthority,classificationOutcome}','') not in (
        'classified','unknown_requires_review','blocked'
      )
      or nullif(p_risk#>>'{productBehaviorAuthority,behaviorFingerprint}','') is null
      or nullif(p_risk#>>'{productBehaviorAuthority,taxonomyVersionId}','') is null
      or coalesce(jsonb_typeof(p_risk#>'{productBehaviorAuthority,profilePermissions}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productBehaviorAuthority,processBehavior}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productBehaviorAuthority,classificationReasonCodes}'),'')<>'array'
      or p_risk#>'{productBehaviorAuthority,runtimeMapperIngredientId}' is distinct from 'null'::jsonb
      or (
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
      )
    then raise exception 'trusted product behavior authority required'; end if;

    v_facts:=v_facts||jsonb_strip_nulls(jsonb_build_object($new$;
  if strpos(v_patched,'trusted product behavior authority required')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior validation anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$        'mapperFingerprint',p_risk#>'{productProfileAuthority,mapperFingerprint}'$old$;
  v_new:=$new$        'mapperFingerprint',p_risk#>'{productProfileAuthority,mapperFingerprint}',
        'productBehaviorAuthority',p_risk#>'{productBehaviorAuthority}'$new$;
  if strpos(v_patched,$marker$'productBehaviorAuthority',p_risk#>'{productBehaviorAuthority}'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior fact persistence anchor drifted'; end if;
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

  v_old:=$old$  v_mapping text;$old$;
  v_new:=$new$  v_mapping text;
  v_behavior_reference text;
  v_product_behavior_accepted boolean := false;$new$;
  if strpos(v_patched,'v_product_behavior_accepted boolean')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior classifier declaration drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  -- Taxonomy is server-owned. Customer/public product fields are evidence for$old$;
  v_new:=$new$  v_behavior_reference:=nullif(v_public_data#>>'{productIntelligence,productBehaviorAuthority,referenceMapperIngredientId}','');
  v_product_behavior_accepted :=
    v_public_data#>>'{productIntelligence,productBehaviorAuthority,authority}'='PRODUCT_BEHAVIOR_V1'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,validationMode}'='server_recomputed_product_behavior'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,articleIdentity}'='PRODUCT_OWNED'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='classified'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,baseRecipeEligible}'='true'
    -- ingest_product_v1 strips nested JSON nulls after validating that the
    -- server authority explicitly supplied runtimeMapperIngredientId=null.
    and v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}' is null
    and v_behavior_reference is not null
    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
    );

  -- Taxonomy is server-owned. Customer/public product fields are evidence for$new$;
  if strpos(v_patched,'v_behavior_reference:=nullif')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior classifier authority anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- Copy only the reference binding's semantics. v_mapping remains unchanged
  -- and is what is persisted into mapper_ingredient_id (null for PR/PM).
  v_old:=$old$  where b.mapper_ingredient_id=v_mapping and b.is_current;$old$;
  v_new:=$new$  where b.mapper_ingredient_id=coalesce(v_mapping,v_behavior_reference) and b.is_current;$new$;
  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior semantic reference anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- BASE-scoped permissions require both independent authorities: own physics
  -- and an accepted ProductBehavior classification.
  v_patched:=replace(v_patched,
    $old$'BASE_RECIPE',v_base,$old$,
    $new$'BASE_RECIPE',v_product_behavior_accepted and v_base,$new$
  );
  v_patched:=replace(v_patched,
    $old$'TOPPING',v_topping,'SUBSTITUTION',v_base,'COST'$old$,
    $new$'TOPPING',v_topping,'SUBSTITUTION',v_product_behavior_accepted and v_base,'COST'$new$
  );
  v_patched:=replace(v_patched,
    $old$'MONITOR',v_base,$old$,
    $new$'MONITOR',v_product_behavior_accepted and v_base,$new$
  );
  v_patched:=replace(v_patched,
    $old$'PRODUCTION',v_base or v_topping,$old$,
    $new$'PRODUCTION',(v_product_behavior_accepted and v_base) or v_topping,$new$
  );
  v_patched:=replace(v_patched,
    $old$'SAVE',v_base or v_topping$old$,
    $new$'SAVE',(v_product_behavior_accepted and v_base) or v_topping$new$
  );
  v_patched:=replace(v_patched,
    $old$'BASE_FORMULATION',v_base,'POST_PROCESS_ADDON'$old$,
    $new$'BASE_FORMULATION',v_product_behavior_accepted and v_base,'POST_PROCESS_ADDON'$new$
  );

  if strpos(v_patched,'v_product_behavior_accepted and v_base')=0 then
    raise exception 'ProductBehavior Base permission patch incomplete';
  end if;

  -- Preserve exact server authority reasons in the canonical binding. These
  -- are existing classifier/live-overlay codes, not a new parallel taxonomy.
  v_old:=$old$    case when not v_base then 'product_owned_profile_missing' end,
    case when v_explicit_rejection then 'product_rejected' end
  ],null);$old$;
  v_new:=$new$    case when not v_base then 'product_owned_profile_missing' end,
    case when v_explicit_rejection then 'product_rejected' end
  ],null);
  if jsonb_typeof(v_public_data#>'{productIntelligence,productBehaviorAuthority,classificationReasonCodes}')='array' then
    select coalesce(array_agg(distinct reason order by reason),'{}'::text[])
    into v_reasons
    from unnest(v_reasons || array(
      select jsonb_array_elements_text(
        v_public_data#>'{productIntelligence,productBehaviorAuthority,classificationReasonCodes}'
      )
    )) reason;
  end if;$new$;
  if strpos(v_patched,'jsonb_array_elements_text')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior classifier reasons drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$'classificationReasonCodes',to_jsonb(v_reasons)$old$;
  v_new:=$new$'classificationReasonCodes',to_jsonb(v_reasons),
      'productBehaviorAuthority',v_public_data#>'{productIntelligence,productBehaviorAuthority}'$new$;
  if strpos(v_patched,$marker$'productBehaviorAuthority',v_public_data#>'{productIntelligence,productBehaviorAuthority}'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior snapshot anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$case when v_explicit_rejection then 'blocked' else 'ready' end,$old$;
  v_new:=$new$case when v_explicit_rejection
      or v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='blocked'
      then 'blocked' else 'ready' end,$new$;
  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior binding status anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_classifier$;

-- The canonical resolver already reads PR/PM physics from product_versions and
-- gates Base on binding.profile_permissions. Remove only the stale diagnostic
-- that still called a null runtime Mapper identity a blocker.
do $patch_resolver$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$v_scope='BASE_FORMULATION' and v_mapping is null$old$;
  v_new:=$new$v_scope='BASE_FORMULATION' and v_mapping is null
          and not (
            p_entity_kind='catalog_product_version'
            and v_public_facts#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='classified'
            and v_public_facts#>>'{productIntelligence,productBehaviorAuthority,baseRecipeEligible}'='true'
          )$new$;
  if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior resolver Mapper diagnostic drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);
  execute v_patched;
end;
$patch_resolver$;

-- Picker/search uses the immutable binding as its one ProductBehavior source of
-- truth. A complete numeric profile without BASE_RECIPE permission is visible
-- for review but cannot be selected into Base.
do $patch_search$
declare
  v_signature regprocedure:=to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'product search authority missing'; end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched:=v_definition;
  v_old:=$old$      (coalesce(p.status,'')<>'rejected'
        and v.facts#>>'{productIntelligence,engineUsable}'='true'
        and jsonb_typeof(v.facts->'technicalComposition')='object'
        and v.facts->'technicalComposition'<>'{}'::jsonb) usable_in_base,$old$;
  v_new:=$new$      (coalesce(p.status,'')<>'rejected'
        and v.facts#>>'{productIntelligence,engineUsable}'='true'
        and jsonb_typeof(v.facts->'technicalComposition')='object'
        and v.facts->'technicalComposition'<>'{}'::jsonb
        and b.mapper_ingredient_id is null
        and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)) usable_in_base,$new$;
  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'ProductBehavior search readiness anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_search$;

-- Disable the two legacy automatic/admin Mapper identity writers. The original
-- proposal function remains read-only for historical audit; this writer is a
-- non-mutating tombstone and has no callable role.
create or replace function public.authorize_live_overlay_mapper_identity_v1(
  p_actor_user_id uuid,
  p_product_id uuid
) returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'authorized',false,
    'reason','retired_product_owned_behavior_authority',
    'productId',p_product_id
  );
$$;

revoke all on function public.authorize_live_overlay_mapper_identity_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.bind_intimport_whole_profile_match_v1(
  uuid,text,text,uuid,uuid,uuid,jsonb,jsonb
) from public,anon,authenticated,service_role;

comment on function public.classify_catalog_product_behavior_v2(uuid,text)
is 'Classifies immutable PR/PM ProductBehavior from server-approved semantic reference evidence while preserving null runtime Mapper identity and product-owned composition.';
