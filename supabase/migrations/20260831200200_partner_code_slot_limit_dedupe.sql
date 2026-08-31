-- ============================================================================
-- GELLATTI — remove the DUPLICATE active-code ceiling this workstream added
-- ============================================================================
-- Owner decision, 2026-08-31: OPTION 1. The pre-existing
-- `gellatti_partner_code_guard_v1` (installed by
-- 20260826122000_partner_workspace_and_public_links) is the single authority
-- for the three-active-code ceiling. The trigger this workstream added in
-- 20260831200000 is redundant and is removed forward-only.
--
-- ── HOW THE DUPLICATION HAPPENED ────────────────────────────────────────────
-- The original audit recorded X3 ("nothing limits a partner to 3 active codes")
-- as a MISSING runtime capability. That was WRONG. The ceiling already existed
-- and was already enforced live; the audit searched for a count constraint and
-- did not look for an existing trigger. 20260831200000 therefore added a second
-- enforcement of a rule that was never absent.
--
-- The duplication was caught by live staging QA — a 4th-code probe refused with
-- `partner_active_code_limit_reached`, which is not a string this workstream
-- ever wrote — before any financial migration was applied.
--
-- ── WHY THE PRE-EXISTING GUARD WINS ─────────────────────────────────────────
-- It is the approved, already-deployed authority, and it fires first anyway
-- (`partner_codes_controlled_guard` sorts before `partner_codes_slot_limit`),
-- so the newer trigger was already dead code.
--
-- The newer trigger carried an explicit `tg_op = 'UPDATE'` short-circuit that
-- the older one lacks. That refinement turns out to be unnecessary: the older
-- guard excludes the row under test with `c.id <> new.id`, which handles the
-- same cases. Proven live before this migration was written, with the newer
-- trigger disabled inside a rolled-back transaction so only the older guard was
-- active:
--
--   A  update an active row, no count increase, at 3 active   -> ALLOWED
--   B  retire an active code                                  -> ALLOWED, 3 -> 2
--   C  promote a retired code to active while at 3 active     -> REFUSED
--   D  activate one more while at 2 active                    -> ALLOWED, 2 -> 3
--   E  unrelated column update while at 3 active              -> ALLOWED
--
-- ── WHAT THIS MIGRATION MUST NOT TOUCH ──────────────────────────────────────
-- `gellatti_partner_code_guard_v1` and its trigger are left exactly as they
-- are. The ceiling, historical alias ownership, case-insensitive global
-- uniqueness and banned-word enforcement all survive unchanged — they live in
-- the indexes and in the claim guard, not in the trigger being dropped.

drop trigger if exists partner_codes_slot_limit on public.partner_codes;
drop function if exists public.enforce_partner_code_slot_limit();

-- ── ONE canonical internal reason ───────────────────────────────────────────
-- The same condition was reporting three different strings depending on the
-- path: `partner_active_code_limit_reached` (canonical guard),
-- `partner_code_slot_limit` (the trigger now dropped) and `slot_limit_reached`
-- (the claim guard). The canonical guard's identifier is the authority, so the
-- claim guard adopts it. No fourth spelling is invented.
--
-- CUSTOMER-VISIBLE SEMANTICS ARE UNCHANGED. These identifiers are internal
-- refusal reasons; the customer message is chosen by the presentation layer
-- from the reason, and the "you already have three public codes" meaning is
-- identical before and after. Only the internal token changes.
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

  foreach v_banned in array array[
    'ADMIN','PINGUINO','STRIPE','SUPPORT','STAFF','OFFICIAL','SYSTEM','BILLING','PAYOUT',
    'FUCK','SHIT','CUNT','NAZI','RAPE','PUTA','MIERDA'
  ] loop
    if position(v_banned in v_code) > 0 then
      return 'banned_word';
    end if;
  end loop;

  select * into v_holder from public.partner_codes where upper(code) = v_code;

  if found then
    if v_holder.status = 'blocked' then return 'blocked_code'; end if;
    if v_holder.partner_id <> p_partner_id then return 'held_by_another_partner'; end if;
    if v_holder.status = 'active' then return 'already_current'; end if;
  end if;

  select count(*) into v_active
  from public.partner_codes
  where partner_id = p_partner_id and status = 'active';

  -- Canonical identifier, matching gellatti_partner_code_guard_v1 exactly.
  if v_active >= 3 then return 'partner_active_code_limit_reached'; end if;

  return null;
end $fn$;

revoke all on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) from public, anon;
grant execute on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) to authenticated;

-- ============================================================================
-- ROLLBACK: re-create the trigger and function dropped above from the body in
-- 20260831200000, and revert the claim guard's ceiling identifier to
-- 'slot_limit_reached'. Doing so restores a duplicate enforcement of a rule the
-- canonical guard already applies — only do it knowingly.
-- ============================================================================
