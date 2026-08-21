-- Gellatti Product Scanner v1. This migration is prepared for review only.
-- It does not change mapper_basement and does not duplicate the canonical product root.

create table if not exists public.product_scan_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version text not null default 'gellatti_product_scan_v1'
    check (schema_version='gellatti_product_scan_v1'),
  state text not null default 'collecting'
    check (state in ('collecting','matched','analyzed','finalized','expired','blocked')),
  barcode text,
  exact_product_id uuid references public.products(id),
  result_json jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  overlay_state text not null default 'SCAN_DRAFT'
    check (overlay_state in ('SCAN_DRAFT','USABLE_FOR_OWNER','PENDING_PUBLICATION','PUBLISHED','BLOCKED')),
  vision_calls smallint not null default 0 check (vision_calls between 0 and 2),
  web_calls smallint not null default 0 check (web_calls between 0 and 1),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  finalized_at timestamptz,
  constraint product_scan_session_result_state check (
    result_json is null or state in ('analyzed','finalized','blocked')
  )
);
create index if not exists product_scan_sessions_owner_idx on public.product_scan_sessions(user_id,created_at desc);
create index if not exists product_scan_sessions_expiry_idx on public.product_scan_sessions(expires_at) where state not in ('finalized','expired');

-- Metadata only. V1 sends selected normalized images to the provider but does
-- not persist raw binaries or EXIF in Supabase storage.
create table if not exists public.product_scan_assets (
  id uuid primary key,
  session_id uuid not null references public.product_scan_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('camera_auto','camera_manual','gallery','drop','paste')),
  original_mime text not null,
  normalized_mime text not null check (normalized_mime in ('image/png','image/jpeg','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  checksum_sha256 text not null check (checksum_sha256~'^[0-9a-f]{64}$'),
  transformations text[] not null default '{}',
  quality_score smallint check (quality_score between 0 and 100),
  created_at timestamptz not null default now(),
  unique(session_id,checksum_sha256)
);
create index if not exists product_scan_assets_session_idx on public.product_scan_assets(session_id,created_at);

create table if not exists public.product_scan_field_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.product_scan_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.product_scan_assets(id) on delete cascade,
  field_key text not null,
  source_type text not null check (source_type in ('label','barcode_registry','manufacturer','retailer')),
  confidence text not null check (confidence in ('high','medium','low')),
  evidence_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists product_scan_field_evidence_session_idx on public.product_scan_field_evidence(session_id,field_key);

create table if not exists public.product_scan_external_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.product_scan_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('barcode_registry','manufacturer','retailer','web_search')),
  source_url text,
  source_title text,
  retrieved_at timestamptz not null default now(),
  fields_used text[] not null default '{}',
  conflicts jsonb not null default '[]'::jsonb
);

create table if not exists public.product_scan_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.product_scan_sessions(id) on delete cascade,
  call_kind text not null check (call_kind in ('fast','accurate')),
  environment text not null check (environment in ('staging','production')),
  openai_project_id text not null,
  model text not null,
  image_count smallint not null check (image_count between 1 and 4),
  detail_level text not null check (detail_level in ('auto','low','high','original')),
  ip_hash text not null check (ip_hash~'^[0-9a-f]{64}$'),
  device_hash text not null check (device_hash~'^[0-9a-f]{64}$'),
  idempotency_key text not null,
  payload_hash text not null check (payload_hash~'^[0-9a-f]{64}$'),
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  estimated_cost_usd numeric(12,6) not null check (estimated_cost_usd>=0),
  actual_cost_usd numeric(12,6) check (actual_cost_usd>=0),
  input_tokens integer check (input_tokens>=0),
  output_tokens integer check (output_tokens>=0),
  web_calls smallint not null default 0 check (web_calls between 0 and 1),
  latency_ms integer check (latency_ms>=0),
  retry_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,idempotency_key)
);
create index if not exists product_scan_usage_user_day_idx on public.product_scan_usage_ledger(user_id,created_at desc);
create index if not exists product_scan_usage_ip_burst_idx on public.product_scan_usage_ledger(ip_hash,created_at desc);
create index if not exists product_scan_usage_device_burst_idx on public.product_scan_usage_ledger(device_hash,created_at desc);

