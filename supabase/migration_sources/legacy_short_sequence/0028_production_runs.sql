-- 0028_production_runs.sql
-- PINGÜINO PRO CORE — Production Mode (Track B). Additive, FILE-FIRST — owner applies to staging,
-- never production riwipywgqobrulyzrzad. No remote application here.
--
-- A production run is planned from an EXACT immutable recipe-version (references
-- public.recipe_versions from 0027, never the recipe's mutable latest state). The planned scaled
-- snapshot is IMMUTABLE (insert + select only). Actuals are recorded separately and never replace
-- the plan. Lifecycle events are APPEND-ONLY, which is where post-completion amendments live.
-- Owner-scoped RLS by internal user id (auth.uid()); never email. Does not modify or recreate any
-- existing table.

-- ── production_runs (mutable metadata + status; immutable reproducibility trace) ──
create table if not exists public.production_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.saved_recipes(id) on delete cascade,
  -- the EXACT immutable recipe-version this run was planned from (never "latest")
  recipe_version_id uuid not null references public.recipe_versions(id) on delete restrict,
  recipe_version_number integer not null check (recipe_version_number >= 1),
  status text not null default 'draft'
    check (status in ('draft','planned','in_progress','completed','cancelled')),
  planned_batch_g numeric not null check (planned_batch_g > 0),
  product_profile text,
  temperature_c numeric,
  -- reproducibility trace captured at plan time (frozen)
  engine_version text not null,
  config_version text not null,
  mapper_dataset_version text,
  planned_date date,
  machine text,
  location text,
  batch_reference text,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);
alter table public.production_runs enable row level security;
create index if not exists production_runs_owner_idx on public.production_runs (owner_user_id, created_at desc);
create index if not exists production_runs_recipe_idx on public.production_runs (recipe_id, created_at desc);
create index if not exists production_runs_version_idx on public.production_runs (recipe_version_id);
create index if not exists production_runs_status_idx on public.production_runs (owner_user_id, status);
create policy production_runs_select_own on public.production_runs
  for select using (auth.uid() = owner_user_id);
create policy production_runs_insert_own on public.production_runs
  for insert with check (auth.uid() = owner_user_id);
create policy production_runs_update_own on public.production_runs
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
-- No delete policy/grant: runs are cancelled, never destroyed.
grant select, insert, update on public.production_runs to authenticated;

-- ── production_run_planned_items (IMMUTABLE frozen plan — the exact scaled snapshot) ──
create table if not exists public.production_run_planned_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  line_id text not null,
  name text not null,
  planned_grams numeric not null check (planned_grams >= 0),
  display_grams numeric not null check (display_grams >= 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, line_id)
);
alter table public.production_run_planned_items enable row level security;
create index if not exists production_planned_items_run_idx on public.production_run_planned_items (run_id, position);
-- IMMUTABLE: SELECT + INSERT only — no update/delete policy or grant, so the frozen plan can
-- never be rewritten.
create policy production_planned_items_select_own on public.production_run_planned_items
  for select using (auth.uid() = owner_user_id);
create policy production_planned_items_insert_own on public.production_run_planned_items
  for insert with check (auth.uid() = owner_user_id);
grant select, insert on public.production_run_planned_items to authenticated;

-- ── production_run_actuals (recorded actuals; upsertable while the run is worked) ──
create table if not exists public.production_run_actuals (
  run_id uuid primary key references public.production_runs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- per-ingredient actual weights + substitutions kept as jsonb (never replaces the plan table)
  actual_items jsonb not null default '[]'::jsonb,
  substitutions jsonb not null default '[]'::jsonb,
  actual_total_mix_g numeric check (actual_total_mix_g >= 0),
  actual_yield_g numeric check (actual_yield_g >= 0),
  waste_g numeric check (waste_g >= 0),
  operator_notes text,
  deviation_reason text,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);
alter table public.production_run_actuals enable row level security;
create policy production_actuals_select_own on public.production_run_actuals
  for select using (auth.uid() = owner_user_id);
create policy production_actuals_insert_own on public.production_run_actuals
  for insert with check (auth.uid() = owner_user_id);
create policy production_actuals_update_own on public.production_run_actuals
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
grant select, insert, update on public.production_run_actuals to authenticated;

-- ── production_run_events (APPEND-ONLY history — lifecycle + post-completion amendments) ──
create table if not exists public.production_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('created','planned','started','actual_recorded','completed','cancelled','amended','note_added')),
  detail text,
  amendment jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.production_run_events enable row level security;
create index if not exists production_events_run_idx on public.production_run_events (run_id, created_at);
-- APPEND-ONLY: SELECT + INSERT only — no update/delete policy or grant, so completed history can
-- never be silently rewritten.
create policy production_events_select_own on public.production_run_events
  for select using (auth.uid() = owner_user_id);
create policy production_events_insert_own on public.production_run_events
  for insert with check (auth.uid() = owner_user_id);
grant select, insert on public.production_run_events to authenticated;

-- No grants to anon anywhere. No delete on any table. No inventory / product / mapper table is
-- touched — Production Mode records what was made; it never claims stock was consumed.
