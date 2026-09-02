-- INTIMPORT catalogue import is not a manual candidate.
--
-- preflight_product_ingest_v1 mapped EVERY non-OCR source to the
-- `manual_candidate` action, so an owner importing their own catalogue was
-- metered by the crowd-submission quota: 10 products per day. A real 820-row
-- import created 10 rows and then logged 807 `daily` denials in six minutes.
--
-- A bulk catalogue import and a stranger hand-adding a product to the shared
-- catalogue are different acts with different risks, and they now have
-- different rate classes. `catalog_import` carries NO product-count quota.
--
-- The exemption is narrow, and it is NOT granted on the strength of a browser
-- field. `source` arrives from the client, so `catalog_import` earns the
-- unmetered class only when the ACTOR holds a paid entitlement — a fact that
-- lives in the database and cannot be set from a page. Anyone else sending
-- source='catalog_import' falls back to `manual_candidate` and its limits,
-- so spoofing the field buys nothing.
--
-- Operational safety is unchanged: reservations, idempotent replay, denial
-- auditing, payload validation, authentication and the per-row transaction all
-- stay exactly as they were. Only the product-count quota is lifted, and only
-- for this class.

create or replace function public.reserve_global_catalog_rate_slot(
  p_actor_user_id uuid,
  p_action text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_multiplier integer := 1;
  v_now timestamptz := now();
  v_count integer;
  v_retry timestamptz;
  v_reason text;
  v_existing public.global_catalog_rate_events%rowtype;
  v_id uuid;
begin
  if p_actor_user_id is null or p_action not in ('ocr_scan','manual_candidate','review_escalation','duplicate_dispute','catalog_import')
    or length(coalesce(p_idempotency_key,'')) not between 8 and 160
    or length(coalesce(p_payload_hash,'')) not between 16 and 128 then
    raise exception 'invalid catalog rate request';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_actor_user_id::text||':'||p_action));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('catalog-ip:'||p_ip_hash));
  end if;
  if p_device_hash is not null then
    perform pg_advisory_xact_lock(hashtext('catalog-device:'||p_device_hash));
  end if;
  select * into v_existing from public.global_catalog_rate_events
    where user_id=p_actor_user_id and action=p_action and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.payload_hash is distinct from p_payload_hash then
      raise exception 'idempotency key payload mismatch';
    end if;
    return jsonb_build_object('allowed',true,'idempotent',true,'reservationId',v_existing.id,'retryAt',null);
  end if;
  select coalesce(multiplier,1) into v_multiplier from public.global_catalog_trusted_accounts where user_id=p_actor_user_id;
  v_multiplier:=coalesce(v_multiplier,1);
  -- A repeated payload is a duplicate SUBMISSION signal for hand-entered
  -- products. Within one catalogue file it is ordinary: identity dedup and
  -- idempotency already decide what a repeat means, so it is not a denial here.
  if p_action<>'catalog_import' and p_payload_hash is not null and exists(
    select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action
      and payload_hash=p_payload_hash and created_at>v_now-interval '24 hours'
  ) then
    select min(created_at)+interval '24 hours' into v_retry
      from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action
        and payload_hash=p_payload_hash and created_at>v_now-interval '24 hours';
    v_reason:='duplicate_payload';
  end if;
  if v_reason is null and p_action='catalog_import' then
    -- NO PRODUCT-COUNT QUOTA. A catalogue is as long as it is.
    v_reason:=null;
  elsif v_reason is null and p_action='ocr_scan' then
    select count(*),min(created_at)+interval '1 minute' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 minute';
    if v_count>=3*v_multiplier then v_reason:='burst'; end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '1 hour' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour';
      if v_count>=20*v_multiplier then v_reason:='hourly'; end if;
    end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
      if v_count>=100*v_multiplier then v_reason:='daily'; end if;
    end if;
  elsif v_reason is null and p_action='manual_candidate' then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=10*v_multiplier then v_reason:='daily'; end if;
  elsif v_reason is null and p_action='duplicate_dispute' then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=2*v_multiplier then v_reason:='daily'; end if;
  elsif v_reason is null then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=2*v_multiplier then v_reason:='daily'; end if;
    if v_reason is null and exists(select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour') then
      select max(created_at)+interval '1 hour' into v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action;
      v_reason:='cooldown';
    end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '30 days' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '30 days';
      if v_count>=10*v_multiplier then v_reason:='rolling_30d'; end if;
    end if;
  end if;
  -- IP and device risk still guard every OTHER class, and a catalogue import
  -- neither trips them nor counts toward them: one owner importing 820 rows in
  -- 14 minutes is not 820 strangers, and letting those rows inflate the shared
  -- counters would lock the same person out of the manual paths afterwards.
  if p_action<>'catalog_import' then
    if v_reason is null and not p_risk_challenge_passed and p_ip_hash is not null and
      (select count(*) from public.global_catalog_rate_events where ip_hash=p_ip_hash and action<>'catalog_import' and created_at>v_now-interval '1 minute')>=10*v_multiplier then
      v_reason:='ip_risk'; v_retry:=v_now+interval '1 minute';
    end if;
    if v_reason is null and not p_risk_challenge_passed and p_device_hash is not null and
      (select count(*) from public.global_catalog_rate_events where device_hash=p_device_hash and action<>'catalog_import' and created_at>v_now-interval '1 minute')>=5*v_multiplier then
      v_reason:='device_risk'; v_retry:=v_now+interval '1 minute';
    end if;
  end if;
  if v_reason is not null then
    insert into public.global_catalog_rate_denials(user_id,action,reason,ip_hash,device_hash)
      values(p_actor_user_id,p_action,v_reason,p_ip_hash,p_device_hash);
    return jsonb_build_object('allowed',false,'reason',v_reason,'retryAt',v_retry,
      'challengeRequired',v_reason in ('ip_risk','device_risk'));
  end if;
  insert into public.global_catalog_rate_events(user_id,action,idempotency_key,payload_hash,ip_hash,device_hash)
    values(p_actor_user_id,p_action,p_idempotency_key,p_payload_hash,p_ip_hash,p_device_hash) returning id into v_id;
  return jsonb_build_object('allowed',true,'idempotent',false,'reservationId',v_id,'retryAt',null);
end;
$$;

create or replace function public.preflight_product_ingest_v1(
  p_actor_user_id uuid,
  p_source text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false,
  p_ocr_session_id uuid default null,
  p_duplicate_decision text default null,
  p_review_escalation boolean default false
) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_action text;
  v_result jsonb;
  v_dispute jsonb;
  v_review jsonb;
  v_completed jsonb;
  v_is_admin boolean;
begin
  if p_actor_user_id is null or p_source not in (
    'ocr','barcode','manual','admin','catalog_import','retailer_feed','spreadsheet',
    'supplier_specification','shop','franchise','internal_subproduct','future_integration'
  ) then raise exception 'invalid product ingest preflight'; end if;
  if p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid product ingest preflight hash'; end if;
  select exists(select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_is_admin;
  if p_source in ('admin','retailer_feed','supplier_specification','shop','franchise','future_integration')
    and not v_is_admin then
    raise exception 'privileged product source requires an active administrator';
  end if;
  if p_source='ocr' and not exists(
    select 1 from public.ocr_intake_sessions s
    where s.id=p_ocr_session_id and s.user_id=p_actor_user_id
      and s.state in ('ready_to_save','duplicate_blocked','saved')
      and exists(select 1 from public.ocr_intake_images i
        where i.session_id=s.id and i.state='ready')
  ) then raise exception 'owned saveable OCR session not found'; end if;
  if p_duplicate_decision is not null and p_duplicate_decision not in ('same','different') then
    raise exception 'invalid duplicate decision';
  end if;
  -- A barcode label supplied by a browser is not server evidence. Until the
  -- adapter can prove a scanner event it receives the conservative manual
  -- candidate quota; only an owned ready OCR session earns OCR capacity.
  --
  -- A catalogue import earns the unmetered class only when the ACTOR is an
  -- administrator or holds a paid entitlement. `source` came from the client;
  -- the entitlement did not. Everyone else keeps the manual candidate quota,
  -- so claiming source='catalog_import' bypasses nothing.
  v_action:=case
    when p_source='ocr' then 'ocr_scan'
    when p_source='catalog_import'
      and (v_is_admin or public.gellatti_has_paid_access_v1(p_actor_user_id)) then 'catalog_import'
    else 'manual_candidate'
  end;
  v_result:=public.reserve_global_catalog_rate_slot(
    p_actor_user_id,v_action,p_idempotency_key,p_payload_hash,
    p_ip_hash,p_device_hash,p_risk_challenge_passed
  );
  if not coalesce((v_result->>'allowed')::boolean,false) then return v_result; end if;
  select e.result_snapshot||jsonb_build_object('idempotent',true) into v_completed
  from public.product_ingest_events e
  where e.actor_user_id=p_actor_user_id and e.source=p_source
    and e.idempotency_key=p_idempotency_key;
  if found then
    return v_result||jsonb_build_object('completedResult',v_completed);
  end if;
  if p_duplicate_decision='different' then
    v_dispute:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'duplicate_dispute',left('duplicate:'||p_idempotency_key,160),p_payload_hash,
      p_ip_hash,p_device_hash,p_risk_challenge_passed
    );
    if not coalesce((v_dispute->>'allowed')::boolean,false) then return v_dispute; end if;
    v_result:=v_result||jsonb_build_object('disputeReservationId',v_dispute->>'reservationId');
  end if;
  if p_review_escalation then
    v_review:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'review_escalation',left('review:'||p_idempotency_key,160),p_payload_hash,
      p_ip_hash,p_device_hash,p_risk_challenge_passed
    );
    if not coalesce((v_review->>'allowed')::boolean,false) then return v_review; end if;
    v_result:=v_result||jsonb_build_object('reviewReservationId',v_review->>'reservationId');
  end if;
  return v_result;
end;
$$;
