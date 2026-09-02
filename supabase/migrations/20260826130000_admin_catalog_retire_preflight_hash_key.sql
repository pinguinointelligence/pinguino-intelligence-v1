-- ingest_product_v1 names the shared preflight fingerprint
-- `preflightPayloadHash`. Keep the Admin RETIRE adapter on that exact contract.

select pg_advisory_xact_lock(hashtextextended('admin-catalog-retire-preflight-hash-key-v1',0));

do $patch_admin_retire_hash$
declare
  v_definition text;
  v_patched text;
begin
  v_definition:=pg_get_functiondef(
    'public.gellatti_admin_catalog_action_v1(uuid,text,jsonb)'::regprocedure
  );
  v_patched:=replace(v_definition,$old$'ratePayloadHash',v_rate_hash$old$,
    $new$'preflightPayloadHash',v_rate_hash$new$);
  if strpos(v_patched,$marker$'preflightPayloadHash',v_rate_hash$marker$)=0 then
    raise exception 'Admin retire preflight hash-key anchor drifted';
  end if;
  execute v_patched;
end;
$patch_admin_retire_hash$;
