-- Exact owner ProductBehavior/process/dosage authority for the canonical
-- PI-ING-002114 Mapper identity. This does not create an Overlay product.
begin;

insert into public.owner_product_dosage_policy_versions (
  policy_key, version, status, exact_mapper_ingredient_id,
  exact_catalog_product_version_id, min_percent, preferred_percent, max_percent,
  presence_semantics, provenance, source_version, policy_payload
) values (
  'gellatti-stabilizer-profile-dosage', 1, 'published', 'PI-ING-002114', null,
  0.18, 0.23, 0.28, 'optional_zero_or_range',
  'OWNER_FORMULATION · Gellatti owner formula',
  'owner-gellatti-stabilizer-v1',
  jsonb_build_object(
    'authorityType','product_owned_profile_dosage',
    'presenceSemantics','optional_zero_or_range',
    'profileDosageGPerKg',jsonb_build_object(
      'STANDARD',2.3,
      'SORBET',2.8,
      'CHOCOLATE',2.5,
      'EGG',1.8
    ),
    'scaling','proportional_to_recipe_batch',
    'hiddenConstituentDosageAuthorityApplied',false,
    'sourceType','OWNER_FORMULATION',
    'compositionAuthority','Gellatti owner formula'
  )
)
on conflict (policy_key, version) do update set
  status=excluded.status,
  exact_mapper_ingredient_id=excluded.exact_mapper_ingredient_id,
  exact_catalog_product_version_id=excluded.exact_catalog_product_version_id,
  min_percent=excluded.min_percent,
  preferred_percent=excluded.preferred_percent,
  max_percent=excluded.max_percent,
  presence_semantics=excluded.presence_semantics,
  provenance=excluded.provenance,
  source_version=excluded.source_version,
  policy_payload=excluded.policy_payload;

-- The generic classifier correctly assigns a stabilizer to STRUCTURAL_ONLY,
-- but its broad historical permission projection treats every base-approved
-- Mapper product as topping-capable. Preserve the owner's narrower BASE_ONLY
-- authority for this exact canonical identity on every future reclassification.
create or replace function public.enforce_gellatti_stabilizer_base_only_v1()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.mapper_ingredient_id='PI-ING-002114' then
    new.main_eligibility:='NOT_MAIN';
    new.behavior_role:='STRUCTURAL_ONLY';
    new.profile_permissions:=coalesce(new.profile_permissions,'{}'::jsonb)
      || jsonb_build_object(
        'BASE_RECIPE',true,
        'TOPPING',false,
        'SUBSTITUTION',true,
        'MONITOR',true,
        'PRODUCTION',true,
        'LABEL',true,
        'NUTRITION',true,
        'COST',true,
        'SAVE',true
      );
    new.profile_applicability:=jsonb_build_object(
      'all_existing_profiles','structural_where_profile_compatible',
      'productRole','BASE_ONLY'
    );
  end if;
  return new;
end $$;

drop trigger if exists enforce_gellatti_stabilizer_base_only_mapper_v1
  on public.mapper_product_behavior_bindings;
create trigger enforce_gellatti_stabilizer_base_only_mapper_v1
before insert or update on public.mapper_product_behavior_bindings
for each row execute function public.enforce_gellatti_stabilizer_base_only_v1();

drop trigger if exists enforce_gellatti_stabilizer_base_only_product_v1
  on public.product_behavior_bindings;
create trigger enforce_gellatti_stabilizer_base_only_product_v1
before insert or update on public.product_behavior_bindings
for each row execute function public.enforce_gellatti_stabilizer_base_only_v1();

do $refresh_gellatti_stabilizer_binding$
begin
  perform public.classify_mapper_product_behavior_v2(
    'PI-ING-002114','owner-gellatti-stabilizer-v1'
  );
end;
$refresh_gellatti_stabilizer_binding$;

do $assert_gellatti_stabilizer_authority$
declare
  v_mapper_product uuid;
begin
  select p.id into v_mapper_product
  from public.products p
  where p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:PI-ING-002114'
    and p.is_active and p.merged_into_product_id is null;

  if (select count(*) from public.mapper_product_behavior_bindings b
      where b.mapper_ingredient_id='PI-ING-002114' and b.is_current
        and b.main_eligibility='NOT_MAIN'
        and b.behavior_role='STRUCTURAL_ONLY'
        and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
        and not coalesce((b.profile_permissions->>'TOPPING')::boolean,true)
        and b.process_behavior->>'decision'='HEAT_REQUIRED_FOR_FUNCTION') <> 1 then
    raise exception 'PI-ING-002114 Mapper ProductBehavior authority is incomplete';
  end if;

  if v_mapper_product is null or
    (select count(*) from public.product_behavior_bindings b
      where b.product_id=v_mapper_product and b.mapper_ingredient_id='PI-ING-002114'
        and b.is_current and b.main_eligibility='NOT_MAIN'
        and b.behavior_role='STRUCTURAL_ONLY'
        and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
        and not coalesce((b.profile_permissions->>'TOPPING')::boolean,true)) <> 1 then
    raise exception 'PI-ING-002114 canonical ProductBehavior binding is incomplete';
  end if;

  if (select count(*) from public.owner_product_dosage_policy_versions p
      where p.exact_mapper_ingredient_id='PI-ING-002114' and p.status='published'
        and p.policy_payload->'profileDosageGPerKg'=jsonb_build_object(
          'STANDARD',2.3,'SORBET',2.8,'CHOCOLATE',2.5,'EGG',1.8
        )) <> 1 then
    raise exception 'PI-ING-002114 exact profile dosage authority is incomplete';
  end if;

  if exists(
    select 1 from public.products p
    where p.normalized_identity='mapper:PI-ING-002114'
      and p.product_kind<>'mapper_reference'
  ) then
    raise exception 'PI-ING-002114 duplicate non-Mapper product identity detected';
  end if;
end;
$assert_gellatti_stabilizer_authority$;

commit;
