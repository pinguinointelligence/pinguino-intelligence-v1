-- SCANNER — PRIVATE NOT-READY PRODUCT (owner contract, 2026-09-05).
--
-- A customer-scanned exact commercial product that the readiness authority cannot yet make
-- recipe-ready MUST still be saved PRIVATELY: exact GTIN, brand, name, package facts, label facts,
-- provenance, readiness status and the missing technical facts kept internally. It never becomes a
-- global catalogue product, never a country default, never recipe-eligible until the authority proves
-- technical safety. This is a NARROW sibling of gellatti_upsert_customer_added_product_v1:
--   * same ownership, EAN lock, existing-PR reuse (no duplicate exact product), pending shared
--     provisional row, account link, private relation and evidence rows;
--   * the ONLY differences: the profile readiness gate and the behaviour-classified gate are not
--     required, and the persisted facts + response carry engineUsable = false / privateNotReady = true.
-- The ready path (v1) is untouched. Nothing here changes Mapper, PI ids, Engine science or country defaults.
-- Not applied by hand — normal migration workflow only.

create or replace function public.gellatti_upsert_customer_private_product_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_idempotency_key text,
  p_scan_result jsonb,
  p_product_profile jsonb,
  p_product_behavior jsonb,
  p_private_overlay jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_session public.product_scan_sessions%rowtype;
  v_ean text;
  v_identity jsonb:=coalesce(p_scan_result->'identity','{}'::jsonb);
  v_package jsonb:=coalesce(p_scan_result->'package','{}'::jsonb);
  v_name text;
  v_brand text;
  v_existing_pr record;
  v_pending public.customer_added_products%rowtype;
  v_product_id uuid;
  v_version_id uuid;
  v_binding_id uuid;
  v_facts jsonb;
  v_quantity numeric;
  v_unit text;
  v_inserted integer:=0;
  v_count integer;
  v_product_code text;
