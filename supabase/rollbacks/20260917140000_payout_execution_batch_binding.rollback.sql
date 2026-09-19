-- ROLLBACK for 20260917140000_payout_execution_batch_binding.sql
--
-- STATUS: READY / NOT APPLIED. Run only if the forward migration was applied.
-- Restores the four function bodies of 20260831202500_payout_execution.sql
-- byte-identical (build, claim, mark paid, mark failed), removes the v2 settle,
-- and restores the original global unique indexes and item columns.
--
-- Refuses if any item was released: restoring the non-partial unique indexes
-- would otherwise either fail or silently drop the release history. Payout rows
-- are never deleted: they record money that moved.

begin;

do $guard$
begin
  if exists (select 1 from public.partner_payout_items where released_at is not null) then
    raise exception 'rollback refused: released payout items exist; resolve them by hand first';
  end if;
end
$guard$;

drop function if exists public.gellatti_settle_payout_line_v2(uuid, text, uuid, integer, text, boolean, timestamptz);

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

  -- P1: eligible entries plus adjustments, per partner. Adjustments are signed
  -- and are applied to gross, so a refund reversal or a post-payout clawback
  -- reduces (or inverts) the net without touching the immutable entry.
  with balances as (
    select
      p.id as partner_id,
      p.status as partner_status,
      coalesce(p.payouts_enabled, false) as payouts_enabled,
      coalesce(p.onboarding_complete, false) as onboarding_complete,
      -- Unsettled = not yet linked to any payout. partner_payout_items carries
      -- a GLOBAL partial-unique index per entry and per adjustment, so an
      -- amount can be paid by at most one payout ever, across all batches.
      coalesce((
        select sum(ce.amount_cents) from public.commission_entries ce
        where ce.partner_id = p.id and ce.status = 'eligible' and ce.livemode = p_livemode
          and not exists (
            select 1 from public.partner_payout_items i where i.commission_entry_id = ce.id
          )
      ), 0)::integer as gross_cents,
      coalesce((
        select sum(ca.amount_cents) from public.commission_adjustments ca
        join public.commission_entries ce2 on ce2.id = ca.commission_entry_id
        where ce2.partner_id = p.id and ce2.livemode = p_livemode
          and not exists (
            select 1 from public.partner_payout_items i where i.commission_adjustment_id = ca.id
          )
      ), 0)::integer as adjustment_cents
    from public.partners p
  ),
  netted as (
    select
      partner_id,
      partner_status,
      payouts_enabled,
      onboarding_complete,
      gross_cents,
      adjustment_cents,
      (gross_cents + adjustment_cents) as net_cents
    from balances
    -- nothing to say about a partner with no money in either direction
    where gross_cents <> 0 or adjustment_cents <> 0
  ),
  decided as (
    select
      partner_id,
      net_cents,
      case
        -- A suspended or terminated partner is never paid automatically; the
        -- balance carries forward untouched for a human decision.
        when partner_status <> 'active' then 'skipped_not_payable'
        -- Connect must be able to receive money.
        when not (payouts_enabled and onboarding_complete) then 'skipped_not_payable'
        -- P3: a negative net carries forward and blocks payment until positive.
        when net_cents < 0 then 'skipped_negative_balance'
        -- P4: nothing to send.
        when net_cents = 0 then 'skipped_below_threshold'
        -- P2: below the threshold carries forward untouched.
        when net_cents < p_threshold_cents then 'skipped_below_threshold'
        else 'pending'
      end as decision
    from netted
  ),
  written as (
    insert into public.partner_payouts
      (batch_id, partner_id, amount_cents, carry_forward_cents, currency, status, idempotency_key)
    select
      v_batch,
      partner_id,
      -- amount_cents is non-negative by constraint: only a payable line carries
      -- an amount, everything else records the balance as carry-forward.
      case when decision = 'pending' then net_cents else 0 end,
      case when decision = 'pending' then 0 else net_cents end,
      'eur',
      decision,
      -- P6: deterministic idempotency key — batchMonth + partner + currency + mode
      v_month::text || ':' || partner_id::text || ':eur:' || case when p_livemode then 'live' else 'test' end
    from decided
    on conflict (batch_id, partner_id) do nothing
    returning status, amount_cents
  )
  select
    count(*),
    count(*) filter (where status = 'pending'),
    coalesce(sum(amount_cents) filter (where status = 'pending'), 0)
  into v_lines, v_payable, v_total
  from written;

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
declare
  v_livemode boolean;
