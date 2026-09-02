-- PINGÜINO — the scan session must survive a failed analysis, and an exact GTIN
-- lookup must be able to answer a scan without a single paid label call.
--
-- Two served defects are closed here.
--
-- 1. A FAILED analysis consumed the session's analysis allowance.
--    `complete_product_scan_analysis_v1` incremented `vision_calls` for BOTH outcomes,
--    so a provider timeout or a rejected result spent one of the two calls the session
--    is ever allowed — and a second failure left the owner reading „Limit analiz
--    wykorzystany" on a scan that had produced nothing at all. The same statement also
--    overwrote `overlay_state` with 'BLOCKED' on failure, which threw away a GOOD earlier
--    analysis whenever a follow-up call failed. An attempt that returns nothing now costs
--    the session nothing, and never downgrades what the session already holds.
--
--    Spend is still bounded — the per-user burst window, the daily and monthly cost
--    kill switches and the idempotency ledger are untouched — and a new per-session
--    ATTEMPT ceiling replaces the allowance as the thing that stops a retry loop.
--
-- 2. There was no way to record evidence that came from the exact GTIN source.
--    The scanner could only write a session result as the side effect of a vision call,
--    so „ask the barcode's own source before asking the owner for another photograph"
--    had nowhere to put its answer. The two functions at the bottom give the lookup its
--    own reservation and its own completion, sharing the session's existing single-web-
--    call ceiling and writing the same evidence/provenance rows a vision call writes.

create or replace function public.reserve_product_scan_analysis_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_call_kind text,
  p_environment text,
  p_project_id text,
  p_model text,
  p_image_count integer,
  p_detail_level text,
  p_ip_hash text,
  p_device_hash text,
  p_retry_reason text,
  p_idempotency_key text,
  p_payload_hash text,
  p_estimated_cost_usd numeric,
  p_web_requested boolean,
  p_daily_cost_limit_usd numeric,
  p_monthly_cost_limit_usd numeric
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_existing public.product_scan_usage_ledger%rowtype;
  v_session public.product_scan_sessions%rowtype;
  v_id uuid;
  v_now timestamptz:=now();
  v_daily numeric;
  v_monthly numeric;
  v_attempts integer;
begin
  if p_actor_user_id is null or p_session_id is null or p_call_kind not in ('fast','accurate')
    or p_environment not in ('staging','production')
    or length(coalesce(p_project_id,''))<8 or length(coalesce(p_model,''))<3
    or p_image_count not between 1 and 4
    or p_detail_level not in ('auto','low','high','original')
    or p_ip_hash!~'^[0-9a-f]{64}$' or p_device_hash!~'^[0-9a-f]{64}$'
    or length(coalesce(p_idempotency_key,'')) not between 8 and 160
    or p_payload_hash!~'^[0-9a-f]{64}$' or p_estimated_cost_usd<=0
    or p_daily_cost_limit_usd<=0 or p_monthly_cost_limit_usd<=0 then
    raise exception 'invalid product scan analysis reservation';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-analysis:'||p_actor_user_id::text));
  perform pg_advisory_xact_lock(hashtext('product-scan-global-cost'));
  insert into public.product_scan_sessions(id,user_id,state,expires_at)
  values(p_session_id,p_actor_user_id,'collecting',v_now+interval '24 hours')
  on conflict(id) do nothing;
  select * into v_session from public.product_scan_sessions where id=p_session_id;
  if not found or v_session.user_id<>p_actor_user_id then raise exception 'product scan session ownership mismatch'; end if;
  if v_session.expires_at<=v_now or v_session.state in ('expired','finalized') then
    return jsonb_build_object('allowed',false,'reason','session_not_active');
  end if;
  select * into v_existing from public.product_scan_usage_ledger
    where user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.payload_hash<>p_payload_hash or v_existing.call_kind<>p_call_kind then
      raise exception 'product scan analysis idempotency payload mismatch';
    end if;
    -- The SAME evidence failing twice is refused; the caller keys on the payload, so
    -- a retry that carries a new frame is a different call and reaches the checks below.
    if v_existing.status='failed' then
      return jsonb_build_object('allowed',false,'reason','analysis_call_already_failed');
    end if;
    if v_existing.status='reserved' then
      return jsonb_build_object('allowed',false,'reason','analysis_in_progress','retryAt',v_existing.created_at+interval '15 minutes');
    end if;
    return jsonb_build_object('allowed',true,'idempotent',true,'completed',true,'reservationId',v_existing.id);
  end if;
  -- Attempts, not outcomes, are what a runaway retry loop produces. Successful calls
  -- are already capped at two by `vision_calls`; this is the ceiling that also counts
  -- the ones that failed, so a failure staying free can never become unbounded.
  select count(*) into v_attempts from public.product_scan_usage_ledger where session_id=p_session_id;
  if v_attempts>=4 then
    return jsonb_build_object('allowed',false,'reason','session_analysis_attempt_limit');
  end if;
  if p_call_kind='fast' and v_session.vision_calls>0 then
    return jsonb_build_object('allowed',false,'reason','fast_call_already_used');
  end if;
  if p_call_kind='accurate' and v_session.vision_calls<>1 then
    return jsonb_build_object('allowed',false,'reason','accurate_retry_requires_one_fast_call');
  end if;
  if v_session.vision_calls>=2 then return jsonb_build_object('allowed',false,'reason','session_vision_limit'); end if;
  if p_web_requested and v_session.web_calls>=1 then
    return jsonb_build_object('allowed',false,'reason','session_web_limit');
  end if;
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_daily
    from public.product_scan_usage_ledger
    where created_at>=date_trunc('day',v_now);
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_monthly
    from public.product_scan_usage_ledger
    where created_at>=date_trunc('month',v_now);
  if v_daily+p_estimated_cost_usd>p_daily_cost_limit_usd then
    return jsonb_build_object('allowed',false,'reason','daily_cost_kill_switch','retryAt',date_trunc('day',v_now)+interval '1 day');
  end if;
  if v_monthly+p_estimated_cost_usd>p_monthly_cost_limit_usd then
    return jsonb_build_object('allowed',false,'reason','monthly_cost_kill_switch','retryAt',date_trunc('month',v_now)+interval '1 month');
  end if;
  if (select count(*) from public.product_scan_usage_ledger
      where user_id=p_actor_user_id and created_at>v_now-interval '1 minute')>=3 then
    return jsonb_build_object('allowed',false,'reason','analysis_burst','retryAt',v_now+interval '1 minute');
  end if;
  if (select count(*) from public.product_scan_usage_ledger
      where ip_hash=p_ip_hash and created_at>v_now-interval '1 minute')>=10 then
    return jsonb_build_object('allowed',false,'reason','analysis_ip_burst','retryAt',v_now+interval '1 minute');
  end if;
  if (select count(*) from public.product_scan_usage_ledger
      where device_hash=p_device_hash and created_at>v_now-interval '1 minute')>=5 then
    return jsonb_build_object('allowed',false,'reason','analysis_device_burst','retryAt',v_now+interval '1 minute');
  end if;
  insert into public.product_scan_usage_ledger(
    user_id,session_id,call_kind,environment,openai_project_id,model,image_count,
    detail_level,ip_hash,device_hash,retry_reason,idempotency_key,payload_hash,estimated_cost_usd
  ) values(
    p_actor_user_id,p_session_id,p_call_kind,p_environment,p_project_id,p_model,p_image_count,
    p_detail_level,p_ip_hash,p_device_hash,nullif(p_retry_reason,''),p_idempotency_key,
    p_payload_hash,p_estimated_cost_usd
  ) returning id into v_id;
  return jsonb_build_object('allowed',true,'idempotent',false,'completed',false,'reservationId',v_id);
