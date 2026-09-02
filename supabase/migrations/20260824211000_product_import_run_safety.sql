-- Durable INTIMPORT execution identity, cooperative cancellation, exact mutation
-- ledger, deterministic rollback, and staging-safe PR clean reset authority.
-- No statement in this migration writes mapper_basement.

create table if not exists public.product_import_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source text not null check (source in ('INTIMPORT','GENERIC','MERCADONA','COLIN')),
  mode text not null check (mode in ('STANDARD','CLEAN_OWNER_REIMPORT')),
  label text not null,
  source_file_name text,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  total_rows integer not null check (total_rows >= 0),
  status text not null check (status in (
    'ANALYZING','READY','IMPORTING','CANCELLING','CANCELLED','COMPLETED','FAILED',
    'ROLLING_BACK','ROLLED_BACK'
  )),
  preflight_snapshot jsonb not null default '{}'::jsonb,
  cancellation_requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_import_run_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.product_import_runs(id) on delete restrict,
  row_index integer not null check (row_index >= 0),
  source_row_id text,
  display_name text,
  outcome text not null check (outcome in (
    'CREATED','REUSED','UPDATED','REVIEW','SKIPPED','FAILED'
  )),
  actions text[] not null default '{}' check (
    actions <@ array[
      'CREATED','REUSED','UPDATED','VERSION_CREATED','RELATION_CREATED','SKIPPED','REVIEW'
    ]::text[]
  ),
  product_id uuid,
  ingest_event_id uuid,
  previous_product_version_id uuid,
  new_product_version_id uuid,
  previous_behavior_binding_id uuid,
  new_behavior_binding_id uuid,
  product_before jsonb,
  relation_before jsonb,
  review_cases_before jsonb not null default '[]'::jsonb,
  aliases_before jsonb not null default '[]'::jsonb,
  variants_before jsonb not null default '[]'::jsonb,
  result_snapshot jsonb not null default '{}'::jsonb,
  error text,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  unique(import_run_id,row_index)
);