begin
  select b.livemode into v_livemode from public.payout_batches b where b.id = p_batch_id;
  if v_livemode is null then raise exception 'payout_batch_not_found'; end if;
  perform public.gellatti_assert_payout_allowed_v1(v_livemode);

  return query
  with due as (
    select pp.id
    from public.partner_payouts pp
    where pp.batch_id = p_batch_id
      and pp.status = 'pending'
      -- never re-transfer a line that already carries a transfer id
      and pp.stripe_transfer_id is null
      and pp.amount_cents > 0
    order by pp.created_at
    limit greatest(coalesce(p_limit, 10), 0)
    for update skip locked
  ),
  claimed as (
    update public.partner_payouts pp
      set status = 'processing', updated_at = p_now
      from due
      where pp.id = due.id
      returning pp.id, pp.partner_id, pp.amount_cents, pp.idempotency_key
  )
  select c.id, c.partner_id, c.amount_cents, c.idempotency_key,
         p.stripe_connect_account_id, v_livemode
  from claimed c
  join public.partners p on p.id = c.partner_id;
end $$;

revoke all on function public.gellatti_claim_payout_lines_v1(uuid, integer, timestamptz)
  from public, anon, authenticated;

create or replace function public.gellatti_mark_payout_paid_v1(
  p_payout_id uuid,
  p_stripe_transfer_id text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_amount integer;
  v_partner uuid;
begin
  if p_stripe_transfer_id is null or btrim(p_stripe_transfer_id) = '' then
    raise exception 'payout_paid_requires_transfer_id';
  end if;

  update public.partner_payouts
    set status = 'paid',
        stripe_transfer_id = p_stripe_transfer_id,
        paid_at = p_now,
        failure_reason = null,
        updated_at = p_now
    where id = p_payout_id and status in ('processing', 'pending')
    returning status, amount_cents, partner_id into v_status, v_amount, v_partner;

  if v_status is null then
    raise exception 'payout_line_not_claimed_or_already_settled';
  end if;

  -- Bind the settled entries and adjustments to THIS payout. The global
  -- partial-unique indexes on partner_payout_items are what make double
  -- payment impossible across batches; `on conflict do nothing` means a retry
  -- of this settle is harmless rather than a constraint violation.
  insert into public.partner_payout_items (payout_id, commission_entry_id, amount_cents)
    select p_payout_id, ce.id, ce.amount_cents
    from public.commission_entries ce
    where ce.partner_id = v_partner and ce.status = 'eligible'
      and not exists (
        select 1 from public.partner_payout_items i where i.commission_entry_id = ce.id
      )
    on conflict do nothing;

  insert into public.partner_payout_items (payout_id, commission_adjustment_id, amount_cents)
    select p_payout_id, ca.id, ca.amount_cents
    from public.commission_adjustments ca
    join public.commission_entries ce2 on ce2.id = ca.commission_entry_id
    where ce2.partner_id = v_partner
      and not exists (
        select 1 from public.partner_payout_items i where i.commission_adjustment_id = ca.id
      )
    on conflict do nothing;

  -- Only entries actually linked to this payout become 'paid'. The immutable
  -- financial fields are untouched; only the status advances (0018 rule).
  update public.commission_entries ce
    set status = 'paid', updated_at = p_now
    where ce.partner_id = v_partner and ce.status = 'eligible'
      and exists (
        select 1 from public.partner_payout_items i
        where i.commission_entry_id = ce.id and i.payout_id = p_payout_id
      );

  return jsonb_build_object('id', p_payout_id, 'status', v_status, 'amountCents', v_amount);
end $$;

revoke all on function public.gellatti_mark_payout_paid_v1(uuid, text, timestamptz)
  from public, anon, authenticated;

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
  v_status text;
begin
  update public.partner_payouts
    set status = 'failed',
        failure_reason = p_reason,
        stripe_transfer_id = null,
        paid_at = null,
        updated_at = p_now
    where id = p_payout_id and status in ('processing', 'pending')
    returning status into v_status;

  if v_status is null then
    raise exception 'payout_line_not_claimed_or_already_settled';
  end if;
  return jsonb_build_object('id', p_payout_id, 'status', v_status, 'reason', p_reason);
end $$;

revoke all on function public.gellatti_mark_payout_failed_v1(uuid, text, timestamptz)
  from public, anon, authenticated;

drop index if exists public.partner_payout_items_entry_active_uniq;
drop index if exists public.partner_payout_items_adjustment_active_uniq;
create unique index if not exists partner_payout_items_entry_uniq
  on public.partner_payout_items (commission_entry_id)
  where commission_entry_id is not null;
create unique index if not exists partner_payout_items_adjustment_uniq
  on public.partner_payout_items (commission_adjustment_id)
  where commission_adjustment_id is not null;

alter table public.partner_payout_items drop constraint if exists partner_payout_items_release_pair;
alter table public.partner_payout_items drop column if exists release_reason;
alter table public.partner_payout_items drop column if exists released_at;

commit;