end;
$$;

create or replace function public.complete_product_scan_analysis_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_result jsonb,
  p_validation jsonb,
  p_overlay_state text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_web_calls integer,
  p_latency_ms integer,
  p_actual_cost_usd numeric
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_call_kind text;
  v_session public.product_scan_sessions%rowtype;
begin
  if p_status not in ('completed','failed')
    or p_overlay_state not in ('SCAN_DRAFT','USABLE_FOR_OWNER','PENDING_PUBLICATION','BLOCKED')
    or p_web_calls not between 0 and 1 or p_latency_ms<0 or p_actual_cost_usd<0 then
    raise exception 'invalid product scan analysis completion';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-analysis:'||p_actor_user_id::text));
  select call_kind into v_call_kind from public.product_scan_usage_ledger
    where id=p_reservation_id and user_id=p_actor_user_id and session_id=p_session_id and status='reserved'
    for update;
  if not found then raise exception 'product scan analysis reservation not found'; end if;
  -- The real spend is always recorded, whatever the outcome. What a failure must NOT
  -- do is spend the session's allowance or erase what the session already knows.
  update public.product_scan_usage_ledger set
    status=p_status,actual_cost_usd=p_actual_cost_usd,input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,web_calls=p_web_calls,latency_ms=p_latency_ms,completed_at=now()
  where id=p_reservation_id;
  select * into v_session from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if not found then raise exception 'product scan session not found'; end if;
  update public.product_scan_sessions set
    state=case
      when p_status='completed' then 'analyzed'
      when v_session.result_json is not null then 'analyzed'
      else 'collecting' end,
    result_json=case when p_status='completed' then p_result else result_json end,
    validation_json=case when p_status='completed' then coalesce(p_validation,'{}'::jsonb) else validation_json end,
    overlay_state=case when p_status='completed' then p_overlay_state else overlay_state end,
    vision_calls=vision_calls+case when p_status='completed' then 1 else 0 end,
    web_calls=web_calls+p_web_calls,
    estimated_cost_usd=estimated_cost_usd+p_actual_cost_usd,
    updated_at=now()
  where id=p_session_id and user_id=p_actor_user_id;
  if p_status='completed' then
    delete from public.product_scan_field_evidence
      where session_id=p_session_id and user_id=p_actor_user_id;
    insert into public.product_scan_field_evidence(
      session_id,user_id,asset_id,field_key,source_type,confidence,evidence_value
    )
    select p_session_id,p_actor_user_id,(item->>'assetId')::uuid,item->>'field',
      item->>'source',item->>'confidence',null
    from jsonb_array_elements(coalesce(p_result->'evidence','[]'::jsonb)) item
    where coalesce(item->>'assetId','')~*'^[0-9a-f-]{36}$'
      and item->>'source' in ('label','barcode_registry','manufacturer','retailer')
      and item->>'confidence' in ('high','medium','low')
      and exists(select 1 from public.product_scan_assets a
        where a.id=(item->>'assetId')::uuid and a.session_id=p_session_id and a.user_id=p_actor_user_id);
    delete from public.product_scan_external_sources
      where session_id=p_session_id and user_id=p_actor_user_id;
    insert into public.product_scan_external_sources(
      session_id,user_id,source_type,source_url,source_title,fields_used
    )
    select p_session_id,p_actor_user_id,item->>'sourceType',nullif(item->>'url',''),
      nullif(item->>'title',''),array(select jsonb_array_elements_text(coalesce(item->'fieldsUsed','[]'::jsonb)))
    from jsonb_array_elements(coalesce(p_result->'externalSources','[]'::jsonb)) item
    where item->>'sourceType' in ('barcode_registry','manufacturer','retailer','web_search')
      and (nullif(item->>'url','') is null or item->>'url'~*'^https://');
  end if;
