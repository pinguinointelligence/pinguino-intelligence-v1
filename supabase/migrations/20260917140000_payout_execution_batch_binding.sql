-- ============================================================================
-- PAYOUT EXECUTION — batch binding, netting scope and mode scope
-- ============================================================================
-- STATUS: READY / NOT APPLIED. Corrects 20260831202500_payout_execution.sql,
-- which is itself NOT applied, before anything applies either of them. It is
-- applied and exercised on the isolated QA branch only. It never goes to the
-- shared database without an explicit owner approval of this exact file.
--
-- DEFECTS IT FIXES (found 2026-09-17, reproduced before this file on an
-- isolated PostgreSQL):
--   D1  Netting summed every unsettled adjustment whatever its entry's status,
--       while gross summed only eligible entries. A full refund of an UNPAID
--       commission — the webhook flips the entry to 'reversed' and appends −X —
--       was therefore deducted twice: 1000 refunded before payout netted −1000
--       instead of 0.
--   D3  Settling bound whatever was unsettled AT SETTLE TIME, not what the batch
--       counted. A refund landing between build and settle was bound without
--       ever being netted (overpaid); an entry turning eligible after build was
--       marked paid without being sent (underpaid, permanently).
--   D2  Settling had no livemode scope: a TEST settle could bind and flip LIVE
--       rows. Staging and production share one database.
--
-- THE RULES AFTER THIS FILE:
--   N1  Gross = eligible entries of the batch's mode that no active item holds.
--   N2  An adjustment counts only when its entry is (a) in this batch's gross,
--       or (b) already settled by a PAID payout — a post-payout correction.
--       Adjustments of a held entry wait for their entry. Adjustments of an
--       unpaid entry that is not eligible (e.g. reversed) cancel against its
--       excluded gross. So 1000 refunded before payout nets 0, and a 300 refund
--       of a 1000 entry nets 700 — once.
--   B1  Build RESERVES, for every payable line, exactly the entries and
--       adjustments it counted, and refuses to commit unless each line's
--       amount equals the sum of its reserved items.
--   B2  An entry or adjustment is held by at most ONE active (unreleased) item,
--       globally. A released item stays on record as history.
--   C1  Claim re-validates a line before any transfer: every reserved entry is
--       still eligible, no correction arrived after build, the items still sum
--       to the amount, and the partner is still active, payable and has a
--       Connect account. A stale line fails with the reason, releases its
--       reservation, and the money carries forward to the next batch.
--   S1  Settling requires the claimed line, the transfer id, and the expected
--       partner, amount, currency and mode. It binds NOTHING new: it flips only
--       the entries this line reserved. The same transfer id again is a no-op;
--       a different one is refused.
--   F1  A failed line WITHOUT a transfer releases its reservation; its entries
--       stay eligible. A line WITH a transfer id is never failed here — it is
--       settled from the operator's truth.
--
-- A correction after a payout is appended, never rewritten: it nets into the
-- next batch (N2b), and a net below zero stays a visible negative
-- carry-forward. Nothing here pulls money back from a partner's bank.

-- ── Reservation history on the items ────────────────────────────────────────
alter table public.partner_payout_items
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text;

alter table public.partner_payout_items
  drop constraint if exists partner_payout_items_release_pair;
alter table public.partner_payout_items
  add constraint partner_payout_items_release_pair
  check ((released_at is null) = (release_reason is null));

-- B2: one ACTIVE item per entry and per adjustment, globally.
drop index if exists public.partner_payout_items_entry_uniq;
drop index if exists public.partner_payout_items_adjustment_uniq;
create unique index if not exists partner_payout_items_entry_active_uniq
  on public.partner_payout_items (commission_entry_id)
  where commission_entry_id is not null and released_at is null;
create unique index if not exists partner_payout_items_adjustment_active_uniq
  on public.partner_payout_items (commission_adjustment_id)
  where commission_adjustment_id is not null and released_at is null;

