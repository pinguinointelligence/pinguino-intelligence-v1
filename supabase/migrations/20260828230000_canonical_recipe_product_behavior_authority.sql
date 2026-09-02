-- Surgical ProductBehavior authority for two canonical formulation standards.
--
-- Evidence source: the approved runtime formulation registry. Skimmed milk
-- powder is used by milk_gelato and chocolate_gelato. Sucrose is used by those
-- profiles plus sorbet, vegan_gelato and protein_gelato. Profiles absent from
-- the exact allow-list remain fail-closed. mapper_basement is read-only.
begin;

select pg_advisory_xact_lock(
  hashtextextended('canonical-recipe-product-behavior-authority-v1',0)
);

create or replace function public.enforce_canonical_recipe_product_behavior_authority_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.mapper_ingredient_id in ('PI-ING-000270','PI-ING-000514') then
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
    new.profile_applicability:=case
      when new.mapper_ingredient_id='PI-ING-000270' then jsonb_build_object(
        'authorityType','CANONICAL_RECIPE_PROFILE_ALLOWLIST',
        'authorityVersion','canonical-recipe-product-behavior-v1',
        'milk_gelato','eligible',
        'chocolate_gelato','eligible',
        'fruit_gelato','blocked',
        'nut_gelato','blocked',
        'alcohol_gelato','blocked',
        'sorbet','blocked',
        'vegan_gelato','blocked',
        'protein_gelato','blocked'
      )
      else jsonb_build_object(
        'authorityType','CANONICAL_RECIPE_PROFILE_ALLOWLIST',
        'authorityVersion','canonical-recipe-product-behavior-v1',
        'milk_gelato','eligible',
        'chocolate_gelato','eligible',
        'sorbet','eligible',
        'vegan_gelato','eligible',
        'protein_gelato','eligible',
        'fruit_gelato','blocked',
        'nut_gelato','blocked',
        'alcohol_gelato','blocked'
      )
    end;
  end if;
  return new;
end $$;

drop trigger if exists enforce_canonical_recipe_product_behavior_mapper_v1
  on public.mapper_product_behavior_bindings;
create trigger enforce_canonical_recipe_product_behavior_mapper_v1
before insert or update on public.mapper_product_behavior_bindings
for each row execute function public.enforce_canonical_recipe_product_behavior_authority_v1();

drop trigger if exists enforce_canonical_recipe_product_behavior_product_v1
  on public.product_behavior_bindings;
create trigger enforce_canonical_recipe_product_behavior_product_v1
before insert or update on public.product_behavior_bindings
for each row execute function public.enforce_canonical_recipe_product_behavior_authority_v1();

-- The evidence gate remains fail-closed. This adds one generic interpretation
-- of an explicit ProductBehavior allow-list: only a binding carrying the
-- authority marker takes this branch, and an absent profile is blocked.
do $patch_profile_allowlist_gate$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  v_old:=$old$  v_profile_allowed := case
    when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'
    when v_profile='protein_gelato' then v_protein<>'unknown'
    else true
  end;$old$;
  v_new:=$new$  v_profile_allowed := case
    when v_profile_applicability->>'authorityType'='CANONICAL_RECIPE_PROFILE_ALLOWLIST'
      then coalesce(v_profile_applicability->>v_profile,'blocked')='eligible'
    when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'
    when v_profile='protein_gelato' then v_protein<>'unknown'
    else true
  end;$new$;
  if strpos(v_definition,v_new)>0 then
    return;
  end if;
  if strpos(v_definition,v_old)=0 then
    raise exception 'ProductBehavior profile gate anchor drifted';
  end if;
  v_patched:=replace(v_definition,v_old,v_new);
  execute v_patched;
end;
$patch_profile_allowlist_gate$;

do $refresh_canonical_recipe_product_behavior$
begin
  perform public.classify_mapper_product_behavior_v2(
    'PI-ING-000270','canonical-recipe-product-behavior-v1'
  );
  perform public.classify_mapper_product_behavior_v2(
    'PI-ING-000514','canonical-recipe-product-behavior-v1'
  );
end;
$refresh_canonical_recipe_product_behavior$;

do $assert_canonical_recipe_product_behavior$
declare
  v_mapper_id text;
  v_product_id uuid;
  v_expected_profiles jsonb;
begin
  foreach v_mapper_id in array array['PI-ING-000270','PI-ING-000514'] loop
    if (select count(*) from public.mapper_basement m
        where m.ingredient_id=v_mapper_id and m.is_active
          and m.approved_for_base and m.approved_for_engines
          and lower(coalesce(m.verification_status,'')) like 'verified%') <> 1 then
      raise exception '% lacks exact active verified Mapper engine authority',v_mapper_id;
    end if;

    v_expected_profiles:=case when v_mapper_id='PI-ING-000270' then
      jsonb_build_object('milk_gelato','eligible','chocolate_gelato','eligible')
    else
      jsonb_build_object(
        'milk_gelato','eligible','chocolate_gelato','eligible','sorbet','eligible',
        'vegan_gelato','eligible','protein_gelato','eligible'
      )
    end;

    if (select count(*) from public.mapper_product_behavior_bindings b
        where b.mapper_ingredient_id=v_mapper_id and b.is_current
          and b.classifier_version='canonical-recipe-product-behavior-v1'
          and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
          and not coalesce((b.profile_permissions->>'TOPPING')::boolean,true)
          and b.profile_applicability->>'authorityType'=
            'CANONICAL_RECIPE_PROFILE_ALLOWLIST'
          and b.profile_applicability @> v_expected_profiles) <> 1 then
      raise exception '% Mapper ProductBehavior authority is incomplete',v_mapper_id;
    end if;

    select p.id into v_product_id
    from public.products p
    where p.product_kind='mapper_reference'
      and p.normalized_identity='mapper:'||v_mapper_id
      and p.is_active and p.merged_into_product_id is null;

    if v_product_id is null or
      (select count(*) from public.product_behavior_bindings b
       where b.product_id=v_product_id and b.mapper_ingredient_id=v_mapper_id
         and b.is_current
         and b.classifier_version='canonical-recipe-product-behavior-v1'
         and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
         and not coalesce((b.profile_permissions->>'TOPPING')::boolean,true)
         and b.profile_applicability->>'authorityType'=
           'CANONICAL_RECIPE_PROFILE_ALLOWLIST'
         and b.profile_applicability @> v_expected_profiles) <> 1 then
      raise exception '% canonical ProductBehavior mirror is incomplete',v_mapper_id;
    end if;
  end loop;
end;
$assert_canonical_recipe_product_behavior$;

commit;