end;
$$;

-- The exact GTIN lookup: one per session, sharing the session's existing single
-- external-call ceiling. It is reserved BEFORE the provider is called so two tabs of
-- the same session cannot both spend it.
create or replace function public.reserve_product_scan_ean_lookup_v1(
  p_actor_user_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_session public.product_scan_sessions%rowtype;
  v_now timestamptz:=now();
begin
  if p_actor_user_id is null or p_session_id is null then
    raise exception 'invalid product scan lookup reservation';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-lookup:'||p_session_id::text));
  select * into v_session from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if not found then return jsonb_build_object('allowed',false,'reason','owned_scan_session_not_found'); end if;
  if v_session.expires_at<=v_now or v_session.state in ('expired','finalized') then
    return jsonb_build_object('allowed',false,'reason','session_not_active');
  end if;
  if v_session.barcode is null then
    return jsonb_build_object('allowed',false,'reason','lookup_requires_barcode');
  end if;
  if v_session.web_calls>=1 then
    return jsonb_build_object('allowed',false,'reason','session_lookup_already_used');
  end if;
  update public.product_scan_sessions
    set web_calls=web_calls+1, updated_at=v_now
    where id=p_session_id and user_id=p_actor_user_id;
  return jsonb_build_object('allowed',true,'barcode',v_session.barcode);
end;
$$;

-- What the lookup found, written with the SAME provenance rows a label analysis writes.
-- No vision allowance is touched: this call reads a source, it does not read a photograph.
create or replace function public.complete_product_scan_ean_lookup_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_result jsonb,
  p_validation jsonb,
  p_overlay_state text,
  p_cost_usd numeric
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if p_overlay_state not in ('SCAN_DRAFT','USABLE_FOR_OWNER','PENDING_PUBLICATION','BLOCKED')
    or coalesce(p_cost_usd,0)<0 then
    raise exception 'invalid product scan lookup completion';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-lookup:'||p_session_id::text));
  update public.product_scan_sessions set
    result_json=coalesce(p_result,result_json),
    validation_json=coalesce(p_validation,validation_json),
    overlay_state=case when p_result is null then overlay_state else p_overlay_state end,
    state=case when p_result is null then state else 'analyzed' end,
    estimated_cost_usd=estimated_cost_usd+coalesce(p_cost_usd,0),
    updated_at=now()
  where id=p_session_id and user_id=p_actor_user_id
    and state not in ('expired','finalized');
  if not found then raise exception 'product scan session not found'; end if;
  if p_result is not null then
    delete from public.product_scan_external_sources
      where session_id=p_session_id and user_id=p_actor_user_id
        and source_type in ('barcode_registry','manufacturer','retailer','web_search');
    insert into public.product_scan_external_sources(
      session_id,user_id,source_type,source_url,source_title,fields_used
    )
    select p_session_id,p_actor_user_id,item->>'sourceType',nullif(item->>'url',''),
      nullif(item->>'title',''),array(select jsonb_array_elements_text(coalesce(item->'fieldsUsed','[]'::jsonb)))
    from jsonb_array_elements(coalesce(p_result->'externalSources','[]'::jsonb)) item
    where item->>'sourceType' in ('barcode_registry','manufacturer','retailer','web_search')
      and (nullif(item->>'url','') is null or item->>'url'~*'^https://');
  end if;
end;
$$;

revoke all on function public.reserve_product_scan_ean_lookup_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_product_scan_ean_lookup_v1(uuid,uuid,jsonb,jsonb,text,numeric) from public,anon,authenticated;
grant execute on function public.reserve_product_scan_ean_lookup_v1(uuid,uuid) to service_role;
grant execute on function public.complete_product_scan_ean_lookup_v1(uuid,uuid,jsonb,jsonb,text,numeric) to service_role;
