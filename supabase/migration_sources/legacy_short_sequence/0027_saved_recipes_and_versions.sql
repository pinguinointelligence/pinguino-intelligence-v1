-- 0027_saved_recipes_and_versions.sql
-- PINGÜINO PRO CORE — immutable recipe versions (additive, FILE-FIRST — owner applies to
-- staging, never production riwipywgqobrulyzrzad).
--
-- EXTENDS the existing public.saved_recipes (migration 0001, recipe_input = source of truth);
-- it does NOT modify or recreate it. Adds the immutable version history + a 1:1 meta row for
-- archive/latest-pointer. Owner-scoped RLS by internal user id (never email); versions are
-- immutable (insert + select only); no remote application here.

-- ── saved_recipe_meta (1:1 extension of saved_recipes: archive + latest pointer) ──
create table if not exists public.saved_recipe_meta (
  recipe_id uuid primary key references public.saved_recipes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- reserved for the second-stage Workspace sharing model; null for personal recipes
  workspace_id uuid,
  archived boolean not null default false,
  latest_version_number integer not null default 1 check (latest_version_number >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.saved_recipe_meta enable row level security;
create index if not exists saved_recipe_meta_owner_idx on public.saved_recipe_meta (owner_user_id);
create policy saved_recipe_meta_select_own on public.saved_recipe_meta
  for select using (auth.uid() = owner_user_id);
create policy saved_recipe_meta_insert_own on public.saved_recipe_meta
  for insert with check (auth.uid() = owner_user_id);
create policy saved_recipe_meta_update_own on public.saved_recipe_meta
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
grant select, insert, update on public.saved_recipe_meta to authenticated;

-- ── recipe_versions (IMMUTABLE snapshots — the edit history) ──────────────────
create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.saved_recipes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  -- the engine source of truth (results are recomputed from it, never stored stale)
  recipe_input jsonb not null,
  total_batch_g numeric not null check (total_batch_g > 0),
  product_profile text,
  temperature_c numeric,
  -- reproducibility trace captured at save time
  engine_version text not null,
  config_version text not null,
  mapper_dataset_version text,
  source text not null check (source in ('manual','starter_draft','optimizer_correction','restored','imported')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  -- when source = 'restored', the version this snapshot was derived from
  restored_from_version integer,
  note text,
  unique (recipe_id, version_number)
);
alter table public.recipe_versions enable row level security;
create index if not exists recipe_versions_recipe_idx on public.recipe_versions (recipe_id, version_number desc);
create index if not exists recipe_versions_owner_idx on public.recipe_versions (owner_user_id);
-- Owner reads + appends their own versions. IMMUTABLE: SELECT + INSERT only — no update/delete
-- policy or grant anywhere, so an earlier version can never be rewritten or removed.
create policy recipe_versions_select_own on public.recipe_versions
  for select using (auth.uid() = owner_user_id);
create policy recipe_versions_insert_own on public.recipe_versions
  for insert with check (auth.uid() = owner_user_id);
grant select, insert on public.recipe_versions to authenticated;

-- No grants to anon. No update/delete on recipe_versions. saved_recipes (0001) is unchanged.
