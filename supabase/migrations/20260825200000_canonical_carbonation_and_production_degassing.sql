-- One canonical carbonation property for PI / PR / PM and one durable
-- Production acknowledgement. No Engine formula or Mapper science changes.

alter table public.mapper_basement
  add column if not exists carbonation_status text not null default 'UNKNOWN';
alter table public.mapper_basement
  drop constraint if exists mapper_basement_carbonation_status_check;
alter table public.mapper_basement
  add constraint mapper_basement_carbonation_status_check
  check (carbonation_status in ('CARBONATED','NON_CARBONATED','UNKNOWN'));
comment on column public.mapper_basement.carbonation_status is
  'Canonical process property. Existing/unproven PI rows remain UNKNOWN; never inferred from product name.';

alter table public.products
  add column if not exists carbonation_status text not null default 'UNKNOWN',
  add column if not exists carbonation_evidence jsonb not null default '[]'::jsonb;
alter table public.products
  drop constraint if exists products_carbonation_status_check;
alter table public.products
  add constraint products_carbonation_status_check
  check (carbonation_status in ('CARBONATED','NON_CARBONATED','UNKNOWN'));
alter table public.products
  drop constraint if exists products_carbonation_evidence_array;
alter table public.products
  add constraint products_carbonation_evidence_array
  check (jsonb_typeof(carbonation_evidence)='array');

