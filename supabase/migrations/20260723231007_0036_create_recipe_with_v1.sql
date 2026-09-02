-- 0036_create_recipe_with_v1.sql
-- PINGÜINO PRO CORE — TRANSACTIONAL first save (AGENT E / E1). Additive only; touches no table,
-- no data, no existing policy. SECURITY INVOKER: RLS from migrations 0001/0027 still applies;
-- owner id derived from auth.uid(), never from a parameter. EXECUTE: authenticated only.

create or replace function public.create_recipe_with_v1(
  p_name text,
  p_description text,
  p_recipe_input jsonb,
  p_batch_grams integer,
  p_total_batch_g numeric,
  p_engine_version text,
  p_config_version text,
  p_mapper_dataset_version text default null,
  p_product_profile text default null,
  p_temperature_c numeric default null,
  p_source text default 'manual',
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recipe public.saved_recipes;
  v_meta public.saved_recipe_meta;
  v_version public.recipe_versions;
begin
  if v_uid is null then
    raise exception 'You must be signed in to save recipes.' using errcode = '42501';
  end if;

  -- 1) the mutable recipe row (legacy source of truth, migration 0001).
  insert into public.saved_recipes
    (user_id, name, description, recipe_input, product_type,
     engine_version, config_version, batch_grams)
  values
    (v_uid, p_name, p_description, p_recipe_input, p_product_profile,
     p_engine_version, p_config_version, p_batch_grams)
  returning * into v_recipe;

  -- 2) the 1:1 aggregate meta (archive flag + latest pointer, migration 0027).
  insert into public.saved_recipe_meta
    (recipe_id, owner_user_id, workspace_id, archived, latest_version_number)
  values
    (v_recipe.id, v_uid, null, false, 1)
  returning * into v_meta;

  -- 3) the first immutable version (append-only history, migration 0027).
  insert into public.recipe_versions
    (recipe_id, owner_user_id, version_number, recipe_input, total_batch_g,
     product_profile, temperature_c, engine_version, config_version,
     mapper_dataset_version, source, created_by, restored_from_version, note)
  values
    (v_recipe.id, v_uid, 1, p_recipe_input, p_total_batch_g,
     p_product_profile, p_temperature_c, p_engine_version, p_config_version,
     p_mapper_dataset_version, p_source, v_uid, null, p_note)
  returning * into v_version;

  -- Any failure above aborts the WHOLE function call — no orphan row can survive.
  return jsonb_build_object(
    'recipe',  to_jsonb(v_recipe),
    'meta',    to_jsonb(v_meta),
    'version', to_jsonb(v_version)
  );
end;
$$;

revoke all on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text
) from public, anon;
grant execute on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text
) to authenticated;;