create table if not exists public.product_scan_creation_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.product_scan_sessions(id) on delete cascade,
  idempotency_key text not null,
  plan_scope text not null check (plan_scope in ('basic','pro')),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  product_id uuid references public.products(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,idempotency_key),
  constraint product_scan_creation_consumed_product check (
    (status='consumed' and product_id is not null) or status<>'consumed'
  )
);
create index if not exists product_scan_creation_month_idx on public.product_scan_creation_reservations(user_id,created_at desc)
  where status in ('reserved','consumed');

-- The overlay is lifecycle/proof metadata over the canonical product/version,
-- never a second set of public product facts. PI product_code remains server-generated.
create table if not exists public.product_scan_overlay_states (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique references public.product_scan_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_version_id uuid references public.product_versions(id),
  pi_product_code text not null,
  state text not null check (state in ('SCAN_DRAFT','USABLE_FOR_OWNER','PENDING_PUBLICATION','PUBLISHED','BLOCKED')),
  validation_snapshot jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint product_scan_overlay_publish_guard check (
    (state='PUBLISHED' and published_at is not null) or (state<>'PUBLISHED' and published_at is null)
  )
);
create index if not exists product_scan_overlay_product_idx on public.product_scan_overlay_states(product_id,state);

alter table public.product_scan_sessions enable row level security;
alter table public.product_scan_assets enable row level security;
alter table public.product_scan_field_evidence enable row level security;
alter table public.product_scan_external_sources enable row level security;
alter table public.product_scan_usage_ledger enable row level security;
alter table public.product_scan_creation_reservations enable row level security;
alter table public.product_scan_overlay_states enable row level security;

drop policy if exists product_scan_sessions_select_own on public.product_scan_sessions;
create policy product_scan_sessions_select_own on public.product_scan_sessions
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_assets_select_own on public.product_scan_assets;
create policy product_scan_assets_select_own on public.product_scan_assets
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_field_evidence_select_own on public.product_scan_field_evidence;
create policy product_scan_field_evidence_select_own on public.product_scan_field_evidence
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_external_sources_select_own on public.product_scan_external_sources;
create policy product_scan_external_sources_select_own on public.product_scan_external_sources
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_usage_select_own on public.product_scan_usage_ledger;
create policy product_scan_usage_select_own on public.product_scan_usage_ledger
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_creation_select_own on public.product_scan_creation_reservations;
create policy product_scan_creation_select_own on public.product_scan_creation_reservations
  for select using (auth.uid()=user_id);
drop policy if exists product_scan_overlay_select_own_or_published on public.product_scan_overlay_states;
drop policy if exists product_scan_overlay_select_own on public.product_scan_overlay_states;
create policy product_scan_overlay_select_own on public.product_scan_overlay_states
  for select using (auth.uid()=creator_user_id);

-- Cross-account consumers receive only the published canonical linkage. The
-- creator/session ids and validation/evidence snapshots remain owner-private.
create or replace view public.product_scan_published_overlay_v1
with (security_barrier=true) as
select id,product_id,product_version_id,pi_product_code,state,updated_at,published_at
from public.product_scan_overlay_states
where state='PUBLISHED';

-- Authenticated clients receive read-only access through RLS. Every mutation,
-- including readiness/state/publication/private linking, is service-owned.
revoke all on public.product_scan_sessions,public.product_scan_assets,
  public.product_scan_field_evidence,public.product_scan_external_sources,
  public.product_scan_usage_ledger,public.product_scan_creation_reservations,
  public.product_scan_overlay_states from public,anon,authenticated;
grant select on public.product_scan_sessions,public.product_scan_assets,
  public.product_scan_field_evidence,public.product_scan_external_sources,
  public.product_scan_usage_ledger,public.product_scan_creation_reservations,
  public.product_scan_overlay_states to authenticated;
