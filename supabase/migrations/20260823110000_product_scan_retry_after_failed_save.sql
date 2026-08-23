-- PINGÜINO v1.4 — a FAILED product save must leave the scan retryable.
--
-- Found while re-running the owner's exact Cacao Puro finalize (session 4c969b3f) after the
-- classifier-volatility fix: the call answered HTTP 429 `scanner_product_quota_reached`, not the
-- 400 it used to. The account is nowhere near a limit — it holds ONE reservation ever, and that
-- one is `released`.
--
-- `reserve_product_scan_creation_v1` short-circuits on the idempotency key before the limits:
--
--   select * into v_existing … where user_id=… and idempotency_key=p_idempotency_key;
--   if found then return jsonb_build_object('allowed', v_existing.status<>'released', …);
--
-- The three statuses do not mean the same thing. `reserved` = an attempt is in flight; `consumed` =
-- the product exists, so the retry must return THAT product and never create a second one; but
-- `released` means the previous attempt FAILED and the slot was deliberately given back. Answering
-- `allowed=false` there tells the owner they are out of quota when nothing was ever spent — and,
-- because the scanner derives the key from the session (`<sessionId>:create-v1`), it locks that
-- scan out of retrying FOR GOOD. Every scan that hit the 400 became unsavable even after the 400
-- was fixed.
--
-- Fix: a released reservation is re-openable. It goes through the SAME limit checks as a fresh one
-- (a retry must not be a way around the ceiling) and is then reused in place, so the row count
-- stays one-per-scan and the idempotency key keeps protecting against duplicate products.
-- `reserved` and `consumed` are untouched, so the no-duplicate-on-retry guarantee is unchanged.
create or replace function public.reserve_product_scan_creation_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing public.product_scan_creation_reservations%rowtype;
  v_reopen boolean := false;
  v_plan text;
  v_id uuid;
  v_now timestamptz:=now();
  v_lifetime integer;
  v_month integer;
  v_day integer;
  v_timezone text:='UTC';
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_next_day timestamptz;
  v_next_month timestamptz;
begin
  if p_actor_user_id is null or p_session_id is null
    or length(coalesce(p_idempotency_key,'')) not between 8 and 160 then
    raise exception 'invalid product scan creation reservation';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-create:'||p_actor_user_id::text));
  if not exists(select 1 from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id and state='analyzed'
      and overlay_state in ('USABLE_FOR_OWNER','PENDING_PUBLICATION')) then
    return jsonb_build_object('allowed',false,'reason','scan_not_ready');
  end if;
  select * into v_existing from public.product_scan_creation_reservations
    where user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then
    -- reserved = in flight, consumed = the product already exists (return it, never create a
    -- second one). Only a RELEASED slot — a previous attempt that failed — is re-openable, and it
    -- still has to pass the limits below.
    if v_existing.status <> 'released' then
      return jsonb_build_object(
        'allowed',true,'idempotent',true,
        'consumed',v_existing.status='consumed','reservationId',v_existing.id,
        'productId',v_existing.product_id
      );
    end if;
    v_reopen := true;
  end if;
  v_plan:=case when exists(select 1 from public.entitlements e
    where e.user_id=p_actor_user_id and e.scope='pro' and e.status='active'
      and e.starts_at<=v_now and (e.ends_at is null or e.ends_at>v_now)) then 'pro' else 'basic' end;
  -- This repository's account boundary is auth.users/user_id. Use the account
  -- profile timezone for daily/monthly windows; absent or invalid values fail
  -- safely to the documented UTC fallback.
  select coalesce(nullif(timezone,''),'UTC') into v_timezone
    from public.account_profiles where user_id=p_actor_user_id;
  v_timezone:=coalesce(v_timezone,'UTC');
  begin
    perform timezone(v_timezone,v_now);
  exception when invalid_parameter_value then
    v_timezone:='UTC';
  end;
  v_day_start:=date_trunc('day',v_now at time zone v_timezone) at time zone v_timezone;
  v_month_start:=date_trunc('month',v_now at time zone v_timezone) at time zone v_timezone;
  v_next_day:=(date_trunc('day',v_now at time zone v_timezone)+interval '1 day') at time zone v_timezone;
  v_next_month:=(date_trunc('month',v_now at time zone v_timezone)+interval '1 month') at time zone v_timezone;
  -- Reserved slots count temporarily so concurrent requests cannot cross the
  -- five-product boundary. Failures/duplicates release the slot and disappear
  -- from this count; only successful creations remain consumed.
  select count(*) into v_lifetime from public.product_scan_creation_reservations
    where user_id=p_actor_user_id and status in ('reserved','consumed');
  select count(*) into v_month from public.product_scan_creation_reservations
    where user_id=p_actor_user_id and status in ('reserved','consumed')
      and created_at>=v_month_start;
  select count(*) into v_day from public.product_scan_creation_reservations
    where user_id=p_actor_user_id and status in ('reserved','consumed')
      and created_at>=v_day_start;
  if v_plan='pro' and v_month>=50 then
    return jsonb_build_object('allowed',false,'reason','pro_monthly_product_limit','retryAt',v_next_month,'upgradeHook',null);
  end if;
  if v_plan='basic' and v_month>=10 then
    return jsonb_build_object('allowed',false,'reason','basic_monthly_product_limit','retryAt',v_next_month,'upgradeHook','/subscription');
  end if;
  -- First five successfully created products have no daily restriction. Only
  -- once that lifetime allowance is consumed does the 1/day rule apply.
  if v_plan='basic' and v_lifetime>=5 and v_day>=1 then
    return jsonb_build_object('allowed',false,'reason','basic_daily_product_limit','retryAt',v_next_day,'upgradeHook','/subscription');
  end if;
  if v_reopen then
    -- Reuse the row so the idempotency key still maps to exactly one reservation per scan.
    update public.product_scan_creation_reservations set
      status='reserved', plan_scope=v_plan, session_id=p_session_id,
      created_at=v_now, completed_at=null, product_id=null
    where id=v_existing.id
    returning id into v_id;
    return jsonb_build_object('allowed',true,'idempotent',false,'consumed',false,'reservationId',v_id,'plan',v_plan,'reopened',true);
  end if;
  insert into public.product_scan_creation_reservations(
    user_id,session_id,idempotency_key,plan_scope
  ) values(p_actor_user_id,p_session_id,p_idempotency_key,v_plan) returning id into v_id;
  return jsonb_build_object('allowed',true,'idempotent',false,'consumed',false,'reservationId',v_id,'plan',v_plan);
end;
$function$;
