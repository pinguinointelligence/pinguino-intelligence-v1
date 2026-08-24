-- Final PI / PR / PM architecture: every article owns its immutable technical
-- profile. Mapper rows may contribute estimates and classification provenance,
-- but never become the commercial article's runtime identity or composition.

-- One DB-owned allocator, with the origin selected inside canonical ingest.
-- Existing rows retain their IDs; PI continues to be allocated only by Mapper.
create or replace function public.next_product_code()
returns text language plpgsql volatile set search_path=public as $$
declare
  v_origin text:=case
    when current_setting('app.product_article_origin',true)='PM' then 'PM'
    else 'PR'
  end;
begin
  return v_origin||'-ING-'||lpad(nextval('public.products_code_seq')::text,6,'0');
end;
$$;

do $patch_ingest$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_start integer;
  v_end integer;
begin
  v_definition:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_patched:=v_definition;

  -- The old one-time Mapper-binding operation is no longer an article path.
  v_old:='if v_operation not in (''upsert'',''retire'',''bind_intimport_mapper'') then raise exception ''invalid product ingest operation''; end if;';
  v_new:='if v_operation not in (''upsert'',''retire'') then raise exception ''invalid product ingest operation''; end if;';
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned operation guard drifted';
  end if;

  v_old:=$old$  perform set_config('app.canonical_product_ingest','v1',true);$old$;
  v_new:=$new$  perform set_config('app.canonical_product_ingest','v1',true);
  -- Interactive Scanner/barcode/manual articles receive PM at the same product
  -- INSERT seam that already allocates PR. Exact identity reuse never allocates.
  perform set_config(
    'app.product_article_origin',
    case when p_source in ('ocr','barcode','manual') then 'PM' else 'PR' end,
    true
  );$new$;
  if strpos(v_patched,'app.product_article_origin')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product origin allocator anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- A staging migration with the earlier PR-only draft may already be present.
  -- Remove its source-specific p_risk gate before installing the shared PR/PM
  -- authority; leaving both would make the old gate reject the new key.
  v_start:=strpos(v_patched,
    'if coalesce(p_input#>>''{facts,catalogImportIdentity,system}'','''')=''INTIMPORT'' then');
  if v_start>0 then
    v_end:=strpos(substring(v_patched from v_start),E'\n  if not (\n    nullif(trim(coalesce(v_facts->>''packageSize'','''')),'''')) is not null');
    if v_end>0 and substring(v_patched from v_start for v_end) like '%intimportProductProfileAuthority%' then
      v_patched:=substring(v_patched from 1 for v_start-1)
        ||substring(v_patched from v_start+v_end);
    end if;
  end if;

  v_old:=$old$  if not (
    nullif(trim(coalesce(v_facts->>'packageSize','')),'') is not null$old$;
  v_new:=$new$  -- Edge functions are the only callers able to place this object in p_risk.
  -- Browser technicalComposition is deliberately ignored: the server adapter
  -- recomputed this profile from declarations and immutable Mapper data.
  if coalesce(p_risk#>>'{productProfileAuthority,authority}','')='PRODUCT_PROFILE_V1' then
    if coalesce(p_risk#>>'{productProfileAuthority,validationMode}','')
        <>'server_recomputed_product_profile'
      or coalesce(p_risk#>>'{productProfileAuthority,articleIdentity}','')
        <>'PRODUCT_OWNED'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,technicalComposition}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,fieldTruth}'),'')<>'object'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,productAccuracy}'),'')<>'number'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,engineUsable}'),'')<>'boolean'
      or not (
        (p_risk#>>'{productProfileAuthority,origin}'='PR'
          and p_source='catalog_import'
          and coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')='INTIMPORT'
          and coalesce(p_risk#>>'{productProfileAuthority,sourceProductId}','')
            is not distinct from coalesce(p_input#>>'{facts,catalogImportIdentity,sourceProductId}',''))
        or
        (p_risk#>>'{productProfileAuthority,origin}'='PM'
          and p_source in ('ocr','barcode','manual'))
      )
    then raise exception 'trusted product profile authority required'; end if;

    v_facts:=v_facts||jsonb_strip_nulls(jsonb_build_object(
      'technicalComposition',p_risk#>'{productProfileAuthority,technicalComposition}',
      'productAccuracy',p_risk#>'{productProfileAuthority,productAccuracy}',
      'productIntelligence',jsonb_build_object(
        'version',1,
        'authority',p_risk#>>'{productProfileAuthority,authority}',
        'articleIdentity','PRODUCT_OWNED',
        'origin',p_risk#>>'{productProfileAuthority,origin}',
        'compositionReadiness',p_risk#>>'{productProfileAuthority,readiness}',
        'engineUsable',p_risk#>'{productProfileAuthority,engineUsable}',
        'criticalReadiness',p_risk#>'{productProfileAuthority,criticalReadiness}',
        'missingCritical',coalesce(
          p_risk#>'{productProfileAuthority,missingCritical}','[]'::jsonb
        ),
        'missingEngineFields',coalesce(
          p_risk#>'{productProfileAuthority,missingEngineFields}','[]'::jsonb
        ),
        'fieldTruth',p_risk#>'{productProfileAuthority,fieldTruth}',
        'estimatedFromMapperIds',coalesce(
          p_risk#>'{productProfileAuthority,estimatedFromMapperIds}','[]'::jsonb
        ),
        'mapperSimilarity',p_risk#>'{productProfileAuthority,mapperSimilarity}',
        'mapperProfileBasis',p_risk#>'{productProfileAuthority,mapperProfileBasis}',
        'mapperFingerprint',p_risk#>'{productProfileAuthority,mapperFingerprint}'
      ),
      'allergenEvidenceStatus',p_risk#>>'{productProfileAuthority,allergenEvidenceStatus}',
      'ingredientsEvidenceStatus',p_risk#>>'{productProfileAuthority,ingredientsEvidenceStatus}'
    ));
  end if;

  if not (
    nullif(trim(coalesce(v_facts->>'packageSize','')),'') is not null$new$;
  if strpos(v_patched,'productProfileAuthority')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'trusted profile fact anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  v_status:=case when cardinality(v_missing)=0 and cardinality(v_invalid)=0 then 'manual_unverified' else 'blocked' end;
  v_method:=case when v_status='manual_unverified' then 'manual_unverified' else 'blocked' end;$old$;
  v_new:=$new$  v_status:=case when cardinality(v_missing)=0 and cardinality(v_invalid)=0 then 'manual_unverified' else 'blocked' end;
  v_method:=case when v_status='manual_unverified' then 'manual_unverified' else 'blocked' end;
  -- Product Accuracy/readiness governs Base admission. A missing allergen
  -- declaration remains NOT_CONFIRMED and blocks allergen-dependent output,
  -- but absence is never converted into an affirmative "no allergens" claim.
  if coalesce(p_risk#>>'{productProfileAuthority,engineUsable}','false')='true'
    and cardinality(v_invalid)=0 then
    v_status:='manual_unverified';
    v_method:='manual_unverified';
  end if;$new$;
  if strpos(v_patched,$marker$p_risk#>>'{productProfileAuthority,engineUsable}'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'trusted profile admission anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  v_facts_fingerprint:=encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex');$old$;
  v_new:=$new$  v_facts:=v_facts||jsonb_build_object(
    'missingFields',to_jsonb(v_missing),
    'invalidFields',to_jsonb(v_invalid)
  );
  v_facts_fingerprint:=encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex');$new$;
  if strpos(v_patched,$marker$'missingFields',to_jsonb(v_missing)$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'trusted profile missing-field anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  -- Version-bound Mapper authorization is an administrator decision.$old$;
  v_new:=$new$  if coalesce(v_mapper_decision->>'authority','')='INTIMPORT_WHOLE_PROFILE_MATCH' then
    raise exception 'INTIMPORT Mapper runtime binding is retired; persist a product-owned profile';
  end if;

  -- Version-bound Mapper authorization is an administrator decision.$new$;
  if strpos(v_patched,'INTIMPORT Mapper runtime binding is retired')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'retired binding guard anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_ingest$;

-- Retain the historical function for migration auditability, but remove every
-- externally callable route. ingest_product_v1 also rejects the former authority.
revoke all on function public.bind_intimport_whole_profile_match_v1(
  uuid,text,text,uuid,uuid,uuid,jsonb,jsonb
) from public,anon,authenticated,service_role;

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

  v_old:=$old$  v_base := not v_explicit_rejection and v_mapping is not null and exists(select 1 from public.mapper_basement m where m.ingredient_id=v_mapping and m.is_active and m.approved_for_base);$old$;
  v_new:=$new$  v_base := not v_explicit_rejection
    and v_public_data#>>'{productIntelligence,engineUsable}'='true'
    and jsonb_typeof(v_public_data->'technicalComposition')='object'
    and v_public_data->'technicalComposition'<>'{}'::jsonb;$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned classifier Base anchor drifted';
  end if;

  v_old:=$old$    case when v_mapping is null then 'base_technical_authority_missing' end$old$;
  v_new:=$new$    case when not v_base then 'product_owned_profile_missing' end$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned classifier reason anchor drifted';
  end if;

  execute v_patched;
end;
$patch_classifier$;

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

  v_old:=$old$      'technicalComposition',v_mapper_composition,$old$;
  v_new:=$new$      'technicalComposition',v_public_facts->'technicalComposition',$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned resolver composition anchor drifted';
  end if;

  v_old:=$old$  v_base_allowed := not v_explicit_rejection and v_scope='BASE_FORMULATION'
    and v_profile_allowed
    and coalesce((v_permissions->>'BASE_RECIPE')::boolean,false)
    and v_mapping is not null;$old$;
  v_new:=$new$  v_base_allowed := not v_explicit_rejection and v_scope='BASE_FORMULATION'
    and v_profile_allowed
    and coalesce((v_permissions->>'BASE_RECIPE')::boolean,false)
    and (
      (p_entity_kind='mapper' and v_mapping is not null)
      or (
        p_entity_kind='catalog_product_version'
        and jsonb_typeof(v_public_facts->'technicalComposition')='object'
        and v_public_facts->'technicalComposition'<>'{}'::jsonb
        and v_public_facts#>>'{productIntelligence,engineUsable}'='true'
      )
    );$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned resolver Base anchor drifted';
  end if;

  -- The downstream blocker vocabulary predates product-owned profiles and is
  -- expressed in Mapper-shaped variables. For an admitted commercial article,
  -- make those variables reflect its server-owned profile readiness so the old
  -- wording cannot reintroduce a Mapper requirement.
  v_old:=$old$  v_engine_allowed := v_base_allowed and coalesce(v_mapper_engine_approved,false)
    and cardinality(coalesce(v_missing_technical_fields,'{}'::text[]))=0;$old$;
  v_new:=$new$  if p_entity_kind='catalog_product_version'
    and v_public_facts#>>'{productIntelligence,engineUsable}'='true'
    and jsonb_typeof(v_public_facts->'technicalComposition')='object'
    and v_public_facts->'technicalComposition'<>'{}'::jsonb then
    v_mapper_base_approved:=true;
    v_mapper_engine_approved:=true;
    v_missing_technical_fields:='{}'::text[];
  end if;
  v_engine_allowed := v_base_allowed and coalesce(v_mapper_engine_approved,false)
    and cardinality(coalesce(v_missing_technical_fields,'{}'::text[]))=0;$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned resolver Engine anchor drifted';
  end if;

  -- A commercial article with its own Engine-ready profile is fully eligible;
  -- absence of a Mapper reference no longer demotes it to label-only.
  v_old:=$old$case when v_mapping is null then 'label_only' else 'eligible' end$old$;
  v_new:=$new$case when jsonb_typeof(v_shared_facts->'technicalComposition')='object'
        and v_shared_facts->'technicalComposition'<>'{}'::jsonb
      then 'eligible' else 'label_only' end$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned module eligibility anchor drifted';
  end if;

  execute v_patched;
end;
$patch_resolver$;

-- The public resolver is a later process-information wrapper around the
-- evidence gate above. Its Production/Process promotion must use the same own
-- composition rather than checking mapperIngredientId.
do $patch_resolver_wrapper$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.resolve_product_behavior_v1(text,text,jsonb)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$    and nullif(v_resolved->>'mapperIngredientId', '') is not null
    and v_engine_ready and v_role_ready$old$;
  v_new:=$new$    and jsonb_typeof(v_resolved#>'{sharedFacts,technicalComposition}')='object'
    and v_resolved#>'{sharedFacts,technicalComposition}'<>'{}'::jsonb
    and v_engine_ready and v_role_ready$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned public resolver wrapper anchor drifted';
  end if;
  execute v_patched;
end;
$patch_resolver_wrapper$;

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

  v_old:=$old$      (coalesce(p.status,'')<>'rejected' and m.ingredient_id is not null and m.is_active and m.approved_for_base) usable_in_base,$old$;
  v_new:=$new$      (coalesce(p.status,'')<>'rejected'
        and v.facts#>>'{productIntelligence,engineUsable}'='true'
        and jsonb_typeof(v.facts->'technicalComposition')='object'
        and v.facts->'technicalComposition'<>'{}'::jsonb) usable_in_base,$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'product-owned search readiness anchor drifted';
  end if;

  v_old:=$old$      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',p.product_name_display,
        p.product_name_internal,p.brand,p.canonical_family,p.product_category,b.family_id,b.subfamily_id,$old$;
  v_new:=$new$      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',p.product_code,p.product_name_display,
        p.product_name_internal,p.brand,p.canonical_family,p.product_category,b.family_id,b.subfamily_id,$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'commercial article-id search anchor drifted';
  end if;

  v_old:=$old$when e.context='BASE' and not c.usable_in_base then 'approved_for_base_false:'||c.id::text||':'||coalesce(c.mapped_ingredient_id,'none')||':'||coalesce(c.current_version_id::text,'none')||':BASE_RECIPE'$old$;
  v_new:=$new$when e.context='BASE' and not c.usable_in_base then 'product_owned_profile_incomplete:'||c.id::text||':'||coalesce(c.current_version_id::text,'none')||':BASE_RECIPE'$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'commercial readiness copy anchor drifted';
  end if;

  v_old:=$old$      jsonb_build_object('verificationStatus',m.verification_status,'sourceConfidence',m.data_confidence_percent,'verificationSource',m.verification_source,'approvedForBase',m.approved_for_base,'approvedForEngines',m.approved_for_engines,'lifecycleRejected',coalesce(p.status,'')='rejected') public_data,r.private_price,r.currency private_currency,$old$;
  v_new:=$new$      jsonb_build_object('verificationStatus',m.verification_status,'productAccuracy',coalesce(m.data_confidence_percent,0),'sourceConfidence',coalesce(m.data_confidence_percent,0),'verificationSource',m.verification_source,'approvedForBase',m.approved_for_base,'approvedForEngines',m.approved_for_engines,'lifecycleRejected',coalesce(p.status,'')='rejected') public_data,r.private_price,r.currency private_currency,$new$;
  if strpos(v_patched,v_old)>0 then
    v_patched:=replace(v_patched,v_old,v_new);
  elsif strpos(v_patched,v_new)=0 then
    raise exception 'PI product accuracy projection anchor drifted';
  end if;

  execute v_patched;
end;
$patch_search$;

comment on function public.resolve_product_behavior_v1(text,text,jsonb)
is 'One product resolver. PI reads its immutable Mapper profile; admitted PR/PM read their own immutable product-version technicalComposition.';
