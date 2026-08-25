-- Production Rescue changes only the frozen Base vector. Toppings remain
-- byte-identical and are produced later, so a stale topping behavior snapshot
-- must not prevent a hard-safe Base decision that does not touch that topping.

create or replace function public.assert_production_rescue_behavior_authority_v1(
  p_recipe_input jsonb,
  p_product_composition jsonb
) returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_recipe_behavior_authority_v1(
    p_recipe_input,
    jsonb_set(
      coalesce(p_product_composition, '{}'::jsonb),
      '{toppings}',
      '[]'::jsonb,
      true
    ),
    'BATCH_RESCUE'
  );
end;
$$;

revoke all on function public.assert_production_rescue_behavior_authority_v1(jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- Keep the established transactional authorization/consumption functions and
-- replace only their behavior-authority call. Anchor checks fail closed if a
-- future migration has changed either function unexpectedly.
do $patch_production_rescue_behavior_scope$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
  v_old text := $old$perform public.assert_recipe_behavior_authority_v1(
    p_recipe_input, p_product_composition, 'BATCH_RESCUE'
  );$old$;
  v_new text := $new$perform public.assert_production_rescue_behavior_authority_v1(
    p_recipe_input, p_product_composition
  );$new$;
begin
  foreach v_signature in array array[
    'public.production_create_rescue_authorization_v1(uuid,uuid,uuid,uuid,text,integer,integer,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,text,jsonb,timestamptz,timestamptz,text)'::regprocedure,
    'public.production_apply_rescue_v1(uuid,integer,integer,jsonb,jsonb,uuid)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if strpos(v_definition, v_old) = 0 then
      raise exception 'Production Rescue behavior-scope anchor drifted for %', v_signature;
    end if;
    v_patched := replace(v_definition, v_old, v_new);
    execute v_patched;
  end loop;
end;
$patch_production_rescue_behavior_scope$;

