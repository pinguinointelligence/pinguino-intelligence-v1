-- ============================================================================
-- PROPOSAL — NOT APPLIED. Accepted-correction SERVER-SIDE tier enforcement.
-- ============================================================================
-- This file lives OUTSIDE supabase/migrations on purpose.
-- It MUST NOT be applied without explicit owner approval (it changes the
-- write-path security contract). It closes the documented decision-F v1 gap: today the DB enforces
-- OWNERSHIP (RLS) while Pro tier is enforced only in the client/service layer,
-- so a hostile signed-in Free user could insert THEIR OWN correction row via
-- raw REST (no cross-user access; no data leak).
--
-- Server-side source of truth (audited, live-verified 2026-07-10):
--   public.subscriptions — select-own RLS only; authenticated has NO
--   insert/update/delete grant (has_table_privilege verified false), anon has
--   nothing. Every row is therefore server-written by construction (currently
--   owner-seeded at service level; the Phase 2B.3 Stripe webhook Edge Function
--   will maintain it later). The client can never self-promote to Pro.
--
-- TWO exclusive options below. Option A is RECOMMENDED for now (no deploy, no
-- secrets, no new runtime, client code unchanged); Option B belongs to the
-- future Edge-Function-mediated era (Stripe webhooks / wider scale).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- OPTION A (RECOMMENDED) — tier-checking INSERT policy, one migration, no deploy
-- When approved: copy this block VERBATIM to
-- supabase/migrations/0013_accepted_corrections_tier_policy.sql and apply.
-- The SQL below is REAL (Slice-16 proposal convention) but inert here: this
-- file is never executed and tests pin it OUT of supabase/migrations.
-- ────────────────────────────────────────────────────────────────────────────
-- The insert policy additionally requires (1) a server-written Pro
-- entitlement and (2) that an optional recipe link points at the CALLER'S OWN
-- saved recipe (adversarial-review finding: a bare FK would let a crafted
-- insert link another user's recipe id / probe uuid existence).
-- Every subquery runs under the CALLER's own privileges: authenticated may
-- SELECT its own subscriptions / saved_recipes rows (select-own RLS), which
-- are exactly the rows checked — no security-definer helper, no privileged
-- role. Tier semantics mirror the locked pure mapping `planFromSubscription`
-- (src/access/subscription.ts): active | trialing → Pro; past_due → Pro only
-- until current_period_end (grace); everything else → free.

drop policy if exists accepted_corrections_insert_own on public.accepted_corrections;

create policy accepted_corrections_insert_own on public.accepted_corrections
  for insert with check (
    auth.uid() = user_id
    and auth.uid() = created_by
    and (
      recipe_id is null
      or exists (
        select 1
        from public.saved_recipes r
        where r.id = recipe_id
          and r.user_id = auth.uid()
      )
    )
    and exists (
      select 1
      from public.subscriptions s
      where s.user_id = auth.uid()
        and (
          s.subscription_status in ('active', 'trialing')
          or (
            s.subscription_status = 'past_due'
            and s.current_period_end is not null
            and s.current_period_end > now()
          )
        )
    )
  );

-- Consequences (state them, do not hide them):
--  * a signed-in FREE user's raw-REST insert now fails at the DB with an RLS
--    violation — the same honest error path the Studio control already shows;
--  * select/delete stay owner-scoped and unchanged; the service create path
--    keeps working for Pro with zero client changes;
--  * grace expiry is time-based (now()): an insert that succeeds today can
--    honestly fail after current_period_end passes;
--  * freshness caveat: enforcement is only as fresh as the subscriptions cache
--    (owner-maintained until the Stripe webhook writer exists).

-- OPTION A ROLLBACK (restores the Slice-24 ownership-only policy):
-- drop policy if exists accepted_corrections_insert_own on public.accepted_corrections;
-- create policy accepted_corrections_insert_own on public.accepted_corrections
--   for insert with check (auth.uid() = user_id and auth.uid() = created_by);

-- ────────────────────────────────────────────────────────────────────────────
-- OPTION B — Edge-Function-mediated insert cutover (future / wider scale)
-- ONLY valid as ONE atomic change together with:
--   1. deploying supabase/functions/create-accepted-correction (owner approval),
--   2. rewiring createAcceptedCorrection() to invoke it (client change),
--   3. this grant revocation. Applying this alone BREAKS the Pro save path.
-- ────────────────────────────────────────────────────────────────────────────
-- revoke insert on table public.accepted_corrections from authenticated;
-- -- select + delete grants stay: listing and owner-delete remain direct,
-- -- RLS-scoped table access. Inserts then happen ONLY inside the Edge
-- -- Function via the service role, with user_id/created_by forced from the
-- -- verified JWT (never from the request body).

-- OPTION B ROLLBACK:
-- grant insert on table public.accepted_corrections to authenticated;

-- ============================================================================
-- Never touched by either option: the Mapper basement, the product catalog
-- (incl. PAC/POD values and lifecycle statuses), stock. Recipe storage is
-- never WRITTEN — option A only READS the caller's own saved-recipe row to
-- verify an optional link. This proposal concerns exactly one policy / one
-- grant on public.accepted_corrections (plus reads of the caller's own
-- subscriptions / saved_recipes rows).
-- ============================================================================
