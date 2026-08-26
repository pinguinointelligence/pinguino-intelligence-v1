-- Catalog writes remain behind the central canonical-ingest trigger. The
-- security-definer Admin RPC enters that context only after role, reason,
-- target and Mapper/PI protections have succeeded.

select pg_advisory_xact_lock(hashtextextended('admin-catalog-guard-context-v1',0));

do $patch_admin_catalog$
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

  v_old:=$old$  v_target uuid; v_before jsonb;$old$;
  v_new:=$new$  v_target uuid; v_before jsonb;
  v_prior_ingest_context text:=current_setting('app.canonical_product_ingest',true);$new$;
  if strpos(v_patched,'v_prior_ingest_context text')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'admin catalog declaration anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  v_before:=jsonb_build_object('active',v_product.is_active,'mergedInto',v_product.merged_into_product_id,
    'status',v_product.status,'verificationStatus',v_product.canonical_verification_status);
  if p_action in ('ADD_MARKET','REMOVE_MARKET') then$old$;
  v_new:=$new$  v_before:=jsonb_build_object('active',v_product.is_active,'mergedInto',v_product.merged_into_product_id,
    'status',v_product.status,'verificationStatus',v_product.canonical_verification_status);

  -- The central trigger still owns the write boundary. This security-definer
  -- function has already checked the Admin permission, reason and non-Mapper
  -- target, so it may enter the same short-lived context as ingest_product_v1.
  perform set_config('app.canonical_product_ingest','v1',true);

  if p_action in ('ADD_MARKET','REMOVE_MARKET') then$new$;
  if strpos(v_patched,"perform set_config('app.canonical_product_ingest','v1',true)")=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'admin catalog context anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  perform public.gellatti_write_audit_v1(
    'catalog.'||lower(p_action),'products',p_product_id::text,$old$;
  v_new:=$new$  perform set_config('app.canonical_product_ingest',coalesce(v_prior_ingest_context,''),true);
  perform public.gellatti_write_audit_v1(
    'catalog.'||lower(p_action),'products',p_product_id::text,$new$;
  if strpos(v_patched,"set_config('app.canonical_product_ingest',coalesce(v_prior_ingest_context,''),true)")=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'admin catalog restore anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_admin_catalog$;
