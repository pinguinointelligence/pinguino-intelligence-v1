-- ProductBehavior terminal authority follows physical positive presence.
-- Historical zero-gram recipe lines stay immutable and readable, but they do
-- not represent a product used by Save, Production, Label, or Rescue.

alter function public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)
  rename to assert_recipe_behavior_authority_all_lines_v1;

revoke all on function public.assert_recipe_behavior_authority_all_lines_v1(jsonb,jsonb,text)
  from public,anon,authenticated,service_role;

create or replace function public.assert_recipe_behavior_authority_v1(
  p_recipe_input jsonb,
  p_product_composition jsonb,
  p_module text
) returns void
language plpgsql security definer stable
set search_path=public,extensions
as $$
declare
  v_present_recipe jsonb;
  v_present_composition jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_recipe_input)<>'object'
    or jsonb_typeof(coalesce(p_recipe_input->'items','null'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_product_composition,'{}'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_product_composition->'toppings','[]'::jsonb))<>'array' then
    raise exception 'invalid recipe authority payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_recipe_input->'items') item
    where coalesce(jsonb_typeof(item->'planned_grams'),'missing')<>'number'
      or coalesce(jsonb_typeof(item->'actual_grams'),'missing') not in ('number','null')
      or (item->>'planned_grams')::numeric<0
      or (jsonb_typeof(item->'actual_grams')='number'
        and (item->>'actual_grams')::numeric<0)
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(p_product_composition->'toppings','[]'::jsonb)) item
    where coalesce(jsonb_typeof(item->'planned_grams'),'missing')<>'number'
      or coalesce(jsonb_typeof(item->'actual_grams'),'missing') not in ('number','null')
      or (item->>'planned_grams')::numeric<0
      or (jsonb_typeof(item->'actual_grams')='number'
        and (item->>'actual_grams')::numeric<0)
  ) then
    raise exception 'invalid recipe authority mass';
  end if;

  select jsonb_set(
    p_recipe_input,
    '{items}',
    coalesce(jsonb_agg(item order by ordinal)
      filter (where coalesce(
        nullif(item->>'actual_grams','')::numeric,
        (item->>'planned_grams')::numeric
      )>0),'[]'::jsonb),
    true
  ) into v_present_recipe
  from jsonb_array_elements(p_recipe_input->'items') with ordinality rows(item,ordinal);

  select jsonb_set(
    coalesce(p_product_composition,'{}'::jsonb),
    '{toppings}',
    coalesce(jsonb_agg(item order by ordinal)
      filter (where coalesce(
        nullif(item->>'actual_grams','')::numeric,
        (item->>'planned_grams')::numeric
      )>0),'[]'::jsonb),
    true
  ) into v_present_composition
  from jsonb_array_elements(
    coalesce(p_product_composition->'toppings','[]'::jsonb)
  ) with ordinality rows(item,ordinal);

  perform public.assert_recipe_behavior_authority_all_lines_v1(
    v_present_recipe,
    v_present_composition,
    p_module
  );
end $$;

revoke all on function public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
