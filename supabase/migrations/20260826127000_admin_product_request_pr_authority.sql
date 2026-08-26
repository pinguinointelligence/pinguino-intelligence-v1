-- INTIMPORT and an Admin-approved Product Add Request are the two controlled
-- PR origins. Admit the latter only when the immutable request UUID is bound
-- in both facts and evidence and the referenced request is still non-terminal.

select pg_advisory_xact_lock(hashtextextended('admin-product-request-pr-authority-v1',0));

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

  v_old:=$old$        (p_risk#>>'{productProfileAuthority,origin}'='PR'
          and p_source='catalog_import'
          and coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')='INTIMPORT'
          and coalesce(p_risk#>>'{productProfileAuthority,sourceProductId}','')
            is not distinct from coalesce(p_input#>>'{facts,catalogImportIdentity,sourceProductId}',''))
        or$old$;
  v_new:=$new$        (p_risk#>>'{productProfileAuthority,origin}'='PR'
          and (
            (p_source='catalog_import'
              and coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')='INTIMPORT'
              and coalesce(p_risk#>>'{productProfileAuthority,sourceProductId}','')
                is not distinct from coalesce(p_input#>>'{facts,catalogImportIdentity,sourceProductId}',''))
            or
            (p_source='admin'
              and coalesce(p_input->>'provenance','')='product_add_request_admin_v1'
              and coalesce((p_evidence->>'approvedByAdmin')::boolean,false)
              and coalesce(p_input#>>'{facts,productAddRequestId}','')
                =coalesce(p_evidence->>'productAddRequestId','')
              and coalesce(p_input#>>'{facts,productAddRequestId}','')
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and exists(
                select 1 from public.product_add_requests request_authority
                where request_authority.id=(p_input#>>'{facts,productAddRequestId}')::uuid
                  and request_authority.status in ('SUBMITTED','ADMIN_REVIEW','NEEDS_INFO','RESUBMITTED')
              ))
          ))
        or$new$;

  if strpos(v_patched,'product_add_request_admin_v1')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'PR origin authority anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_ingest$;
