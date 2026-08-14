-- A newly inserted immutable version is not classifiable until the canonical
-- product publishes it as current. The 10400 AFTER INSERT trigger ran before
-- that pointer update and could ask the fingerprint function to resolve a
-- not-yet-published entity. Ingest classifies synchronously after publishing
-- the provisional binding; the subsequent products.current_version_id update
-- is the correct enqueue point.
create or replace function public.enqueue_catalog_product_behavior_entity_change_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
declare v_version uuid;
begin
  if tg_table_name='product_versions' then
    v_version := case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name='product_behavior_bindings' then
    v_version := case when tg_op='DELETE' then old.product_version_id else new.product_version_id end;
  else
    v_version := case when tg_op='DELETE' then old.current_version_id else new.current_version_id end;
  end if;

  if v_version is null or not exists(
    select 1
    from public.product_versions v
    join public.products p on p.id=v.product_id
    where v.id=v_version
      and p.current_version_id=v.id
      and p.is_active
      and p.merged_into_product_id is null
  ) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  perform public.enqueue_product_behavior_reclassification_v1(
    'catalog_product_version',v_version::text,tg_table_name||'_changed'
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.enqueue_catalog_product_behavior_entity_change_v1()
  from public,anon,authenticated;
grant execute on function public.enqueue_catalog_product_behavior_entity_change_v1()
  to service_role;