create table if not exists public.product_import_reset_audits (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  pi_count integer not null,
  pr_count integer not null,
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists product_import_runs_actor_created_idx
  on public.product_import_runs(actor_user_id,created_at desc);
create index if not exists product_import_run_rows_run_idx
  on public.product_import_run_rows(import_run_id,row_index);
create index if not exists product_import_run_rows_product_idx
  on public.product_import_run_rows(product_id) where product_id is not null;
create unique index if not exists product_import_one_active_clean_idx
  on public.product_import_runs(mode)
  where mode='CLEAN_OWNER_REIMPORT' and status in ('IMPORTING','CANCELLING','ROLLING_BACK');

alter table public.product_import_runs enable row level security;
alter table public.product_import_run_rows enable row level security;
alter table public.product_import_reset_audits enable row level security;

drop policy if exists product_import_runs_owner_read on public.product_import_runs;
create policy product_import_runs_owner_read on public.product_import_runs
  for select to authenticated using (actor_user_id=auth.uid());
drop policy if exists product_import_run_rows_owner_read on public.product_import_run_rows;
create policy product_import_run_rows_owner_read on public.product_import_run_rows
  for select to authenticated using (exists(
    select 1 from public.product_import_runs r
    where r.id=import_run_id and r.actor_user_id=auth.uid()
  ));
drop policy if exists product_import_reset_audits_admin_read on public.product_import_reset_audits;
create policy product_import_reset_audits_admin_read on public.product_import_reset_audits
  for select to authenticated using (exists(
    select 1 from public.admin_users a where a.user_id=auth.uid() and a.revoked_at is null
  ));

revoke insert,update,delete on public.product_import_runs from authenticated;
revoke insert,update,delete on public.product_import_run_rows from authenticated;
revoke insert,update,delete on public.product_import_reset_audits from authenticated;
grant select on public.product_import_runs,public.product_import_run_rows to authenticated;
grant select on public.product_import_reset_audits to authenticated;

-- Canonical history stays immutable to ordinary code. A separate reset marker
-- is accepted only by the service-role rollback/reset functions below.
create or replace function public.canonical_product_write_guard()
returns trigger language plpgsql set search_path=public as $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if current_setting('app.canonical_product_ingest',true)='v1'
    or current_setting('app.canonical_product_reset',true)='v1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='UPDATE' then
    v_new:=to_jsonb(new);
    v_old:=to_jsonb(old);
  end if;
  if tg_table_name='products' and tg_op='UPDATE'
    and (v_new-array['owner_user_id','created_by','owning_account_id','updated_at'])
      =(v_old-array['owner_user_id','created_by','owning_account_id','updated_at'])
    and ((v_new->'owner_user_id') is not distinct from (v_old->'owner_user_id')
      or v_new->'owner_user_id'='null'::jsonb)
    and ((v_new->'created_by') is not distinct from (v_old->'created_by')
      or v_new->'created_by'='null'::jsonb)
    and ((v_new->'owning_account_id') is not distinct from (v_old->'owning_account_id')
      or v_new->'owning_account_id'='null'::jsonb)
    and ((v_new->'owner_user_id') is distinct from (v_old->'owner_user_id')
      or (v_new->'created_by') is distinct from (v_old->'created_by')
      or (v_new->'owning_account_id') is distinct from (v_old->'owning_account_id')) then
    return new;
  end if;
  if tg_table_name='product_ingest_events' and tg_op='UPDATE'
    and v_new->'actor_user_id'='null'::jsonb
    and v_old->'actor_user_id'<>'null'::jsonb
    and (v_new-'actor_user_id')=(v_old-'actor_user_id') then
    return new;
  end if;
  raise exception 'canonical product writes require ingest_product_v1 (table=%, op=%)',
    tg_table_name,tg_op;
end;
$$;

create or replace function public.canonical_product_immutable_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and current_setting('app.canonical_product_reset',true)='v1' then
    return old;
  end if;
  if tg_op<>'INSERT' or current_setting('app.canonical_product_ingest',true) is distinct from 'v1' then
    raise exception 'canonical product history is immutable and ingest-owned';
  end if;
  return new;
end;
$$;

create or replace function public.product_import_actor_authorized_v1(p_actor_user_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select public.gellatti_has_paid_access_v1(p_actor_user_id) or exists(
    select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null
  );
$$;
revoke all on function public.product_import_actor_authorized_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.product_import_actor_authorized_v1(uuid) to service_role;

create or replace function public.product_import_clean_preflight_v1(p_actor_user_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_pi integer;
  v_pr integer;
  v_pr_versions integer;
  v_pr_bindings integer;
  v_pr_matched integer;
  v_admin boolean;
begin
  select public.product_import_actor_authorized_v1(p_actor_user_id) into v_admin;
  if not v_admin then raise exception 'administrator required'; end if;
  select count(*) into v_pi from public.products
    where product_kind='mapper_reference' and product_code like 'PI-ING-%';
  select count(*) into v_pr from public.products where product_code like 'PR-ING-%';
  select count(*) into v_pr_versions from public.product_versions v
    join public.products p on p.id=v.product_id where p.product_code like 'PR-ING-%';
  select count(*) into v_pr_bindings from public.product_behavior_bindings b
    join public.products p on p.id=b.product_id where p.product_code like 'PR-ING-%';
  select count(*) into v_pr_matched from public.products
    where product_code like 'PR-ING-%' and matched_basement_id is not null;
  return jsonb_build_object(
    'pi',v_pi,'pr',v_pr,'prVersions',v_pr_versions,'prBehaviorBindings',v_pr_bindings,
    'prMatchedBasementRelations',v_pr_matched,
    'ready',v_pi=2088 and v_pr=0 and v_pr_versions=0 and v_pr_bindings=0 and v_pr_matched=0
  );
end;
$$;

create or replace function public.start_product_import_run_v1(
  p_actor_user_id uuid,p_source text,p_mode text,p_label text,p_source_file_name text,
  p_source_fingerprint text,p_total_rows integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
  v_preflight jsonb;
  v_run public.product_import_runs%rowtype;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id) then
    raise exception 'administrator required';
  end if;
  if p_source_fingerprint !~ '^[0-9a-f]{64}$' or p_total_rows<0 then
    raise exception 'invalid import identity';
  end if;
  v_preflight:=public.product_import_clean_preflight_v1(p_actor_user_id);
  if p_mode='CLEAN_OWNER_REIMPORT' and coalesce((v_preflight->>'ready')::boolean,false) is not true then
    raise exception 'clean import requires PI=2088 and PR=0';
  end if;
  insert into public.product_import_runs(
    actor_user_id,source,mode,label,source_file_name,source_fingerprint,total_rows,status,
    preflight_snapshot,started_at
  ) values(
    p_actor_user_id,p_source,p_mode,p_label,p_source_file_name,p_source_fingerprint,p_total_rows,
    'IMPORTING',v_preflight,now()
  ) returning * into v_run;
  return to_jsonb(v_run);
end;
$$;

create or replace function public.request_product_import_cancel_v1(
  p_actor_user_id uuid,p_import_run_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_run public.product_import_runs%rowtype;
begin
  update public.product_import_runs set status='CANCELLING',
    cancellation_requested_at=coalesce(cancellation_requested_at,now()),updated_at=now()
  where id=p_import_run_id and actor_user_id=p_actor_user_id and status='IMPORTING'
  returning * into v_run;
  if not found then
    select * into v_run from public.product_import_runs
      where id=p_import_run_id and actor_user_id=p_actor_user_id;
  end if;
  if not found then raise exception 'import run not found'; end if;
  return to_jsonb(v_run);
end;
$$;

create or replace function public.product_import_run_state_v1(
  p_actor_user_id uuid,p_import_run_id uuid
) returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
  select to_jsonb(r)||jsonb_build_object(
    'processed',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id),
    'created',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and 'CREATED'=any(x.actions)),
    'reused',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and 'REUSED'=any(x.actions)),
    'updated',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and 'UPDATED'=any(x.actions)),
    'review',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and x.outcome='REVIEW'),
    'skipped',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and x.outcome='SKIPPED'),
    'failed',(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id and x.outcome='FAILED'),
    'remaining',greatest(0,r.total_rows-(select count(*) from public.product_import_run_rows x where x.import_run_id=r.id))
  )
  from public.product_import_runs r
  where r.id=p_import_run_id and r.actor_user_id=p_actor_user_id;
