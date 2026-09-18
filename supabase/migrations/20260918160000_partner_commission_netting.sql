-- ============================================================================
-- Pending commission, NET — one projection of the payout authority's netting
-- ============================================================================
-- STATUS: READY / NOT APPLIED — production-shared DB
-- ROLLBACK: supabase/rollbacks/20260918160000_partner_commission_netting.rollback.sql
--
-- THE DEFECT. Two panels show "money still to be paid" as a GROSS sum:
--   - admin  gellatti_admin_directory_v1('PARTNERS').pendingCommission
--            = sum(amount_cents) of the partner's held + eligible entries;
--   - Partner "W trakcie" / "Do wypłaty" = sum(amountCents) of held / eligible
--            rows, added up in the browser.
-- Neither sees a correction. A held 100 € entry with a 20 € partial refund reads
-- 100 € in both panels, while gellatti_build_payout_batch_v1 — the authority that
-- decides what is actually transferred — will count 80 €.
--
-- THE FIX. gellatti_partner_commission_netting_v1 states, for one partner and one
-- mode, the builder's own rule and nothing else:
--   payable   = eligible entries not reserved by a line
--             + corrections not reserved by a line, on those entries and on
--               entries a PAID payout already settled
--             — exactly gross_cents + adjustment_cents of the builder's
--               `balances` row for that partner;
--   held      = held entries + their corrections — what the same rule counts
--               the moment they turn eligible;
--   in flight = lines a batch wrote that nobody settled or failed yet (their
--               entries and corrections are reserved, so they are not in
--               `payable`, and nothing is counted twice);
--   ready     = payable + in flight (the Partner's "Do wypłaty");
--   pending   = held + payable + in flight (the admin's "Oczekująca prowizja";
--               equal to the Partner's "W trakcie" + "Do wypłaty").
-- The builder is NOT changed (the 72 h DB soak exercises it); a QA test proves
-- that `payable` equals what the builder writes for the same state.
--
-- WHO SEES WHAT. The Partner reads only their own row; an admin needs the
-- PARTNER permission. The mode is decided on the server from the request's
-- Origin (gellatti_request_app_origin_v1): the production app reads live money,
-- everything else reads test money. No client parameter chooses it.
--
-- DEPENDS ON (apply first):
--   20260917140000_payout_execution_batch_binding.sql — partner_payout_items
--     .released_at / .commission_adjustment_id;
--   20260910175900_mail_origin_and_escaping.sql — gellatti_request_app_origin_v1.
-- ============================================================================

do $dependency$
begin
  if to_regprocedure('public.gellatti_request_app_origin_v1()') is null then
    raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partner_payout_items'
      and column_name in ('released_at', 'commission_adjustment_id')
    having count(*) = 2
  ) then
    raise exception 'apply 20260917140000_payout_execution_batch_binding.sql first';
  end if;
end $dependency$;

-- ── The one rule ─────────────────────────────────────────────────────────────
create or replace function public.gellatti_partner_commission_netting_v1(
  p_partner_id uuid,
  p_livemode boolean default false
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with unreserved_entries as (
    -- builder: gross_entries (an entry held by an unreleased item belongs to its line)
    select ce.id, ce.status, ce.amount_cents
    from public.commission_entries ce
    where ce.partner_id = p_partner_id
      and ce.livemode = p_livemode
      and ce.status in ('held', 'eligible')
      and not exists (
        select 1 from public.partner_payout_items i
        where i.commission_entry_id = ce.id and i.released_at is null
      )
  ),
  settled_entries as (
    -- builder: settled_entries (a PAID payout already settled these)
    select i.commission_entry_id as entry_id
    from public.partner_payout_items i
    join public.partner_payouts pp on pp.id = i.payout_id
    join public.commission_entries ce on ce.id = i.commission_entry_id
    where ce.partner_id = p_partner_id
      and ce.livemode = p_livemode
      and i.commission_entry_id is not null
      and i.released_at is null
      and pp.status = 'paid'
  ),
  open_adjustments as (
    -- builder: counted_adjustments before the entry filter (not yet in a line)
    select ca.commission_entry_id, ca.amount_cents
    from public.commission_adjustments ca
    join public.commission_entries ce on ce.id = ca.commission_entry_id
    where ce.partner_id = p_partner_id
      and ce.livemode = p_livemode
      and not exists (
        select 1 from public.partner_payout_items i
        where i.commission_adjustment_id = ca.id and i.released_at is null
      )
  ),
  totals as (
    select
      coalesce((select sum(e.amount_cents) from unreserved_entries e where e.status = 'held'), 0)
      + coalesce((select sum(a.amount_cents) from open_adjustments a
                  where a.commission_entry_id in (select e.id from unreserved_entries e where e.status = 'held')), 0)
        as held_cents,
      coalesce((select sum(e.amount_cents) from unreserved_entries e where e.status = 'eligible'), 0)
      + coalesce((select sum(a.amount_cents) from open_adjustments a
                  where a.commission_entry_id in (select e.id from unreserved_entries e where e.status = 'eligible')
                     or a.commission_entry_id in (select s.entry_id from settled_entries s)), 0)
        as payable_cents,
      coalesce((select sum(pp.amount_cents)
                from public.partner_payouts pp
                join public.payout_batches b on b.id = pp.batch_id
                where pp.partner_id = p_partner_id
                  and b.livemode = p_livemode
                  and pp.status in ('pending', 'processing')), 0)
        as in_flight_cents
  )
  select jsonb_build_object(
    'livemode', p_livemode,
    'heldNetCents', t.held_cents,
    'payableNetCents', t.payable_cents,
    'inFlightCents', t.in_flight_cents,
    -- Past the refund window and not yet paid: the next batch plus the line
    -- already written. The Partner's "Do wypłaty".
    'readyNetCents', t.payable_cents + t.in_flight_cents,
    -- Everything not yet paid out. The admin's "Oczekująca prowizja".
    'pendingNetCents', t.held_cents + t.payable_cents + t.in_flight_cents
  )
  from totals t;
$$;

revoke all on function public.gellatti_partner_commission_netting_v1(uuid, boolean)
  from public, anon, authenticated;

-- ── The Partner's own figure ─────────────────────────────────────────────────
create or replace function public.gellatti_partner_pending_commission_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid;
begin
  select p.id into v_partner from public.partners p where p.user_id = auth.uid();
  if v_partner is null then
    return null;
  end if;
  return public.gellatti_partner_commission_netting_v1(
    v_partner,
    (public.gellatti_request_app_origin_v1() ->> 'environment') = 'production'
  );
end $$;

revoke all on function public.gellatti_partner_pending_commission_v1() from public, anon;
grant execute on function public.gellatti_partner_pending_commission_v1() to authenticated;

-- ── The admin's figure, every partner ────────────────────────────────────────
create or replace function public.gellatti_admin_partner_pending_commission_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_livemode boolean;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER') then
    raise exception 'partner_administrator_required';
  end if;
  v_livemode := (public.gellatti_request_app_origin_v1() ->> 'environment') = 'production';
  return coalesce((
    select jsonb_agg(
      public.gellatti_partner_commission_netting_v1(p.id, v_livemode)
        || jsonb_build_object('partnerId', p.id)
      order by p.created_at desc)
    from public.partners p
  ), '[]'::jsonb);
end $$;

revoke all on function public.gellatti_admin_partner_pending_commission_v1() from public, anon;
grant execute on function public.gellatti_admin_partner_pending_commission_v1() to authenticated;
