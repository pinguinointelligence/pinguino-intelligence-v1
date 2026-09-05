-- SCANNER — RESCUE MAY SUPERSEDE A PRIVATE NOT-READY VERSION.
--
-- The one-EAN customer-added authority already guarantees one provisional UUID
-- and one set of account links. Its ready upsert used to reuse an existing
-- pending row without replacing the immutable product version, though. That
-- stranded a product whose first scan was private/not-ready: later label/web /
-- Mapper evidence could return a ready response while exact lookup kept reading
-- the original blocked version forever.
--
-- Patch only the existing ready authority. The EAN lock, UUID, CA code, account
-- links, evidence log and explicit Admin PR canonicalization remain unchanged.
-- No Mapper row, PI identity, PR number or country default is created here.

do $patch_ready_rescue_refresh$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  v_old := $old$  else
    v_product_id:=v_pending.product_id;
    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind='customer_provisional' and merged_into_product_id is null;
    if v_version_id is null then raise exception 'customer_product_pending_state_invalid'; end if;
  end if;$old$;
  v_new := $new$  else
    v_product_id:=v_pending.product_id;
    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind='customer_provisional' and merged_into_product_id is null;
    if v_version_id is null then raise exception 'customer_product_pending_state_invalid'; end if;

    -- Same exact commercial identity, newer immutable technical truth. This is
    -- a version supersession on the existing provisional UUID, not a new item.
    -- rescue-refresh: canonical ingest context — the create branch sets it; the
    -- canonical write guards on products/product_versions require it here too.
    perform set_config('app.canonical_product_ingest','v1',true);
    perform set_config('app.product_article_origin','CUSTOMER_ADDED',true);
    v_name:=coalesce(nullif(trim(v_identity->>'displayName'),''),
      nullif(trim(v_identity->>'originalName'),''));
    v_brand:=nullif(trim(v_identity->>'brand'),'');
    v_facts:=p_scan_result||jsonb_build_object(
      'technicalComposition',p_product_profile->'technicalComposition',
      'productAccuracy',p_product_profile->'productAccuracy',
      'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
      'allergenEvidenceStatus',p_product_profile->>'allergenEvidenceStatus',
      'ingredientsEvidenceStatus',p_product_profile->>'ingredientsEvidenceStatus',
      'productIntelligence',jsonb_build_object(
        'version',1,'authority','PRODUCT_PROFILE_V1','articleIdentity','PRODUCT_OWNED',
        'origin','CUSTOMER_ADDED','compositionReadiness',p_product_profile->>'readiness',
        'engineUsable',p_product_profile->'engineUsable',
        'privateNotReady',false,
        'criticalReadiness',p_product_profile->'criticalReadiness',
        'missingCritical',coalesce(p_product_profile->'missingCritical','[]'::jsonb),
        'missingEngineFields',coalesce(p_product_profile->'missingEngineFields','[]'::jsonb),
        'criticalPhysicsBlockers',coalesce(p_product_profile->'criticalPhysicsBlockers','[]'::jsonb),
        'fieldTruth',p_product_profile->'fieldTruth',
        'estimatedFromMapperIds',coalesce(p_product_profile->'estimatedFromMapperIds','[]'::jsonb),
        'mapperSimilarity',p_product_profile->'mapperSimilarity',
        'mapperProfileBasis',p_product_profile->'mapperProfileBasis',
        'mapperFingerprint',p_product_profile->'mapperFingerprint',
        'legacyEvidenceAccuracy',p_product_profile->'legacyEvidenceAccuracy',
        'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
        'productProfileAuthority',p_product_profile,
        'productBehaviorAuthority',p_product_behavior
      ),
      'missingFields','[]'::jsonb,'invalidFields','[]'::jsonb
    );
    insert into public.product_versions(
      product_id,version,facts,evidence_snapshot,verification_status,verification_method,
      provenance,facts_fingerprint,supersedes
    )
    select v_product_id,prior.version+1,v_facts,
      jsonb_build_object('scanSessionId',p_session_id,'rescueRefresh',true),
      'manual_unverified','manual_unverified','customer_added_scanner_rescue_v1',
      encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex'),prior.id
    from public.product_versions prior where prior.id=v_version_id
    returning id into v_version_id;
    if v_version_id is null then raise exception 'customer_product_version_refresh_failed'; end if;
    update public.products set
      brand=coalesce(v_brand,brand),
      product_name_internal=coalesce(nullif(v_identity->>'originalName',''),product_name_internal),
      product_name_display=coalesce(v_name,product_name_display),
      product_category=coalesce(nullif(v_identity->>'category',''),product_category),
      canonical_family=coalesce(
        nullif(p_product_profile#>>'{recognition,ingredientFamily}','unknown'),canonical_family
      ),
      current_version_id=v_version_id,
      search_document=trim(concat_ws(' ',coalesce(v_brand,brand),
        coalesce(v_name,product_name_display),v_identity->>'category',v_ean)),
      updated_at=statement_timestamp()
    where id=v_product_id;
    select public.classify_catalog_product_behavior_v2(
      v_version_id,'customer-added-rescue-refresh-v1'
    ) into v_binding_id;
    update public.products set current_behavior_binding_id=v_binding_id,
      updated_at=statement_timestamp() where id=v_product_id;
  end if;$new$;

  if strpos(v_definition,'customer-added-rescue-refresh-v1')=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'customer product ready upsert anchor drifted';
    end if;
    v_patched:=replace(v_definition,v_old,v_new);
    execute v_patched;
  end if;
end;
$patch_ready_rescue_refresh$;

revoke all on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) to service_role;

comment on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) is
  'One-EAN customer product ready upsert. A later successful rescue supersedes the existing provisional version on the same UUID; PR promotion remains the canonical Admin authority.';
