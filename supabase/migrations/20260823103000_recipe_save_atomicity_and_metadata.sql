-- PINGÜINO v1.4 — recipe save contract: atomic version append + honest library metadata.
--
-- Two defects this closes, both proven on staging 2026-08-23:
--
--  (1) LIBRARY METADATA WAS NEVER WRITTEN. The canonical save path passed p_product_profile => null
--      and never touched saved_recipes.serving_profile / active_engine_label, so every saved recipe
--      read TYP „—", TRYB „—" and SILNIK „−11°C Engine" (migration 0001's column default) — even a
--      −12°C Protein save. The client now derives all four from the persisted recipe_input; this
--      migration gives create_recipe_with_v1 the two parameters it was missing so the FIRST save is
--      honest too, inside the same transaction.
--
--  (2) APPENDING v2+ WAS NOT ATOMIC. saveNewVersion did: read history → INSERT recipe_versions →
--      UPDATE saved_recipes → UPDATE saved_recipe_meta, as four separate client round-trips. A
--      failure after the INSERT left immutable history ahead of the aggregate the library reads,
--      and two concurrent writers could read the same max(version_number). append_recipe_version_v1
--      locks the parent row, derives the next number server-side and writes version + aggregate in
--      ONE transaction: no partial save, no duplicate vN, no renumbering.
--
-- SECURITY INVOKER throughout — RLS still decides ownership, exactly as migration 0036.

-- ── (1) first save writes the library columns ───────────────────────────────────────────────────
-- Retire the pre-v1.4 overload so PostgREST cannot route an old client around the honest columns.
drop function if exists public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb
);

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
  p_note text default null,
  p_product_composition jsonb default null,
  p_serving_profile text default null,
  p_active_engine_label text default null
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
  insert into public.saved_recipes
    (user_id, name, description, recipe_input, product_composition, product_type,
     serving_profile, active_engine_label, engine_version, config_version, batch_grams)
  values
    (v_uid, p_name, p_description, p_recipe_input, p_product_composition, p_product_profile,
     p_serving_profile,
     coalesce(nullif(p_active_engine_label, ''), '−11°C Engine'),
     p_engine_version, p_config_version, p_batch_grams)
  returning * into v_recipe;
  insert into public.saved_recipe_meta
    (recipe_id, owner_user_id, workspace_id, archived, latest_version_number)
  values (v_recipe.id, v_uid, null, false, 1)
  returning * into v_meta;
  insert into public.recipe_versions
    (recipe_id, owner_user_id, version_number, recipe_input, product_composition,
     total_batch_g, product_profile, temperature_c, engine_version, config_version,
     mapper_dataset_version, source, created_by, restored_from_version, note)
  values
    (v_recipe.id, v_uid, 1, p_recipe_input, p_product_composition,
     p_total_batch_g, p_product_profile, p_temperature_c, p_engine_version, p_config_version,
     p_mapper_dataset_version, p_source, v_uid, null, p_note)
  returning * into v_version;
  return jsonb_build_object('recipe', to_jsonb(v_recipe), 'meta', to_jsonb(v_meta), 'version', to_jsonb(v_version));
end;
$$;

revoke all on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb, text, text
) from public, anon;
grant execute on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb, text, text
) to authenticated;

-- ── (2) atomic append of v2+ (and of a restore) ─────────────────────────────────────────────────
create or replace function public.append_recipe_version_v1(
  p_recipe_id uuid,
  p_recipe_input jsonb,
  p_total_batch_g numeric,
  p_batch_grams integer,
  p_engine_version text,
  p_config_version text,
  p_product_composition jsonb default null,
  p_product_profile text default null,
  p_temperature_c numeric default null,
  p_mapper_dataset_version text default null,
  p_source text default 'manual',
  p_note text default null,
  p_restored_from_version integer default null,
  p_serving_profile text default null,
  p_active_engine_label text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_next integer;
  v_version public.recipe_versions;
begin
  if v_uid is null then
    raise exception 'You must be signed in to save recipes.' using errcode = '42501';
  end if;

  -- Serialize concurrent appends for THIS recipe. RLS on saved_recipes already restricts the row to
  -- its owner, so a lock is only ever taken on a recipe the caller may write.
  perform 1 from public.saved_recipes where id = p_recipe_id for update;
  if not found then
    raise exception 'unknown recipe %', p_recipe_id using errcode = 'P0002';
  end if;

  select owner_user_id into v_owner from public.saved_recipe_meta where recipe_id = p_recipe_id;
  if v_owner is null then
    raise exception 'unknown recipe %', p_recipe_id using errcode = 'P0002';
  end if;

  -- DB-derived under the lock: gap-free, duplicate-free, never renumbered.
  select coalesce(max(version_number), 0) + 1 into v_next
  from public.recipe_versions where recipe_id = p_recipe_id;

  insert into public.recipe_versions
    (recipe_id, owner_user_id, version_number, recipe_input, product_composition,
     total_batch_g, product_profile, temperature_c, engine_version, config_version,
     mapper_dataset_version, source, created_by, restored_from_version, note)
  values
    (p_recipe_id, v_owner, v_next, p_recipe_input, p_product_composition,
     p_total_batch_g, p_product_profile, p_temperature_c, p_engine_version, p_config_version,
     p_mapper_dataset_version, p_source, v_uid, p_restored_from_version, p_note)
  returning * into v_version;

  -- The aggregate advances in the SAME transaction as the version it points at.
  update public.saved_recipes set
    recipe_input = p_recipe_input,
    product_composition = p_product_composition,
    batch_grams = p_batch_grams,
    product_type = coalesce(p_product_profile, product_type),
    serving_profile = coalesce(p_serving_profile, serving_profile),
    active_engine_label = coalesce(nullif(p_active_engine_label, ''), active_engine_label),
    engine_version = p_engine_version,
    config_version = p_config_version,
    updated_at = now()
  where id = p_recipe_id;

  update public.saved_recipe_meta set
    latest_version_number = v_next,
    updated_at = now()
  where recipe_id = p_recipe_id;

  return to_jsonb(v_version);
end;
$$;

revoke all on function public.append_recipe_version_v1(
  uuid, jsonb, numeric, integer, text, text, jsonb, text, numeric, text, text, text, integer, text, text
) from public, anon;
grant execute on function public.append_recipe_version_v1(
  uuid, jsonb, numeric, integer, text, text, jsonb, text, numeric, text, text, text, integer, text, text
) to authenticated;
