-- RETIRE must use the same durable preflight reservation as every canonical
-- ingest. The Admin RPC owns that server-side preflight; it does not weaken or
-- bypass the central rate/idempotency guard.

select pg_advisory_xact_lock(hashtextextended('admin-catalog-retire-preflight-v1',0));

do $patch_admin_retire$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.gellatti_admin_catalog_action_v1(uuid,text,jsonb)'::regprocedure
  );
  v_patched:=v_definition;

  v_old:=$old$  v_target uuid; v_before jsonb;
  v_prior_ingest_context text:=current_setting('app.canonical_product_ingest',true);$old$;
  v_new:=$new$  v_target uuid; v_before jsonb;
  v_prior_ingest_context text:=current_setting('app.canonical_product_ingest',true);
  v_retire_idempotency text;
  v_retire_input jsonb;
  v_retire_evidence jsonb;
  v_rate_hash text;
  v_preflight jsonb;$new$;
  if strpos(v_patched,'v_retire_idempotency text')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'Admin retire declaration anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  elsif p_action='RETIRE' then
    perform public.ingest_product_v1(
      v_admin,'admin','admin-retire:'||p_product_id||':'||gen_random_uuid(),
      jsonb_build_object(
        'operation','retire','productId',p_product_id,'productKind',v_product.product_kind,
        'displayName',coalesce(v_product.product_name_display,v_product.product_name_internal),
        'brand',v_product.brand,'explicitlyUnbranded',v_product.explicitly_unbranded
      ),
      jsonb_build_object('reason',v_reason,'authority','GELLATTI_ADMIN_CATALOG_V1'),
      '{}'::jsonb,'{}'::jsonb
    );$old$;
  v_new:=$new$  elsif p_action='RETIRE' then
    v_retire_idempotency:='admin-retire:'||p_product_id||':'
      ||to_char(v_product.updated_at at time zone 'UTC','YYYYMMDDHH24MISSUS');
    v_retire_input:=jsonb_build_object(
      'operation','retire','productId',p_product_id,'productKind',v_product.product_kind,
      'displayName',coalesce(v_product.product_name_display,v_product.product_name_internal),
      'brand',v_product.brand,'explicitlyUnbranded',v_product.explicitly_unbranded
    );
    v_retire_evidence:=jsonb_build_object(
      'reason',v_reason,'authority','GELLATTI_ADMIN_CATALOG_V1',
      'productUpdatedAt',v_product.updated_at
    );
    v_rate_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
      'source','admin','input',v_retire_input,'evidence',v_retire_evidence,
      'privateOverlay','{}'::jsonb
    )::text,'utf8'),'sha256'),'hex');
    v_preflight:=public.preflight_product_ingest_v1(
      v_admin,'admin',v_retire_idempotency,v_rate_hash,null,null,true,null,null,false
    );
    if not coalesce((v_preflight->>'allowed')::boolean,false)
      or nullif(v_preflight->>'reservationId','') is null then
      raise exception 'admin catalog retire preflight rejected: %',coalesce(v_preflight->>'reason','invalid');
    end if;
    perform public.ingest_product_v1(
      v_admin,'admin',v_retire_idempotency,
      v_retire_input,v_retire_evidence,'{}'::jsonb,
      jsonb_build_object(
        'rateReservationId',v_preflight->>'reservationId',
        'ratePayloadHash',v_rate_hash
      )
    );$new$;
  if strpos(v_patched,'admin catalog retire preflight rejected')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'Admin retire ingest anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_admin_retire$;