revoke all on public.product_scan_published_overlay_v1 from public,anon,authenticated;
grant select on public.product_scan_published_overlay_v1 to authenticated;

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
    if v_existing.status='failed' then
      return jsonb_build_object('allowed',false,'reason','analysis_call_already_failed');
    end if;
    if v_existing.status='reserved' then
      return jsonb_build_object('allowed',false,'reason','analysis_in_progress','retryAt',v_existing.created_at+interval '15 minutes');
    end if;
    return jsonb_build_object('allowed',true,'idempotent',true,'completed',true,'reservationId',v_existing.id);
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
declare v_call_kind text;
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
  update public.product_scan_usage_ledger set
    status=p_status,actual_cost_usd=p_actual_cost_usd,input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,web_calls=p_web_calls,latency_ms=p_latency_ms,completed_at=now()
  where id=p_reservation_id;
  update public.product_scan_sessions set
    state=case when p_status='completed' then 'analyzed' else 'blocked' end,
    result_json=case when p_status='completed' then p_result else result_json end,
    validation_json=coalesce(p_validation,'{}'::jsonb),
    overlay_state=case when p_status='completed' then p_overlay_state else 'BLOCKED' end,
    vision_calls=vision_calls+1,
    web_calls=web_calls+p_web_calls,
    estimated_cost_usd=estimated_cost_usd+p_actual_cost_usd,
    updated_at=now()
  where id=p_session_id and user_id=p_actor_user_id;
  if not found then raise exception 'product scan session not found'; end if;
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

create or replace function public.reserve_product_scan_creation_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_existing public.product_scan_creation_reservations%rowtype;
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
  if found then return jsonb_build_object(
    'allowed',v_existing.status<>'released','idempotent',true,
    'consumed',v_existing.status='consumed','reservationId',v_existing.id,
    'productId',v_existing.product_id
  ); end if;
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
  insert into public.product_scan_creation_reservations(
    user_id,session_id,idempotency_key,plan_scope
  ) values(p_actor_user_id,p_session_id,p_idempotency_key,v_plan) returning id into v_id;
  return jsonb_build_object('allowed',true,'idempotent',false,'consumed',false,'reservationId',v_id,'plan',v_plan);
end;
$$;

create or replace function public.complete_product_scan_creation_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_reservation_id uuid,
  p_created boolean,
  p_product_id uuid,
  p_product_version_id uuid,
  p_product_code text,
  p_result jsonb
) returns void
language plpgsql security definer set search_path=public
as $$
declare v_state text; v_validation jsonb; v_final_state text;
begin
  perform pg_advisory_xact_lock(hashtext('product-scan-create:'||p_actor_user_id::text));
  select overlay_state,validation_json into v_state,v_validation from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if not found then raise exception 'product scan session not found'; end if;
  update public.product_scan_creation_reservations set
    status=case when p_created then 'consumed' else 'released' end,
    product_id=case when p_created then p_product_id else null end,
    completed_at=now()
  where id=p_reservation_id and user_id=p_actor_user_id and session_id=p_session_id and status='reserved';
  if not found then raise exception 'product scan creation reservation not found'; end if;
  if p_product_id is not null then
    v_final_state:=case
      when p_result->>'status'='blocked' then 'BLOCKED'
      when v_state='PENDING_PUBLICATION' then 'PENDING_PUBLICATION'
      else 'USABLE_FOR_OWNER'
    end;
    insert into public.product_scan_overlay_states(
      creator_user_id,session_id,product_id,product_version_id,pi_product_code,state,
      validation_snapshot,evidence_summary
    ) values(
      p_actor_user_id,p_session_id,p_product_id,p_product_version_id,p_product_code,
      v_final_state,
      coalesce(v_validation,'{}'::jsonb),jsonb_build_object(
        'scannerSchema','gellatti_product_scan_v1','ingestResult',coalesce(p_result,'{}'::jsonb)
      )
    ) on conflict(session_id) do update set
      product_id=excluded.product_id,product_version_id=excluded.product_version_id,
      pi_product_code=excluded.pi_product_code,state=excluded.state,
      validation_snapshot=excluded.validation_snapshot,updated_at=now();
  end if;
  update public.product_scan_sessions set state='finalized',
    overlay_state=coalesce(v_final_state,overlay_state),finalized_at=now(),updated_at=now()
    where id=p_session_id and user_id=p_actor_user_id;