$$;

-- The canonical write and its run-ledger row commit in one database transaction.
create or replace function public.ingest_product_import_row_v1(
  p_actor_user_id uuid,p_source text,p_idempotency_key text,p_input jsonb,
  p_evidence jsonb,p_private_overlay jsonb,p_risk jsonb,
  p_import_run_id uuid,p_row_index integer,p_source_row_id text,p_display_name text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
  v_run public.product_import_runs%rowtype;
  v_existing_id uuid;
  v_product_before jsonb;
  v_relation_before jsonb;
  v_reviews_before jsonb:='[]'::jsonb;
  v_aliases_before jsonb:='[]'::jsonb;
  v_variants_before jsonb:='[]'::jsonb;
  v_result jsonb;
  v_product_id uuid;
  v_new_version uuid;
  v_new_binding uuid;
  v_event uuid;
  v_previous_version uuid;
  v_previous_binding uuid;
  v_actions text[];
  v_outcome text;
begin
  select * into v_run from public.product_import_runs
    where id=p_import_run_id and actor_user_id=p_actor_user_id for update;
  if not found then raise exception 'import run not found'; end if;
  if v_run.status='CANCELLING' or v_run.cancellation_requested_at is not null then
    raise exception 'import cancellation requested';
  end if;
  if v_run.status<>'IMPORTING' then raise exception 'import run is not importing'; end if;
  if exists(select 1 from public.product_import_run_rows
    where import_run_id=p_import_run_id and row_index=p_row_index) then
    return (select result_snapshot from public.product_import_run_rows
      where import_run_id=p_import_run_id and row_index=p_row_index);
  end if;

  if p_source='catalog_import' then
    v_existing_id:=public.resolve_intimport_existing_product_v1(p_actor_user_id,p_source,p_input);
  end if;
  if v_existing_id is not null then
    select to_jsonb(p) into v_product_before from public.products p where p.id=v_existing_id;
    select to_jsonb(r) into v_relation_before from public.user_product_relations r
      where r.user_id=p_actor_user_id and r.product_id=v_existing_id;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at),'[]'::jsonb)
      into v_reviews_before from public.product_review_cases c where c.product_id=v_existing_id;
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at),'[]'::jsonb)
      into v_aliases_before from public.product_aliases a where a.product_id=v_existing_id;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at),'[]'::jsonb)
      into v_variants_before from public.product_variants v where v.product_id=v_existing_id;
  end if;

  v_result:=public.ingest_product_v1(
    p_actor_user_id,p_source,p_idempotency_key,p_input,p_evidence,p_private_overlay,p_risk
  );
  v_product_id:=nullif(v_result->>'productId','')::uuid;
  v_new_version:=nullif(v_result->>'productVersionId','')::uuid;
  v_new_binding:=nullif(v_result->>'behaviorBindingId','')::uuid;
  v_event:=nullif(v_result->>'ingestEventId','')::uuid;
  select supersedes into v_previous_version from public.product_versions where id=v_new_version;
  if v_product_before is not null then
    v_previous_binding:=nullif(v_product_before->>'current_behavior_binding_id','')::uuid;
    v_actions:=array['REUSED','UPDATED','VERSION_CREATED'];
    v_outcome:='UPDATED';
  else
    v_actions:=array['CREATED','VERSION_CREATED'];
    v_outcome:='CREATED';
  end if;
  if v_relation_before is null and exists(select 1 from public.user_product_relations
    where user_id=p_actor_user_id and product_id=v_product_id) then
    v_actions:=array_append(v_actions,'RELATION_CREATED');
  end if;
  insert into public.product_import_run_rows(
    import_run_id,row_index,source_row_id,display_name,outcome,actions,product_id,
    ingest_event_id,previous_product_version_id,new_product_version_id,
    previous_behavior_binding_id,new_behavior_binding_id,product_before,relation_before,
    review_cases_before,aliases_before,variants_before,result_snapshot
  ) values(
    p_import_run_id,p_row_index,nullif(p_source_row_id,''),nullif(p_display_name,''),v_outcome,
    v_actions,v_product_id,v_event,v_previous_version,v_new_version,v_previous_binding,v_new_binding,
    v_product_before,v_relation_before,v_reviews_before,v_aliases_before,v_variants_before,v_result
  );
  update public.product_import_runs set updated_at=now() where id=p_import_run_id;
  return v_result;
