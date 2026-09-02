-- P0: a catalog lifecycle change must not invalidate an immutable recipe.
--
-- Identity and effective facts are deliberately separate:
--   * resolve_legacy_recipe_behavior_v1 follows version successors and merge aliases
--     to the current picker identity when one exists;
--   * validate_recipe_behavior_v1 may accept the exact frozen snapshot of an
--     immutable recipe version owned by auth.uid(), without replacing its facts.
--
-- No Engine, Solver, Scanner, Mapper dataset or recipe-math object is changed.

do $$
begin
  if to_regprocedure(
    'public.resolve_legacy_recipe_behavior_current_only_v1(jsonb,jsonb)'
  ) is null then
    alter function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb)
      rename to resolve_legacy_recipe_behavior_current_only_v1;
  end if;
  if to_regprocedure(
    'public.validate_recipe_behavior_current_only_v1(jsonb,jsonb)'
  ) is null then
    alter function public.validate_recipe_behavior_v1(jsonb,jsonb)
      rename to validate_recipe_behavior_current_only_v1;
  end if;
end $$;

revoke all on function public.resolve_legacy_recipe_behavior_current_only_v1(jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.validate_recipe_behavior_current_only_v1(jsonb,jsonb)
  from public,anon,authenticated;

create or replace function public.resolve_legacy_recipe_behavior_v1(
  p_reference jsonb,
  p_context jsonb
) returns jsonb
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
  v_result jsonb;
  v_source_product_id uuid;
  v_canonical_product_id uuid;
  v_canonical_version_id uuid;
  v_canonical_product_code text;
  v_resolution_kind text;
  v_snapshot jsonb;
  v_source_recipe_id uuid;
  v_source_version_id uuid;
  v_source_line_id text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  -- Preserve every previously accepted direct/current flow first.
  v_result := public.resolve_legacy_recipe_behavior_current_only_v1(
    p_reference,
    p_context
  );
  if coalesce(v_result->>'state','')='eligible' then
    if coalesce(v_result->>'productId','')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select p.product_code into v_canonical_product_code
      from public.products p
      where p.id=(v_result->>'productId')::uuid;
    end if;
    v_resolution_kind := case
      when nullif(p_reference->>'productId','')=v_result->>'productId'
        and nullif(p_reference->>'productVersionId','')=v_result->>'productVersionId'
        then 'DIRECT_CURRENT'
      when nullif(p_reference->>'productId','')=v_result->>'productId'
        then 'VERSION_SUCCESSOR'
      else 'PRODUCT_MERGE'
    end;
    return v_result || jsonb_build_object(
      'canonicalProductCode',v_canonical_product_code,
      'historicalResolutionKind',v_resolution_kind
    );
  end if;

  -- Recover the source product from any immutable historical reference. This
  -- covers pending -> canonical, an older PR version and a merged/aliased row.
  if coalesce(p_reference->>'behaviorBindingId','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select b.product_id into v_source_product_id
    from public.product_behavior_bindings b
    where b.id=(p_reference->>'behaviorBindingId')::uuid
    limit 1;
  end if;
  if v_source_product_id is null
    and coalesce(p_reference->>'productVersionId','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select v.product_id into v_source_product_id
    from public.product_versions v
    where v.id=(p_reference->>'productVersionId')::uuid
    limit 1;
  end if;
  if v_source_product_id is null
    and coalesce(p_reference->>'productId','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_source_product_id := (p_reference->>'productId')::uuid;
  end if;

  -- Follow one deterministic merged_into_product_id chain. A cycle or a
  -- non-visible successor produces no row and therefore never guesses.
  if v_source_product_id is not null and exists (
    select 1 from public.products p
    where p.id=v_source_product_id
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
  ) then
    with recursive successor as (
      select p.id,p.merged_into_product_id,p.current_version_id,p.product_code,0 as depth,
        array[p.id]::uuid[] as visited
      from public.products p where p.id=v_source_product_id
      union all
      select p.id,p.merged_into_product_id,p.current_version_id,p.product_code,
        successor.depth+1,successor.visited||p.id
      from successor
      join public.products p on p.id=successor.merged_into_product_id
      where successor.depth<32 and not p.id=any(successor.visited)
    )
    select s.id,s.current_version_id,s.product_code
      into v_canonical_product_id,v_canonical_version_id,v_canonical_product_code
    from successor s
    join public.products p on p.id=s.id
    where s.merged_into_product_id is null
      and p.is_active
      and s.current_version_id is not null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
    order by s.depth desc
    limit 1;
  end if;

  if v_canonical_version_id is not null then
    v_result := public.resolve_product_behavior_v1(
      'catalog_product_version',
      v_canonical_version_id::text,
      p_context
    );
    if coalesce(v_result->>'state','')='eligible' then
      v_resolution_kind := case
        when v_canonical_product_id<>v_source_product_id then 'PRODUCT_MERGE'
        when nullif(p_reference->>'productVersionId','') is distinct from
          v_canonical_version_id::text then 'VERSION_SUCCESSOR'
        else 'DIRECT_CURRENT'
      end;
      return v_result || jsonb_build_object(
        'canonicalProductCode',v_canonical_product_code,
        'historicalResolutionKind',v_resolution_kind
      );
    end if;
  end if;

  -- A product can be intentionally absent from the current picker while its
  -- saved recipe remains reproducible. Only the owner of the immutable source
  -- recipe version may use this fallback; caller-provided facts are not trusted.
  v_source_line_id := nullif(p_reference->>'sourceLineId','');
  if coalesce(p_reference->>'sourceRecipeVersionId','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and v_source_line_id is not null then
    v_source_version_id := (p_reference->>'sourceRecipeVersionId')::uuid;
    if coalesce(p_reference->>'sourceRecipeId','')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_source_recipe_id := (p_reference->>'sourceRecipeId')::uuid;
    end if;
    select rv.product_composition->'behaviorSnapshots'->v_source_line_id
      into v_snapshot
    from public.recipe_versions rv
    where rv.id=v_source_version_id
      and rv.owner_user_id=auth.uid()
      and (v_source_recipe_id is null or rv.recipe_id=v_source_recipe_id)
      and jsonb_typeof(rv.product_composition->'behaviorSnapshots'->v_source_line_id)='object'
    limit 1;
  end if;

  if v_snapshot is not null
    and v_snapshot->>'resolutionState'='RESOLVED'
    and (nullif(p_reference->>'productId','') is null
      or v_snapshot->>'productId'=p_reference->>'productId')
    and (nullif(p_reference->>'productVersionId','') is null
      or v_snapshot->>'productVersionId'=p_reference->>'productVersionId')
    and (nullif(p_reference->>'behaviorBindingId','') is null
      or v_snapshot->>'behaviorBindingId'=p_reference->>'behaviorBindingId')
    and coalesce(v_snapshot#>>array['moduleEligibility',p_context->>'module'],'blocked')='eligible'
    and v_snapshot#>>'{resolutionContext,productProfile}'=p_context->>'productProfile'
    and (v_snapshot#>>'{resolutionContext,temperatureC}')::numeric=
      (p_context->>'temperatureC')::numeric
    and v_snapshot#>>'{resolutionContext,mode}'=p_context->>'mode'
    and v_snapshot->>'processScope'=p_context->>'processScope'
    and v_snapshot#>>'{resolutionContext,requestedRole}'=p_context->>'requestedRole' then
    select p.product_code into v_canonical_product_code
    from public.products p where p.id=(v_snapshot->>'productId')::uuid;
    return jsonb_build_object(
      'schemaVersion',1,
      'resolverVersion','historical-recipe-immutable-authority-v1',
      'entityKind',case when v_snapshot->>'source'='mapper'
        then 'mapper' else 'catalog_product_version' end,
      'productId',v_snapshot->>'productId',
      'productVersionId',v_snapshot->>'productVersionId',
      'factsFingerprint',v_snapshot->>'factsFingerprint',
      'catalogStatus',coalesce(v_snapshot->>'verificationState','manual_unverified'),
      'provenance',coalesce(v_snapshot->>'source','catalog_import'),
      'behaviorBindingId',v_snapshot->>'behaviorBindingId',
      'behaviorBindingVersion',v_snapshot->>'behaviorBindingVersion',
      'taxonomyVersion',v_snapshot->>'taxonomyVersion',
      'mapperIngredientId',v_snapshot->'mapperIngredientId',
      'familyId',v_snapshot->'familyId',
      'subfamilyId',v_snapshot->'subfamilyId',
      'formId',v_snapshot->'formId',
      'behaviorRole',v_snapshot->'behaviorRole',
      'mainCapability',v_snapshot->'mainCapability',
      'mainAuthority',v_snapshot->'mainAuthority',
      'mainCalibrationLevel',v_snapshot->'mainCalibrationLevel',
      'mainEligibility',v_snapshot->>'mainClassification',
      'veganEligibility',coalesce(v_snapshot#>>'{sharedFacts,veganEligibility}','unknown'),
      'proteinBehavior',coalesce(v_snapshot#>>'{sharedFacts,proteinBehavior}','unknown'),
      'processBehavior',coalesce(v_snapshot#>'{sharedFacts,processEvidence}','[]'::jsonb),
      'sharedFacts',v_snapshot->'sharedFacts',
      'approvedLiquidDairyCarrier',coalesce(
        (v_snapshot->>'approvedLiquidDairyCarrier')::boolean,false
      ),
      'context',p_context,
      'module',p_context->>'module',
      'state','eligible',
      'moduleEligibility',v_snapshot->'moduleEligibility',
      'mainPolicy',null,
      'warnings',coalesce(v_snapshot->'warnings','[]'::jsonb),
      'blockReasons',coalesce(v_snapshot->'blockReasons','[]'::jsonb),
      'canonicalProductCode',v_canonical_product_code,
      'historicalResolutionKind','IMMUTABLE_SNAPSHOT'
    );
  end if;

  return jsonb_build_object(
    'schemaVersion',1,
    'state','blocked',
    'module',coalesce(p_context->>'module','SEARCH'),
    'blockReasons',jsonb_build_array('legacy_product_reference_unresolved')
  );
end $$;

revoke all on function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb)
  from public,anon;
grant execute on function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb)
  to authenticated;

create or replace function public.validate_recipe_behavior_v1(
  p_lines jsonb,
  p_context jsonb
) returns jsonb
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
  v_current jsonb;
  v_result_line jsonb;
  v_input_line jsonb;
  v_historical_snapshot jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_stale_ids jsonb := '[]'::jsonb;
  v_ready boolean := true;
  v_line_id text;
begin
  v_current := public.validate_recipe_behavior_current_only_v1(p_lines,p_context);
  if coalesce((v_current->>'ready')::boolean,false) then return v_current; end if;
  -- Preserve service-role/current validation semantics. Historical fallback is
  -- strictly an authenticated owner path and never borrows p_context.accountId.
  if auth.uid() is null then return v_current; end if;

  for v_result_line in select value from jsonb_array_elements(
    coalesce(v_current->'lines','[]'::jsonb)
  ) loop
    v_line_id := v_result_line->>'lineId';
    if v_result_line->>'state'='ready' then
      v_lines := v_lines || jsonb_build_array(v_result_line);
      continue;
    end if;

    select value into v_input_line
    from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
    where value->>'lineId'=v_line_id
    limit 1;
    v_historical_snapshot := null;

    -- Server-side immutable evidence: the exact snapshot must already belong
    -- to a recipe version owned by auth.uid(). No other account's history can
    -- authorize this line, even when UUIDs are known to the caller.
    select snapshot.value into v_historical_snapshot
    from public.recipe_versions rv
    cross join lateral jsonb_each(
      coalesce(rv.product_composition->'behaviorSnapshots','{}'::jsonb)
    ) snapshot
    where rv.owner_user_id=auth.uid()
      and snapshot.key=v_line_id
      and snapshot.value->>'resolutionState'='RESOLVED'
      and snapshot.value->>'productId'=v_input_line->>'productId'
      and snapshot.value->>'productVersionId'=v_input_line->>'productVersionId'
      and snapshot.value->>'behaviorBindingId'=v_input_line->>'behaviorBindingId'
      and snapshot.value->>'behaviorBindingVersion'=v_input_line->>'behaviorBindingVersion'
      and snapshot.value->>'factsFingerprint'=v_input_line->>'factsFingerprint'
      and snapshot.value->>'taxonomyVersion'=v_input_line->>'taxonomyVersion'
      and coalesce(snapshot.value->>'mapperIngredientId','')=
        coalesce(v_input_line->>'mapperIngredientId','')
      and snapshot.value->'sharedFacts'=v_input_line->'sharedFacts'
      and snapshot.value->>'processScope'=p_context->>'processScope'
      and snapshot.value#>>'{resolutionContext,productProfile}'=p_context->>'productProfile'
      and (snapshot.value#>>'{resolutionContext,temperatureC}')::numeric=
        (p_context->>'temperatureC')::numeric
      and snapshot.value#>>'{resolutionContext,mode}'=p_context->>'mode'
      and snapshot.value#>>'{resolutionContext,requestedRole}'=p_context->>'requestedRole'
      and coalesce(
        snapshot.value#>>array['moduleEligibility',p_context->>'module'],
        'blocked'
      )='eligible'
    order by rv.created_at desc
    limit 1;

    if v_historical_snapshot is not null then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'lineId',v_line_id,
        'state','ready',
        'reasons',jsonb_build_array('historical_recipe_snapshot_authority')
      ));
    else
      v_ready := false;
      v_stale_ids := v_stale_ids || jsonb_build_array(v_line_id);
      v_lines := v_lines || jsonb_build_array(v_result_line);
    end if;
  end loop;

  return jsonb_set(
    jsonb_set(
      jsonb_set(v_current,'{ready}',to_jsonb(v_ready),true),
      '{lines}',v_lines,true
    ),
    '{staleLineIds}',v_stale_ids,true
  );
end $$;

revoke all on function public.validate_recipe_behavior_v1(jsonb,jsonb)
  from public,anon;
grant execute on function public.validate_recipe_behavior_v1(jsonb,jsonb)
  to authenticated,service_role;

comment on function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb) is
  'Resolves historical version/pending/merge identity to a deterministic current successor while retaining owner-scoped immutable-recipe fallback.';
comment on function public.validate_recipe_behavior_v1(jsonb,jsonb) is
  'Validates current authority first, then exact immutable owner recipe snapshots without rewriting their saved effective facts.';
