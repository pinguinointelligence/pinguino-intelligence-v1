-- Forward-only runtime repair for the authenticated Mapper 2088 audit.
-- mapper_basement.data_confidence_percent is integer in the live schema while
-- the public-safe audit contract intentionally exposes a numeric value.

create or replace function public.audit_mapper_runtime_usability_v1()
returns table(
  ingredient_id text,
  product_id uuid,
  product_version_id uuid,
  binding_id uuid,
  verification_status text,
  source_confidence numeric,
  verification_source text,
  approved_for_base boolean,
  approved_for_engines boolean,
  missing_technical_fields text[],
  process_status text,
  behavior_state text,
  main_policy_status text,
  binding_status text,
  selectable_base boolean,
  pi_calculable boolean
)
language plpgsql stable security definer
set search_path=public,extensions
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return query
  select m.ingredient_id,p.id,p.current_version_id,b.id,m.verification_status,
    m.data_confidence_percent::numeric,m.verification_source,m.approved_for_base,m.approved_for_engines,
    array_remove(array[
      case when m.water_percent is null or m.water_percent<0 then 'water_percent' end,
      case when m.total_solids_percent is null or m.total_solids_percent<0 then 'total_solids_percent' end,
      case when m.fat_percent is null or m.fat_percent<0 then 'fat_percent' end,
      case when m.protein_percent is null or m.protein_percent<0 then 'protein_percent' end,
      case when m.carbohydrate_percent is null or m.carbohydrate_percent<0 then 'carbohydrate_percent' end,
      case when m.total_sugars_percent is null or m.total_sugars_percent<0 then 'total_sugars_percent' end,
      case when m.salt_percent is null or m.salt_percent<0 then 'salt_percent' end,
      case when m.pod_value is null or m.pod_value<0 then 'pod_value' end,
      case when m.pac_value is null or m.pac_value<0 then 'pac_value' end
    ],null),coalesce(b.process_behavior->>'decision','UNKNOWN'),b.behavior_role,
    b.main_policy_status,b.binding_status,
    (m.is_active and m.approved_for_base),
    (m.is_active and m.approved_for_engines
      and m.water_percent is not null and m.water_percent>=0
      and m.total_solids_percent is not null and m.total_solids_percent>=0
      and m.fat_percent is not null and m.fat_percent>=0
      and m.protein_percent is not null and m.protein_percent>=0
      and m.carbohydrate_percent is not null and m.carbohydrate_percent>=0
      and m.total_sugars_percent is not null and m.total_sugars_percent>=0
      and m.salt_percent is not null and m.salt_percent>=0
      and m.pod_value is not null and m.pod_value>=0
      and m.pac_value is not null and m.pac_value>=0)
  from public.mapper_basement m
  join public.products p on p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||m.ingredient_id
    and p.is_active and p.merged_into_product_id is null
  join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
    and b.product_id=p.id and b.product_version_id=v.id and b.is_current
  where m.is_active order by m.ingredient_id;
end;
$$;

revoke all on function public.audit_mapper_runtime_usability_v1() from public,anon;
grant execute on function public.audit_mapper_runtime_usability_v1() to authenticated,service_role;

do $assert_mapper_runtime_audit_projection$
declare
  v_result_type text;
begin
  select pg_get_function_result('public.audit_mapper_runtime_usability_v1()'::regprocedure)
  into v_result_type;
  if position('source_confidence numeric' in v_result_type)=0 then
    raise exception 'Mapper runtime audit confidence contract drifted';
  end if;
  if position('data_confidence_percent::numeric' in
    pg_get_functiondef('public.audit_mapper_runtime_usability_v1()'::regprocedure))=0 then
    raise exception 'Mapper runtime audit integer-to-numeric projection is missing';
  end if;
end;
$assert_mapper_runtime_audit_projection$;
