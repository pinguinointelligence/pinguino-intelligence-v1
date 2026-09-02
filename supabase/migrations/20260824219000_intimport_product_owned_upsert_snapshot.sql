-- Product-owned INTIMPORT sends the canonical `upsert` operation. The import
-- ledger wrapper still reused the retired binding-only identity resolver,
-- whose `bind_intimport_mapper` guard rejected every row before canonical
-- ingest with P0001 `entitled INTIMPORT existing-only identity required`.
--
-- Keep the resolver read-only and service-only. Only its operation contract is
-- aligned with the product-owned ingest boundary; entitlement, INTIMPORT
-- identity, exact matching and ownership checks remain unchanged.
create or replace function public.resolve_intimport_existing_product_v1(
  p_actor_user_id uuid,
  p_source text,
  p_input jsonb
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  v_ean text:=nullif(regexp_replace(
    coalesce(nullif(p_input->>'ean',''),p_input->>'barcode',''),'\D','','g'
  ),'');
  v_name text:=nullif(trim(coalesce(p_input->>'displayName',p_input->>'originalName','')),'');
  v_brand text:=nullif(trim(coalesce(p_input->>'brand','')),'');
  v_identity text;
  v_product_id uuid;
  v_match_count integer;
  v_is_admin boolean;
begin
  if p_actor_user_id is null or p_source<>'catalog_import'
    or public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source)<>'catalog_import'
    or coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')<>'INTIMPORT'
    or coalesce(nullif(p_input->>'operation',''),'upsert')<>'upsert'
    or v_name is null then
    raise exception 'entitled INTIMPORT product-owned upsert identity required';
  end if;
  if v_ean is not null and v_ean !~ '^[0-9]{8,14}$' then v_ean:=null; end if;
  v_identity:=case when v_ean is not null then 'ean:'||v_ean else
    'identity:'||encode(extensions.digest(convert_to(
      lower(coalesce(v_brand,''))||'|'||lower(coalesce(v_name,''))||'|'||
      lower(coalesce(p_input->>'category',''))||'|'||
      lower(coalesce(p_input->>'packageSize',p_input#>>'{facts,packageSize}','')),
      'utf8'),'sha256'),'hex') end;
  select exists(select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_is_admin;
  select count(*) into v_match_count
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.visibility='shared' and p.product_kind='commercial_product'
    and p.source_type='catalog_import'
    and ((v_ean is not null and p.ean_code_normalized=v_ean)
      or p.normalized_identity=v_identity)
    and (p.created_by=p_actor_user_id or v_is_admin);
  if v_match_count<>1 then return null; end if;
  select p.id into v_product_id
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.visibility='shared' and p.product_kind='commercial_product'
    and p.source_type='catalog_import'
    and ((v_ean is not null and p.ean_code_normalized=v_ean)
      or p.normalized_identity=v_identity)
    and (p.created_by=p_actor_user_id or v_is_admin);
  return v_product_id;
end;
$$;

revoke all on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
  to service_role;

comment on function public.resolve_intimport_existing_product_v1(uuid,text,jsonb)
is 'Read-only service adapter for an entitled product-owned INTIMPORT upsert to snapshot one exact existing owner identity before atomic import/rollback.';

notify pgrst,'reload schema';
