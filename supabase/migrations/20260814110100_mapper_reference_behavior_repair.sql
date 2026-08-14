-- Repair the served Mapper behavior authority after the canonical verification
-- backfill in 20260814110000.  A canonical mapper_reference is still resolved
-- and classified as entity_kind='mapper'; it must never be sent through the
-- commercial catalog classifier merely because its root metadata changed.

select pg_advisory_xact_lock(hashtextextended('upi-mapper-reference-behavior-repair-v1',0));
lock table public.product_behavior_reclassification_queue in share row exclusive mode;

create or replace function public.enqueue_catalog_product_behavior_entity_change_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_version uuid;
  v_product_id uuid;
  v_product_kind text;
  v_normalized_identity text;
  v_mapper_ingredient_id text;
begin
  if tg_table_name='product_versions' then
    v_version := case when tg_op='DELETE' then old.id else new.id end;
    v_product_id := case when tg_op='DELETE' then old.product_id else new.product_id end;
  elsif tg_table_name='product_behavior_bindings' then
    v_version := case when tg_op='DELETE' then old.product_version_id else new.product_version_id end;
    v_product_id := case when tg_op='DELETE' then old.product_id else new.product_id end;
  else
    v_version := case when tg_op='DELETE' then old.current_version_id else new.current_version_id end;
    v_product_id := case when tg_op='DELETE' then old.id else new.id end;
    v_product_kind := case when tg_op='DELETE' then old.product_kind else new.product_kind end;
    v_normalized_identity := case when tg_op='DELETE' then old.normalized_identity else new.normalized_identity end;
  end if;

  if v_product_kind is null and v_product_id is not null then
    select p.product_kind,p.normalized_identity
      into v_product_kind,v_normalized_identity
    from public.products p where p.id=v_product_id;
  end if;

  if v_product_kind='mapper_reference' then
    v_mapper_ingredient_id := nullif(regexp_replace(
      coalesce(v_normalized_identity,''),'^mapper:','','i'
    ),'');
    if v_mapper_ingredient_id is not null
      and exists(select 1 from public.mapper_basement m
        where m.ingredient_id=v_mapper_ingredient_id and m.is_active) then
      perform public.enqueue_product_behavior_reclassification_v1(
        'mapper',v_mapper_ingredient_id,tg_table_name||'_changed'
      );
    end if;
  elsif v_version is not null then
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version',v_version::text,tg_table_name||'_changed'
    );
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.enqueue_catalog_product_behavior_entity_change_v1()
  from public,anon,authenticated;

-- Serialize against any worker that already claimed a wrongly-routed catalog
-- job, then make every such job historical. The published binding is repaired
-- below by the mapper classifier before this transaction commits.
do $$
declare v_version_id uuid;
begin
  for v_version_id in
    select p.current_version_id
    from public.products p
    where p.product_kind='mapper_reference'
      and p.is_active and p.merged_into_product_id is null
      and p.current_version_id is not null
    order by p.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'product-behavior:catalog_product_version:'||v_version_id::text,0
    ));
    update public.product_behavior_reclassification_queue q set
      status='succeeded',result_binding_id=null,completed_at=now(),
      progress=jsonb_build_object('stage','superseded','completed',1,'total',1),
      last_error_code=null,last_error_message=null,updated_at=now()
    where q.entity_kind='catalog_product_version'
      and q.entity_id=v_version_id::text
      and q.status in ('pending','running','failed');
  end loop;
end $$;

-- Re-publish the exact canonical binding for every active Mapper row. Enqueue
-- intentionally reactivates an earlier succeeded idempotency key, so this is a
-- deterministic repair rather than a second classification authority.
do $$
declare v_mapper_id text;
  v_result jsonb;
begin
  for v_mapper_id in
    select m.ingredient_id from public.mapper_basement m
    where m.is_active order by m.ingredient_id
  loop
    perform public.enqueue_product_behavior_reclassification_v1(
      'mapper',v_mapper_id,'mapper_reference_root_repair'
    );
  end loop;

  loop
    exit when not exists (
      select 1 from public.product_behavior_reclassification_queue q
      where q.entity_kind='mapper' and q.status in ('pending','failed')
        and q.attempt_count<q.max_attempts
    );
    v_result := public.process_product_behavior_reclassification_queue_v1(250);
    exit when coalesce((v_result->>'processed')::integer,0)=0;
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from public.products p
    left join public.product_versions v
      on v.id=p.current_version_id and v.product_id=p.id
    left join public.product_behavior_bindings b
      on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m
      on p.normalized_identity='mapper:'||m.ingredient_id and m.is_active
    where p.product_kind='mapper_reference'
      and p.is_active and p.merged_into_product_id is null
      and (
        v.id is null or m.ingredient_id is null or b.id is null
        or b.mapper_ingredient_id is distinct from m.ingredient_id
        or b.classifier_version not like 'product-behavior-layered-v2-%'
      )
  ) then
    raise exception 'canonical Mapper behavior repair is incomplete';
  end if;

  if exists (
    select 1
    from public.product_behavior_reclassification_queue q
    join public.products p on p.current_version_id::text=q.entity_id
      and p.product_kind='mapper_reference'
    where q.entity_kind='catalog_product_version'
      and q.status in ('pending','running','failed')
  ) then
    raise exception 'mapper_reference still has a catalog classification job';
  end if;

  if exists (
    select 1 from public.product_behavior_reclassification_queue q
    where q.entity_kind='mapper' and q.status<>'succeeded'
  ) then
    raise exception 'Mapper behavior repair contains unfinished jobs';
  end if;
end $$;
