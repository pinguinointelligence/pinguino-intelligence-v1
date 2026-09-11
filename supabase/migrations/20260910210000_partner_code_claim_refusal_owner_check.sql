-- D-CODE-08 — the code-availability RPC answers only about the caller's own partner.
--
-- STATUS: READY / WAITING OWNER DB APPROVAL — production-shared DB. Staging and
-- production share one Supabase project, so applying this changes production.
-- Owner decision 2026-09-10: tighten it, but do not apply yet. Do not `db push`.
--
-- gellatti_partner_code_claim_refusal_v1(p_partner_id, p_code) is SECURITY DEFINER
-- and granted to `authenticated`, but never checked that p_partner_id belongs to
-- the caller. Any signed-in account could therefore ask about another partner:
-- whether it already holds 3 active codes (partner_active_code_limit_reached) or a
-- given code (already_current).
--
-- The fix is one guard, the first statement after `begin`: a signed-in caller may
-- ask only about the partner row whose user_id is their own; otherwise 42501
-- partner_ownership_required. It RAISES rather than returning a new refusal, so
-- the vocabulary the Codes form's copy is pinned to does not move. Everything
-- after the guard is the live body unchanged (normalised md5
-- 069bf0ea25c699163a1cc4cf6b274280) — contract-tested.
--
-- Legitimate checks keep working: partners.user_id is NOT NULL UNIQUE (0016), the
-- workspace RPC picks the caller's partner by user_id = auth.uid(), and the only
-- client caller (the Codes form) passes that id. No SQL function calls this one.
--
-- ROLLBACK: supabase/rollbacks/20260910210000_partner_code_claim_refusal_owner_check.rollback.sql

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
  -- Owner check first, before anything is looked up: a signed-in caller may ask
  -- only about the partner row they own. A caller without a JWT (service role,
  -- cron) is unchanged; `anon` has no grant.
  if auth.uid() is not null and not exists (
    select 1 from public.partners p
    where p.id = p_partner_id and p.user_id = auth.uid()
  ) then
    raise exception 'partner_ownership_required' using errcode = '42501';
  end if;

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
