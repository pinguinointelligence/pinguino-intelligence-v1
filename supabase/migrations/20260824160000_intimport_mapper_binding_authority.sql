-- Sanctioned INTIMPORT whole-profile Mapper binding.
--
-- The browser may propose the exact profile selected during Parse, but only
-- catalog-submit can mint the server-recomputed authority carried in p_risk.
-- mapper_basement is read-only throughout this migration.

select pg_advisory_xact_lock(hashtextextended('intimport-mapper-binding-authority-v1',0));

-- Resolve only the already-existing base identity used by canonical ingest.
-- This is deliberately read-only and refuses the force-distinct `:variant:`
-- identities: the current Poland catalog predates those three rows, so guessing
-- a product id for them would be worse than leaving them unmatched.
create or replace function public.resolve_intimport_existing_product_v1(
  p_actor_user_id uuid,
  p_source text,
  p_input jsonb
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_ean text:=nullif(regexp_replace(coalesce(nullif(p_input->>'ean',''),p_input->>'barcode',''),'\D','','g'),'');
  v_name text:=nullif(trim(coalesce(p_input->>'displayName',p_input->>'originalName','')),'');
  v_brand text:=nullif(trim(coalesce(p_input->>'brand','')),'');
  v_identity text;
  v_product_id uuid;
  v_match_count integer;
  v_is_admin boolean;
begin
  if p_actor_user_id is null or p_source<>'catalog_import'
    or public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source)<>'catalog_import'
    or coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')<>'INTIMPORT'
    or coalesce(p_input->>'operation','')<>'bind_intimport_mapper'
    or v_name is null then
    raise exception 'entitled INTIMPORT existing-only identity required';
  end if;
  if v_ean is not null and v_ean !~ '^[0-9]{8,14}$' then v_ean:=null; end if;
  v_identity:=case when v_ean is not null then 'ean:'||v_ean else
    'identity:'||encode(extensions.digest(convert_to(
      lower(coalesce(v_brand,''))||'|'||lower(coalesce(v_name,''))||'|'||
      lower(coalesce(p_input->>'category',''))||'|'||
      lower(coalesce(p_input->>'packageSize',p_input#>>'{facts,packageSize}','')),
      'utf8'),'sha256'),'hex') end;
  select exists(select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_is_admin;
  select count(*) into v_match_count
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.visibility='shared' and p.product_kind='commercial_product'
    and p.source_type='catalog_import'
    and ((v_ean is not null and p.ean_code_normalized=v_ean)
      or p.normalized_identity=v_identity)
    and (p.created_by=p_actor_user_id or v_is_admin);
  if v_match_count<>1 then return null; end if;
  select p.id into v_product_id
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.visibility='shared' and p.product_kind='commercial_product'
    and p.source_type='catalog_import'
    and ((v_ean is not null and p.ean_code_normalized=v_ean)
      or p.normalized_identity=v_identity)
    and (p.created_by=p_actor_user_id or v_is_admin);
  return v_product_id;
end;
$$;

revoke all on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
  to service_role;

create or replace function public.bind_intimport_whole_profile_match_v1(
  p_actor_user_id uuid,
  p_source text,
  p_rate_action text,
  p_product_id uuid,
  p_product_version_id uuid,
  p_current_binding_id uuid,
  p_mapper_decision jsonb,
  p_server_authority jsonb
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_mapper_id text:=nullif(trim(coalesce(p_mapper_decision->>'mapperIngredientId','')),'');
  v_current public.product_behavior_bindings%rowtype;
  v_new_binding uuid;
  v_confidence numeric;
begin
  if p_actor_user_id is null or p_source<>'catalog_import' or p_rate_action<>'catalog_import' then
    raise exception 'INTIMPORT whole-profile authority requires entitled catalog_import';
  end if;
  if jsonb_typeof(coalesce(p_mapper_decision,'null'::jsonb))<>'object'
    or p_mapper_decision->>'authority'<>'INTIMPORT_WHOLE_PROFILE_MATCH'
    or v_mapper_id is null then
    raise exception 'typed INTIMPORT Mapper decision required';
  end if;
  if jsonb_typeof(coalesce(p_server_authority,'null'::jsonb))<>'object'
    or p_server_authority->>'authority'<>'INTIMPORT_WHOLE_PROFILE_MATCH'
    or p_server_authority->>'validationMode'<>'server_recomputed_whole_profile'
    or p_server_authority->>'mapperIngredientId'<>v_mapper_id
    or nullif(p_server_authority->>'selectionFingerprint','') is null
    or nullif(p_server_authority->>'mapperFingerprint','') is null
    or coalesce(p_server_authority->>'profileBasis','none')='none'
    or coalesce(p_server_authority->>'rejected','')<>'' then
    raise exception 'server-validated INTIMPORT whole-profile authority required';
  end if;
  begin
    v_confidence:=(p_server_authority->>'confidence')::numeric;
  exception when invalid_text_representation then
    raise exception 'invalid INTIMPORT whole-profile confidence';
  end;
  if v_confidence is null or v_confidence<0.85 or v_confidence>1
    or coalesce((p_server_authority->>'hardContradiction')::boolean,true) then
    raise exception 'INTIMPORT whole-profile match was not accepted';
  end if;
  if not exists(
    select 1 from public.mapper_basement m
    where m.ingredient_id=v_mapper_id
      and m.is_active=true
      and m.approved_for_base=true
      and m.approved_for_engines=true
      and lower(trim(coalesce(m.verification_status,''))) like 'verified%'
  ) then
    raise exception 'INTIMPORT Mapper target is not active, Base/Engine approved and Verified';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'product-behavior:catalog_product_version:'||p_product_version_id::text,0
  ));
  if not exists(
    select 1 from public.products p
    where p.id=p_product_id and p.current_version_id=p_product_version_id
      and p.current_behavior_binding_id=p_current_binding_id
      and p.product_kind<>'mapper_reference' and p.is_active
      and p.merged_into_product_id is null
  ) then
    raise exception 'INTIMPORT binding requires the exact active current product version';
  end if;
  select * into v_current from public.product_behavior_bindings b
  where b.id=p_current_binding_id and b.product_id=p_product_id
    and b.product_version_id=p_product_version_id and b.is_current for update;
  if not found then raise exception 'INTIMPORT binding requires the exact current behavior'; end if;
  if v_current.mapper_ingredient_id is not null
    and v_current.mapper_ingredient_id<>v_mapper_id then
    raise exception 'INTIMPORT binding cannot replace a different current Mapper authority';
  end if;

  if v_current.mapper_ingredient_id=v_mapper_id then
    update public.products set
      mapper_status='matched',matched_basement_id=v_mapper_id,
      match_method='intimport_whole_profile_match',match_confidence='high',
      needs_review_reason=null,updated_at=now()
    where id=p_product_id;
    return v_current.id;
  end if;

  perform set_config('app.canonical_product_ingest','v1',true);
  update public.product_behavior_bindings set is_current=false
  where id=v_current.id and is_current;
  insert into public.product_behavior_bindings(
    product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,
    family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,
    protein_behavior,approved_liquid_dairy_carrier,profile_permissions,
    process_behavior,behavior_snapshot,warnings,block_reasons,
    classifier_version,binding_status,is_current,behavior_role,
    main_policy_status,profile_applicability,classification_reason_codes
  ) values (
    v_current.product_id,v_current.product_version_id,v_mapper_id,
    v_current.taxonomy_version_id,v_current.family_id,v_current.subfamily_id,
    v_current.form_id,'UNKNOWN_REQUIRES_EVIDENCE',v_current.vegan_eligibility,
    v_current.protein_behavior,v_current.approved_liquid_dairy_carrier,'{}'::jsonb,
    v_current.process_behavior,v_current.behavior_snapshot||jsonb_build_object(
      'mappingDecision','intimport_whole_profile_match',
      'mappingAuthority','INTIMPORT_WHOLE_PROFILE_MATCH',
      'mapperIngredientId',v_mapper_id,'confidence',v_confidence,
      'profileBasis',p_server_authority->>'profileBasis',
      'selectionFingerprint',p_server_authority->>'selectionFingerprint'
    ),array['behavior_reclassification_required'],
    array['behavior_reclassification_required'],
    'intimport-whole-profile-provisional:'||left(p_server_authority->>'selectionFingerprint',48),
    'blocked',true,'UNKNOWN_REQUIRES_EVIDENCE','BLOCKED_DATA','{}'::jsonb,
    array['behavior_reclassification_required']
  ) returning id into v_new_binding;

  update public.products set
    current_behavior_binding_id=v_new_binding,
    mapper_status='matched',matched_basement_id=v_mapper_id,
    match_method='intimport_whole_profile_match',match_confidence='high',
    mapper_notes='INTIMPORT whole-profile match '||round(v_confidence*100,2)::text||
      '% ('||coalesce(p_server_authority->>'profileBasis','unknown')||')',
    needs_review_reason=null,updated_at=now()
  where id=p_product_id;
  return v_new_binding;
end;
$$;

revoke all on function public.bind_intimport_whole_profile_match_v1(
  uuid,text,text,uuid,uuid,uuid,jsonb,jsonb
) from public,anon,authenticated,service_role;

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

  v_old:='if v_operation not in (''upsert'',''retire'') then raise exception ''invalid product ingest operation''; end if;';
  v_new:='if v_operation not in (''upsert'',''retire'',''bind_intimport_mapper'') then raise exception ''invalid product ingest operation''; end if;';
  if strpos(v_patched,v_old)=0 then raise exception 'ingest operation guard drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='if v_lifecycle_decision is not null or v_mapper_decision<>''{}''::jsonb
    or v_mapper_candidate<>''{}''::jsonb then';
  v_new:='if v_lifecycle_decision is not null
    or (v_mapper_decision<>''{}''::jsonb
      and coalesce(v_mapper_decision->>''authority'','''')<>''INTIMPORT_WHOLE_PROFILE_MATCH'')
    or v_mapper_candidate<>''{}''::jsonb then';
  if strpos(v_patched,v_old)=0 then raise exception 'ingest review reservation guard drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='perform set_config(''app.canonical_product_ingest'',''v1'',true);
  -- Version-bound Mapper authorization is an administrator decision.';
  v_new:='perform set_config(''app.canonical_product_ingest'',''v1'',true);

  -- Binding-only is the one-time/current-catalog path. It never parses facts,
  -- creates a product or creates a version; it changes only the exact current
  -- behavior binding after the Edge adapter has recomputed the frozen match.
  if v_operation=''bind_intimport_mapper'' then
    if v_requested_product_id is null then
      raise exception ''INTIMPORT binding-only operation requires productId'';
    end if;
    select * into v_existing from public.products p
    where p.id=v_requested_product_id and p.product_kind<>''mapper_reference''
      and p.is_active and p.merged_into_product_id is null
      and (p.owning_account_id=p_actor_user_id or p.created_by=p_actor_user_id or v_is_admin)
    for update;
    if not found then raise exception ''active INTIMPORT product not found or not owned''; end if;
    v_product_id:=v_existing.id;
    v_version_id:=v_existing.current_version_id;
    v_binding_id:=v_existing.current_behavior_binding_id;
    if v_version_id is null or v_binding_id is null then
      raise exception ''INTIMPORT binding-only operation requires a current version and behavior'';
    end if;
    v_binding_id:=public.bind_intimport_whole_profile_match_v1(
      p_actor_user_id,p_source,
      public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source),
      v_product_id,v_version_id,v_binding_id,v_mapper_decision,
      p_risk->''intimportWholeProfileAuthority''
    );
    v_binding_id:=public.classify_catalog_product_behavior_v2(
      v_version_id,''intimport-whole-profile-backfill:''||left(v_payload_fingerprint,24)
    );
    v_outcome:=''accepted'';
    insert into public.product_ingest_events(
      actor_user_id,source,idempotency_key,payload_fingerprint,product_id,
      product_version_id,behavior_binding_id,status,result_snapshot
    ) values(
      p_actor_user_id,p_source,p_idempotency_key,v_payload_fingerprint,v_product_id,
      v_version_id,v_binding_id,v_outcome,''{}''::jsonb
    ) returning id into v_event_id;
    v_evidence_record:=jsonb_build_object(
      ''mapperDecision'',v_mapper_decision,
      ''authority'',p_risk->''intimportWholeProfileAuthority'',
      ''bindingOnly'',true
    );
    insert into public.product_evidence(
      product_id,product_version_id,ingest_event_id,owner_user_id,
      evidence_kind,evidence,evidence_fingerprint
    ) values(
      v_product_id,v_version_id,v_event_id,p_actor_user_id,
      ''intimport_whole_profile_match'',v_evidence_record,
      encode(extensions.digest(convert_to(v_evidence_record::text,''utf8''),''sha256''),''hex'')
    );
    v_result:=jsonb_build_object(
      ''schemaVersion'',1,''kind'',''updated'',''productId'',v_product_id,
      ''productVersionId'',v_version_id,''behaviorBindingId'',v_binding_id,
      ''ingestEventId'',v_event_id,''productCode'',v_existing.product_code,
      ''status'',v_existing.canonical_verification_status,
      ''verificationMethod'',v_existing.canonical_verification_method,
      ''mapperIngredientId'',v_mapper_decision->>''mapperIngredientId'',
      ''mapperAuthority'',''INTIMPORT_WHOLE_PROFILE_MATCH'',
      ''autoFavorited'',coalesce((select favorite from public.user_product_relations
        where user_id=p_actor_user_id and product_id=v_product_id),false),
      ''reviewCaseKey'',null,''idempotent'',false,''missingFields'',jsonb_build_array(),
      ''invalidFields'',jsonb_build_array(),''duplicateCandidates'',jsonb_build_array()
    );
    update public.product_ingest_events set result_snapshot=v_result where id=v_event_id;
    return v_result;
  end if;

  -- Version-bound Mapper authorization is an administrator decision.';
  if strpos(v_patched,v_old)=0 then raise exception 'ingest Mapper branch anchor drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='if v_mapper_decision<>''{}''::jsonb then
    if not v_is_admin then raise exception ''administrator Mapper decision required''; end if;';
  v_new:='if v_mapper_decision<>''{}''::jsonb
    and coalesce(v_mapper_decision->>''authority'','''')<>''INTIMPORT_WHOLE_PROFILE_MATCH'' then
    if not v_is_admin then raise exception ''administrator Mapper decision required''; end if;';
  if strpos(v_patched,v_old)=0 then raise exception 'administrator Mapper decision branch drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='  -- Classification is an ingest responsibility, not eventual best effort.';
  v_new:='  if coalesce(v_mapper_decision->>''authority'','''')=''INTIMPORT_WHOLE_PROFILE_MATCH'' then
    v_binding_id:=public.bind_intimport_whole_profile_match_v1(
      p_actor_user_id,p_source,
      public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source),
      v_product_id,v_version_id,v_binding_id,v_mapper_decision,
      p_risk->''intimportWholeProfileAuthority''
    );
  end if;

  -- Classification is an ingest responsibility, not eventual best effort.';
  if strpos(v_patched,v_old)=0 then raise exception 'catalog classifier anchor drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='if v_outcome in (''accepted'',''blocked'') then
    v_binding_id:=public.classify_catalog_product_behavior_v2(';
  v_new:='if v_outcome in (''accepted'',''blocked'')
    or coalesce(v_mapper_decision->>''authority'','''')=''INTIMPORT_WHOLE_PROFILE_MATCH'' then
    v_binding_id:=public.classify_catalog_product_behavior_v2(';
  if strpos(v_patched,v_old)=0 then raise exception 'catalog classification outcome guard drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  v_old:='  if p_source=''ocr'' and nullif(p_evidence->>''ocrSessionId'','''') is not null then';
  v_new:='  if coalesce(v_mapper_decision->>''authority'','''')=''INTIMPORT_WHOLE_PROFILE_MATCH'' then
    v_evidence_record:=jsonb_build_object(
      ''mapperDecision'',v_mapper_decision,
      ''authority'',p_risk->''intimportWholeProfileAuthority'',
      ''bindingOnly'',false
    );
    insert into public.product_evidence(
      product_id,product_version_id,ingest_event_id,owner_user_id,
      evidence_kind,evidence,evidence_fingerprint
    ) values(
      v_product_id,v_version_id,v_event_id,p_actor_user_id,
      ''intimport_whole_profile_match'',v_evidence_record,
      encode(extensions.digest(convert_to(v_evidence_record::text,''utf8''),''sha256''),''hex'')
    );
  end if;

  if p_source=''ocr'' and nullif(p_evidence->>''ocrSessionId'','''') is not null then';
  if strpos(v_patched,v_old)=0 then raise exception 'ingest evidence anchor drifted'; end if;
  v_patched:=replace(v_patched,v_old,v_new);

  if v_patched=v_definition
    or strpos(v_patched,'''bind_intimport_mapper''')=0
    or strpos(v_patched,'INTIMPORT_WHOLE_PROFILE_MATCH')=0
    or strpos(v_patched,'bind_intimport_whole_profile_match_v1')=0
    or strpos(v_patched,'gellatti_ingest_rate_action_v1(p_actor_user_id,p_source)')=0 then
    raise exception 'INTIMPORT Mapper authority ingest patch incomplete';
  end if;
  execute v_patched;
end;
$patch_ingest$;

comment on function public.bind_intimport_whole_profile_match_v1(
  uuid,text,text,uuid,uuid,uuid,jsonb,jsonb
) is 'Applies only a catalog-submit server-recomputed >=85 INTIMPORT whole-profile Mapper match to an exact current commercial product version.';

comment on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
is 'Read-only service adapter for exact existing INTIMPORT canonical identities; never creates products or resolves force-distinct variants.';