-- ── BUILD: net by N1/N2 and reserve by B1 ────────────────────────────────────
create or replace function public.gellatti_build_payout_batch_v1(
  p_month date default null,
  p_livemode boolean default false,
  p_now timestamptz default now(),
  p_threshold_cents integer default 2500
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_batch uuid;
  v_created boolean := false;
  v_lines integer := 0;
  v_payable integer := 0;
  v_total integer := 0;
  v_mismatch integer := 0;
begin
  perform public.gellatti_assert_payout_allowed_v1(p_livemode);

  v_month := coalesce(p_month, date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date);
  if extract(day from v_month) <> 1 then
    raise exception 'payout_batch_month_must_be_first_of_month';
  end if;

  -- Serialise concurrent builders for this (month, livemode).
  perform pg_advisory_xact_lock(hashtext('gellatti_payout_batch:' || v_month::text || ':' || p_livemode::text));

  insert into public.payout_batches (month, currency, livemode, status, started_at)
    values (v_month, 'eur', p_livemode, 'processing', p_now)
    on conflict (month, currency, livemode) do nothing
    returning id into v_batch;

  if v_batch is null then
    select id into v_batch from public.payout_batches
      where month = v_month and currency = 'eur' and livemode = p_livemode;
  else
    v_created := true;
  end if;

  -- A reversal that commits during the build waits for it, so the net and the
  -- reservation read the same entry statuses. Adjustments inserted meanwhile
  -- are invisible here and are caught at claim (C1).
  perform 1 from public.commission_entries ce
    where ce.livemode = p_livemode and ce.status = 'eligible'
    for share;

  with gross_entries as (
    select ce.id, ce.partner_id, ce.amount_cents
    from public.commission_entries ce
    where ce.status = 'eligible' and ce.livemode = p_livemode
      and not exists (
        select 1 from public.partner_payout_items i
        where i.commission_entry_id = ce.id and i.released_at is null
      )
  ),
  settled_entries as (
    select i.commission_entry_id as entry_id
    from public.partner_payout_items i
    join public.partner_payouts pp on pp.id = i.payout_id
    where i.commission_entry_id is not null and i.released_at is null and pp.status = 'paid'
  ),
  counted_adjustments as (
    select ca.id, ce.partner_id, ca.amount_cents
    from public.commission_adjustments ca
    join public.commission_entries ce on ce.id = ca.commission_entry_id
    where ce.livemode = p_livemode
      and not exists (
        select 1 from public.partner_payout_items i
        where i.commission_adjustment_id = ca.id and i.released_at is null
      )
      and (
        exists (select 1 from gross_entries g where g.id = ce.id)
        or exists (select 1 from settled_entries s where s.entry_id = ce.id)
      )
  ),
  balances as (
    select
      p.id as partner_id,
      p.status as partner_status,
      coalesce(p.payouts_enabled, false) as payouts_enabled,
      coalesce(p.onboarding_complete, false) as onboarding_complete,
      p.stripe_connect_account_id,
      coalesce((select sum(g.amount_cents) from gross_entries g where g.partner_id = p.id), 0)::integer as gross_cents,
      coalesce((select sum(a.amount_cents) from counted_adjustments a where a.partner_id = p.id), 0)::integer as adjustment_cents
    from public.partners p
  ),
  decided as (
    select
      partner_id,
      gross_cents + adjustment_cents as net_cents,
      case
        -- A suspended or terminated partner is never paid automatically.
        when partner_status <> 'active' then 'skipped_not_payable'
        -- Connect must be able to receive money, and the account must exist.
        when not (payouts_enabled and onboarding_complete) then 'skipped_not_payable'
        when stripe_connect_account_id is null then 'skipped_not_payable'
        -- P3: a negative net carries forward and blocks payment.
        when gross_cents + adjustment_cents < 0 then 'skipped_negative_balance'
        -- P4: nothing to send.
        when gross_cents + adjustment_cents = 0 then 'skipped_below_threshold'
        -- P2: below the threshold carries forward untouched.
        when gross_cents + adjustment_cents < p_threshold_cents then 'skipped_below_threshold'
        else 'pending'
      end as decision
    from balances
    where gross_cents <> 0 or adjustment_cents <> 0
  ),
  written as (
    insert into public.partner_payouts
      (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key)
    select
      v_batch,
      partner_id,
      case when decision = 'pending' then net_cents else 0 end,
      case when decision = 'pending' then 0 else net_cents end,
      'eur',
      decision,
      -- P6: deterministic idempotency key — batchMonth + partner + currency + mode
      v_month::text || ':' || partner_id::text || ':eur:' || case when p_livemode then 'live' else 'test' end
    from decided
    on conflict (batch_id, partner_id) do nothing
    returning id, partner_id, status, amount_cents
  ),
  reserved_entries as (
    insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents)
    select w.id, g.id, g.amount_cents
    from written w
    join gross_entries g on g.partner_id = w.partner_id
    where w.status = 'pending'
    returning payout_id, amount_cents
  ),
  reserved_adjustments as (
    insert into public.partner_payout_items (payout_id, commission_adjustment_id, amount_cents)
    select w.id, a.id, a.amount_cents
    from written w
    join counted_adjustments a on a.partner_id = w.partner_id
    where w.status = 'pending'
    returning payout_id, amount_cents
  ),
  reserved as (
    select r.payout_id, sum(r.amount_cents) as reserved_cents
    from (
      select * from reserved_entries
      union all
      select * from reserved_adjustments
    ) r
    group by r.payout_id
  )
  select
    count(*),
    count(*) filter (where w.status = 'pending'),
    coalesce(sum(w.amount_cents) filter (where w.status = 'pending'), 0),
    count(*) filter (where w.status = 'pending' and coalesce(r.reserved_cents, 0) <> w.amount_cents)
  into v_lines, v_payable, v_total, v_mismatch
  from written w
  left join reserved r on r.payout_id = w.id;

  -- B1: a payable line reserves exactly what it counted, or nothing is written.
  if v_mismatch > 0 then
    raise exception 'payout_reservation_mismatch'
      using detail = v_mismatch::text || ' payable line(s) do not equal their reserved items';
  end if;

  update public.payout_batches
    set partner_count = v_payable,
        total_amount_cents = v_total,
        updated_at = p_now
    where id = v_batch;

  return jsonb_build_object(
    'batchId', v_batch, 'month', v_month, 'livemode', p_livemode,
    'batchCreated', v_created, 'linesWritten', v_lines,
    'payableLines', v_payable, 'payableTotalCents', v_total,
    'thresholdCents', p_threshold_cents
  );
