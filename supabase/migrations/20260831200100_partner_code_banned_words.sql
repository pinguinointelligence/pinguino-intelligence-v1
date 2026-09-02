-- ============================================================================
-- GELLATTI — WORK WITH US §8: the banned-word check the claim guard was missing
-- ============================================================================
-- Found by probing the LIVE guard immediately after applying
-- 20260831200000, before any further migration ran:
--
--   gellatti_partner_code_claim_refusal_v1(partner, 'ADMINX')    -> null
--   gellatti_partner_code_claim_refusal_v1(partner, 'PINGUINO1') -> null
--   gellatti_partner_code_claim_refusal_v1(partner, 'STRIPEX')   -> null
--
-- All three should have been refused. `partnerCodes.ts` PC3 rejects any code
-- CONTAINING a protected or offensive word, and the SQL guard implemented only
-- length and charset. The database was therefore weaker than the TS authority,
-- and a partner could have claimed a code impersonating Gellatti staff, the
-- payment provider, or the old brand.
--
-- This is a forward fix rather than an edit of 20260831200000: that migration
-- is already applied and registered, and rewriting an applied migration is the
-- exact repo/DB divergence this workstream spent its preflight eliminating.
--
-- The word lists mirror PROTECTED_CODE_WORDS and OFFENSIVE_CODE_WORDS in
-- src/billing/domain/partnerCodes.ts. Matching is by CONTAINMENT and is
-- deliberately conservative: a false positive only costs the partner a
-- different code suggestion, while a false negative puts `STRIPEBILLING` in a
-- public referral URL.

create or replace function public.gellatti_partner_code_claim_refusal_v1(
  p_partner_id uuid,
  p_code text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_holder public.partner_codes%rowtype;
  v_active integer;
  v_banned text;
begin
  if length(v_code) < 5 then return 'too_short'; end if;
  if length(v_code) > 16 then return 'too_long'; end if;
  if v_code !~ '^[A-Z0-9]+$' then return 'invalid_characters'; end if;

  -- PC3: protected system words + a small offensive list, matched by
  -- containment on the normalized code. Same set, same order, as the TS module.
  foreach v_banned in array array[
    'ADMIN','PINGUINO','STRIPE','SUPPORT','STAFF','OFFICIAL','SYSTEM','BILLING','PAYOUT',
    'FUCK','SHIT','CUNT','NAZI','RAPE','PUTA','MIERDA'
  ] loop
    if position(v_banned in v_code) > 0 then
      return 'banned_word';
    end if;
  end loop;

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
end $fn$;

revoke all on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) from public, anon;
grant execute on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) to authenticated;

-- Existing codes are NOT re-validated. Two of the live QA codes would fail the
-- current format rules (`qabrowser-a`..`qabrowser-d` carry hyphens and lower
-- case), and rewriting a live code would change a public referral address that
-- may already be printed somewhere. Grandfathered on purpose; the guard governs
-- new claims only.

-- ============================================================================
-- ROLLBACK: re-apply the 20260831200000 body of
-- gellatti_partner_code_claim_refusal_v1, which omits the banned-word loop.
-- Doing so re-opens ADMIN/STRIPE/PINGUINO-shaped codes to partners.
-- ============================================================================
