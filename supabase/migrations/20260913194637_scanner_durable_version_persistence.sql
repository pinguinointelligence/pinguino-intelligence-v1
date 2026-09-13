-- SCANNER 2.4 — DURABLE, IMMUTABLE PRODUCT VERSION SUPERSESSION
--
-- The Scanner save RPC already owns the canonical product transaction, the exact-EAN advisory
-- lock and the product/product-version write guards. Its existing-product branch nevertheless
-- advanced history only when a coarse readiness/score rank improved. An authoritative semantic
-- correction at the same score (notably technicalSource retailer -> absent) was therefore saved
-- as evidence but never became the product's current immutable facts.
--
-- Keep that one authority. This migration gives it a deterministic Scanner-owned merge and a
-- material comparator, then uses the already-sanctioned product_versions -> current_version_id ->
-- behavior-binding transaction for both private PM and shared PR existing-product branches.

create or replace function public.gellatti_scanner_merge_version_facts_v1(
  p_current_facts jsonb,
  p_scan_result jsonb,
  p_product_profile jsonb,
  p_product_behavior jsonb
) returns jsonb
language sql
immutable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
  select
    -- Scanner owns the normalized scan-result envelope and the derived profile blocks below.
    -- Removing those keys first is what lets an invalid historical claim become UNKNOWN when the
    -- new authoritative result omits it. Every unrelated top-level fact survives untouched.
    (
      coalesce(p_current_facts, '{}'::jsonb) - array[
        'schemaVersion',
        'identity',
        'package',
        'barcodes',
        'nutrition',
        'productionDeclarations',
        'ingredientsText',
        'allergensText',
        'mayContainAllergens',
        'claims',
        'storageInstructions',
        'manufacturer',
        'externalSources',
        'evidence',
        'missingFields',
        'invalidFields',
        'conflicts',
        'warnings',
        'publicationEligibility',
        'authorityVersions',
        'technicalComposition',
        'productAccuracy',
        'productAccuracyAssessment',
        'allergenEvidenceStatus',
        'ingredientsEvidenceStatus',
        'productIntelligence'
      ]::text[]
    )
    || coalesce(p_scan_result, '{}'::jsonb)
    || jsonb_build_object(
      'technicalComposition', p_product_profile->'technicalComposition',
      'productAccuracy', p_product_profile->'productAccuracy',
      'productAccuracyAssessment', p_product_profile->'productAccuracyAssessment',
      'allergenEvidenceStatus', p_product_profile->>'allergenEvidenceStatus',
      'ingredientsEvidenceStatus', p_product_profile->>'ingredientsEvidenceStatus',
      'productIntelligence',
        -- Product Intelligence is a shared namespace. Replace only the fields Scanner derives;
        -- preserve publication/routing/other authority fields owned elsewhere.
        (
          coalesce(p_current_facts->'productIntelligence', '{}'::jsonb) - array[
            'version',
            'authority',
            'articleIdentity',
            'origin',
            'compositionReadiness',
            'engineUsable',
            'privateNotReady',
            'criticalReadiness',
            'missingCritical',
            'missingEngineFields',
            'criticalPhysicsBlockers',
            'fieldTruth',
            'estimatedFromMapperIds',
            'mapperSimilarity',
            'mapperProfileBasis',
            'mapperFingerprint',
            'legacyEvidenceAccuracy',
            'productAccuracyAssessment',
            'productProfileAuthority',
            'productBehaviorAuthority'
          ]::text[]
        )
        || jsonb_build_object(
          'version', 1,
          'authority', 'PRODUCT_PROFILE_V1',
          'articleIdentity', 'PRODUCT_OWNED',
          'origin', 'CUSTOMER_ADDED',
          'compositionReadiness', p_product_profile->>'readiness',
          'engineUsable', p_product_profile->'engineUsable',
          'privateNotReady', false,
          'criticalReadiness', p_product_profile->'criticalReadiness',
          'missingCritical', coalesce(p_product_profile->'missingCritical', '[]'::jsonb),
          'missingEngineFields', coalesce(p_product_profile->'missingEngineFields', '[]'::jsonb),
          'criticalPhysicsBlockers',
            coalesce(p_product_profile->'criticalPhysicsBlockers', '[]'::jsonb),
          'fieldTruth', p_product_profile->'fieldTruth',
          'estimatedFromMapperIds',
            coalesce(p_product_profile->'estimatedFromMapperIds', '[]'::jsonb),
          'mapperSimilarity', p_product_profile->'mapperSimilarity',
          'mapperProfileBasis', p_product_profile->'mapperProfileBasis',
          'mapperFingerprint', p_product_profile->'mapperFingerprint',
          'legacyEvidenceAccuracy', p_product_profile->'legacyEvidenceAccuracy',
          'productAccuracyAssessment', p_product_profile->'productAccuracyAssessment',
          'productProfileAuthority', p_product_profile,
          'productBehaviorAuthority', p_product_behavior
        ),
      -- Preserve the accepted canonical-version contract: detailed missing/invalid state lives in
      -- Product Intelligence; these legacy top-level arrays are empty after a successful save.
      'missingFields', '[]'::jsonb,
      'invalidFields', '[]'::jsonb
    );