end $$;

revoke all on function public.gellatti_build_payout_batch_v1(date, boolean, timestamptz, integer)
  from public, anon, authenticated;

-- ── CLAIM: re-validate by C1 before any transfer ─────────────────────────────
create or replace function public.gellatti_claim_payout_lines_v1(
  p_batch_id uuid,
  p_limit integer default 10,
  p_now timestamptz default now()
) returns table (
  payout_id uuid,
  partner_id uuid,
  amount_cents integer,
  idempotency_key text,
  stripe_connect_account_id text,
  livemode boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_livemode boolean;
  v_line record;
  v_problem text;
  v_connect text;
begin
  select b.livemode into v_livemode from public.payout_batches b where b.id = p_batch_id;
  if v_livemode is null then raise exception 'payout_batch_not_found'; end if;
  perform public.gellatti_assert_payout_allowed_v1(v_livemode);

  for v_line in
    select pp.id, pp.partner_id, pp.amount_cents, pp.idempotency_key
    from public.partner_payouts pp
    where pp.batch_id = p_batch_id
      and pp.status = 'pending'
      and pp.stripe_transfer_id is null
      and pp.amount_cents > 0
    order by pp.created_at, pp.id
    limit greatest(coalesce(p_limit, 10), 0)
    -- two workers claim disjoint lines
    for update of pp skip locked
  loop
    -- Freeze the reserved entries while this line is validated.
    perform 1
      from public.commission_entries ce
      join public.partner_payout_items i on i.commission_entry_id = ce.id
      where i.payout_id = v_line.id and i.released_at is null
      for share of ce;

    v_problem := null;
    v_connect := null;
    select p.stripe_connect_account_id into v_connect
      from public.partners p where p.id = v_line.partner_id;

    if exists (
      select 1
      from public.partner_payout_items i
      join public.commission_entries ce on ce.id = i.commission_entry_id
      where i.payout_id = v_line.id and i.released_at is null and ce.status <> 'eligible'
    ) then
      v_problem := 'reserved_entry_no_longer_eligible';
    elsif exists (
      -- A correction the build did not count: on a reserved entry of this line,
      -- or on an entry a paid payout already settled.
      select 1
      from public.commission_adjustments ca
      join public.commission_entries ce on ce.id = ca.commission_entry_id
      where ce.partner_id = v_line.partner_id
        and ce.livemode = v_livemode
        and not exists (
          select 1 from public.partner_payout_items i2
          where i2.commission_adjustment_id = ca.id and i2.released_at is null
        )
        and (
          exists (
            select 1 from public.partner_payout_items i3
            where i3.commission_entry_id = ce.id and i3.payout_id = v_line.id and i3.released_at is null
          )
          or exists (
            select 1 from public.partner_payout_items i4
            join public.partner_payouts pp4 on pp4.id = i4.payout_id
            where i4.commission_entry_id = ce.id and i4.released_at is null and pp4.status = 'paid'
          )
        )
    ) then
      v_problem := 'correction_arrived_after_build';
    elsif (
      select coalesce(sum(i.amount_cents), 0)
      from public.partner_payout_items i
      where i.payout_id = v_line.id and i.released_at is null
    ) <> v_line.amount_cents then
      v_problem := 'reserved_items_do_not_sum_to_amount';
    elsif not exists (
      select 1 from public.partners p
      where p.id = v_line.partner_id
        and p.status = 'active'
        and coalesce(p.payouts_enabled, false)
        and coalesce(p.onboarding_complete, false)
        and p.stripe_connect_account_id is not null
    ) then
      v_problem := 'partner_not_payable';
    end if;

    if v_problem is not null then
      update public.partner_payouts
        set status = 'failed', failure_reason = 'stale_line:' || v_problem, updated_at = p_now
        where id = v_line.id;
      update public.partner_payout_items
        set released_at = p_now, release_reason = 'stale_line:' || v_problem
        where payout_id = v_line.id and released_at is null;
      perform public.gellatti_write_audit_v1(
        'payout.line_released_stale', 'partner_payouts', v_line.id::text,
        jsonb_build_object(
          'before', jsonb_build_object('status', 'pending', 'amountCents', v_line.amount_cents),
          'after', jsonb_build_object('status', 'failed', 'reservationReleased', true, 'amountImpactCents', 0)
        ),
        v_problem, p_batch_id::text, 'system', 'payout-claim'
      );
      continue;
    end if;

    update public.partner_payouts
      set status = 'processing', updated_at = p_now
      where id = v_line.id;

    payout_id := v_line.id;
    partner_id := v_line.partner_id;
    amount_cents := v_line.amount_cents;
    idempotency_key := v_line.idempotency_key;
    stripe_connect_account_id := v_connect;
    livemode := v_livemode;
    return next;
  end loop;
end $$;

revoke all on function public.gellatti_claim_payout_lines_v1(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- ── SETTLE: by S1 — bind nothing new ─────────────────────────────────────────
create or replace function public.gellatti_settle_payout_line_v2(
  p_payout_id uuid,
  p_stripe_transfer_id text,
  p_partner_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_livemode boolean,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_reserved integer;
  v_flipped integer;
begin
  if p_stripe_transfer_id is null or btrim(p_stripe_transfer_id) = '' then
    raise exception 'payout_paid_requires_transfer_id';
  end if;

  select pp.id, pp.partner_id, pp.amount_cents, pp.currency, pp.status,
         pp.stripe_transfer_id, b.livemode
    into v_line
    from public.partner_payouts pp
    join public.payout_batches b on b.id = pp.batch_id
    where pp.id = p_payout_id
    for update of pp;
  if not found then
    raise exception 'payout_line_not_found';
  end if;

  if v_line.status = 'paid' then
    if v_line.stripe_transfer_id = p_stripe_transfer_id then
      return jsonb_build_object('id', p_payout_id, 'status', 'paid', 'alreadySettled', true);
    end if;
    raise exception 'payout_line_already_paid_by_another_transfer';
  end if;
  if v_line.status <> 'processing' then
    raise exception 'payout_line_not_claimed';
  end if;
  if v_line.partner_id <> p_partner_id
     or v_line.amount_cents <> p_amount_cents
     or v_line.currency <> lower(btrim(coalesce(p_currency, '')))
     or v_line.livemode <> p_livemode then
    raise exception 'payout_settlement_does_not_match_line';
  end if;

  select coalesce(sum(i.amount_cents), 0) into v_reserved
    from public.partner_payout_items i
    where i.payout_id = p_payout_id and i.released_at is null;
  if v_reserved <> v_line.amount_cents then
    raise exception 'payout_items_do_not_sum_to_amount';
  end if;

  update public.partner_payouts
    set status = 'paid',
        stripe_transfer_id = p_stripe_transfer_id,
        paid_at = p_now,
        failure_reason = null,
        updated_at = p_now
    where id = p_payout_id;

  -- Only the entries this line reserved become paid. An entry reversed after the
  -- claim stays 'reversed': its gross WAS transferred, and its reversal
  -- adjustment, which this line did not reserve, nets as a post-payout
  -- correction in the next batch (N2b).
  with flipped as (
    update public.commission_entries ce
      set status = 'paid', updated_at = p_now
      from public.partner_payout_items i
      where i.payout_id = p_payout_id
        and i.released_at is null
        and i.commission_entry_id = ce.id
        and ce.status = 'eligible'
      returning 1
  )
  select count(*) into v_flipped from flipped;

  perform public.gellatti_write_audit_v1(
    'payout.line_settled', 'partner_payouts', p_payout_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('status', 'processing'),
      'after', jsonb_build_object(
        'status', 'paid', 'transferId', p_stripe_transfer_id,
        'amountCents', v_line.amount_cents, 'entriesPaid', v_flipped
      )
    ),
    'transfer confirmed by the operator', p_stripe_transfer_id, 'system', 'payout-settle'
  );

  return jsonb_build_object(
    'id', p_payout_id, 'status', 'paid',
    'amountCents', v_line.amount_cents, 'entriesPaid', v_flipped
  );
end $$;

revoke all on function public.gellatti_settle_payout_line_v2(uuid, text, uuid, integer, text, boolean, timestamptz)
  from public, anon, authenticated;

-- The unsafe settle (D2, D3) is withdrawn. It was never applied anywhere, and
-- nothing calls it.
drop function if exists public.gellatti_mark_payout_paid_v1(uuid, text, timestamptz);

-- ── FAIL: by F1 ──────────────────────────────────────────────────────────────
create or replace function public.gellatti_mark_payout_failed_v1(
  p_payout_id uuid,
  p_reason text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_released integer;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'payout_failure_requires_reason';
  end if;

  select pp.id, pp.status, pp.stripe_transfer_id, pp.amount_cents
    into v_line
    from public.partner_payouts pp
    where pp.id = p_payout_id
    for update;
  if not found then
    raise exception 'payout_line_not_found';
  end if;
  if v_line.status not in ('processing', 'pending') then
    raise exception 'payout_line_not_claimed_or_already_settled';
  end if;
  -- A line with a transfer id moved money: it is settled from the operator's
  -- truth, never failed here.
  if v_line.stripe_transfer_id is not null then
    raise exception 'payout_line_has_transfer_settle_it_instead';
  end if;

  update public.partner_payouts
    set status = 'failed', failure_reason = p_reason, paid_at = null, updated_at = p_now
    where id = p_payout_id;

  with released as (
    update public.partner_payout_items
      set released_at = p_now, release_reason = 'line_failed:' || p_reason
      where payout_id = p_payout_id and released_at is null
      returning 1
  )
  select count(*) into v_released from released;

  perform public.gellatti_write_audit_v1(
    'payout.line_failed', 'partner_payouts', p_payout_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('status', v_line.status, 'amountCents', v_line.amount_cents),
      'after', jsonb_build_object('status', 'failed', 'itemsReleased', v_released, 'amountImpactCents', 0)
    ),
    p_reason, p_payout_id::text, 'system', 'payout-worker'
  );

  return jsonb_build_object('id', p_payout_id, 'status', 'failed', 'reason', p_reason, 'itemsReleased', v_released);
end $$;

revoke all on function public.gellatti_mark_payout_failed_v1(uuid, text, timestamptz)
  from public, anon, authenticated;
