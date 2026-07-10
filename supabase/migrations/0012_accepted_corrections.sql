-- ============================================================================
-- Migration 0012 — accepted_corrections (Spine Slice 24, LIVE)
-- ============================================================================
-- The FIRST write path for accepted optimizer corrections. Copied from the
-- approved proposal docs/spine/proposals/accepted_corrections_table.proposal.sql
-- UNCHANGED except this header, per the locked owner decisions A–I
-- (docs/spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md §0, 2026-07-10):
-- separate immutable audit table; Pro-only at the service/client layer for v1
-- (decision F — an Edge-Function-mediated insert is REQUIRED hardening before
-- wider production scale); owner-scoped RLS; write-once (no update policy or
-- grant); owner delete allowed; both recipe snapshots stored verbatim; target
-- modes engine_seeded/regulator_shadow; never touches Mapper/product tables.
--
-- Design notes (mirrors the proven saved_recipes pattern from 0001):
--  * snapshots are the record: original + corrected recipe_input jsonb are
--    stored VERBATIM. saved_recipes rows are NEVER mutated by a correction —
--    an accepted correction is a separate, immutable audit record.
--  * ownership: user_id references auth.users; every policy is
--    auth.uid() = user_id. Frontend uses the anon key + user JWT only — no
--    privileged server role.
--  * immutability as audit strategy: there is NO update policy — a correction
--    record is write-once (insert), readable and deletable by its owner only.
--    Corrections are provenance-stamped (engine/config version, schema_version,
--    target_mode, source_recipe_hash) so any later drift is detectable.
--  * no Mapper coupling: nothing here touches the products table, the Mapper
--    basement table, product PAC/POD values, or lifecycle statuses.
-- ============================================================================

-- ── accepted_corrections ────────────────────────────────────────────────────
create table if not exists public.accepted_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- optional link to a saved recipe; corrections for unsaved recipes carry
  -- their full snapshot instead. If the saved recipe is deleted, the
  -- correction record survives as a standalone snapshot (set null).
  recipe_id uuid references public.saved_recipes (id) on delete set null,

  schema_version text not null default '1',
  source_recipe_hash text not null,              -- FNV-1a hex of original_recipe_snapshot (drift detection)
  original_recipe_snapshot jsonb not null,       -- RecipeInput at accept time (verbatim)
  corrected_recipe_snapshot jsonb not null,      -- solver-corrected RecipeInput (verbatim, hypothetical)

  optimizer_decision text not null
    check (optimizer_decision in ('optimized', 'tradeoff')),  -- only real, verified outcomes
  correction_actions jsonb not null,             -- [{type, ingredient, grams}] — exact gram actions
  before_metrics jsonb not null,                 -- BaseEngineMetrics before
  after_metrics jsonb not null,                  -- BaseEngineMetrics after the rerun
  target_mode text not null
    check (target_mode in ('engine_seeded', 'regulator_shadow')),
  product_profile text not null,
  serving_temperature_c numeric not null,
  warnings jsonb not null default '[]'::jsonb,
  trace jsonb not null,                          -- {rerunState, improvementDetected, injectedMetrics, regulatorProfile}

  engine_version text not null,                  -- provenance (same convention as saved_recipes)
  config_version text not null,

  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  -- creator must be the owner (also enforced by RLS with check below)
  constraint accepted_corrections_creator_is_owner check (created_by = user_id)
);

-- ── indexes ─────────────────────────────────────────────────────────────────
create index if not exists accepted_corrections_user_id_idx
  on public.accepted_corrections (user_id);
create index if not exists accepted_corrections_recipe_id_idx
  on public.accepted_corrections (recipe_id);
create index if not exists accepted_corrections_created_at_idx
  on public.accepted_corrections (created_at desc);

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.accepted_corrections enable row level security;

-- select: only your own correction records
create policy accepted_corrections_select_own on public.accepted_corrections
  for select using (auth.uid() = user_id);

-- insert: only as yourself, and only records you own
create policy accepted_corrections_insert_own on public.accepted_corrections
  for insert with check (auth.uid() = user_id and auth.uid() = created_by);

-- update: NO POLICY ON PURPOSE — accepted corrections are immutable audit
-- records. With RLS enabled and no update policy, updates are denied for
-- everyone (write-once). Revisions are new inserts.

-- delete: an owner may remove their own record (GDPR-style ownership)
create policy accepted_corrections_delete_own on public.accepted_corrections
  for delete using (auth.uid() = user_id);

-- ── grants (mirror 0002's pattern for authenticated users) ──────────────────
grant select, insert, delete on table public.accepted_corrections to authenticated;
-- note: NO update grant, and nothing for anon - demo sessions can never write.

-- ============================================================================
-- ROLLBACK PLAN (not applied — the paired down-migration, kept as comments)
-- ============================================================================
-- The table is self-contained (no other table references it), so rollback is a
-- clean drop; saved_recipes and all other data are untouched:
--
--   drop policy if exists accepted_corrections_select_own on public.accepted_corrections;
--   drop policy if exists accepted_corrections_insert_own on public.accepted_corrections;
--   drop policy if exists accepted_corrections_delete_own on public.accepted_corrections;
--   drop index if exists accepted_corrections_user_id_idx;
--   drop index if exists accepted_corrections_recipe_id_idx;
--   drop index if exists accepted_corrections_created_at_idx;
--   drop table if exists public.accepted_corrections;
-- ============================================================================
