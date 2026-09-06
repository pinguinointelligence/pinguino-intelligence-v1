-- Republish every catalog/customer binding now that acceptance resolves against
-- the CURRENT Mapper binding for the referenced ingredient
-- (`mapper_lineage_current_binding`). This is the reclassification that
-- `reclassify_base_only_nutrition_bindings` deliberately skipped: at that time a
-- stale provenance row would have stripped every permission, so those products
-- were recorded and left alone rather than destroyed.
--
-- Canonical path only: `enqueue_product_behavior_reclassification_v1` then
-- `process_product_behavior_reclassification_queue_v1`. No `profile_permissions`
-- row is written by hand, and no Mapper row or product fact is touched.
--
-- Every post-condition below fails closed, so a bad outcome rolls the whole
-- migration back instead of leaving a half-republished catalog.

select pg_advisory_xact_lock(hashtextextended('reclassify-stale-mapper-lineage-v1',0));

do $reclassify$
declare
  v_row record;
  v_total integer := 0;
  v_enqueued integer := 0;
  v_result jsonb;
  v_failed integer;
  v_regressed integer;
  v_uncured integer;
  v_mapper_before text; v_mapper_after text;
  v_facts_before text; v_facts_after text;
begin
  if strpos(
    pg_get_functiondef('public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure),
    $check$provenance_binding.mapper_ingredient_id=v_behavior_reference$check$
  ) = 0 then
    raise exception 'refusing to reclassify: current-lineage resolution is not published';
  end if;

  select md5(string_agg(id::text||is_current::text||coalesce(profile_permissions::text,''),'|' order by id))
    into v_mapper_before from public.mapper_product_behavior_bindings;
  select md5(string_agg(p.id::text||coalesce(v.facts::text,''),'|' order by p.id))
    into v_facts_before
  from public.products p join public.product_versions v on v.id=p.current_version_id
  where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null;

  create temporary table _relineage on commit drop as
  select p.id as product_id, p.product_code, p.current_version_id as version_id,
    coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false) as base0,
    coalesce((b.profile_permissions->>'MONITOR')::boolean,false) as mon0,
    coalesce((b.profile_permissions->>'NUTRITION')::boolean,false) as nut0,
    coalesce((b.profile_permissions->>'PRODUCTION')::boolean,false) as prod0,
    coalesce((b.profile_permissions->>'SAVE')::boolean,false) as save0,
    coalesce((b.profile_permissions->>'TOPPING')::boolean,false) as top0,
    (p.canonical_verification_status <> 'blocked'
     and nullif(trim(coalesce(v.facts->>'ingredientsText','')),'') is not null
     and nullif(trim(coalesce(v.facts->>'allergensText','')),'') is not null
     and jsonb_typeof(v.facts->'nutrition') = 'object') as label_evidence_complete
  from public.products p
  join public.product_versions v on v.id = p.current_version_id
  join public.product_behavior_bindings b on b.id = p.current_behavior_binding_id
  where p.product_kind <> 'mapper_reference'
    and p.merged_into_product_id is null
    and p.is_active
    and nullif(v.facts#>>'{productIntelligence,productBehaviorAuthority,referenceMapperIngredientId}','') is not null;

  select count(*) into v_total from _relineage;
  raise notice 'reference-carrying active catalog products: %', v_total;

  for v_row in select * from _relineage order by product_code loop
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version', v_row.version_id::text,
      'mapper_lineage_current_binding_fix', null,
      'mapper-lineage-current-v1:' || left(public.product_behavior_entity_fingerprint_v1(
        'catalog_product_version', v_row.version_id::text), 16));
    v_enqueued := v_enqueued + 1;
  end loop;

  v_result := public.process_product_behavior_reclassification_queue_v1(greatest(v_enqueued,1));
  raise notice 'queue result: %', v_result;

  select count(*) into v_failed
  from public.product_behavior_reclassification_queue
  where reason='mapper_lineage_current_binding_fix' and status<>'succeeded';
  if v_failed > 0 then
    raise exception 'reclassification left % job(s) unfinished', v_failed;
  end if;

  -- No product may LOSE a capability it already held.
  select count(*) into v_regressed
  from _relineage r join public.products p on p.id=r.product_id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where (r.base0 and not coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false))
     or (r.save0 and not coalesce((b.profile_permissions->>'SAVE')::boolean,false))
     or (r.mon0 and not coalesce((b.profile_permissions->>'MONITOR')::boolean,false))
     or (r.top0 and not coalesce((b.profile_permissions->>'TOPPING')::boolean,false));
  if v_regressed > 0 then
    raise exception '% product(s) lost BASE_RECIPE/SAVE/MONITOR/TOPPING', v_regressed;
  end if;

  -- Complete label evidence on a base-capable product must now publish nutrition.
  select count(*) into v_uncured
  from _relineage r join public.products p on p.id=r.product_id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where r.label_evidence_complete and r.base0
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean,false);
  if v_uncured > 0 then
    raise exception '% complete base product(s) still lack NUTRITION', v_uncured;
  end if;

  -- Evidence was not weakened.
  select count(*) into v_regressed
  from _relineage r join public.products p on p.id=r.product_id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where not r.label_evidence_complete
    and coalesce((b.profile_permissions->>'NUTRITION')::boolean,false)
    and not r.nut0;
  if v_regressed > 0 then
    raise exception '% product(s) without label evidence were granted NUTRITION', v_regressed;
  end if;

  -- The contradictory executable pair must not exist on any selectable product.
  select count(*) into v_regressed
  from public.products p join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where p.is_active and p.merged_into_product_id is null
    and coalesce((b.profile_permissions->>'PRODUCTION')::boolean,false)
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean,false);
  if v_regressed > 0 then
    raise exception '% selectable binding(s) grant PRODUCTION without NUTRITION', v_regressed;
  end if;

  -- The owner's product specifically.
  if not exists(
    select 1 from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
    where p.product_code='PR-ING-007142'
      and coalesce((b.profile_permissions->>'NUTRITION')::boolean,false)
      and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
  ) then
    raise exception 'PR-ING-007142 did not reach BASE_RECIPE + NUTRITION';
  end if;

  -- Nothing outside the catalog bindings moved.
  select md5(string_agg(id::text||is_current::text||coalesce(profile_permissions::text,''),'|' order by id))
    into v_mapper_after from public.mapper_product_behavior_bindings;
  if v_mapper_before is distinct from v_mapper_after then
    raise exception 'Mapper behaviour bindings changed';
  end if;
  select md5(string_agg(p.id::text||coalesce(v.facts::text,''),'|' order by p.id))
    into v_facts_after
  from public.products p join public.product_versions v on v.id=p.current_version_id
  where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null;
  if v_facts_before is distinct from v_facts_after then
    raise exception 'product facts changed';
  end if;
end $reclassify$;

-- Mapper-reference products are classified elsewhere and must not have moved.
do $verify_mapper_untouched$
declare v_blocked integer;
begin
  select count(*) into v_blocked
  from public.products p join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where p.product_kind='mapper_reference'
    and not coalesce((b.profile_permissions->>'NUTRITION')::boolean,false);
  if v_blocked > 0 then
    raise exception 'mapper-reference NUTRITION changed for % product(s)', v_blocked;
  end if;
end $verify_mapper_untouched$;