begin
  if p_actor_user_id is null then raise exception 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception 'invalid_idempotency_key';
  end if;
  select * into v_session from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if v_session.id is null or v_session.expires_at<=statement_timestamp() then
    raise exception 'owned_scan_session_not_found';
  end if;
  if v_session.state not in ('analyzed','finalized') then raise exception 'scan_not_ready'; end if;
  if v_session.result_json is distinct from p_scan_result then
    raise exception 'scanner_result_authority_mismatch';
  end if;
  v_ean:=regexp_replace(coalesce(p_scan_result#>>'{barcodes,0,value}',v_session.barcode,''),'\D','','g');
  if v_ean !~ '^[0-9]{8,14}$' or v_ean is distinct from regexp_replace(coalesce(v_session.barcode,''),'\D','','g') then
    raise exception 'customer_product_valid_ean_required';
  end if;
  -- the profile and behaviour must still come from the server authorities (never client-made);
  -- readiness itself is NOT required here — that is the whole point of this function
  if p_product_profile#>>'{authority}'<>'PRODUCT_PROFILE_V1'
    or p_product_profile#>>'{validationMode}'<>'server_recomputed_product_profile'
    or p_product_profile#>>'{articleIdentity}'<>'PRODUCT_OWNED'
    or p_product_profile#>>'{origin}'<>'CUSTOMER_ADDED'
  then raise exception 'customer_product_profile_authority_required'; end if;
  if p_product_behavior#>>'{authority}'<>'PRODUCT_BEHAVIOR_V1'
    or p_product_behavior#>>'{validationMode}'<>'server_recomputed_product_behavior'
    or p_product_behavior#>>'{articleIdentity}'<>'PRODUCT_OWNED'
  then raise exception 'customer_product_behavior_authority_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-added-ean:'||v_ean,0));
  -- an exact shared commercial product with this GTIN is reused, never duplicated
  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr
    from public.products p
    where p.is_active and p.merged_into_product_id is null
      and p.visibility='shared' and p.product_kind='commercial_product'
      and p.product_code like 'PR-ING-%' and p.canonical_verification_status<>'blocked'
      and (p.ean_code_normalized=v_ean or exists(select 1 from public.product_variants pv
        where pv.product_id=p.id and pv.is_current and pv.ean=v_ean))
    order by p.canonical_verification_status='verified' desc,p.created_at limit 1;
  if v_existing_pr.id is not null then
    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)
    values(p_actor_user_id,v_existing_pr.id,true,
      nullif(p_private_overlay->>'price','')::numeric,
      nullif(upper(p_private_overlay->>'currency'),''),nullif(p_private_overlay->>'supplier',''),
      nullif(p_private_overlay->>'notes',''))
    on conflict(user_id,product_id) do update set favorite=true,
      private_price=coalesce(excluded.private_price,user_product_relations.private_price),
      currency=coalesce(excluded.currency,user_product_relations.currency),
      supplier=coalesce(excluded.supplier,user_product_relations.supplier),
      notes=coalesce(excluded.notes,user_product_relations.notes),updated_at=statement_timestamp();
    return jsonb_build_object('kind','existing_product','productId',v_existing_pr.id,
      'productCode',v_existing_pr.product_code,'displayName',v_existing_pr.product_name_display,
      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null);
  end if;

  select * into v_pending from public.customer_added_products
    where normalized_ean=v_ean and status='PENDING' for update;
  if v_pending.id is null then
    v_name:=coalesce(nullif(trim(v_identity->>'displayName'),''),nullif(trim(v_identity->>'originalName'),''));
    v_brand:=nullif(trim(v_identity->>'brand'),'');
    if v_name is null or (v_brand is null and coalesce((v_identity->>'explicitlyUnbranded')::boolean,false)=false) then
      raise exception 'customer_product_identity_required';
    end if;
    perform set_config('app.canonical_product_ingest','v1',true);
    perform set_config('app.product_article_origin','CUSTOMER_ADDED',true);
    v_facts:=p_scan_result||jsonb_build_object(
      'technicalComposition',coalesce(p_product_profile->'technicalComposition','{}'::jsonb),
      'productAccuracy',p_product_profile->'productAccuracy',
      'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
      'allergenEvidenceStatus',p_product_profile->>'allergenEvidenceStatus',
      'ingredientsEvidenceStatus',p_product_profile->>'ingredientsEvidenceStatus',
      'productIntelligence',jsonb_build_object(
        'version',1,'authority','PRODUCT_PROFILE_V1','articleIdentity','PRODUCT_OWNED',
        'origin','CUSTOMER_ADDED','compositionReadiness',coalesce(p_product_profile->>'readiness','NOT_READY'),
        'engineUsable',false,
        'privateNotReady',true,
        'criticalReadiness',p_product_profile->'criticalReadiness',
        'missingCritical',coalesce(p_product_profile->'missingCritical','[]'::jsonb),
        'missingEngineFields',coalesce(p_product_profile->'missingEngineFields','[]'::jsonb),
        'criticalPhysicsBlockers',coalesce(p_product_profile->'criticalPhysicsBlockers','[]'::jsonb),
        'criticalBlockers',coalesce(p_product_profile#>'{productAccuracyAssessment,criticalBlockers}','[]'::jsonb),
        'fieldTruth',coalesce(p_product_profile->'fieldTruth','{}'::jsonb),
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
    insert into public.products(
      owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,
      product_category,country,status,source_type,is_active,product_kind,visibility,
      canonical_verification_status,canonical_verification_method,canonical_provenance,
      explicitly_unbranded,canonical_family,normalized_identity,search_document
    ) values(
      null,p_actor_user_id,v_brand,v_ean,v_ean,
      coalesce(nullif(v_identity->>'originalName',''),v_name),v_name,
      nullif(v_identity->>'category',''),nullif(v_identity->>'countryOfOrigin',''),
      'manual_adjusted','label_scan',true,'customer_provisional','internal',
      'manual_unverified','manual_unverified','customer_added_scanner_v1',
      coalesce((v_identity->>'explicitlyUnbranded')::boolean,false),
      nullif(p_product_profile#>>'{recognition,ingredientFamily}','unknown'),
      'ean:'||v_ean,trim(concat_ws(' ',v_brand,v_name,v_identity->>'category',v_ean))
    ) returning id,product_code into v_product_id,v_product_code;
    insert into public.product_versions(
      product_id,version,facts,evidence_snapshot,verification_status,verification_method,
      provenance,facts_fingerprint
    ) values(
      v_product_id,1,v_facts,jsonb_build_object('scanSessionId',p_session_id,'privateNotReady',true),
      'manual_unverified','manual_unverified','customer_added_scanner_v1',
      encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex')
    ) returning id into v_version_id;
    update public.products set current_version_id=v_version_id where id=v_product_id;
    -- the behaviour classifier runs on the facts as they are; an unresolved outcome keeps the product
    -- out of recipes by the existing authority, exactly as intended for a not-ready private product
    begin
      select public.classify_catalog_product_behavior_v2(v_version_id,'product-behavior-v2')
        into v_binding_id;
      update public.products set current_behavior_binding_id=v_binding_id where id=v_product_id;
    exception when others then
      v_binding_id:=null;
    end;
    begin
      v_quantity:=nullif(v_package->>'netQuantity','')::numeric;
    exception when invalid_text_representation then v_quantity:=null; end;
    v_unit:=nullif(lower(v_package->>'unit'),'');
    if not exists(select 1 from public.product_variants where ean=v_ean) then
      insert into public.product_variants(
        product_id,ean,net_quantity,net_unit,market,original_package_name
      ) values(v_product_id,v_ean,v_quantity,v_unit,'GLOBAL',v_name);
    end if;
    insert into public.customer_added_products(normalized_ean,product_id)
      values(v_ean,v_product_id) returning * into v_pending;
  else
    v_product_id:=v_pending.product_id;
    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind='customer_provisional' and merged_into_product_id is null;
    if v_version_id is null then raise exception 'customer_product_pending_state_invalid'; end if;
  end if;

  insert into public.customer_added_product_accounts(
    customer_added_product_id,user_id,product_id,first_scan_session_id,last_scan_session_id
  ) values(v_pending.id,p_actor_user_id,v_product_id,p_session_id,p_session_id)
  on conflict(customer_added_product_id,user_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    update public.customer_added_product_accounts set last_scan_session_id=p_session_id,
      last_used_at=statement_timestamp()
      where customer_added_product_id=v_pending.id and user_id=p_actor_user_id;
  end if;
  select count(*) into v_count from public.customer_added_product_accounts
    where customer_added_product_id=v_pending.id;
  update public.customer_added_products set distinct_customer_count=v_count,
    last_seen_at=statement_timestamp(),updated_at=statement_timestamp() where id=v_pending.id;

  insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)
  values(p_actor_user_id,v_product_id,true,
    nullif(p_private_overlay->>'price','')::numeric,
    nullif(upper(p_private_overlay->>'currency'),''),nullif(p_private_overlay->>'supplier',''),
    nullif(p_private_overlay->>'notes',''))
  on conflict(user_id,product_id) do update set favorite=true,
    private_price=coalesce(excluded.private_price,user_product_relations.private_price),
    currency=coalesce(excluded.currency,user_product_relations.currency),
    supplier=coalesce(excluded.supplier,user_product_relations.supplier),
    notes=coalesce(excluded.notes,user_product_relations.notes),updated_at=statement_timestamp();

  insert into public.customer_added_product_evidence(
    customer_added_product_id,user_id,scan_session_id,product_version_id,scan_result,
    product_profile_authority,product_behavior_authority
  ) values(v_pending.id,p_actor_user_id,p_session_id,v_version_id,p_scan_result,
    p_product_profile,p_product_behavior)
  on conflict(user_id,scan_session_id) do nothing;
  update public.product_scan_sessions set state='finalized',exact_product_id=v_product_id,
    updated_at=statement_timestamp()
    where id=p_session_id and user_id=p_actor_user_id;

  select product_code into v_product_code from public.products where id=v_product_id;
  return jsonb_build_object(
    'kind','customer_added_product','productId',v_product_id,'productCode',v_product_code,
    'displayName',(select product_name_display from public.products where id=v_product_id),
    'brand',(select brand from public.products where id=v_product_id),
    'pendingId',v_pending.id,'customerCount',v_count,'engineUsable',false,'privateNotReady',true,
    'productAccuracy',p_product_profile->'productAccuracy'
  );
end;
$function$;

revoke all on function public.gellatti_upsert_customer_private_product_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.gellatti_upsert_customer_private_product_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role;

comment on function public.gellatti_upsert_customer_private_product_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) is
  'Scanner: persist a customer-scanned exact product PRIVATELY when the readiness authority cannot yet make it recipe-ready (engineUsable=false, privateNotReady=true). Reuses an exact shared PR instead of duplicating. Service role only (called by product-scan-finalize).';
