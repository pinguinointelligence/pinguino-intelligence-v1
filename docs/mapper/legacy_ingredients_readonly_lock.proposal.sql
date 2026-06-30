-- ============================================================================
-- PROPOSAL — NOT APPLIED. This file lives under docs/ (NOT supabase/migrations/),
-- so the migration runner never picks it up. A human stages it as a real,
-- reviewed migration only after confirming no external / Edge Function / backup
-- job reads public.ingredients.
--
-- Purpose: make the orphaned, superseded pre-v0.95 `public.ingredients` table
-- explicitly READ-ONLY. This is the SAFE, NON-DESTRUCTIVE first step:
--   * no DROP, no column removal, no data loss
--   * reversible (re-grant / edit the comment)
-- The destructive options (drop npac_value column, drop/rename the table) are a
-- SEPARATE gated migration — see LEGACY_INGREDIENTS_CLEANUP_PLAN.md (options 2/4).
--
-- Verified state 2026-06-30: 542 rows, 67 columns incl. npac_value, 1 RLS policy,
-- ZERO code references (`.from('ingredients')` not found in src/). The active
-- pipeline uses public.mapper_basement and is npac-free.
-- ============================================================================

-- 1. Mark the table deprecated (documentation only; fully reversible).
comment on table public.ingredients is
  'DEPRECATED (pre-v0.95). Superseded by public.mapper_basement. READ-ONLY — do not write. '
  'Sole remaining npac_value carrier; inert (no grants, no code path, not in the active engine pipeline).';

-- 2. Defense-in-depth: ensure no write privileges remain for app roles.
--    (The app already has no grants here; this makes the intent explicit + reversible.)
revoke insert, update, delete, truncate on public.ingredients from anon, authenticated;

-- 3. (Optional, review first) If a SELECT grant exists and writes must also be
--    blocked at the row level, replace any write policy with a SELECT-only policy.
--    Left commented because it depends on the current policy set:
-- -- drop policy if exists <existing_write_policy> on public.ingredients;
-- -- create policy ingredients_readonly on public.ingredients for select using (true);

-- ============================================================================
-- DO NOT add a DROP TABLE / DROP COLUMN / ALTER ... DROP here. Those are
-- destructive and require an explicit, separately-approved migration with a
-- verified export/backup of the 542 rows first.
-- ============================================================================
