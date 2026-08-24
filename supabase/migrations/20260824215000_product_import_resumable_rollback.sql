-- Durable per-row rollback progress keeps every request beneath the API
-- timeout and makes rollback safely resumable after a browser/network loss.
alter table public.product_import_run_rows
  add column if not exists rolled_back_at timestamptz;

create or replace function public.rollback_product_import_run_batch_v1(
  p_actor_user_id uuid,p_import_run_id uuid,p_batch_size integer default 8
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions
set statement_timeout='30s' as $$
declare
  v_run public.product_import_runs%rowtype;
  r public.product_import_run_rows%rowtype;
  v_assignments text;
  v_batch_count integer:=0;
  v_remaining integer;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'import owner authorization required'; end if;
  if p_batch_size<1 or p_batch_size>20 then raise exception 'invalid rollback batch size'; end if;
  select * into v_run from public.product_import_runs where id=p_import_run_id for update;
  if not found or v_run.actor_user_id<>p_actor_user_id then raise exception 'import run not found'; end if;
  if v_run.status not in ('CANCELLED','COMPLETED','FAILED','ROLLING_BACK') then
    raise exception 'run is not rollback eligible';
  end if;
  update public.product_import_runs set status='ROLLING_BACK',updated_at=now()
    where id=p_import_run_id;
  perform set_config('app.canonical_product_reset','v1',true);
  select string_agg(format(
    '%1$I=(jsonb_populate_record(null::public.products,$1)).%1$I',a.attname
  ),',') into v_assignments
  from pg_attribute a where a.attrelid='public.products'::regclass and a.attnum>0
    and not a.attisdropped and a.attname<>'id' and a.attgenerated='' and a.attidentity='';

  for r in select * from public.product_import_run_rows
    where import_run_id=p_import_run_id and product_id is not null and rolled_back_at is null
    order by row_index desc limit p_batch_size
  loop
    if exists(select 1 from public.product_ingest_events e
      where e.product_id=r.product_id and e.created_at>r.created_at
        and not exists(select 1 from public.product_import_run_rows x
          where x.import_run_id=p_import_run_id and x.ingest_event_id=e.id)) then
      raise exception 'rollback conflict: later product ingest exists for %',r.product_id;
    end if;
    if exists(select 1 from public.saved_recipes s
        where s.recipe_input::text like '%'||r.product_id::text||'%')
      or exists(select 1 from public.recipe_versions v
        where v.recipe_input::text like '%'||r.product_id::text||'%') then
      raise exception 'rollback conflict: product % is used by a saved recipe',r.product_id;
    end if;
    delete from public.product_behavior_reclassification_queue
      where entity_kind='catalog_product_version' and entity_id=r.new_product_version_id::text;
    if 'CREATED'=any(r.actions) then
      delete from public.product_review_cases where product_id=r.product_id;
      delete from public.product_evidence where product_id=r.product_id;
      delete from public.product_ingest_events where product_id=r.product_id;
      delete from public.product_behavior_bindings where product_id=r.product_id;
      delete from public.product_variant_markets where variant_id in
        (select id from public.product_variants where product_id=r.product_id);
      delete from public.product_retailer_offers where variant_id in
        (select id from public.product_variants where product_id=r.product_id);
      delete from public.product_variants where product_id=r.product_id;
      delete from public.product_aliases where product_id=r.product_id;
      delete from public.user_product_relations where product_id=r.product_id;
      delete from public.product_snapshots where product_id=r.product_id;
      update public.products set current_version_id=null,current_behavior_binding_id=null,
        matched_basement_id=null where id=r.product_id;
      delete from public.product_versions where product_id=r.product_id;
      delete from public.products where id=r.product_id;
    else
      update public.product_behavior_bindings set is_current=false where product_id=r.product_id;
      update public.product_behavior_bindings set is_current=true where id=r.previous_behavior_binding_id;
      execute 'update public.products set '||v_assignments||' where id=$2'
        using r.product_before,r.product_id;
      delete from public.product_review_cases where product_id=r.product_id;
      insert into public.product_review_cases
        select * from jsonb_populate_recordset(
          null::public.product_review_cases,r.review_cases_before
        );
      delete from public.user_product_relations
        where user_id=p_actor_user_id and product_id=r.product_id;
      if r.relation_before is not null then
        insert into public.user_product_relations
          select * from jsonb_populate_record(
            null::public.user_product_relations,r.relation_before
          );
      end if;
      delete from public.product_aliases a where a.product_id=r.product_id
        and not exists(select 1 from jsonb_to_recordset(r.aliases_before) x(id uuid)
          where x.id=a.id);
      delete from public.product_variant_markets where variant_id in (
        select v.id from public.product_variants v where v.product_id=r.product_id
          and not exists(select 1 from jsonb_to_recordset(r.variants_before) x(id uuid)
            where x.id=v.id)
      );
      delete from public.product_retailer_offers where variant_id in (
        select v.id from public.product_variants v where v.product_id=r.product_id
          and not exists(select 1 from jsonb_to_recordset(r.variants_before) x(id uuid)
            where x.id=v.id)
      );
      delete from public.product_variants v where v.product_id=r.product_id
        and not exists(select 1 from jsonb_to_recordset(r.variants_before) x(id uuid)
          where x.id=v.id);
      delete from public.product_evidence where ingest_event_id=r.ingest_event_id;
      delete from public.product_ingest_events where id=r.ingest_event_id;
      delete from public.product_behavior_bindings where product_version_id=r.new_product_version_id;
      delete from public.product_versions where id=r.new_product_version_id;
    end if;
    update public.product_import_run_rows set rolled_back_at=now() where id=r.id;
    v_batch_count:=v_batch_count+1;
  end loop;

  update public.product_import_run_rows set rolled_back_at=now()
    where import_run_id=p_import_run_id and product_id is null and rolled_back_at is null;
  select count(*) into v_remaining from public.product_import_run_rows
    where import_run_id=p_import_run_id and product_id is not null and rolled_back_at is null;
  if v_remaining=0 then
    update public.product_import_runs set status='ROLLED_BACK',rolled_back_at=now(),updated_at=now()
      where id=p_import_run_id;
  end if;
  return public.product_import_run_state_v1(p_actor_user_id,p_import_run_id)||jsonb_build_object(
    'rolledBackThisBatch',v_batch_count,
    'rolledBackRows',(select count(*) from public.product_import_run_rows
      where import_run_id=p_import_run_id and rolled_back_at is not null),
    'remainingRollbackRows',v_remaining
  );
end;
$$;

revoke all on function public.rollback_product_import_run_batch_v1(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.rollback_product_import_run_batch_v1(uuid,uuid,integer)
  to service_role;

notify pgrst,'reload schema';