end;
$$;

create or replace function public.record_product_import_row_outcome_v1(
  p_actor_user_id uuid,p_import_run_id uuid,p_row_index integer,p_source_row_id text,
  p_display_name text,p_outcome text,p_error text default null,p_result jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_actions text[]:='{}';
begin
  if not exists(select 1 from public.product_import_runs
    where id=p_import_run_id and actor_user_id=p_actor_user_id) then
    raise exception 'import run not found';
  end if;
  if p_outcome='SKIPPED' then v_actions:=array['SKIPPED']; end if;
  if p_outcome='REVIEW' then v_actions:=array['REVIEW']; end if;
  if p_outcome='REUSED' then v_actions:=array['REUSED']; end if;
  insert into public.product_import_run_rows(
    import_run_id,row_index,source_row_id,display_name,outcome,actions,error,result_snapshot
  ) values(
    p_import_run_id,p_row_index,nullif(p_source_row_id,''),nullif(p_display_name,''),
    p_outcome,v_actions,nullif(p_error,''),coalesce(p_result,'{}'::jsonb)
  ) on conflict(import_run_id,row_index) do nothing;
  return public.product_import_run_state_v1(p_actor_user_id,p_import_run_id);
end;
$$;

create or replace function public.finish_product_import_run_v1(
  p_actor_user_id uuid,p_import_run_id uuid,p_status text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if p_status not in ('CANCELLED','COMPLETED','FAILED') then raise exception 'invalid terminal status'; end if;
  update public.product_import_runs set status=p_status,finished_at=now(),updated_at=now()
    where id=p_import_run_id and actor_user_id=p_actor_user_id
      and status in ('IMPORTING','CANCELLING');
  if not found then raise exception 'import run cannot be finished'; end if;
  return public.product_import_run_state_v1(p_actor_user_id,p_import_run_id);
end;
$$;

-- Register the already-stopped pre-ledger Poland run from an exact, guarded
-- event interval. This is service-only and refuses any count/identity drift.
create or replace function public.register_legacy_product_import_run_v1(
  p_actor_user_id uuid,p_started_at timestamptz,p_stopped_at timestamptz,
  p_expected_events integer,p_expected_created integer,p_total_rows integer,
  p_source_fingerprint text,p_processed_rows jsonb
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
  v_run_id uuid;
  v_count integer;
  v_created integer;
  v_ordinal integer:=0;
  v_row_index integer;
  v_source_row_id text;
  v_display_name text;
  e record;
  f jsonb;
  v_prev_event timestamptz;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'administrator required'; end if;
  select count(*),count(*) filter(where p.created_at>=p_started_at)
    into v_count,v_created
  from public.product_ingest_events ev join public.products p on p.id=ev.product_id
  where ev.actor_user_id=p_actor_user_id and ev.source='catalog_import'
    and ev.created_at between p_started_at and p_stopped_at;
  if v_count<>p_expected_events or v_created<>p_expected_created then
    raise exception 'legacy import event set drifted (events %, created %)',v_count,v_created;
  end if;
  if jsonb_typeof(p_processed_rows)<>'array'
    or jsonb_array_length(p_processed_rows)<p_expected_events then
    raise exception 'legacy import processed-row ledger is incomplete';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_processed_rows) x
    group by (x->>'rowIndex')::integer having count(*)>1
  ) then
    raise exception 'legacy import processed-row ledger has duplicate indexes';
  end if;
  insert into public.product_import_runs(
    actor_user_id,source,mode,label,source_file_name,source_fingerprint,total_rows,status,
    preflight_snapshot,started_at,finished_at,cancellation_requested_at
  ) values(
    p_actor_user_id,'INTIMPORT','CLEAN_OWNER_REIMPORT','Polska — accidental pre-reset run',
    'PL_Poland.csv',p_source_fingerprint,p_total_rows,'CANCELLED',
    jsonb_build_object('pi',2088,'pr',820,'ready',false),p_started_at,p_stopped_at,p_stopped_at
  ) returning id into v_run_id;
  for e in
    select ev.*,p.created_at as product_created_at,to_jsonb(p) as product_json,v.supersedes,
      (select b.id from public.product_behavior_bindings b
        where b.product_version_id=v.supersedes order by b.classified_at desc limit 1) as previous_binding
    from public.product_ingest_events ev
    join public.products p on p.id=ev.product_id
    join public.product_versions v on v.id=ev.product_version_id
    where ev.actor_user_id=p_actor_user_id and ev.source='catalog_import'
      and ev.created_at between p_started_at and p_stopped_at
    order by ev.created_at
  loop
    v_ordinal:=v_ordinal+1;
    v_row_index:=v_ordinal;
    for f in select value from jsonb_array_elements(p_processed_rows) value
      where value->>'outcome'='FAILED' order by (value->>'rowIndex')::integer
    loop
      if v_row_index>=(f->>'rowIndex')::integer then v_row_index:=v_row_index+1; end if;
    end loop;
    select x->>'sourceRowId',x->>'displayName' into v_source_row_id,v_display_name
      from jsonb_array_elements(p_processed_rows) x
      where (x->>'rowIndex')::integer=v_row_index;
    if not found then raise exception 'legacy import missing processed row %',v_row_index; end if;
    select max(created_at) into v_prev_event from public.product_ingest_events
      where product_id=e.product_id and created_at<p_started_at;
    insert into public.product_import_run_rows(
      import_run_id,row_index,source_row_id,display_name,outcome,actions,product_id,
      ingest_event_id,previous_product_version_id,new_product_version_id,
      previous_behavior_binding_id,new_behavior_binding_id,product_before,relation_before,
      review_cases_before,aliases_before,variants_before,result_snapshot,created_at
    ) values(
      v_run_id,v_row_index,v_source_row_id,v_display_name,
      case when e.product_created_at>=p_started_at then 'CREATED' else 'UPDATED' end,
      case when e.product_created_at>=p_started_at
        then array['CREATED','VERSION_CREATED','RELATION_CREATED']
        else array['REUSED','UPDATED','VERSION_CREATED'] end,
      e.product_id,e.id,e.supersedes,e.product_version_id,e.previous_binding,e.behavior_binding_id,
      case when e.product_created_at>=p_started_at then null else
        jsonb_set(jsonb_set(jsonb_set(e.product_json,
          '{current_version_id}',to_jsonb(e.supersedes),true),
          '{current_behavior_binding_id}',to_jsonb(e.previous_binding),true),
          '{updated_at}',to_jsonb(coalesce(v_prev_event,e.product_created_at)),true) end,
      case when e.product_created_at>=p_started_at then null else
        (select to_jsonb(r)||jsonb_build_object('updated_at',coalesce(v_prev_event,r.created_at))
          from public.user_product_relations r where r.user_id=p_actor_user_id and r.product_id=e.product_id) end,
      case when e.product_created_at>=p_started_at then '[]'::jsonb else
        (select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object(
          'submission_count',greatest(1,c.submission_count-1),
          'updated_at',coalesce(v_prev_event,c.created_at)) order by c.created_at),'[]'::jsonb)
          from public.product_review_cases c where c.product_id=e.product_id) end,
      case when e.product_created_at>=p_started_at then '[]'::jsonb else
        (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at),'[]'::jsonb)
          from public.product_aliases a where a.product_id=e.product_id) end,
      case when e.product_created_at>=p_started_at then '[]'::jsonb else
        (select coalesce(jsonb_agg(to_jsonb(vr) order by vr.created_at),'[]'::jsonb)
          from public.product_variants vr where vr.product_id=e.product_id) end,
      e.result_snapshot,e.created_at
    );
  end loop;
  for f in select value from jsonb_array_elements(p_processed_rows) value
    where value->>'outcome'='FAILED' order by (value->>'rowIndex')::integer
  loop
    insert into public.product_import_run_rows(
      import_run_id,row_index,source_row_id,display_name,outcome,error,result_snapshot,created_at
    ) values(
      v_run_id,(f->>'rowIndex')::integer,nullif(f->>'sourceRowId',''),
      nullif(f->>'displayName',''),'FAILED',nullif(f->>'error',''),
      coalesce(f->'result','{}'::jsonb),
      coalesce(nullif(f->>'createdAt','')::timestamptz,p_stopped_at)
    );
  end loop;
  return v_run_id;