-- Persist the server-recomputed profile inside immutable product-version facts.
do $patch_ingest_carbonation$
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

  v_old:=$old$      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,engineUsable}'),'')<>'boolean'$old$;
  v_new:=$new$      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,engineUsable}'),'')<>'boolean'
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,carbonation}'),'')<>'object'
      or coalesce(p_risk#>>'{productProfileAuthority,carbonation,status}','')
        not in ('CARBONATED','NON_CARBONATED','UNKNOWN')
      or coalesce(jsonb_typeof(p_risk#>'{productProfileAuthority,carbonation,evidence}'),'')<>'array'$new$;
  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product carbonation guard anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$      'ingredientsEvidenceStatus',p_risk#>>'{productProfileAuthority,ingredientsEvidenceStatus}'$old$;
  v_new:=$new$      'ingredientsEvidenceStatus',p_risk#>>'{productProfileAuthority,ingredientsEvidenceStatus}',
      'carbonationStatus',p_risk#>>'{productProfileAuthority,carbonation,status}',
      'carbonation',p_risk#>'{productProfileAuthority,carbonation}'$new$;
  if strpos(v_patched,$marker$'carbonationStatus',p_risk#>>'{productProfileAuthority,carbonation,status}'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product carbonation fact anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_ingest_carbonation$;

-- The immutable current version remains the authority; these root columns are
-- a typed current-version projection for legacy Products readers.
create or replace function public.sync_current_product_carbonation_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_status text:=coalesce(new.facts->>'carbonationStatus','UNKNOWN');
  v_evidence jsonb:=coalesce(new.facts#>'{carbonation,evidence}','[]'::jsonb);
begin
  if v_status not in ('CARBONATED','NON_CARBONATED','UNKNOWN')
    or jsonb_typeof(v_evidence)<>'array' then
    raise exception 'invalid canonical carbonation profile' using errcode='23514';
  end if;
  perform set_config('app.canonical_product_ingest','v1',true);
  update public.products
  set carbonation_status=v_status, carbonation_evidence=v_evidence
  where id=new.product_id;
  return new;
end;
$$;
revoke all on function public.sync_current_product_carbonation_v1()
  from public,anon,authenticated,service_role;
drop trigger if exists product_version_carbonation_projection_v1
  on public.product_versions;
create trigger product_version_carbonation_projection_v1
after insert or update of facts on public.product_versions
for each row execute function public.sync_current_product_carbonation_v1();

-- PI search uses the same public-data shape as PR/PM. Values remain UNKNOWN
-- unless a controlled Mapper curation explicitly proves otherwise.
do $patch_search_carbonation$
declare
  v_signature regprocedure:=to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'product search authority missing'; end if;
  v_definition:=pg_get_functiondef(v_signature);
  v_patched:=v_definition;
  v_old:=$old$      jsonb_build_object('verificationStatus',m.verification_status,'productAccuracy',coalesce(m.data_confidence_percent,0),'sourceConfidence',coalesce(m.data_confidence_percent,0),'verificationSource',m.verification_source,'approvedForBase',m.approved_for_base,'approvedForEngines',m.approved_for_engines,'lifecycleRejected',coalesce(p.status,'')='rejected') public_data,r.private_price,r.currency private_currency,$old$;
  v_new:=$new$      jsonb_build_object('verificationStatus',m.verification_status,'productAccuracy',coalesce(m.data_confidence_percent,0),'sourceConfidence',coalesce(m.data_confidence_percent,0),'verificationSource',m.verification_source,'approvedForBase',m.approved_for_base,'approvedForEngines',m.approved_for_engines,'lifecycleRejected',coalesce(p.status,'')='rejected','carbonationStatus',m.carbonation_status,'carbonation',jsonb_build_object('status',m.carbonation_status,'evidence','[]'::jsonb,'decision','NO_EXACT_ASSERTION')) public_data,r.private_price,r.currency private_currency,$new$;
  if strpos(v_patched,$marker$'carbonationStatus',m.carbonation_status$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'PI carbonation search anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_search_carbonation$;

-- Durable Production receipt: the existing run lifecycle remains unchanged.
alter table public.production_runs
  add column if not exists degassing_required boolean not null default false,
  add column if not exists degassing_acknowledged boolean not null default false,
  add column if not exists degassing_acknowledged_at timestamptz,
  add column if not exists carbonated_product_ids text[] not null default '{}'::text[];
alter table public.production_runs
  drop constraint if exists production_runs_degassing_ack_consistent;
alter table public.production_runs
  add constraint production_runs_degassing_ack_consistent check (
    (not degassing_acknowledged and degassing_acknowledged_at is null)
    or (degassing_required and degassing_acknowledged and degassing_acknowledged_at is not null)
  );

create or replace function public.production_carbonated_products_v1(
  p_recipe_input jsonb,
  p_product_composition jsonb
) returns jsonb language sql immutable
set search_path=pg_catalog,public as $$
  with raw as (
    select
      coalesce(item#>>'{ingredient,canonical_ingredient_id}',item#>>'{ingredient,id}') product_id,
      item#>>'{ingredient,name}' product_name,
      coalesce((item->>'planned_grams')::numeric,0) grams
    from jsonb_array_elements(coalesce(p_recipe_input->'items','[]'::jsonb)) item
    where item#>>'{ingredient,carbonation_status}'='CARBONATED'
    union all
    select
      coalesce(item#>>'{ingredient,canonical_ingredient_id}',item#>>'{ingredient,id}') product_id,
      item#>>'{ingredient,name}' product_name,
      coalesce((item->>'planned_grams')::numeric,0) grams
    from jsonb_array_elements(coalesce(p_product_composition->'toppings','[]'::jsonb)) item
    where item#>>'{ingredient,carbonation_status}'='CARBONATED'
  ), grouped as (
    select product_id,min(product_name) product_name,sum(grams) grams
    from raw where nullif(trim(product_id),'') is not null group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',product_id,'name',product_name,'grams',grams
  ) order by product_id),'[]'::jsonb) from grouped
$$;
revoke all on function public.production_carbonated_products_v1(jsonb,jsonb)
  from public,anon,authenticated,service_role;

do $patch_production_start_carbonation$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.production_start_run_v2(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,jsonb,text)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$    process_advisories = v_readiness->'advisories'
  where id = p_run_id and owner_user_id = v_uid and status = 'draft';$old$;
  v_new:=$new$    process_advisories = v_readiness->'advisories',
    degassing_required = jsonb_array_length(public.production_carbonated_products_v1(
      v_version.recipe_input,v_version.product_composition
    )) > 0,
    degassing_acknowledged = false,
    degassing_acknowledged_at = null,
    carbonated_product_ids = array(
      select value->>'productId'
      from jsonb_array_elements(public.production_carbonated_products_v1(
        v_version.recipe_input,v_version.product_composition
      )) value
    )
  where id = p_run_id and owner_user_id = v_uid and status = 'draft';$new$;
  if strpos(v_patched,'carbonated_product_ids = array(')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'Production start carbonation anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_production_start_carbonation$;

alter table public.production_run_events
  drop constraint if exists production_run_events_event_type_check;
alter table public.production_run_events
  add constraint production_run_events_event_type_check check (
    event_type in (
      'created','planned','started','actual_recorded','rescue_applied','completed',
      'cancelled','amended','note_added','production_started',
      'heat_information_acknowledged','degassing_acknowledged',
      'ingredient_actual_confirmed','actual_entry_corrected','variance_detected',
      'rescue_previewed','rescue_accepted','batch_target_changed',
      'additional_ingredient_requested','ingredient_completed',
      'production_completed','production_cancelled'
    )
  );

-- The existing event-state trigger has its own explicit vocabulary. Extend
-- that in-place as well; otherwise the audit-table check would accept the
-- receipt while the state trigger rejected the same in-progress event.
do $patch_production_event_state_carbonation$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef('public.enforce_production_event_state()'::regprocedure);
  v_patched:=v_definition;
  v_old:=$old$'heat_information_acknowledged','ingredient_actual_confirmed'$old$;
  v_new:=$new$'heat_information_acknowledged','degassing_acknowledged',
        'ingredient_actual_confirmed'$new$;
  if strpos(v_patched,$marker$'degassing_acknowledged'$marker$)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'Production event-state carbonation anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_production_event_state_carbonation$;

create or replace function public.production_acknowledge_degassing_v1(p_run_id uuid)
returns timestamptz language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_uid uuid:=public.assert_production_pro_entitlement_v1();
  v_at timestamptz;
begin
  update public.production_runs
  set degassing_acknowledged=true,
      degassing_acknowledged_at=coalesce(degassing_acknowledged_at,pg_catalog.now())
  where id=p_run_id and owner_user_id=v_uid and status='in_progress'
    and degassing_required
  returning degassing_acknowledged_at into v_at;
  if v_at is null then
    raise exception 'active owned run requiring degassing not found' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.production_run_events
    where run_id=p_run_id and event_type='degassing_acknowledged'
  ) then
    insert into public.production_run_events(
      id,run_id,owner_user_id,event_type,detail,amendment,created_by,created_at
    ) values(
      extensions.gen_random_uuid(),p_run_id,v_uid,'degassing_acknowledged',
      'Operator confirmed complete degassing',
      jsonb_build_object('acknowledgedAt',v_at),v_uid,v_at
    );
  end if;
  return v_at;
end;
$$;
revoke all on function public.production_acknowledge_degassing_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.production_acknowledge_degassing_v1(uuid)
  to authenticated;

comment on column public.production_runs.degassing_required is
  'Frozen from exact recipe-version ingredients with carbonation_status=CARBONATED.';
comment on column public.production_runs.degassing_acknowledged is
  'Durable operator receipt; no Engine or ProductBehavior authority.';

notify pgrst,'reload schema';
