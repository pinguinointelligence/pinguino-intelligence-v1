-- ROLLBACK for 20260910210000_partner_code_claim_refusal_owner_check.sql
--
-- STATUS: READY / NOT APPLIED. Run only if the forward migration was applied.
-- Restores gellatti_partner_code_claim_refusal_v1 to the definition live today
-- (20260831200200; normalised md5 069bf0ea25c699163a1cc4cf6b274280).

begin;

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

commit;
