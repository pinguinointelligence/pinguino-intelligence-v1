-- OD-24 (Owner 19.09.2026) — HOME gets a DURABLE production run without being made to
-- save its recipe to the library first.
--
-- The architecture of `production_runs` is deliberately UNTOUCHED: `recipe_id` and
-- `recipe_version_id` stay NOT NULL, there is no second run model and no JSON-only path.
-- What changes is one word on `saved_recipes`: whether a row is the customer's library
-- recipe or a technical snapshot that exists only so a run can point at an immutable
-- version.
--
-- Why a column and not a table: every consumer of a run — exact resume, history, labels,
-- Rescue, repeat batch, the audit trail — already resolves a recipe through
-- `saved_recipes` + `recipe_versions`. A parallel table would have to be taught to all of
-- them, which is precisely the second model this decision forbids.
--
-- NON-DESTRUCTIVE: the column defaults to 'library', so every existing row keeps exactly
-- the meaning it has today. No data is rewritten.

-- ── (1) whose kind of row is this ───────────────────────────────────────────────────────
alter table public.saved_recipes
  add column if not exists origin text not null default 'library';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'saved_recipes_origin_check'
  ) then
    alter table public.saved_recipes
      add constraint saved_recipes_origin_check
      check (origin in ('library', 'production_snapshot'));
  end if;
end;
$$;

comment on column public.saved_recipes.origin is
  'library = the customer''s own saved recipe, shown in „Receptury → Moje" and counted '
  'against any saved-recipe limit. production_snapshot = a technical, hidden snapshot '
  'created when a HOME batch needs a durable run; never listed as a recipe, never counted '
  'against the limit, and never deleted to make room (a run''s snapshot is a historical '
  'document — OD-24 §6).';

-- The library reads one owner's `library` rows; production history resolves snapshots by id.
create index if not exists saved_recipes_user_origin_idx
  on public.saved_recipes (user_id, origin);

-- ── (2) the SAME atomic recipe+v1 door, told which kind it is writing ───────────────────
-- Appending a defaulted parameter keeps every existing caller working unchanged; the old
-- exact signature is dropped so PostgREST cannot route a stale client around the column.
drop function if exists public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb, text, text
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
  p_active_engine_label text default null,
  p_origin text default 'library'
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
  if p_origin not in ('library', 'production_snapshot') then
    raise exception 'Unknown saved recipe origin: %', p_origin using errcode = '22023';
  end if;
  insert into public.saved_recipes
    (user_id, name, description, recipe_input, product_composition, product_type,
     serving_profile, active_engine_label, engine_version, config_version, batch_grams, origin)
  values
    (v_uid, p_name, p_description, p_recipe_input, p_product_composition, p_product_profile,
     p_serving_profile,
     coalesce(nullif(p_active_engine_label, ''), '−11°C Engine'),
     p_engine_version, p_config_version, p_batch_grams, p_origin)
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
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb, text, text, text
) from public, anon;
grant execute on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb, text, text, text
) to authenticated;
