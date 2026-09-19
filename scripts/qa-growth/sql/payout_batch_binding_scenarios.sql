-- ============================================================================
-- QA ONLY — payout batch binding: reproducer BEFORE the fix, result AFTER it.
-- ============================================================================
-- Runs on the isolated QA branch (qa-growth-e2e, ncmsonfwbgsqedgnzofg) ONLY, as
-- ONE transaction that always aborts: the final RAISE carries the results and
-- rolls everything back, so QA keeps no fixture, no function and no batch.
-- Prerequisites: the QA replay has passed 20260826120000 (audit helper).
--
-- Expected values are written by hand below; nothing is computed by the code
-- under test. Amounts are fixture values, not programme rates.
do $scenario$
declare
  r jsonb := '{}'::jsonb;
  v_offer text := 'home_monthly_standard';
  pa uuid; pb uuid; pc uuid; pd uuid; pe uuid; pf uuid; pg uuid; ph uuid;
  e uuid; e2 uuid; v jsonb; v_line record; v_err text;
  mk_partner text;
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg') then
    raise exception 'isolation guard: not the QA branch';
  end if;

  -- ── fixtures: synthetic users and active, payable partners ──────────────────
  create temp table qa_partners (label text primary key, id uuid) on commit drop;
  for mk_partner in select unnest(array['A','B','C','D','E','F','G','H']) loop
    declare u uuid := gen_random_uuid(); p uuid;
    begin
      insert into auth.users (id, email) values (u, 'qa.payout.' || lower(mk_partner) || '@example.invalid');
      insert into public.partners (user_id, status, stripe_connect_account_id, onboarding_complete, payouts_enabled)
        values (u, 'active', 'acct_qa_' || lower(mk_partner) || '_' || substr(u::text, 1, 8), true, true)
        returning id into p;
      insert into qa_partners values (mk_partner, p);
    end;
  end loop;
  select id into pa from qa_partners where label = 'A';
  select id into pb from qa_partners where label = 'B';
  select id into pc from qa_partners where label = 'C';
  select id into pd from qa_partners where label = 'D';
  select id into pe from qa_partners where label = 'E';
  select id into pf from qa_partners where label = 'F';
  select id into pg from qa_partners where label = 'G';
  select id into ph from qa_partners where label = 'H';

  -- ── BEFORE: the original, unapplied payout execution ──────────────────────
  execute $orig$-- ============================================================================
-- GELLATTI — WORK WITH US §14: the PAYOUT EXECUTION layer
-- ============================================================================
-- Owner authority, 2026-08-31: "payoutNetting.ts remains the calculation
-- authority. Build the execution layer around it."
--
-- The lifecycle this implements:
--   earned → held → two full calendar months → eligible → netting
--   → EUR 25 threshold → payout batch → Connect transfer → reconciliation
--   → bank payout state → Partner statement → Admin
--
-- The tables (payout_batches, partner_payouts, partner_payout_items) already
-- existed with the right shape — including the skipped_* statuses and the
-- unique keys that make duplicate work impossible. What was missing was
-- everything that ACTUALLY RUNS. This migration supplies it.
--
-- ── THE LIVE KILL SWITCH ────────────────────────────────────────────────────
-- Owner: "Absolutely no Live transfer. Production automated payouts remain
-- disabled until a separate explicit OWNER release."
-- Every function that could move money refuses when p_livemode is true unless
-- payout_release_state says an owner released it. The default row is NOT
-- released, and only a service-role actor can change it. This is a hard gate,
-- not a feature flag read from config.

-- ── The release gate ─────────────────────────────────────────────────────────
create table if not exists public.payout_release_state (
  id boolean primary key default true check (id),
  live_payouts_released boolean not null default false,
  released_by_user_id uuid references auth.users (id),
  released_at timestamptz,
  release_note text,
  updated_at timestamptz not null default now()
);

insert into public.payout_release_state (id, live_payouts_released)
  values (true, false)
  on conflict (id) do nothing;