end;
$$;

create or replace function public.rollback_product_import_run_v1(
  p_actor_user_id uuid,p_import_run_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions
set statement_timeout='120s' as $$
declare
  v_run public.product_import_runs%rowtype;
  v_assignments text;
  v_all_ids uuid[];
  v_created_ids uuid[];
  v_existing_ids uuid[];
  v_new_versions uuid[];
  v_created integer:=0;
  v_restored integer:=0;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'administrator required'; end if;
  select * into v_run from public.product_import_runs where id=p_import_run_id for update;
  if not found or v_run.actor_user_id<>p_actor_user_id then raise exception 'import run not found'; end if;
  if v_run.status not in ('CANCELLED','COMPLETED','FAILED') then raise exception 'run is not rollback eligible'; end if;
  update public.product_import_runs set status='ROLLING_BACK',updated_at=now() where id=p_import_run_id;
  perform set_config('app.canonical_product_reset','v1',true);
  select
    coalesce(array_agg(product_id) filter(where product_id is not null),'{}'::uuid[]),
    coalesce(array_agg(product_id) filter(where 'CREATED'=any(actions)),'{}'::uuid[]),
    coalesce(array_agg(product_id) filter(where product_id is not null and not ('CREATED'=any(actions))),'{}'::uuid[]),
    coalesce(array_agg(new_product_version_id) filter(where new_product_version_id is not null),'{}'::uuid[]),
    count(*) filter(where 'CREATED'=any(actions)),
    count(*) filter(where product_id is not null and not ('CREATED'=any(actions)))
  into v_all_ids,v_created_ids,v_existing_ids,v_new_versions,v_created,v_restored
  from public.product_import_run_rows where import_run_id=p_import_run_id;

  if exists(
    select 1 from public.product_ingest_events e
    join public.product_import_run_rows r on r.product_id=e.product_id
      and r.import_run_id=p_import_run_id
    where e.created_at>r.created_at and not exists(
      select 1 from public.product_import_run_rows x
      where x.import_run_id=p_import_run_id and x.ingest_event_id=e.id
    )
  ) then raise exception 'rollback conflict: a later product ingest exists'; end if;
  if exists(select 1 from public.saved_recipes s,unnest(v_all_ids) p(id)
      where s.recipe_input::text like '%'||p.id::text||'%')
    or exists(select 1 from public.recipe_versions v,unnest(v_all_ids) p(id)
      where v.recipe_input::text like '%'||p.id::text||'%') then
    raise exception 'rollback conflict: an imported product is used by a saved recipe';
  end if;

  delete from public.product_behavior_reclassification_queue
    where entity_kind='catalog_product_version'
      and entity_id in (select u.id::text from unnest(v_new_versions) u(id));

  update public.product_behavior_bindings set is_current=false where product_id=any(v_existing_ids);
  update public.product_behavior_bindings b set is_current=true
  from public.product_import_run_rows r
  where r.import_run_id=p_import_run_id and b.id=r.previous_behavior_binding_id;
  select string_agg(format(
    '%1$I=(jsonb_populate_record(null::public.products,r.product_before)).%1$I',a.attname
  ),',') into v_assignments
  from pg_attribute a where a.attrelid='public.products'::regclass and a.attnum>0
    and not a.attisdropped and a.attname<>'id' and a.attgenerated='' and a.attidentity='';
  execute 'update public.products p set '||v_assignments||
    ' from public.product_import_run_rows r where r.import_run_id=$1'
    ' and r.product_before is not null and p.id=r.product_id' using p_import_run_id;

  delete from public.product_review_cases where product_id=any(v_existing_ids);
  insert into public.product_review_cases
    select j.* from public.product_import_run_rows r
    cross join lateral jsonb_populate_recordset(
      null::public.product_review_cases,r.review_cases_before
    ) j where r.import_run_id=p_import_run_id and r.product_before is not null;
  delete from public.user_product_relations
    where user_id=p_actor_user_id and product_id=any(v_existing_ids);
  insert into public.user_product_relations
    select j.* from public.product_import_run_rows r
    cross join lateral jsonb_populate_record(
      null::public.user_product_relations,r.relation_before
    ) j where r.import_run_id=p_import_run_id and r.relation_before is not null;
  delete from public.product_aliases a where a.product_id=any(v_existing_ids) and not exists(
    select 1 from public.product_import_run_rows r
    cross join lateral jsonb_to_recordset(r.aliases_before) x(id uuid)
    where r.import_run_id=p_import_run_id and x.id=a.id
  );
  delete from public.product_variant_markets m where m.variant_id in (
    select v.id from public.product_variants v where v.product_id=any(v_existing_ids)
      and not exists(
        select 1 from public.product_import_run_rows r
        cross join lateral jsonb_to_recordset(r.variants_before) x(id uuid)
        where r.import_run_id=p_import_run_id and x.id=v.id
      )
  );
  delete from public.product_retailer_offers o where o.variant_id in (
    select v.id from public.product_variants v where v.product_id=any(v_existing_ids)
      and not exists(
        select 1 from public.product_import_run_rows r
        cross join lateral jsonb_to_recordset(r.variants_before) x(id uuid)
        where r.import_run_id=p_import_run_id and x.id=v.id
      )
  );
  delete from public.product_variants v where v.product_id=any(v_existing_ids) and not exists(
    select 1 from public.product_import_run_rows r
    cross join lateral jsonb_to_recordset(r.variants_before) x(id uuid)
    where r.import_run_id=p_import_run_id and x.id=v.id
  );
  delete from public.product_review_cases where product_id=any(v_created_ids);
  update public.products set current_version_id=null,current_behavior_binding_id=null,
    matched_basement_id=null where id=any(v_created_ids);
  delete from public.product_evidence e using public.product_import_run_rows r
    where r.import_run_id=p_import_run_id and e.ingest_event_id=r.ingest_event_id;
  delete from public.product_ingest_events e using public.product_import_run_rows r
    where r.import_run_id=p_import_run_id and e.id=r.ingest_event_id;
  delete from public.product_behavior_bindings b using public.product_import_run_rows r
    where r.import_run_id=p_import_run_id and b.product_version_id=r.new_product_version_id;
  delete from public.product_versions v using public.product_import_run_rows r
    where r.import_run_id=p_import_run_id and v.id=r.new_product_version_id;

  delete from public.product_evidence where product_id=any(v_created_ids);
  delete from public.product_ingest_events where product_id=any(v_created_ids);
  delete from public.product_behavior_bindings where product_id=any(v_created_ids);
  delete from public.product_variant_markets where variant_id in
    (select id from public.product_variants where product_id=any(v_created_ids));
  delete from public.product_retailer_offers where variant_id in
    (select id from public.product_variants where product_id=any(v_created_ids));
  delete from public.product_variants where product_id=any(v_created_ids);
  delete from public.product_aliases where product_id=any(v_created_ids);
  delete from public.user_product_relations where product_id=any(v_created_ids);
  delete from public.product_snapshots where product_id=any(v_created_ids);
  delete from public.product_versions where product_id=any(v_created_ids);
  delete from public.products where id=any(v_created_ids);
  update public.product_import_runs set status='ROLLED_BACK',rolled_back_at=now(),updated_at=now()
    where id=p_import_run_id;
  return jsonb_build_object(
    'status','ROLLED_BACK','createdProductsRemoved',v_created,'previousVersionsRestored',v_restored,
    'reusedWithoutMutation',(select count(*) from public.product_import_run_rows
      where import_run_id=p_import_run_id and outcome='REUSED'),
    'pi',(select count(*) from public.products where product_code like 'PI-ING-%'),
    'pr',(select count(*) from public.products where product_code like 'PR-ING-%')
  );
end;
$$;

create or replace function public.snapshot_and_clean_pr_catalog_v1(
  p_actor_user_id uuid,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions
set statement_timeout='120s' as $$
declare
  v_ids uuid[];
  v_versions uuid[];
  v_variants uuid[];
  v_pi integer;
  v_pr integer;
  v_snapshot jsonb;
  v_audit_id uuid;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'administrator required'; end if;
  select array_agg(id),count(*) into v_ids,v_pr from public.products where product_code like 'PR-ING-%';
  select count(*) into v_pi from public.products
    where product_kind='mapper_reference' and product_code like 'PI-ING-%';
  if v_pi<>2088 then raise exception 'Mapper count guard failed: %',v_pi; end if;
  v_ids:=coalesce(v_ids,'{}'::uuid[]);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_versions
    from public.product_versions where product_id=any(v_ids);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_variants
    from public.product_variants where product_id=any(v_ids);
  if exists(select 1 from public.saved_recipes s,unnest(v_ids) p(id)
      where s.recipe_input::text like '%'||p.id::text||'%')
    or exists(select 1 from public.recipe_versions r,unnest(v_ids) p(id)
      where r.recipe_input::text like '%'||p.id::text||'%') then
    raise exception 'clean reset blocked: PR product is referenced by a saved recipe';
  end if;
  if exists(select 1 from public.owner_product_dosage_policy_versions
      where exact_catalog_product_version_id=any(v_versions)) then
    raise exception 'clean reset blocked: PR version has an owner dosage policy';
  end if;
  if exists(select 1 from public.product_behavior_policy_versions
      where exact_catalog_product_version_id=any(v_versions)) then
    raise exception 'clean reset blocked: PR version has a behavior policy';
  end if;
  if exists(select 1 from public.products
      where merged_into_product_id=any(v_ids) and not (id=any(v_ids))) then
    raise exception 'clean reset blocked: non-PR product is merged into a PR product';
  end if;
  if exists(select 1 from public.product_scan_creation_reservations where product_id=any(v_ids))
    or exists(select 1 from public.product_scan_overlay_states
      where product_id=any(v_ids) or product_version_id=any(v_versions)) then
    raise exception 'clean reset blocked: PR product is referenced by Scanner state';
  end if;
  v_snapshot:=jsonb_build_object(
    'capturedAt',now(),'reason',p_reason,'pi',v_pi,'pr',v_pr,
    'products',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_code),'[]'::jsonb)
      from public.products x where x.id=any(v_ids)),
    'versions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.version),'[]'::jsonb)
      from public.product_versions x where x.product_id=any(v_ids)),
    'bindings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.classified_at),'[]'::jsonb)
      from public.product_behavior_bindings x where x.product_id=any(v_ids)),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_evidence x where x.product_id=any(v_ids)),
    'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_ingest_events x where x.product_id=any(v_ids)),
    'reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_review_cases x where x.product_id=any(v_ids)),
    'relations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id),'[]'::jsonb)
      from public.user_product_relations x where x.product_id=any(v_ids)),
    'aliases',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_aliases x where x.product_id=any(v_ids)),
    'variants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_variants x where x.product_id=any(v_ids)),
    'variantMarkets',(select coalesce(jsonb_agg(to_jsonb(x) order by x.variant_id,x.market),'[]'::jsonb)
      from public.product_variant_markets x where x.variant_id=any(v_variants)),
    'retailerOffers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.variant_id,x.created_at),'[]'::jsonb)
      from public.product_retailer_offers x where x.variant_id=any(v_variants)),
    'snapshots',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_snapshots x where x.product_id=any(v_ids)),
    'scannerSessionsDetached',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.product_scan_sessions x where x.exact_product_id=any(v_ids)),
    'reclassificationQueue',(select coalesce(jsonb_agg(to_jsonb(x) order by x.queued_at),'[]'::jsonb)
      from public.product_behavior_reclassification_queue x
      where x.entity_kind='catalog_product_version'
        and x.entity_id in (select u.id::text from unnest(v_versions) as u(id)))
  );
  insert into public.product_import_reset_audits(
    actor_user_id,reason,pi_count,pr_count,snapshot,snapshot_sha256
  ) values(
    p_actor_user_id,p_reason,v_pi,v_pr,v_snapshot,
    encode(extensions.digest(convert_to(v_snapshot::text,'utf8'),'sha256'),'hex')
  ) returning id into v_audit_id;
  perform set_config('app.canonical_product_reset','v1',true);
  delete from public.product_behavior_reclassification_queue
    where entity_kind='catalog_product_version'
      and entity_id in (select u.id::text from unnest(v_versions) as u(id));
  delete from public.product_review_cases where product_id=any(v_ids);
  delete from public.product_evidence where product_id=any(v_ids);
  delete from public.product_ingest_events where product_id=any(v_ids);
  delete from public.product_behavior_bindings where product_id=any(v_ids);
  delete from public.product_variant_markets where variant_id=any(v_variants);
  delete from public.product_retailer_offers where variant_id=any(v_variants);
  delete from public.product_variants where product_id=any(v_ids);
  delete from public.product_aliases where product_id=any(v_ids);
  delete from public.user_product_relations where product_id=any(v_ids);
  delete from public.product_snapshots where product_id=any(v_ids);
  -- Scanner analysis/evidence stays intact; only the soon-invalid canonical PR
  -- pointer is detached and preserved verbatim in the audit snapshot above.
  update public.product_scan_sessions set exact_product_id=null
    where exact_product_id=any(v_ids);
  update public.products set current_version_id=null,current_behavior_binding_id=null,
    matched_basement_id=null,merged_into_product_id=null where id=any(v_ids);
  delete from public.product_versions where product_id=any(v_ids);
  delete from public.products where id=any(v_ids);
  return jsonb_build_object(
    'auditId',v_audit_id,'snapshotSha256',(select snapshot_sha256
      from public.product_import_reset_audits where id=v_audit_id),
    'deletedPr',v_pr,'pi',(select count(*) from public.products where product_code like 'PI-ING-%'),
    'pr',(select count(*) from public.products where product_code like 'PR-ING-%'),
    'orphanPrVersions',0,'orphanPrBehaviorBindings',0,'orphanPrMatchedBasementRelations',0
  );
