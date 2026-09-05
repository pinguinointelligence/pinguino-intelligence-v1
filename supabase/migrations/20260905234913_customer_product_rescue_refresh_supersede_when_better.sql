-- SCANNER — RESCUE REFRESH SUPERSEDES ONLY WHEN THE PROFILE IS BETTER (owner direction 2026-09-05 §9).
--
-- The one-EAN ready upsert's refresh branch (20260905190000 + 20260905190308) wrote a superseding
-- product version on EVERY later ready finalize of an existing provisional product — a second account
-- scanning the same package, or a rescan with identical facts, produced a new immutable version of the
-- same truth. Owner rule: better data → controlled update; identical or weaker → no degradation and no
-- needless versions. "Better" is decided from the persisted facts, never from who scanned:
--   * usable where the current version is not;
--   * both usable and a higher readiness rank (READY > ESTIMATED_READY), or the same rank with a
--     materially higher Product Accuracy (> 0.5 points);
--   * neither usable and a higher readiness rank.
-- Otherwise the current version stays and the scan only links the account (evidence, relation, session).
-- Patches the existing definition in place; idempotent through its marker. No Mapper row, PI identity,
-- PR number or country default is touched.

do $patch_rescue_refresh_supersede_when_better$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if strpos(v_definition,'rescue-refresh: supersede only when better')>0 then
    return;
  end if;
  v_old := $old$    insert into public.product_versions(
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
  end if;$old$;
  v_new := $new$    -- rescue-refresh: supersede only when better (owner §9). Identical or weaker facts keep
    -- the current version: no degradation, no needless versions; the scan still links below.
    declare
      v_prior_facts jsonb;
      v_prior_usable boolean;
      v_new_usable boolean;
      v_prior_rank integer;
      v_new_rank integer;
      v_prior_accuracy numeric;
      v_new_accuracy numeric;
      v_improves boolean;
    begin
      select pv.facts into v_prior_facts from public.product_versions pv where pv.id=v_version_id;
      v_prior_usable:=coalesce((v_prior_facts#>>'{productIntelligence,engineUsable}')::boolean,false);
      v_new_usable:=coalesce((p_product_profile->>'engineUsable')::boolean,false);
      v_prior_rank:=case v_prior_facts#>>'{productIntelligence,compositionReadiness}'
        when 'READY' then 2 when 'ESTIMATED_READY' then 1 else 0 end;
      v_new_rank:=case p_product_profile->>'readiness'
        when 'READY' then 2 when 'ESTIMATED_READY' then 1 else 0 end;
      v_prior_accuracy:=coalesce((v_prior_facts#>>'{productIntelligence,productAccuracy}')::numeric,0);
      v_new_accuracy:=coalesce((p_product_profile->>'productAccuracy')::numeric,0);
      v_improves:=(v_new_usable and not v_prior_usable)
        or (v_new_usable and v_prior_usable
            and (v_new_rank>v_prior_rank
                 or (v_new_rank=v_prior_rank and v_new_accuracy>v_prior_accuracy+0.5)))
        or (not v_new_usable and not v_prior_usable and v_new_rank>v_prior_rank);
      if v_improves then
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
      end if;
    end;
  end if;$new$;
  if strpos(v_definition,v_old)=0 then
    raise exception 'customer product rescue refresh anchor drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_rescue_refresh_supersede_when_better$;
