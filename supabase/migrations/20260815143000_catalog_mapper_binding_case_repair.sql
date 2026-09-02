-- Repair the catalog -> Mapper authorization seam without touching Mapper
-- Basement. The immutable 2088 dataset uses governed values such as
-- `Verified` and `Verified / PI Calculated`; the catalog classifier and the
-- administrator mapping decision still compared them to lowercase `verified`.

select pg_advisory_xact_lock(hashtextextended('catalog-mapper-binding-case-repair-v1',0));

do $patch_classifier$
declare
  v_definition text;
  v_patched text;
  v_old text := 'and m.verification_status=''verified''';
  v_new text := 'and lower(coalesce(m.verification_status,'''')) like ''verified%''';
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  if strpos(v_definition,v_old)=0 then
    raise exception 'catalog classifier Mapper verification predicate drifted; refusing unsafe patch';
  end if;
  v_patched := replace(v_definition,v_old,v_new);
  if v_patched=v_definition or strpos(v_patched,v_old)>0 then
    raise exception 'catalog classifier Mapper verification predicate was not repaired exactly';
  end if;
  execute v_patched;
end;
$patch_classifier$;

do $patch_ingest$
declare
  v_definition text;
  v_patched text;
  v_old text := 'and m.verification_status=''verified''';
  v_new text := 'and lower(coalesce(m.verification_status,'''')) like ''verified%''';
begin
  v_definition := pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  if strpos(v_definition,v_old)=0 then
    raise exception 'catalog ingest Mapper verification predicate drifted; refusing unsafe patch';
  end if;
  v_patched := replace(v_definition,v_old,v_new);
  if v_patched=v_definition or strpos(v_patched,v_old)>0 then
    raise exception 'catalog ingest Mapper verification predicate was not repaired exactly';
  end if;
  execute v_patched;
end;
$patch_ingest$;

-- A failed old classifier call can have left a current binding without its
-- Mapper id even though the exact current product version has an accepted
-- administrator mapping decision. Restore only those evidence-backed cases.
-- An Estimated Mapper (including PI-ING-000405) cannot satisfy this predicate.
do $repair_evidence_backed_bindings$
declare
  v_row record;
  v_provisional_binding uuid;
begin
  for v_row in
    select p.id product_id,p.current_version_id,p.current_behavior_binding_id,
      p.matched_basement_id mapper_ingredient_id
    from public.products p
    join public.product_behavior_bindings b
      on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    join public.mapper_basement m on m.ingredient_id=p.matched_basement_id
      and m.is_active and m.approved_for_base and m.approved_for_engines
      and lower(coalesce(m.verification_status,'')) like 'verified%'
    where p.product_kind<>'mapper_reference'
      and p.is_active and p.merged_into_product_id is null
      and p.mapper_status='matched' and p.matched_basement_id is not null
      and b.mapper_ingredient_id is null
      and exists(
        select 1 from public.product_evidence e
        where e.product_id=p.id and e.product_version_id=p.current_version_id
          and e.evidence_kind='admin_mapper_decision'
          and e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id
      )
    order by p.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'product-behavior:catalog_product_version:'||v_row.current_version_id::text,0
    ));
    perform set_config('app.canonical_product_ingest','v1',true);

    update public.product_behavior_bindings
      set is_current=false
    where id=v_row.current_behavior_binding_id and is_current;

    insert into public.product_behavior_bindings(
      product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,
      family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,
      protein_behavior,approved_liquid_dairy_carrier,profile_permissions,
      process_behavior,behavior_snapshot,warnings,block_reasons,
      classifier_version,binding_status,is_current,behavior_role,
      main_policy_status,profile_applicability,classification_reason_codes
    )
    select b.product_id,b.product_version_id,v_row.mapper_ingredient_id,
      b.taxonomy_version_id,b.family_id,b.subfamily_id,b.form_id,
      'UNKNOWN_REQUIRES_EVIDENCE',b.vegan_eligibility,b.protein_behavior,
      b.approved_liquid_dairy_carrier,'{}'::jsonb,b.process_behavior,
      b.behavior_snapshot||jsonb_build_object(
        'mappingDecision','case_predicate_repair',
        'mapperIngredientId',v_row.mapper_ingredient_id
      ),b.warnings,array['behavior_reclassification_required'],
      'catalog-mapper-case-repair-provisional-v1','blocked',true,
      'UNKNOWN_REQUIRES_EVIDENCE','BLOCKED_DATA','{}'::jsonb,
      array['behavior_reclassification_required']
    from public.product_behavior_bindings b
    where b.id=v_row.current_behavior_binding_id
    returning id into v_provisional_binding;

    update public.products set current_behavior_binding_id=v_provisional_binding
    where id=v_row.product_id;

    perform public.classify_catalog_product_behavior_v2(
      v_row.current_version_id,'catalog-mapper-case-repair-v1'
    );
  end loop;
end;
$repair_evidence_backed_bindings$;

do $assert_repair$
begin
  if exists(
    select 1
    from public.products p
    join public.product_behavior_bindings b
      on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    join public.mapper_basement m on m.ingredient_id=p.matched_basement_id
      and m.is_active and m.approved_for_base and m.approved_for_engines
      and lower(coalesce(m.verification_status,'')) like 'verified%'
    where p.product_kind<>'mapper_reference'
      and p.is_active and p.merged_into_product_id is null
      and p.mapper_status='matched' and p.matched_basement_id is not null
      and b.mapper_ingredient_id is null
      and exists(
        select 1 from public.product_evidence e
        where e.product_id=p.id and e.product_version_id=p.current_version_id
          and e.evidence_kind='admin_mapper_decision'
          and e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id
      )
  ) then
    raise exception 'evidence-backed catalog Mapper binding repair is incomplete';
  end if;

  -- Do not turn unrelated historical catalog rows into a deployment-wide
  -- assertion. The repair predicate above is the exact authority boundary:
  -- active current version + accepted admin_mapper_decision + Verified target.
  -- Estimated/unreviewed rows remain untouched and fail closed in their own
  -- current binding.
end;
$assert_repair$;

comment on function public.classify_catalog_product_behavior_v2(uuid,text)
is 'Classifies an exact canonical product version. Mapper eligibility follows the immutable governed Verified-prefix vocabulary; no Mapper row is mutated.';
