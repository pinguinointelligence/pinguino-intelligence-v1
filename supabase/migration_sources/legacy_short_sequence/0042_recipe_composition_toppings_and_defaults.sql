-- Product-layer Base/Topping composition. Base Engine recipe_input remains unchanged.
alter table public.saved_recipes
  add column if not exists product_composition jsonb;

alter table public.recipe_versions
  add column if not exists product_composition jsonb;

alter table public.saved_recipes
  drop constraint if exists saved_recipes_product_composition_v1;
alter table public.saved_recipes
  add constraint saved_recipes_product_composition_v1 check (
    product_composition is null or ((
      product_composition->>'schemaVersion' = '1'
      and product_composition->>'baseScope' = 'BASE_FORMULATION'
      and jsonb_typeof(product_composition->'baseOrder') = 'array'
      and jsonb_typeof(product_composition->'toppings') = 'array'
      and jsonb_typeof(product_composition->'migrationAmbiguities') = 'array'
    ) is true)
  );

alter table public.recipe_versions
  drop constraint if exists recipe_versions_product_composition_v1;
alter table public.recipe_versions
  add constraint recipe_versions_product_composition_v1 check (
    product_composition is null or ((
      product_composition->>'schemaVersion' = '1'
      and product_composition->>'baseScope' = 'BASE_FORMULATION'
      and jsonb_typeof(product_composition->'baseOrder') = 'array'
      and jsonb_typeof(product_composition->'toppings') = 'array'
      and jsonb_typeof(product_composition->'migrationAmbiguities') = 'array'
    ) is true)
  );

-- Account-owned per-product defaults. No anonymous access; no cross-owner sharing.
create table if not exists public.user_recipe_defaults (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  product_context_key text not null check (product_context_key in ('gelato', 'sorbet', 'vegan', 'protein')),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, product_context_key)
);
alter table public.user_recipe_defaults enable row level security;
drop policy if exists user_recipe_defaults_select_own on public.user_recipe_defaults;
drop policy if exists user_recipe_defaults_insert_own on public.user_recipe_defaults;
drop policy if exists user_recipe_defaults_update_own on public.user_recipe_defaults;
drop policy if exists user_recipe_defaults_delete_own on public.user_recipe_defaults;
create policy user_recipe_defaults_select_own on public.user_recipe_defaults
  for select using (auth.uid() = owner_user_id);
create policy user_recipe_defaults_insert_own on public.user_recipe_defaults
  for insert with check (auth.uid() = owner_user_id);
create policy user_recipe_defaults_update_own on public.user_recipe_defaults
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy user_recipe_defaults_delete_own on public.user_recipe_defaults
  for delete using (auth.uid() = owner_user_id);
drop trigger if exists user_recipe_defaults_touch_updated_at on public.user_recipe_defaults;
create trigger user_recipe_defaults_touch_updated_at
  before update on public.user_recipe_defaults
  for each row execute function public.touch_updated_at();
revoke all on public.user_recipe_defaults from public, anon;
grant select, insert, update, delete on public.user_recipe_defaults to authenticated;

-- Frozen production plan gains an explicit scope and independent display position.
alter table public.production_run_planned_items
  add column if not exists process_scope text not null default 'BASE_FORMULATION'
    check (process_scope in ('BASE_FORMULATION', 'POST_PROCESS_ADDON')),
  add column if not exists canonical_ingredient_id text,
  add column if not exists scope_position integer not null default 0 check (scope_position >= 0);

create unique index if not exists production_plan_scope_canonical_unique
  on public.production_run_planned_items (run_id, process_scope, canonical_ingredient_id)
  where canonical_ingredient_id is not null;

-- Transactional v1 save with the product sidecar. SECURITY INVOKER keeps all RLS active.
-- Retire the pre-sidecar overload so PostgREST cannot route old clients around
-- the atomic composition snapshot.
drop function if exists public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text
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
  p_product_composition jsonb default null
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
     engine_version, config_version, batch_grams)
  values
    (v_uid, p_name, p_description, p_recipe_input, p_product_composition, p_product_profile,
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
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb
) from public, anon;
grant execute on function public.create_recipe_with_v1(
  text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text, jsonb
) to authenticated;
