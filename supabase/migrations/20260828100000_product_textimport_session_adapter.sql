-- TEXTIMPORT only opens a server-owned Product Scanner session from an already
-- adapted ProductScanResult. Product validation remains in the existing Scanner
-- validator and final product creation remains in product-scan-finalize.

create or replace function public.create_product_textimport_session_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_result jsonb,
  p_validation jsonb,
  p_overlay_state text,
  p_barcode text default null
) returns void
language plpgsql security definer
set search_path=public
as $$
begin
  if p_actor_user_id is null or p_session_id is null then
    raise exception 'textimport actor and session are required';
  end if;
  if jsonb_typeof(coalesce(p_result,'null'::jsonb))<>'object'
    or p_result->>'schemaVersion'<>'gellatti_product_scan_v1' then
    raise exception 'textimport requires the Product Scanner result contract';
  end if;
  if jsonb_typeof(coalesce(p_validation,'null'::jsonb))<>'object'
    or p_validation#>>'{intake,kind}'<>'TEXTIMPORT' then
    raise exception 'textimport validation envelope is invalid';
  end if;
  if p_overlay_state not in ('SCAN_DRAFT','USABLE_FOR_OWNER','PENDING_PUBLICATION','BLOCKED') then
    raise exception 'textimport Scanner overlay is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtext('product-textimport-session:'||p_session_id::text));
  if exists(select 1 from public.product_scan_sessions where id=p_session_id) then
    if not exists(select 1 from public.product_scan_sessions
      where id=p_session_id and user_id=p_actor_user_id and result_json=p_result
        and validation_json=p_validation and overlay_state=p_overlay_state) then
      raise exception 'textimport session id is already in use';
    end if;
    return;
  end if;

  insert into public.product_scan_sessions(
    id,user_id,state,barcode,result_json,validation_json,overlay_state,
    vision_calls,web_calls,estimated_cost_usd,expires_at
  ) values(
    p_session_id,p_actor_user_id,
    case when p_validation->>'ok'='true' then 'analyzed' else 'blocked' end,
    nullif(p_barcode,''),p_result,p_validation,p_overlay_state,0,0,0,
    now()+interval '24 hours'
  );

  insert into public.product_scan_external_sources(
    session_id,user_id,source_type,source_url,source_title,fields_used
  )
  select p_session_id,p_actor_user_id,item->>'sourceType',nullif(item->>'url',''),
    nullif(item->>'title',''),
    array(select jsonb_array_elements_text(coalesce(item->'fieldsUsed','[]'::jsonb)))
  from jsonb_array_elements(coalesce(p_result->'externalSources','[]'::jsonb)) item
  where item->>'sourceType' in ('barcode_registry','manufacturer','retailer','web_search')
    and (nullif(item->>'url','') is null or item->>'url'~*'^https://');
end;
$$;

revoke all on function public.create_product_textimport_session_v1(
  uuid,uuid,jsonb,jsonb,text,text
) from public,anon,authenticated;
grant execute on function public.create_product_textimport_session_v1(
  uuid,uuid,jsonb,jsonb,text,text
) to service_role;

comment on function public.create_product_textimport_session_v1(uuid,uuid,jsonb,jsonb,text,text)
is 'Service-only TEXTIMPORT adapter seam into the existing Product Scanner session and finalization path.';