end;
$$;

revoke all on function public.product_import_clean_preflight_v1(uuid) from public,anon,authenticated;
revoke all on function public.start_product_import_run_v1(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.request_product_import_cancel_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.product_import_run_state_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ingest_product_import_row_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.record_product_import_row_outcome_v1(uuid,uuid,integer,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_product_import_run_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.register_legacy_product_import_run_v1(uuid,timestamptz,timestamptz,integer,integer,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.rollback_product_import_run_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.snapshot_and_clean_pr_catalog_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.product_import_clean_preflight_v1(uuid) to service_role;
grant execute on function public.start_product_import_run_v1(uuid,text,text,text,text,text,integer) to service_role;
grant execute on function public.request_product_import_cancel_v1(uuid,uuid) to service_role;
grant execute on function public.product_import_run_state_v1(uuid,uuid) to service_role;
grant execute on function public.ingest_product_import_row_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,integer,text,text) to service_role;
grant execute on function public.record_product_import_row_outcome_v1(uuid,uuid,integer,text,text,text,text,jsonb) to service_role;
grant execute on function public.finish_product_import_run_v1(uuid,uuid,text) to service_role;
grant execute on function public.register_legacy_product_import_run_v1(uuid,timestamptz,timestamptz,integer,integer,integer,text,jsonb) to service_role;
grant execute on function public.rollback_product_import_run_v1(uuid,uuid) to service_role;
grant execute on function public.snapshot_and_clean_pr_catalog_v1(uuid,text) to service_role;

notify pgrst,'reload schema';
