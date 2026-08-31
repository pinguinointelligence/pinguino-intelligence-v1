-- ============================================================================
-- GELLATTI — WORK WITH US §8: partner code SLOTS and ALIAS OWNERSHIP
-- ============================================================================
-- Owner override, 2026-08-31. Two changes to the EXISTING partner_codes table.
-- Nothing is dropped, no history is rewritten, attribution is untouched: every
-- referral row keys on the immutable partner_id, never on the code text.
--
--  X3 — SLOT CEILING. A partner may hold 0-3 ACTIVE (current public) codes.
--       Nothing enforced a count before this migration.
--
--  X2 — ALIAS OWNERSHIP. Until now uniqueness was scoped to ACTIVE rows
--       (partner_codes_code_active_uniq ... where status = 'active'), so a
--       RETIRED code's text was free for a DIFFERENT partner to claim. That
--       means an old social post carrying a retired code could silently start
--       paying somebody else. §8 forbids this: a retired code becomes a
--       historical alias of the SAME partner and can never be claimed by
--       another. Uniqueness therefore becomes GLOBAL across every status.
--
-- Vocabulary mapping (no new status values, so no CHECK constraint churn):
--   'active'  = one of the partner's <= 3 current public codes
--   'retired' = a historical ALIAS, still owned by the same partner
--   'blocked' = admin-disabled, unclaimable by anyone including the owner
--
-- The TS authority for these rules is src/billing/domain/partnerCodeSlots.ts
-- (CS1..CS7); this migration is the DB enforcement of the same rules, and
-- partnerCodeSlots.migration.test.ts asserts the two stay in lockstep.
--
-- Writes stay service-role only — no new grants.

-- ── 0. Pre-flight: refuse to run against data that already violates X2 ──────
-- The new global unique index cannot be created if two partners already hold
-- the same code text in different statuses. Fail LOUDLY with the offending
-- rows rather than half-applying: an operator must decide which partner keeps
-- the code, because that decision moves money.
do $$
declare
  v_dupes text;
begin
  -- Case-INSENSITIVE, matching the index created below. Real staging data
  -- contains lowercase codes (`qabrowser-b`), so a case-sensitive check here
  -- would pass while the case-insensitive index then failed to build.
  select string_agg(format('%s (%s rows)', u, n), ', ')
    into v_dupes
  from (
    select upper(code) as u, count(*) as n
    from public.partner_codes
    group by upper(code)
    having count(*) > 1
  ) d;

  if v_dupes is not null then
    raise exception
      'partner_codes: cannot enforce global code uniqueness — duplicate code text already exists: %. Resolve ownership manually before applying this migration.',
      v_dupes;
  end if;

  select string_agg(format('%s (%s rows)', l, n), ', ')
    into v_dupes
  from (
    select lower(slug) as l, count(*) as n
    from public.partner_codes
    group by lower(slug)
    having count(*) > 1
  ) d;

  if v_dupes is not null then
    raise exception
      'partner_codes: cannot enforce global slug uniqueness — duplicate slug already exists: %. Resolve ownership manually before applying this migration.',
      v_dupes;
  end if;
end $$;

-- ── 1. X2: uniqueness becomes GLOBAL, not active-only ───────────────────────
-- Create the replacements FIRST, then drop the old partial indexes, so the
-- namespace is never unprotected mid-migration.
-- CASE-INSENSITIVE on purpose (§8: "case-insensitive collision check"). Live
-- staging stores some codes lowercase (`qabrowser-b`), so a plain (code) index
-- would let a second partner take `QABROWSER-B` — reintroducing the very
-- collision this migration exists to prevent.
create unique index if not exists partner_codes_code_global_uniq
  on public.partner_codes (upper(code));
-- slug already carries a `slug = lower(slug)` CHECK from 0016, so it is
-- canonical already; lower() here simply makes that explicit and future-proof.
create unique index if not exists partner_codes_slug_global_uniq
  on public.partner_codes (lower(slug));

drop index if exists public.partner_codes_code_active_uniq;
drop index if exists public.partner_codes_slug_active_uniq;

-- ── 2. X3: at most three ACTIVE codes per partner ───────────────────────────
-- A cross-row rule needs a trigger; a CHECK cannot see sibling rows. The
-- trigger fires only on transitions that can INCREASE the active count, so
-- archiving and blocking always stay possible even if a partner somehow sits
-- above the ceiling from before this migration.
create or replace function public.enforce_partner_code_slot_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;
  -- UPDATE that leaves an already-active row active cannot add a slot.
  if tg_op = 'UPDATE' and old.status = 'active' and old.partner_id = new.partner_id then
    return new;
  end if;

  select count(*) into v_active
  from public.partner_codes
  where partner_id = new.partner_id
    and status = 'active'
    and id is distinct from new.id;

  if v_active >= 3 then
    raise exception
      'partner_code_slot_limit: partner % already holds % active codes (maximum 3)',
      new.partner_id, v_active
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

revoke all on function public.enforce_partner_code_slot_limit() from public, anon, authenticated;

drop trigger if exists partner_codes_slot_limit on public.partner_codes;
create trigger partner_codes_slot_limit
  before insert or update of status, partner_id on public.partner_codes
  for each row execute function public.enforce_partner_code_slot_limit();

-- ── 3. Claim guard used by the code-management RPC ──────────────────────────
-- Mirrors evaluateCodeClaim() in src/billing/domain/partnerCodeSlots.ts so the
-- customer sees a typed reason instead of a raw constraint violation. Returns
-- null when the claim is allowed, otherwise the refusal reason.
create or replace function public.gellatti_partner_code_claim_refusal_v1(
  p_partner_id uuid,
  p_code text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_holder public.partner_codes%rowtype;
  v_active integer;
begin
  -- CS4: normalization makes the lookup case-insensitive.
  if length(v_code) < 5 then return 'too_short'; end if;
  if length(v_code) > 16 then return 'too_long'; end if;
  if v_code !~ '^[A-Z0-9]+$' then return 'invalid_characters'; end if;

  -- upper(code) = v_code, NOT code = v_code: stored codes are not guaranteed
  -- uppercase, and a case-sensitive lookup would report an existing code as
  -- available.
  select * into v_holder from public.partner_codes where upper(code) = v_code;

  if found then
    -- CS6: a blocked code is unclaimable by anyone, its owner included.
    if v_holder.status = 'blocked' then return 'blocked_code'; end if;
    -- CS2/CS4/CS5: another partner's code — active OR retired — is never free.
    if v_holder.partner_id <> p_partner_id then return 'held_by_another_partner'; end if;
    if v_holder.status = 'active' then return 'already_current'; end if;
  end if;

  -- CS1: the ceiling applies to reclaiming your own alias too.
  select count(*) into v_active
  from public.partner_codes
  where partner_id = p_partner_id and status = 'active';

  if v_active >= 3 then return 'slot_limit_reached'; end if;

  return null;
end $$;

revoke all on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) from public, anon;
grant execute on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) to authenticated;

-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   drop trigger if exists partner_codes_slot_limit on public.partner_codes;
--   drop function if exists public.enforce_partner_code_slot_limit();
--   drop function if exists public.gellatti_partner_code_claim_refusal_v1(uuid, text);
--   create unique index partner_codes_code_active_uniq
--     on public.partner_codes (code) where status = 'active';
--   create unique index partner_codes_slug_active_uniq
--     on public.partner_codes (slug) where status = 'active';
--   drop index if exists public.partner_codes_code_global_uniq;
--   drop index if exists public.partner_codes_slug_global_uniq;
-- Reverting re-opens retired codes to other partners — only do so knowingly.
-- ============================================================================
