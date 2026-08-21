-- Owner-approved Sorbet Multi-Main compatibility for the three already
-- published exact 60% identities. This does not classify any neighbouring
-- Mapper row and does not modify mapper_basement or recipe/customer data.
--
-- The resolver projects multiMainGroupKey as the shared policy id and
-- multiMainHardLimitPercent as the aggregate ceiling. Consequently a group is
-- executable only when every member resolves one of these exact policies;
-- unknown or mixed-authority groups continue to fail closed.

update public.product_behavior_policy_versions
set evidence = evidence || jsonb_build_object(
  'multiMainGroupKey', 'main-sorbet-exact-fruit-60-v1',
  'multiMainHardLimitPercent', 60,
  'multiMainTargetPercent', 60,
  'multiMainRatioPolicy', 'preserve_user_selected_ratio',
  'multiMainAuthority', 'owner-approved'
)
where status = 'published'
  and product_profile = 'sorbet'
  and (policy_key, exact_mapper_ingredient_id) in (
    ('main-sorbet-strawberry-fresh-1553', 'PI-ING-001553'),
    ('main-sorbet-lime-fresh-0369', 'PI-ING-000369'),
    ('main-sorbet-mango-puree-0340', 'PI-ING-000340')
  )
  and eco_floor_percent = 60
  and optimal_ceiling_percent = 60
  and hard_limit_percent = 60
  and equivalent_factor = 1;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.product_behavior_policy_versions
  where status = 'published'
    and product_profile = 'sorbet'
    and evidence->>'multiMainGroupKey' = 'main-sorbet-exact-fruit-60-v1'
    and (evidence->>'multiMainHardLimitPercent')::numeric = 60
    and exact_mapper_ingredient_id in ('PI-ING-001553', 'PI-ING-000369', 'PI-ING-000340');

  if v_count <> 3 then
    raise exception 'Sorbet Multi-Main authority expected 3 exact policies, found %', v_count;
  end if;
end;
$$;
