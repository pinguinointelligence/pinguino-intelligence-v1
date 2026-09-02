-- PINGÜINO v1.4 — Product Scanner: „Edge Function returned a non-2xx status code" root cause.
--
-- Owner case (staging, 2026-08-23 06:34:05Z): product-scan-analyze returned 200 with the full
-- Cacao Puro / La Chocolatera result, then product-scan-finalize returned HTTP 400
-- {"error":"product_ingest_failed"} and the client rendered the raw SDK message.
--
-- Server-side cause, reproduced deterministically and rolled back:
--
--   ingest_product_v1, line 1022, after it has INSERTed the new public.product_versions row:
--     update public.product_behavior_reclassification_queue set status='succeeded', …
--     where entity_kind='catalog_product_version' and entity_id=v_version_id::text
--       and status in ('pending','running')
--       and source_fingerprint = public.product_behavior_entity_fingerprint_v1(
--             'catalog_product_version', v_version_id::text);
--
--   → ERROR: classification entity not found (kind=catalog_product_version, id=…, version=f,
--            product=f, current=f)
--
-- public.product_behavior_entity_fingerprint_v1 was declared STABLE. A STABLE function evaluates
-- against the snapshot of the calling query rather than taking its own, so it could not see the
-- product_versions row that the SAME transaction had just written; it fell into the
-- "entity not found" branch and raised. Because ingest deliberately treats a classifier failure as
-- fatal ("any classifier failure rolls the identity, version, relation and provisional binding back
-- together"), the exception rolled the whole product creation back — and every scanner save of a
-- NEW product failed. The `version=f, product=f, current=f` diagnostic in the raised message is the
-- proof: with the function marked VOLATILE, the identical ingest call returns kind=created.
--
-- The fingerprint is an authority over the state being written, so it MUST read the transaction's
-- own writes: VOLATILE is the correct category here, not an optimization trade-off. Body unchanged.
create or replace function public.product_behavior_entity_fingerprint_v1(
  p_entity_kind text,
  p_entity_id text
) returns text
language plpgsql volatile security definer
set search_path=public,extensions
as $$
declare
  v_local text;
  v_policy text;
  v_mapping text;
  v_version_exists boolean:=false;
  v_product_exists boolean:=false;
  v_is_current boolean:=false;
begin
  if p_entity_kind='mapper' then
    select coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,''),m.ingredient_id
    into v_local,v_mapping
    from public.mapper_basement m
    left join public.mapper_process_metadata pm on pm.ingredient_id=m.ingredient_id
    where m.ingredient_id=p_entity_id;
  elsif p_entity_kind='catalog_product_version' then
    select coalesce(to_jsonb(v)::text,'')||'|'||coalesce((to_jsonb(p)-array['current_behavior_binding_id','updated_at'])::text,'')||'|'||
      coalesce(b.mapper_ingredient_id,'')||'|'||
      coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,''),b.mapper_ingredient_id
    into v_local,v_mapping
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

  select string_agg(to_jsonb(p)::text,'|' order by p.version,p.policy_key)
  into v_policy
  from public.owner_product_dosage_policy_versions p
  where p.status='published'
    and p.exact_mapper_ingredient_id=v_mapping
    and (
      p.exact_catalog_product_version_id is null
      or (p_entity_kind='catalog_product_version'
        and p.exact_catalog_product_version_id::text=p_entity_id)
    );
  if v_policy is not null then
    v_local:=v_local||'|owner-dosage|'||v_policy;
  end if;

  return encode(extensions.digest(
    public.product_behavior_authority_fingerprint_v1()||'|'||v_local,'sha256'
  ),'hex');
end $$;

revoke all on function public.product_behavior_entity_fingerprint_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.product_behavior_entity_fingerprint_v1(text,text)
  to service_role;
