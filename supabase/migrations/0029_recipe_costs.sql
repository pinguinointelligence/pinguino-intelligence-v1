-- 0029_recipe_costs.sql
-- PINGÜINO PRO CORE — ingredient costs + immutable cost snapshots (Track C). Additive, FILE-FIRST
-- — owner applies to staging, never production riwipywgqobrulyzrzad. No remote application here.
--
-- ingredient_cost_entries: the owner's personal price list (owner-scoped CRUD). A cost is the
-- user's own purchase data; currencies are never converted and VAT is never guessed.
-- recipe_cost_snapshots: IMMUTABLE (insert + select only) — a later price change produces a NEW
-- snapshot; the historical one is frozen. Owner-scoped RLS by auth.uid() (never email). Touches no
-- existing table.

-- ── ingredient_cost_entries (owner's price list) ─────────────────────────────
create table if not exists public.ingredient_cost_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- the ingredient this price is for (engine/catalog id; text so engine + catalog ids both fit)
  ingredient_id text not null,
  ingredient_name text not null,
  supplier text,
  purchase_quantity numeric not null check (purchase_quantity > 0),
  purchase_unit text not null check (purchase_unit in ('g','kg','ml','l','unit','package')),
  -- explicit conversion inputs — a volume/unit purchase is uncostable without them (never assumed)
  density_g_per_ml numeric check (density_g_per_ml >= 0),
  unit_weight_g numeric check (unit_weight_g >= 0),
  units_per_package numeric check (units_per_package >= 0),
  price numeric not null check (price >= 0),
  -- ISO 4217, uppercase; never converted to another currency
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_includes_tax boolean not null default false,
  -- explicit VAT rate; null = unknown (never guessed)
  tax_rate_percent numeric check (tax_rate_percent >= 0),
  effective_from date not null,
  expires_at date,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.ingredient_cost_entries enable row level security;
create index if not exists cost_entries_owner_idx on public.ingredient_cost_entries (owner_user_id, ingredient_id, effective_from desc);
create policy cost_entries_select_own on public.ingredient_cost_entries
  for select using (auth.uid() = owner_user_id);
create policy cost_entries_insert_own on public.ingredient_cost_entries
  for insert with check (auth.uid() = owner_user_id);
create policy cost_entries_update_own on public.ingredient_cost_entries
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy cost_entries_delete_own on public.ingredient_cost_entries
  for delete using (auth.uid() = owner_user_id);
grant select, insert, update, delete on public.ingredient_cost_entries to authenticated;

-- ── recipe_cost_snapshots (IMMUTABLE frozen cost at a point in time) ───────────
create table if not exists public.recipe_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.saved_recipes(id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete restrict,
  -- set when the snapshot is for a specific production run
  production_run_id uuid references public.production_runs(id) on delete set null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  basis text not null check (basis in ('net','gross')),
  -- frozen per-line costs (ingredient, grams, cost_per_kg, line_cost, state)
  lines jsonb not null,
  total_cost numeric,
  cost_per_kg numeric,
  complete boolean not null,
  missing_ingredient_ids jsonb not null default '[]'::jsonb,
  engine_version text not null,
  config_version text not null,
  resolved_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.recipe_cost_snapshots enable row level security;
create index if not exists cost_snapshots_owner_idx on public.recipe_cost_snapshots (owner_user_id, recipe_id, created_at desc);
create index if not exists cost_snapshots_version_idx on public.recipe_cost_snapshots (recipe_version_id);
-- IMMUTABLE: SELECT + INSERT only — no update/delete policy or grant, so a historical cost can
-- never be silently rewritten when the current price changes.
create policy cost_snapshots_select_own on public.recipe_cost_snapshots
  for select using (auth.uid() = owner_user_id);
create policy cost_snapshots_insert_own on public.recipe_cost_snapshots
  for insert with check (auth.uid() = owner_user_id);
grant select, insert on public.recipe_cost_snapshots to authenticated;

-- No grants to anon. No update/delete on recipe_cost_snapshots. Currencies are never converted and
-- VAT is never inferred — those are explicit fields, absent = unknown.
