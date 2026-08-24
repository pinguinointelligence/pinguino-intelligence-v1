-- Replace the legacy row loop with set-based restoration. Every target still
-- comes from the exact run ledger; the change only removes per-row round trips.
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
      and not exists(select 1 from public.product_import_run_rows r
        cross join lateral jsonb_to_recordset(r.variants_before) x(id uuid)
        where r.import_run_id=p_import_run_id and x.id=v.id)
  );
  delete from public.product_retailer_offers o where o.variant_id in (
    select v.id from public.product_variants v where v.product_id=any(v_existing_ids)
      and not exists(select 1 from public.product_import_run_rows r
        cross join lateral jsonb_to_recordset(r.variants_before) x(id uuid)
        where r.import_run_id=p_import_run_id and x.id=v.id)
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

revoke all on function public.rollback_product_import_run_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.rollback_product_import_run_v1(uuid,uuid) to service_role;