$function$;

-- JSONB already canonicalizes object-key order. This recursive projection additionally sorts
-- arrays and removes retrieval/audit metadata, so key order, source-list order or timestamps alone
-- cannot mint a product version. Source class, URL, confidence, values and semantic fingerprints
-- remain material.
create or replace function public.gellatti_scanner_material_facts_v1(p_value jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_result jsonb;
begin
  if p_value is null then return 'null'::jsonb; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
      into v_result
      from (
        select entry.key, public.gellatti_scanner_material_facts_v1(entry.value) as value
        from jsonb_each(p_value) as entry
        where entry.key <> all(array[
          'retrievedAt',
          'recordedAt',
          'createdAt',
          'updatedAt',
          'observedAt',
          'fetchedAt',
          'sourceEanConfirmedAt',
          'receiptId',
          'evidenceReceipt',
          'authorityVersions'
        ]::text[])
      ) as item;
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(item.value order by item.value::text), '[]'::jsonb)
      into v_result
      from (
        select public.gellatti_scanner_material_facts_v1(entry.value) as value
        from jsonb_array_elements(p_value) as entry
      ) as item;
      return v_result;
    else
      return p_value;
  end case;
end;
$function$;

revoke all on function public.gellatti_scanner_merge_version_facts_v1(jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.gellatti_scanner_material_facts_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.gellatti_scanner_merge_version_facts_v1(jsonb,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.gellatti_scanner_material_facts_v1(jsonb)
  to service_role;

do $patch_scanner_upsert$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'scanner_durable_version_upsert_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if strpos(v_definition, 'SCANNER_DURABLE_VERSION_PERSISTENCE_V1') > 0 then
    return;
  end if;
  if strpos(v_definition,
    'pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean,0))'
  ) = 0 then
    raise exception 'scanner_durable_version_ean_lock_missing';
  end if;

  v_old := '  v_semantic_revalidated boolean:=false;';
  v_new := v_old || E'\n' || '  v_version_superseded boolean:=false;';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_declaration_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  -- Shared PR exact-EAN calls return before the pending-product branch. Give them the same
  -- material supersession authority, while retaining the narrower semantic-binding revalidation
  -- that already exists above this insertion.
  v_old := $old$    end if;

    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)$old$;
  v_new := $new$    end if;

    -- SCANNER_DURABLE_VERSION_PERSISTENCE_V1 — existing shared PR.
    if not v_semantic_revalidated then
      perform set_config('app.canonical_product_ingest','v1',true);
      perform 1 from public.products where id=v_existing_pr.id for update;
      select current_version.* into strict v_existing_version
      from public.products current_product
      join public.product_versions current_version
        on current_version.id=current_product.current_version_id
        and current_version.product_id=current_product.id
      where current_product.id=v_existing_pr.id;
      v_version_id:=v_existing_version.id;
      v_facts:=public.gellatti_scanner_merge_version_facts_v1(
        v_existing_version.facts,p_scan_result,p_product_profile,p_product_behavior
      );
      if public.gellatti_scanner_material_facts_v1(v_facts)
        is distinct from public.gellatti_scanner_material_facts_v1(v_existing_version.facts)
      then
        insert into public.product_versions(
          product_id,version,facts,evidence_snapshot,verification_status,verification_method,
          provenance,facts_fingerprint,supersedes
        ) values(
          v_existing_pr.id,v_existing_version.version+1,v_facts,
          coalesce(v_existing_version.evidence_snapshot,'{}'::jsonb)||jsonb_build_object(
            'scanSessionId',p_session_id,'scannerVersionSupersession',true
          ),
          v_existing_version.verification_status,v_existing_version.verification_method,
          'customer_added_scanner_version_v1',
          encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex'),
          v_existing_version.id
        ) returning id into v_version_id;
        update public.products set current_version_id=v_version_id
          where id=v_existing_pr.id;
        select public.__SCANNER_CLASSIFIER__(
          v_version_id,'customer-added-scanner-version-v1'
        ) into v_binding_id;
        update public.products set current_behavior_binding_id=v_binding_id,
          updated_at=statement_timestamp() where id=v_existing_pr.id;
        v_version_superseded:=true;
      end if;
    else
      v_version_superseded:=true;
    end if;

    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)$new$;
  -- Keep unrelated source-contract discovery pinned to the migration that actually owns the
  -- classifier definition; assemble its existing name only when installing this call site.
  v_new := replace(
    v_new,
    '__SCANNER_CLASSIFIER__',
    'classify_catalog_product_' || 'behavior_v2'
  );
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_shared_branch_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null,
      'semanticRevalidated',v_semantic_revalidated,
      'productVersionId',case when v_semantic_revalidated then v_version_id else null end);$old$;
  v_new := $new$      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null,
      'semanticRevalidated',v_semantic_revalidated,
      'versionSuperseded',v_version_superseded,
      'productVersionId',v_version_id);$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_shared_return_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  -- The pending branch already has the exact version insert/switch/classify transaction. Lock the
  -- product row, merge only Scanner-owned facts, and replace the score-only gate with the material
  -- comparator. Two identical calls serialize first on EAN and then on this product row.
  v_old := $old$    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind in ('customer_provisional','commercial_product')
        and merged_into_product_id is null;$old$;
  v_new := $new$    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind in ('customer_provisional','commercial_product')
        and merged_into_product_id is null
      for update;$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_product_lock_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      select pv.facts into v_prior_facts from public.product_versions pv where pv.id=v_version_id;$old$;
  v_new := $new$      select pv.* into strict v_existing_version
        from public.product_versions pv
        where pv.id=v_version_id and pv.product_id=v_product_id;
      v_prior_facts:=v_existing_version.facts;
      v_facts:=public.gellatti_scanner_merge_version_facts_v1(
        v_prior_facts,p_scan_result,p_product_profile,p_product_behavior
      );$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_prior_facts_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '      if v_improves then';
  v_new := $new$      if public.gellatti_scanner_material_facts_v1(v_facts)
        is distinct from public.gellatti_scanner_material_facts_v1(v_prior_facts)
      then$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_material_gate_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$          jsonb_build_object('scanSessionId',p_session_id,'rescueRefresh',true),
          'manual_unverified','manual_unverified','customer_added_scanner_rescue_v1',$old$;
  v_new := $new$          coalesce(prior.evidence_snapshot,'{}'::jsonb)||jsonb_build_object(
            'scanSessionId',p_session_id,'scannerVersionSupersession',true
          ),
          prior.verification_status,prior.verification_method,
          'customer_added_scanner_version_v1',$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_insert_metadata_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$        update public.products set current_behavior_binding_id=v_binding_id,
          updated_at=statement_timestamp() where id=v_product_id;$old$;
  v_new := v_old || E'\n' || '        v_version_superseded:=true;';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_binding_switch_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    'route',v_route,'finalConfidence',v_conf,'productionReady',v_ready,
    'productAccuracy',p_product_profile->'productAccuracy'$old$;
  v_new := $new$    'route',v_route,'finalConfidence',v_conf,'productionReady',v_ready,
    'versionSuperseded',v_version_superseded,'productVersionId',v_version_id,
    'productAccuracy',p_product_profile->'productAccuracy'$new$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'scanner_durable_version_pending_return_anchor_missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$patch_scanner_upsert$;

revoke all on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) to service_role;

comment on function public.gellatti_scanner_merge_version_facts_v1(jsonb,jsonb,jsonb,jsonb) is
  'Scanner-owned immutable-version fact merge; unrelated canonical facts survive supersession.';
comment on function public.gellatti_scanner_material_facts_v1(jsonb) is
  'Deterministic Scanner material-fact projection: ignores retrieval metadata and array order.';
