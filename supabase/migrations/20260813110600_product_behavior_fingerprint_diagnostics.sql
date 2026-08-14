-- Keep classification failures fail-closed, but expose enough server-owned
-- invariant detail to diagnose an ingest rollback without leaking product
-- facts. This replaces the opaque 10400 error only; the fingerprint bytes and
-- authority inputs are unchanged.
create or replace function public.product_behavior_entity_fingerprint_v1(
  p_entity_kind text,
  p_entity_id text
) returns text
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
  v_local text;
  v_version_exists boolean:=false;
  v_product_exists boolean:=false;
  v_is_current boolean:=false;
begin
  if p_entity_kind='mapper' then
    select coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,'')
    into v_local
    from public.mapper_basement m
    left join public.mapper_process_metadata pm on pm.ingredient_id=m.ingredient_id
    where m.ingredient_id=p_entity_id;
  elsif p_entity_kind='catalog_product_version' then
    select coalesce(to_jsonb(v)::text,'')||'|'||coalesce((to_jsonb(p)-array['current_behavior_binding_id','updated_at'])::text,'')||'|'||
      coalesce(b.mapper_ingredient_id,'')||'|'||
      coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,'')
    into v_local
    from public.product_versions v
    join public.products p on p.id=v.product_id
    left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    left join public.mapper_process_metadata pm on pm.ingredient_id=b.mapper_ingredient_id
    where v.id=p_entity_id::uuid;
    if v_local is null then
      select exists(select 1 from public.product_versions v where v.id=p_entity_id::uuid),
        exists(select 1 from public.product_versions v join public.products p on p.id=v.product_id
          where v.id=p_entity_id::uuid),
        exists(select 1 from public.product_versions v join public.products p on p.id=v.product_id
          where v.id=p_entity_id::uuid and p.current_version_id=v.id)
      into v_version_exists,v_product_exists,v_is_current;
    end if;
  else
    raise exception 'unsupported classification entity kind';
  end if;
  if v_local is null then
    raise exception 'classification entity not found (kind=%, id=%, version=%, product=%, current=%)',
      p_entity_kind,p_entity_id,v_version_exists,v_product_exists,v_is_current;
  end if;
  return encode(extensions.digest(
    public.product_behavior_authority_fingerprint_v1()||'|'||v_local,'sha256'
  ),'hex');
end $$;

revoke all on function public.product_behavior_entity_fingerprint_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.product_behavior_entity_fingerprint_v1(text,text)
  to service_role;