alter table public.payout_release_state enable row level security;
-- No policies and no grants: readable and writable by the service role only.

create or replace function public.gellatti_live_payouts_released_v1()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select live_payouts_released from public.payout_release_state where id), false);
$$;

revoke all on function public.gellatti_live_payouts_released_v1() from public, anon, authenticated;

-- Raise unless this execution is allowed to move money.
create or replace function public.gellatti_assert_payout_allowed_v1(p_livemode boolean)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_livemode and not public.gellatti_live_payouts_released_v1() then
    raise exception 'live_payouts_not_released'
      using hint = 'Live payouts require an explicit owner release in payout_release_state.';
  end if;
end $$;

revoke all on function public.gellatti_assert_payout_allowed_v1(boolean) from public, anon, authenticated;

-- ── STEP 1: held → eligible ──────────────────────────────────────────────────
-- eligible_at was computed by the two-full-calendar-month rule when the entry
-- was created (holdCalendar H1). This only flips the state once that instant
-- has passed. Idempotent: a re-run matches nothing new.
create or replace function public.gellatti_transition_eligible_commissions_v1(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with promoted as (
    update public.commission_entries
      set status = 'eligible', updated_at = p_now
      where status = 'held'
        and eligible_at <= p_now
      returning 1
  )
  select count(*) into v_count from promoted;
  return jsonb_build_object('promoted', v_count, 'at', p_now);
end $$;

revoke all on function public.gellatti_transition_eligible_commissions_v1(timestamptz)
  from public, anon, authenticated;

-- ── STEP 2: build the batch ──────────────────────────────────────────────────
-- payoutNetting.ts is the calculation authority; this reproduces P1..P5 in SQL
-- and the guard test asserts the constants match.
--
-- DUPLICATE SCHEDULER EXECUTION is handled twice over:
--   * `payout_batches_month_uniq` means only one batch row can exist per
--     (month, currency, livemode);
--   * an advisory lock serialises two concurrent builders so the second waits
--     and then finds the batch already populated rather than racing it.
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

-- ── STEP 3: claim a payout line for transfer ─────────────────────────────────
-- Same `for update skip locked` discipline as the email lane: two concurrent
-- workers claim disjoint lines instead of both transferring the same one.
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

-- ── STEP 4: settle a claimed line ────────────────────────────────────────────
-- The CRASH-AFTER-TRANSFER case: if the worker dies between Stripe accepting
-- the transfer and this commit, the line stays 'processing' with no transfer
-- id. The reconciler (step 5) then asks Stripe about the deterministic
-- idempotency key and settles it from the truth, so the money is never sent
-- twice and never lost from the record.
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

-- A failure returns the line to the batch WITHOUT paying it. The balance simply
-- carries forward: the entries stay 'eligible' and the next batch picks them up.
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

-- ── STEP 5: reconciliation ───────────────────────────────────────────────────
-- Lines stuck in 'processing' past a grace window are exactly the ambiguous
-- outcomes: a Stripe timeout, or a crash between transfer and commit. They are
-- listed here so the worker can ask Stripe about the idempotency key and settle
-- from the truth. NOTHING is auto-failed: assuming failure could double-pay.
create or replace function public.gellatti_stuck_payout_lines_v1(
  p_now timestamptz default now(),
  p_grace_minutes integer default 15
) returns table (
  payout_id uuid,
  batch_id uuid,
  partner_id uuid,
  amount_cents integer,
  idempotency_key text,
  stripe_connect_account_id text,
  livemode boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pp.id, pp.batch_id, pp.partner_id, pp.amount_cents, pp.idempotency_key,
         p.stripe_connect_account_id, b.livemode, pp.updated_at
  from public.partner_payouts pp
  join public.partners p on p.id = pp.partner_id
  join public.payout_batches b on b.id = pp.batch_id
  where pp.status = 'processing'
    and pp.stripe_transfer_id is null
    and pp.updated_at < p_now - make_interval(mins => greatest(coalesce(p_grace_minutes, 15), 1))
  order by pp.updated_at;
$$;

revoke all on function public.gellatti_stuck_payout_lines_v1(timestamptz, integer)
  from public, anon, authenticated;

-- Close a batch once nothing is left in flight.
create or replace function public.gellatti_close_payout_batch_v1(
  p_batch_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_flight integer;
  v_failed integer;
  v_status text;
begin
  select count(*) filter (where status in ('pending', 'processing')),
         count(*) filter (where status = 'failed')
    into v_in_flight, v_failed
  from public.partner_payouts where batch_id = p_batch_id;

  if v_in_flight > 0 then
    return jsonb_build_object('batchId', p_batch_id, 'status', 'processing', 'inFlight', v_in_flight);
  end if;

  v_status := case when v_failed > 0 then 'completed_with_errors' else 'completed' end;
  update public.payout_batches
    set status = v_status, completed_at = p_now, updated_at = p_now
    where id = p_batch_id;

  return jsonb_build_object('batchId', p_batch_id, 'status', v_status, 'failedLines', v_failed);
end $$;

revoke all on function public.gellatti_close_payout_batch_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- ── A MISSED monthly batch ───────────────────────────────────────────────────
-- Unlike the tier snapshot, a missed payout batch does NOT lose anything and is
-- NOT back-filled. The reasoning matters:
--
--   * commission entries stay 'eligible' until a payout actually settles them,
--     so a missed February batch simply means March's batch pays that money;
--   * creating a retroactive "February" batch in March would select the same
--     eligible set March would take, so it adds no money and no accuracy — it
--     only creates two batch rows competing for one set of entries;
--   * partner_payout_items would then refuse the second one anyway, leaving a
--     confusing empty batch on the record.
--
-- So the money self-heals and the batch row does not. What IS needed is to SEE
-- that a month was skipped, which is what this reports. Filling it is a
-- deliberate operator decision, made by calling the builder with an explicit
-- p_month, not something the scheduler should do behind anyone's back.
create or replace function public.gellatti_missing_payout_batch_months_v1(
  p_now timestamptz default now(),
  p_livemode boolean default false
) returns table (month date)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
      coalesce(
        (select date_trunc('month', (min(ce.earned_at) at time zone 'Europe/Madrid'))::date
         from public.commission_entries ce where ce.livemode = p_livemode),
        date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date
      ),
      date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date,
      interval '1 month'
    )::date as month
  )
  select m.month
  from months m
  where not exists (
    select 1 from public.payout_batches b
    where b.month = m.month and b.currency = 'eur' and b.livemode = p_livemode
  )
  order by m.month;
$$;

revoke all on function public.gellatti_missing_payout_batch_months_v1(timestamptz, boolean)
  from public, anon, authenticated;

-- ── Partner statement + Admin ────────────────────────────────────────────────
create or replace function public.gellatti_admin_payout_batches_v1(
  p_limit integer default 50
) returns table (
  id uuid, month date, currency text, livemode boolean, status text,
  partner_count integer, total_amount_cents integer,
  started_at timestamptz, completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', auth.uid()) then
    raise exception 'administrator_required';
  end if;
  return query
    select b.id, b.month, b.currency, b.livemode, b.status, b.partner_count,
           b.total_amount_cents, b.started_at, b.completed_at
    from public.payout_batches b
    order by b.month desc
    limit greatest(coalesce(p_limit, 50), 1);
end $$;

revoke all on function public.gellatti_admin_payout_batches_v1(integer) from public, anon;
grant execute on function public.gellatti_admin_payout_batches_v1(integer) to authenticated;

-- ── GRANT SURFACE ───────────────────────────────────────────────────────────
-- The project carries ALTER DEFAULT PRIVILEGES on schema public granting ALL
-- (`arwdDxtm`) on every NEW table to anon and authenticated. A new table is
-- therefore fully writable by any signed-in user the moment it is created, and
-- omitting a grant achieves nothing. RLS contains it, but a table that decides
-- money or holds personal data should not have RLS as its ONLY barrier.
-- Found live after 20260831200500; see
-- 20260831200600_partner_rate_profiles_grant_surface.sql for the full evidence.
revoke all on public.payout_release_state from anon, authenticated;
-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   drop function if exists public.gellatti_admin_payout_batches_v1(integer);
--   drop function if exists public.gellatti_missing_payout_batch_months_v1(timestamptz, boolean);
--   drop function if exists public.gellatti_close_payout_batch_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_stuck_payout_lines_v1(timestamptz, integer);
--   drop function if exists public.gellatti_mark_payout_failed_v1(uuid, text, timestamptz);
--   drop function if exists public.gellatti_mark_payout_paid_v1(uuid, text, timestamptz);
--   drop function if exists public.gellatti_claim_payout_lines_v1(uuid, integer, timestamptz);
--   drop function if exists public.gellatti_build_payout_batch_v1(date, boolean, timestamptz, integer);
--   drop function if exists public.gellatti_transition_eligible_commissions_v1(timestamptz);
--   drop function if exists public.gellatti_assert_payout_allowed_v1(boolean);
--   drop function if exists public.gellatti_live_payouts_released_v1();
--   drop table if exists public.payout_release_state;
-- Payout rows are NOT removed: they record money that moved.
-- ============================================================================
$orig$;

  -- D1 reproducer: 1000 eligible, fully refunded before any payout.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pa, 'sub_qa_a', v_offer, 'home', 'monthly', 'standard', 1, 1000, 'reversed', '2026-01-10T10:00:00Z', '2026-03-31T22:00:00Z', false) returning id into e;
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pa, e, -1000, 'refund_reversal', 'qa full refund', 'obj:re_qa_a');
  v := public.gellatti_build_payout_batch_v1('2026-05-01', false, '2026-05-01T02:45:00Z', 2500);
  r := r || jsonb_build_object('before_D1_partnerA', (select jsonb_build_object('status', status, 'carryForwardCents', carry_forward_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pa));
  -- expected BEFORE (the defect): skipped_negative_balance, carry -1000

  -- D3 reproducer: build reserves nothing; a refund after build is bound at settle.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pc, 'sub_qa_c', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-02-10T10:00:00Z', '2026-04-30T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2026-06-01', false, '2026-06-01T02:45:00Z', 2500);
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pc, e, -500, 'refund_reversal', 'qa refund after build', 'obj:re_qa_c1');
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-06-01T03:00:00Z') where partner_id = pc;
  perform public.gellatti_mark_payout_paid_v1(v_line.payout_id, 'tr_qa_c_before', '2026-06-01T03:05:00Z');
  r := r || jsonb_build_object('before_D3_partnerC', jsonb_build_object(
    'transferredCents', v_line.amount_cents,
    'boundAdjustmentCents', (select coalesce(sum(i.amount_cents), 0) from public.partner_payout_items i where i.payout_id = v_line.payout_id and i.commission_adjustment_id is not null)));
  -- expected BEFORE (the defect): transferred 3000 AND the -500 bound as settled -> never netted

  -- Reset the payout layer state for the AFTER phase (same transaction).
  delete from public.partner_payout_items;
  delete from public.partner_payouts;
  delete from public.payout_batches;
  delete from public.commission_adjustments where partner_id in (select id from qa_partners);
  delete from public.commission_entries where partner_id in (select id from qa_partners);

  -- ── AFTER: the corrective migration ────────────────────────────────────────
  execute $fix$-- ============================================================================
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
$fix$;

  -- A: 1000 fully refunded before payout nets 0 -> no line at all.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pa, 'sub_qa_a', v_offer, 'home', 'monthly', 'standard', 1, 1000, 'reversed', '2026-01-10T10:00:00Z', '2026-03-31T22:00:00Z', false) returning id into e;
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pa, e, -1000, 'refund_reversal', 'qa full refund', 'obj:re_qa_a');
  -- B: 1000 with a 300 refund nets 700 once (threshold 500 so it pays).
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pb, 'sub_qa_b', v_offer, 'home', 'monthly', 'standard', 1, 1000, 'eligible', '2026-01-12T10:00:00Z', '2026-03-31T22:00:00Z', false) returning id into e;
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pb, e, -300, 'refund_reversal', 'qa partial refund', 'obj:re_qa_b');

  v := public.gellatti_build_payout_batch_v1('2026-05-01', false, '2026-05-01T02:45:00Z', 500);
  r := r || jsonb_build_object(
    'after_A_line_exists', exists (select 1 from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pa),
    'after_B_line', (select jsonb_build_object('status', status, 'amountCents', amount_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pb),
    'after_B_reserved', (select jsonb_agg(i.amount_cents order by i.amount_cents desc) from public.partner_payout_items i join public.partner_payouts pp on pp.id = i.payout_id where pp.partner_id = pb and i.released_at is null)
  );
  -- expected AFTER: A none; B pending 700 with reserved [1000, -300]

  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-05-01T03:00:00Z') where partner_id = pb;
  v := public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_b', pb, 700, 'EUR', false, '2026-05-01T03:05:00Z');
  v := public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_b', pb, 700, 'EUR', false, '2026-05-01T03:06:00Z');
  r := r || jsonb_build_object('after_B_settle_again_same_transfer', v->>'alreadySettled');
  begin
    perform public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_other', pb, 700, 'EUR', false, '2026-05-01T03:07:00Z');
    r := r || jsonb_build_object('after_B_other_transfer', 'ACCEPTED');
  exception when others then
    r := r || jsonb_build_object('after_B_other_transfer', sqlerrm);
  end;
  v := public.gellatti_build_payout_batch_v1('2026-06-01', false, '2026-06-01T02:45:00Z', 500);
  r := r || jsonb_build_object('after_B_next_month_line_exists', exists (select 1 from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pb));
  -- expected AFTER: alreadySettled true; other transfer refused; no line next month (no re-deduction)

  -- C: a refund after build makes the line stale before any transfer.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pc, 'sub_qa_c', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-02-10T10:00:00Z', '2026-04-30T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2026-07-01', false, '2026-07-01T02:45:00Z', 2500);
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pc, e, -500, 'refund_reversal', 'qa refund after build', 'obj:re_qa_c1');
  perform count(*) from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-07-01T03:00:00Z');
  r := r || jsonb_build_object('after_C_line', (select jsonb_build_object('status', status, 'reason', failure_reason) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pc));
  v := public.gellatti_build_payout_batch_v1('2026-08-01', false, '2026-08-01T02:45:00Z', 2500);
  r := r || jsonb_build_object('after_C_next_line', (select jsonb_build_object('status', status, 'amountCents', amount_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pc));
  -- expected AFTER: failed 'stale_line:correction_arrived_after_build'; next month pending 2500

  -- D: an entry eligible after build is not paid by that line.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pd, 'sub_qa_d', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2026-09-01', false, '2026-09-01T02:45:00Z', 2500);
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pd, 'sub_qa_d2', v_offer, 'home', 'monthly', 'standard', 1, 2000, 'eligible', '2026-03-20T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e2;
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-09-01T03:00:00Z') where partner_id = pd;
  perform public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_d', pd, 3000, 'eur', false, '2026-09-01T03:05:00Z');
  r := r || jsonb_build_object('after_D_statuses', jsonb_build_object('first', (select status from public.commission_entries where id = e), 'late', (select status from public.commission_entries where id = e2)));
  -- expected AFTER: first paid, late eligible

  -- E: a TEST batch never binds LIVE money.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pe, 'sub_qa_e_live', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', true) returning id into e2;
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pe, 'sub_qa_e_test', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2026-10-01', false, '2026-10-01T02:45:00Z', 2500);
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-10-01T03:00:00Z') where partner_id = pe;
  perform public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_e', pe, 3000, 'eur', false, '2026-10-01T03:05:00Z');
  r := r || jsonb_build_object('after_E_statuses', jsonb_build_object('test', (select status from public.commission_entries where id = e), 'live', (select status from public.commission_entries where id = e2)));
  -- expected AFTER: test paid, live eligible

  -- F: a refund after payout nets into the next batch and stays a visible negative.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pf, 'sub_qa_f', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2026-11-01', false, '2026-11-01T02:45:00Z', 2500);
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2026-11-01T03:00:00Z') where partner_id = pf;
  perform public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_f', pf, 3000, 'eur', false, '2026-11-01T03:05:00Z');
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (pf, e, -3000, 'refund_reversal', 'qa refund after payout', 'obj:re_qa_f');
  v := public.gellatti_build_payout_batch_v1('2026-12-01', false, '2026-12-01T02:45:00Z', 2500);
  r := r || jsonb_build_object('after_F_next_line', (select jsonb_build_object('status', status, 'carryForwardCents', carry_forward_cents, 'amountCents', amount_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pf),
                               'after_F_first_payout_kept', (select status from public.partner_payouts where stripe_transfer_id = 'tr_qa_f'));
  -- expected AFTER: skipped_negative_balance carry -3000 amount 0; first payout still paid

  -- G: a failed line releases, and the next batch picks the money up again.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (pg, 'sub_qa_g', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2027-01-01', false, '2027-01-01T02:45:00Z', 2500);
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2027-01-01T03:00:00Z') where partner_id = pg;
  perform public.gellatti_mark_payout_failed_v1(v_line.payout_id, 'qa bank rejected', '2027-01-01T03:05:00Z');
  v := public.gellatti_build_payout_batch_v1('2027-02-01', false, '2027-02-01T02:45:00Z', 2500);
  r := r || jsonb_build_object('after_G', jsonb_build_object(
    'releasedItems', (select count(*) from public.partner_payout_items where payout_id = v_line.payout_id and released_at is not null),
    'nextLine', (select jsonb_build_object('status', status, 'amountCents', amount_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = pg)));
  -- expected AFTER: 1 released item; next month pending 3000

  -- H: an entry reversed after claim; the transfer still settles, the reversal nets next.
  insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier, rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (ph, 'sub_qa_h', v_offer, 'home', 'monthly', 'standard', 1, 3000, 'eligible', '2026-03-10T10:00:00Z', '2026-05-31T22:00:00Z', false) returning id into e;
  v := public.gellatti_build_payout_batch_v1('2027-03-01', false, '2027-03-01T02:45:00Z', 2500);
  select * into v_line from public.gellatti_claim_payout_lines_v1((v->>'batchId')::uuid, 10, '2027-03-01T03:00:00Z') where partner_id = ph;
  update public.commission_entries set status = 'reversed' where id = e;
  insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    values (ph, e, -3000, 'refund_reversal', 'qa reversal after claim', 'obj:re_qa_h');
  perform public.gellatti_settle_payout_line_v2(v_line.payout_id, 'tr_qa_h', ph, 3000, 'eur', false, '2027-03-01T03:05:00Z');
  v := public.gellatti_build_payout_batch_v1('2027-04-01', false, '2027-04-01T02:45:00Z', 2500);
  r := r || jsonb_build_object('after_H', jsonb_build_object(
    'entryStatus', (select status from public.commission_entries where id = e),
    'nextLine', (select jsonb_build_object('status', status, 'carryForwardCents', carry_forward_cents) from public.partner_payouts where batch_id = (v->>'batchId')::uuid and partner_id = ph)));
  -- expected AFTER: entry reversed; next month skipped_negative_balance carry -3000

  raise exception 'QA_SCENARIO_RESULTS %', r::text;
end
$scenario$;
