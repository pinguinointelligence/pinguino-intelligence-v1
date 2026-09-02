-- SECURITY HOTFIX — the Mapper search views are READ MODELS, so make the live
-- privileges say so. Owner-approved 2026-09-02.
--
-- WHAT WAS WRONG
-- `mapper_basement_search` and `mapper_basement_search_demo` are both
-- `security_invoker=false` views owned by `postgres`, so they execute with the OWNER's
-- rights and do NOT apply `mapper_basement`'s row-level security. Live, both carried
-- `arwdDxtm` (ALL) for browser roles:
--
--   mapper_basement_search        authenticated = ALL
--   mapper_basement_search_demo   anon = ALL, authenticated = ALL
--
-- Proven with real anonymous REST calls against the shared project: an INSERT straight
-- into `mapper_basement` is refused with 42501 (row-level security), while the SAME
-- insert through `mapper_basement_search_demo` reaches the table and fails only on a
-- NOT NULL constraint — i.e. it passed RLS. An anonymous visitor could write Mapper rows.
-- This database is shared with production.
--
-- WHY IT DRIFTED
-- Not a bad intent — an incomplete REVOKE against Supabase's schema default privileges,
-- which grant ALL on newly created objects to `anon` and `authenticated`:
--
--   0809194002 revoked from `public, anon`  → `authenticated`'s default ALL survived
--   0809194003 revoked from `public`        → both roles' default ALL survived
--
-- Both migrations then granted SELECT, which was already implied by the ALL they never
-- removed. The declared contract was always SELECT-only; only the live ACL disagreed.
--
-- WHAT THIS DOES
-- Revokes every write privilege from the browser-facing roles and re-asserts SELECT.
-- It does NOT touch `postgres` or `service_role`, does NOT change either view's
-- projection, does NOT change `security_invoker`, and does NOT touch Mapper data. The
-- demo projection stays exactly as it is: identity, category, dietary and approval flags
-- — no cost, supplier, PAC/POD, source or reviewer.
--
-- `security_invoker=true` is deliberately NOT the fix here: anonymous SELECT depends on
-- the definer-style projection, and `mapper_basement` intentionally has no anon RLS
-- policy, so flipping it would break the demo instead of securing it.

begin;

-- The RICH view (cost, PAC/POD, full nutrition) — authenticated read model only.
revoke insert, update, delete, truncate, references, trigger
  on public.mapper_basement_search from public, anon, authenticated;
grant select on public.mapper_basement_search to authenticated;

-- The DEMO-SAFE view — every visitor may read it, nobody may write it.
revoke insert, update, delete, truncate, references, trigger
  on public.mapper_basement_search_demo from public, anon, authenticated;
grant select on public.mapper_basement_search_demo to anon, authenticated;

commit;