end;
$$;

create or replace function public.release_product_scan_creation_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_reservation_id uuid
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('product-scan-create:'||p_actor_user_id::text));
  update public.product_scan_creation_reservations set status='released',completed_at=now()
  where id=p_reservation_id and user_id=p_actor_user_id and session_id=p_session_id and status='reserved';
end;
$$;

create or replace function public.publish_product_scan_overlay_v1(p_overlay_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  update public.product_scan_overlay_states overlay set
    state='PUBLISHED',published_at=now(),updated_at=now()
  from public.products product
  join public.product_behavior_bindings binding
    on binding.id=product.current_behavior_binding_id and binding.is_current
  where overlay.id=p_overlay_id and overlay.product_id=product.id
    and overlay.state='PENDING_PUBLICATION'
    and product.canonical_verification_status='verified'
    and binding.binding_status='ready'
    and coalesce(jsonb_array_length(overlay.validation_snapshot->'missingCriticalFields'),0)=0
    and coalesce((overlay.validation_snapshot->>'highRiskAuthorityRequired')::boolean,false)=false;
  if not found then
    raise exception 'overlay lacks verified publication authority';
  end if;
end;
$$;

create or replace function public.expire_product_scan_sessions_v1(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_count integer; v_ids uuid[];
begin
  select coalesce(array_agg(id),'{}'::uuid[]) into v_ids from (
    select id from public.product_scan_sessions
    where expires_at<now() and state not in ('finalized','expired') limit least(greatest(p_limit,1),2000)
  ) expired;
  delete from public.product_scan_field_evidence where session_id=any(v_ids);
  delete from public.product_scan_external_sources where session_id=any(v_ids);
  delete from public.product_scan_assets where session_id=any(v_ids);
  update public.product_scan_sessions set state='expired',result_json=null,validation_json='{}',updated_at=now()
    where id=any(v_ids);
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.reserve_product_scan_analysis_v1(uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,numeric,boolean,numeric,numeric) from public,anon,authenticated;
revoke all on function public.complete_product_scan_analysis_v1(uuid,uuid,uuid,text,jsonb,jsonb,text,integer,integer,integer,integer,numeric) from public,anon,authenticated;
revoke all on function public.reserve_product_scan_creation_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_product_scan_creation_v1(uuid,uuid,uuid,boolean,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.release_product_scan_creation_v1(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.publish_product_scan_overlay_v1(uuid) from public,anon,authenticated;
revoke all on function public.expire_product_scan_sessions_v1(integer) from public,anon,authenticated;
grant execute on function public.reserve_product_scan_analysis_v1(uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,numeric,boolean,numeric,numeric) to service_role;
grant execute on function public.complete_product_scan_analysis_v1(uuid,uuid,uuid,text,jsonb,jsonb,text,integer,integer,integer,integer,numeric) to service_role;
grant execute on function public.reserve_product_scan_creation_v1(uuid,uuid,text) to service_role;
grant execute on function public.complete_product_scan_creation_v1(uuid,uuid,uuid,boolean,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.release_product_scan_creation_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.publish_product_scan_overlay_v1(uuid) to service_role;
grant execute on function public.expire_product_scan_sessions_v1(integer) to service_role;

comment on table public.product_scan_overlay_states is
  'Lifecycle/proof projection over canonical products. Contains no private price, supplier, notes or stock.';

-- Rollback plan: disable PRODUCT_SCANNER_V1_ENABLED first. Retain usage/quota
-- audit history in any shared environment. Only in a disposable database, and
-- only after dropping the safe published view and seven service-only functions
-- above, may the seven product_scan_* tables be dropped in reverse foreign-key order. Mapper Base,
-- canonical products and immutable product_versions are never rollback targets.
