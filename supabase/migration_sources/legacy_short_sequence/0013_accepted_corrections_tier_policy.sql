-- ============================================================================
-- Migration 0013 — accepted_corrections tier-enforced INSERT policy (Option A)
-- ============================================================================
-- Owner-approved promotion of the Option A block from
-- docs/spine/proposals/accepted_corrections_tier_policy.proposal.sql,
-- copied VERBATIM (test-pinned executable-SQL equivalence). Closes the
-- decision-F v1 gap: until now the DB enforced OWNERSHIP only, so a hostile
-- signed-in Free user could insert THEIR OWN correction row via raw REST.
--
-- After this migration the INSERT additionally requires:
--  (1) a server-written Pro entitlement in public.subscriptions (select-own
--      RLS; the client has NO write grant there, so tier can never be
--      client-supplied) with the locked `planFromSubscription` semantics —
--      active | trialing → Pro; past_due → Pro only until current_period_end;
--  (2) an optional recipe link to point at the CALLER'S OWN saved recipe
--      (hardening-slice adversarial finding: the bare FK allowed cross-user
--      linkage / uuid probing).
-- Every subquery runs under the CALLER's own privileges — no security-definer
-- helper, no privileged role, no Edge Function, nothing deployed.
-- SELECT/DELETE stay owner-scoped and unchanged; there is still NO update
-- policy or grant (write-once audit table, migration 0012).
-- Never touched: the Mapper basement, the product catalog (PAC/POD values,
-- lifecycle statuses), stock; recipe storage is only READ (own row) here.
-- ============================================================================

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

-- ============================================================================
-- ROLLBACK PLAN (not applied — kept as comments): restores the Slice-24
-- ownership-only policy.
--
--   drop policy if exists accepted_corrections_insert_own on public.accepted_corrections;
--   create policy accepted_corrections_insert_own on public.accepted_corrections
--     for insert with check (auth.uid() = user_id and auth.uid() = created_by);
-- ============================================================================
