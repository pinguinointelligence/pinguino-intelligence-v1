-- ============================================================================
-- GELLATTI — WORK WITH US §10: the monthly partner TIER SNAPSHOT WRITER
-- ============================================================================
-- Owner authority, 2026-08-31: "Gold must be REAL, not just calculated."
--
-- `partner_tier_snapshots` already existed and `stripe-webhook/dispatch.ts`
-- already READS it (and defers the event when it is missing), but NOTHING EVER
-- WROTE IT. Gold could therefore never activate at runtime no matter how many
-- referrals a partner landed. This migration supplies the missing writer.
--
-- The TS authority is src/billing/domain/tierSnapshots.ts (T1..T6); this is the
-- DB enforcement of the same rules, guarded by tierSnapshotWriter.migration.test.ts.
--
-- REQUIRED PROPERTIES (owner list):
--   * Europe/Madrid month boundaries
--   * HOME + PRO counted COMBINED
--   * 0–99 Standard, exactly 100 Gold
--   * an active Elite override wins
--   * the monthly snapshot is IMMUTABLE
--   * repeated execution is IDEMPOTENT
--   * later subscription-count changes never rewrite a written snapshot
--   * a downgrade takes effect at the NEXT monthly snapshot
--
-- IMMUTABILITY IS THE MECHANISM FOR THREE OF THOSE AT ONCE. The writer inserts
-- with `on conflict (partner_id, month) do nothing`. So the first write for a
-- month wins; re-running the job is a no-op; and a count that changes later in
-- the month cannot rewrite history. A downgrade simply appears in the NEXT
-- month's snapshot, which is exactly the owner's required behaviour.

-- ── The Gold threshold ───────────────────────────────────────────────────────
-- Constant rather than magic number, and asserted equal to the TS
-- DEFAULT_GOLD_THRESHOLD by the guard test.
create or replace function public.gellatti_gold_threshold_v1()
returns integer language sql immutable
as $$ select 100 $$;

-- ── T3: the eligible active referred subscription count ─────────────────────
-- Eligible = attributed to this partner, belonging to a REAL OTHER customer,
-- currently granting paid access at the given instant.
--
-- Counted (HOME + PRO combined, T3):
--   * 'active' and 'trialing' — the same statuses the app's access layer treats
--     as paid access, which T3 explicitly mirrors;
--   * 'past_due' ONLY while its already-paid period has not ended — that paid
--     window is the grace, not a fixed number of days.
--   * cancel_at_period_end is IGNORED on purpose: a subscription scheduled to
--     cancel still counts until its paid access actually ends.
--
-- Excluded: any other Stripe status (canceled, unpaid, incomplete, paused);
-- the partner's own account (self-referral); attributions that are not active.
--
-- POLICY NOTE for the owner: 'trialing' counts because T3 mirrors the access
-- layer. If Gold should require a subscription that has actually PAID, that is
-- a one-line change here plus the matching change in tierSnapshots.ts — flagged
-- rather than decided silently.
create or replace function public.gellatti_partner_active_referred_count_v1(
  p_partner_id uuid,
  p_at timestamptz
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct cs.id)::integer
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  join public.partners p on p.id = ra.partner_id
  where ra.partner_id = p_partner_id
    and ra.status = 'active'
    -- T3: a real OTHER customer. A partner never counts their own subscription.
    and cs.user_id <> p.user_id
    and (
      cs.status in ('active', 'trialing')
      -- grace is the already-paid window, never a fixed duration
      or (cs.status = 'past_due' and cs.current_period_end is not null
          and cs.current_period_end > p_at)
    );
$$;

revoke all on function public.gellatti_partner_active_referred_count_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- ── T4: is an Elite override in force at this instant? ──────────────────────
-- The Elite override record IS the rate profile (migration 20260831200500):
-- assigning Elite means creating a versioned rate profile, so the override and
-- the rates it implies can never disagree. A partner marked elite with no
-- profile would have no resolvable rate (RP7), so elite without a profile is
-- deliberately not a state this writer can produce.
create or replace function public.gellatti_partner_elite_active_v1(
  p_partner_id uuid,
  p_at timestamptz
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partner_rate_profiles rp
    where rp.partner_id = p_partner_id
      and rp.effective_start <= p_at
      and (rp.effective_end is null or p_at < rp.effective_end)
      and (rp.revoked_at    is null or p_at < rp.revoked_at)
  );
$$;

revoke all on function public.gellatti_partner_elite_active_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- ── T1/T2/T5: the writer ─────────────────────────────────────────────────────
-- p_month is the first day of the commission month in Europe/Madrid. The caller
-- (scheduler) supplies it; the default derives the CURRENT Madrid month, so a
-- plain invocation on the 1st does the right thing.
--
-- p_count_at is the instant the counts are measured. It defaults to now(), and
-- is an explicit parameter so a backfill or a test can measure a specific
-- instant rather than "whenever the job happened to run".
create or replace function public.gellatti_write_partner_tier_snapshots_v1(
  p_month date default null,
  p_count_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_threshold integer := public.gellatti_gold_threshold_v1();
  v_written integer := 0;
  v_skipped integer := 0;
  v_considered integer := 0;
begin
  -- Europe/Madrid month boundary. `p_count_at at time zone 'Europe/Madrid'`
  -- converts the instant to Madrid wall-clock, so an instant at 23:30 UTC on
  -- 31 March lands in the April snapshot, matching holdCalendar's H3.
  v_month := coalesce(
    p_month,
    date_trunc('month', (p_count_at at time zone 'Europe/Madrid'))::date
  );

  if extract(day from v_month) <> 1 then
    raise exception 'tier_snapshot_month_must_be_first_of_month';
  end if;

  with candidates as (
    select
      p.id as partner_id,
      public.gellatti_partner_active_referred_count_v1(p.id, p_count_at) as active_count,
      public.gellatti_partner_elite_active_v1(p.id, p_count_at) as elite
    from public.partners p
    -- A suspended or terminated partner earns nothing, so no snapshot is
    -- written for them; their historical snapshots stay untouched.
    where p.status = 'active'
  ),
  resolved as (
    select
      partner_id,
      active_count,
      elite,
      case
        -- T4: an active Elite override beats the automatic tier.
        when elite then 'elite'
        -- T2: Gold at exactly the threshold, so 99 is Standard and 100 is Gold.
        when active_count >= v_threshold then 'gold'
        -- T1: Standard is the default.
        else 'standard'
      end as tier
    from candidates
  ),
  inserted as (
    insert into public.partner_tier_snapshots
      (partner_id, month, tier, active_subscription_count, elite_override, computed_at)
    select partner_id, v_month, tier, active_count, elite, p_count_at
    from resolved
    -- T5/T6 IMMUTABILITY: the first snapshot for a month wins. A re-run is a
    -- no-op, and a later count change cannot rewrite what was recorded.
    on conflict (partner_id, month) do nothing
    returning 1
  )
  select
    (select count(*) from resolved),
    (select count(*) from inserted)
  into v_considered, v_written;

  v_skipped := v_considered - v_written;

  return jsonb_build_object(
    'month', v_month,
    'threshold', v_threshold,
    'partnersConsidered', v_considered,
    'snapshotsWritten', v_written,
    -- skipped = already had a snapshot for this month. On a second run of the
    -- same month this equals partnersConsidered, which is what idempotent looks
    -- like from the outside.
    'snapshotsSkipped', v_skipped,
    'countedAt', p_count_at
  );
end $$;

revoke all on function public.gellatti_write_partner_tier_snapshots_v1(date, timestamptz)
  from public, anon, authenticated;

-- ── CATCH-UP: a MISSED monthly invocation ────────────────────────────────────
-- The writer above derives the CURRENT Madrid month, so an invocation on
-- 3 March writes March. On its own a missed 1 February run would leave February
-- with no snapshot forever — and a February commission would defer on
-- `tier_snapshot_missing` indefinitely, because dispatch.ts refuses to borrow
-- another month's tier.
--
-- ── WHY THIS MAY NOT USE TODAY'S COUNT (owner ruling, 2026-08-31) ───────────
-- An earlier draft filled a missing month with the CURRENT count. That is
-- rejected, and rightly: a February boundary of 105 actives is Gold, but if
-- March has fallen to 87 a late catch-up would write February as Standard and
-- silently underpay every February commission. The inverse overpays. A tier
-- snapshot must represent ITS OWN boundary or it must not exist.
--
-- Equally forbidden: borrowing the previous month's tier, the next month's
-- tier, the partners.tier mirror, or anything from a client payload.
--
-- ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────
-- It RECONSTRUCTS the count as-of the missed boundary from immutable history,
-- and refuses to write anything when that reconstruction cannot be proven.
--
-- The historical source is `stripe_webhook_events`. Payloads are retained
-- (0021: "payload is audit/debug evidence"), and a Stripe
-- `customer.subscription.*` payload carries the subscription's status,
-- current_period_end and cancellation fields at that instant. Ordering uses the
-- payload's own `created` timestamp, NOT received_at: received_at is when we
-- happened to receive it, which is wrong if delivery was late or out of order.

-- The subscription's state as it stood at an arbitrary instant, read from the
-- last event Stripe emitted about it at or before that instant.
create or replace function public.gellatti_subscription_state_asof_v1(
  p_stripe_subscription_id text,
  p_at timestamptz
) returns table (
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  event_created timestamptz,
  ambiguous boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      e.payload->'data'->'object'->>'status' as status,
      case
        when (e.payload->'data'->'object'->>'current_period_end') ~ '^[0-9]+$'
        then to_timestamp((e.payload->'data'->'object'->>'current_period_end')::bigint)
      end as current_period_end,
      coalesce((e.payload->'data'->'object'->>'cancel_at_period_end')::boolean, false)
        as cancel_at_period_end,
      (e.payload->>'created')::bigint as created_epoch
    from public.stripe_webhook_events e
    where e.event_type like 'customer.subscription.%'
      and e.payload->'data'->'object'->>'id' = p_stripe_subscription_id
      and (e.payload->>'created') ~ '^[0-9]+$'
      and to_timestamp((e.payload->>'created')::bigint) <= p_at
  ),
  newest as (select max(created_epoch) as created_epoch from candidates)
  select
    c.status,
    c.current_period_end,
    c.cancel_at_period_end,
    to_timestamp(c.created_epoch),
    -- AMBIGUOUS: two or more events share the newest timestamp AND disagree on
    -- status. Stripe emits at second resolution, so a tie is possible; a tie we
    -- cannot order is a fact we do not have.
    (select count(distinct c2.status) > 1 from candidates c2
      where c2.created_epoch = c.created_epoch)
  from candidates c
  join newest n on n.created_epoch = c.created_epoch
  limit 1;
$$;

revoke all on function public.gellatti_subscription_state_asof_v1(text, timestamptz)
  from public, anon, authenticated;

-- Can the count for this partner be reconstructed at this instant at all?
--
-- Two conditions, both necessary:
--   1. the event log must reach back before the boundary — if the boundary
--      predates the first event we ever stored there is simply no history;
--   2. every attributed subscription that already existed at the boundary must
--      have at least one subscription event at or before it. A subscription
--      with no event is a hole, and a hole means the count is a guess.
create or replace function public.gellatti_tier_reconstruction_blocker_v1(
  p_partner_id uuid,
  p_at timestamptz
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_log_start timestamptz;
  v_n integer;
begin
  -- THE PROOF PREDICATE. Reconstruction may call itself PROVEN only when every
  -- threshold-relevant subscription's state at the boundary is DETERMINABLE
  -- from stored facts. An unknown is never resolved to "inactive" — that would
  -- undercount and silently downgrade a partner — nor to "active", which would
  -- overcount. An unknown makes the whole month unproven.

  -- (1) Is there any history at all, and does it reach back far enough?
  select min(to_timestamp((payload->>'created')::bigint)) into v_log_start
  from public.stripe_webhook_events
  where (payload->>'created') ~ '^[0-9]+$';

  if v_log_start is null then
    return 'no_event_history';
  end if;
  if p_at < v_log_start then
    return 'history_before_retention_start';
  end if;

  -- (2) Attribution ownership must be a settled historical fact at the
  -- boundary. `locked_at` is durable (A3: locked for the commissionable
  -- lifetime); `status` is mutable and tells us nothing about the past. A row
  -- that existed at the boundary but was not yet locked is genuinely unknown.
  select count(*) into v_n
  from public.referral_attributions ra
  where ra.partner_id = p_partner_id
    and ra.created_at <= p_at
    and ra.subscription_id is not null
    and (ra.locked_at is null or ra.locked_at > p_at)
    and ra.status <> 'expired';
  if v_n > 0 then
    return 'attribution_history_missing';
  end if;

  -- (3) Every owned subscription that already existed must have a state we can
  -- read at the boundary. No event at or before it = missing initial state.
  select count(*) into v_n
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  where ra.partner_id = p_partner_id
    and ra.locked_at is not null and ra.locked_at <= p_at
    and cs.created_at <= p_at
    and not exists (
      select 1 from public.gellatti_subscription_state_asof_v1(cs.stripe_subscription_id, p_at)
    );
  if v_n > 0 then
    return 'missing_initial_state';
  end if;

  -- (4) The newest event at the boundary must be unambiguous. Stripe stamps at
  -- second resolution, so two events can tie; a tie whose statuses disagree
  -- cannot be ordered from stored facts.
  select count(*) into v_n
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  cross join lateral public.gellatti_subscription_state_asof_v1(cs.stripe_subscription_id, p_at) st
  where ra.partner_id = p_partner_id
    and ra.locked_at is not null and ra.locked_at <= p_at
    and cs.created_at <= p_at
    and st.ambiguous;
  if v_n > 0 then
    return 'ambiguous_event_sequence';
  end if;

  -- (5) A state we cannot classify is not a state we know. Any status outside
  -- the T3 vocabulary means the predicate cannot be evaluated.
  select count(*) into v_n
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  cross join lateral public.gellatti_subscription_state_asof_v1(cs.stripe_subscription_id, p_at) st
  where ra.partner_id = p_partner_id
    and ra.locked_at is not null and ra.locked_at <= p_at
    and cs.created_at <= p_at
    and (st.status is null
         or st.status not in ('active','trialing','past_due','canceled','unpaid',
                              'incomplete','incomplete_expired','paused'));
  if v_n > 0 then
    return 'subscription_state_unknown';
  end if;

  -- (6) Where the verdict DEPENDS on the paid window, that window must be
  -- known. past_due, and active/trialing that is cancelling, both turn on
  -- current_period_end; without it the answer is unproven rather than false.
  select count(*) into v_n
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  cross join lateral public.gellatti_subscription_state_asof_v1(cs.stripe_subscription_id, p_at) st
  where ra.partner_id = p_partner_id
    and ra.locked_at is not null and ra.locked_at <= p_at
    and cs.created_at <= p_at
    and st.current_period_end is null
    and (st.status = 'past_due'
         or (st.status in ('active','trialing') and st.cancel_at_period_end));
  if v_n > 0 then
    return 'payment_state_unproven';
  end if;

  return null;
end $$;

revoke all on function public.gellatti_tier_reconstruction_blocker_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- The count AS OF a historical boundary. Same T3 eligibility rule as the live
-- counter, applied to the reconstructed state rather than the cache.
create or replace function public.gellatti_partner_referred_count_asof_v1(
  p_partner_id uuid,
  p_at timestamptz
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- MIRRORS isEligibleReferredSubscription() in tierSnapshots.ts (T3) exactly.
  -- There is ONE definition of "active paid referral" and this is not a second
  -- one: every branch below corresponds to a branch there.
  --
  -- entitlement = 'paid' is satisfied BY CONSTRUCTION here: an invite trial and
  -- a partner's own free access create no Stripe subscription at all
  -- (inviteCodes I5, locked decision 8), so anything present in
  -- customer_subscriptions with a Stripe id is a paid-subscription source.
  select count(distinct cs.id)::integer
  from public.referral_attributions ra
  join public.customer_subscriptions cs on cs.id = ra.subscription_id
  join public.partners p on p.id = ra.partner_id
  cross join lateral public.gellatti_subscription_state_asof_v1(cs.stripe_subscription_id, p_at) st
  where ra.partner_id = p_partner_id
    -- A3: ownership is permanent once locked, so locked_at is the durable
    -- historical fact. The mutable `status` column is deliberately NOT used.
    and ra.locked_at is not null
    and ra.locked_at <= p_at
    -- T3: a real OTHER customer
    and cs.user_id <> p.user_id
    -- T3: fraud-reversed commissions never count
    and not exists (
      select 1 from public.commission_adjustments ca
      join public.commission_entries ce on ce.id = ca.commission_entry_id
      where ce.partner_id = p_partner_id
        and ce.stripe_subscription_id = cs.stripe_subscription_id
        and ca.reason = 'fraud'
    )
    and (
      -- T3: active/trialing count; if cancelling at period end they count only
      -- while the paid window has not closed.
      (st.status in ('active', 'trialing')
        and (
          not st.cancel_at_period_end
          or (st.current_period_end is not null and st.current_period_end > p_at)
        ))
      -- T3: past_due counts only inside the already-paid window
      or (st.status = 'past_due'
        and st.current_period_end is not null
        and st.current_period_end > p_at)
      -- T3: canceled / unpaid / incomplete / incomplete_expired / paused never count
    );
$$;

revoke all on function public.gellatti_partner_referred_count_asof_v1(uuid, timestamptz)
  from public, anon, authenticated;

-- ── The typed state for a month that cannot be reconstructed ─────────────────
-- Nothing is guessed and nothing is written. The gap is recorded so Admin can
-- see the month, the partner, the reason and what it blocks; the affected
-- commissions stay deferred until a human resolves it.
create table if not exists public.partner_tier_snapshot_gaps (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  month date not null check (extract(day from month) = 1),
  state text not null default 'historical_snapshot_reconciliation_required'
    check (state in ('historical_snapshot_reconciliation_required', 'resolved')),
  -- Machine-readable, one per proof-predicate clause. Never free text.
  reason text not null check (reason in (
    'no_event_history',
    'history_before_retention_start',
    'attribution_history_missing',
    'missing_initial_state',
    'ambiguous_event_sequence',
    'subscription_state_unknown',
    'payment_state_unproven'
  )),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users (id),
  resolution_note text,
  constraint partner_tier_snapshot_gaps_uniq unique (partner_id, month)
);

alter table public.partner_tier_snapshot_gaps enable row level security;
-- No policy, no grant: operator-facing, read through the admin function below.

-- Which months are missing a snapshot?
create or replace function public.gellatti_missing_tier_snapshot_months_v1(
  p_now timestamptz default now()
) returns table (month date, partners_missing integer)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
      coalesce(
        (select date_trunc('month', (min(p.created_at) at time zone 'Europe/Madrid'))::date
         from public.partners p where p.status = 'active'),
        date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date
      ),
      date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date,
      interval '1 month'
    )::date as month
  )
  select m.month, count(p.id)::integer
  from months m
  join public.partners p
    on p.status = 'active'
   and date_trunc('month', (p.created_at at time zone 'Europe/Madrid'))::date <= m.month
  where not exists (
    select 1 from public.partner_tier_snapshots s
    where s.partner_id = p.id and s.month = m.month
  )
  group by m.month
  having count(p.id) > 0
  order by m.month;
$$;

revoke all on function public.gellatti_missing_tier_snapshot_months_v1(timestamptz)
  from public, anon, authenticated;

-- Fill every missing month FROM ITS OWN BOUNDARY, or record why it cannot be.
--
-- The boundary instant is Madrid midnight on the 1st — the same instant the
-- on-time job would have measured, so a late run and an on-time run produce the
-- SAME snapshot. That equality is the whole point.
create or replace function public.gellatti_catchup_partner_tier_snapshots_v1(
  p_now timestamptz default now(),
  p_max_months integer default 12
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_boundary timestamptz;
  v_threshold integer := public.gellatti_gold_threshold_v1();
  v_partner record;
  v_blocker text;
  v_count integer;
  v_elite boolean;
  v_written integer := 0;
  v_blocked integer := 0;
begin
  for v_month in
    select month from public.gellatti_missing_tier_snapshot_months_v1(p_now)
    order by month
    limit greatest(coalesce(p_max_months, 12), 1)
  loop
    -- Madrid midnight on the 1st, as a UTC instant.
    v_boundary := (v_month::timestamp at time zone 'Europe/Madrid');

    for v_partner in
      select p.id from public.partners p
      where p.status = 'active'
        and date_trunc('month', (p.created_at at time zone 'Europe/Madrid'))::date <= v_month
        and not exists (
          select 1 from public.partner_tier_snapshots s
          where s.partner_id = p.id and s.month = v_month
        )
    loop
      v_blocker := public.gellatti_tier_reconstruction_blocker_v1(v_partner.id, v_boundary);

      if v_blocker is not null then
        -- NOTHING is written. The month stays absent, the commissions stay
        -- deferred, and the reason is recorded for a human.
        insert into public.partner_tier_snapshot_gaps (partner_id, month, reason)
          values (v_partner.id, v_month, v_blocker)
          on conflict (partner_id, month) do nothing;
        v_blocked := v_blocked + 1;
        continue;
      end if;

      v_count := public.gellatti_partner_referred_count_asof_v1(v_partner.id, v_boundary);
      -- Elite obeys the same historical-time rule: the override in force AT the
      -- boundary, never the one in force today.
      v_elite := public.gellatti_partner_elite_active_v1(v_partner.id, v_boundary);

      insert into public.partner_tier_snapshots
        (partner_id, month, tier, active_subscription_count, elite_override, computed_at)
      values (
        v_partner.id, v_month,
        case when v_elite then 'elite'
             when v_count >= v_threshold then 'gold'
             else 'standard' end,
        v_count, v_elite, p_now
      )
      on conflict (partner_id, month) do nothing;
      v_written := v_written + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'snapshotsWritten', v_written,
    'partnersBlocked', v_blocked,
    'late', v_written > 0 or v_blocked > 0
  );
end $$;

revoke all on function public.gellatti_catchup_partner_tier_snapshots_v1(timestamptz, integer)
  from public, anon, authenticated;

-- Admin: the unreconstructable months, with everything needed to act.
create or replace function public.gellatti_admin_tier_snapshot_gaps_v1(
  p_limit integer default 200
) returns table (
  partner_id uuid, month date, state text, reason text, detected_at timestamptz,
  affected_commission_entries integer, affected_amount_cents bigint
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
    select g.partner_id, g.month, g.state, g.reason, g.detected_at,
           (select count(*)::integer from public.commission_entries ce
             where ce.partner_id = g.partner_id
               and date_trunc('month', (ce.earned_at at time zone 'Europe/Madrid'))::date = g.month),
           (select coalesce(sum(ce.amount_cents), 0)::bigint from public.commission_entries ce
             where ce.partner_id = g.partner_id
               and date_trunc('month', (ce.earned_at at time zone 'Europe/Madrid'))::date = g.month)
    from public.partner_tier_snapshot_gaps g
    where g.state = 'historical_snapshot_reconciliation_required'
    order by g.month, g.partner_id
    limit greatest(coalesce(p_limit, 200), 1);
end $$;

revoke all on function public.gellatti_admin_tier_snapshot_gaps_v1(integer) from public, anon;
grant execute on function public.gellatti_admin_tier_snapshot_gaps_v1(integer) to authenticated;

-- ── Admin read ───────────────────────────────────────────────────────────────
create or replace function public.gellatti_admin_partner_tier_snapshots_v1(
  p_partner_id uuid default null,
  p_limit integer default 200
) returns table (
  partner_id uuid,
  month date,
  tier text,
  active_subscription_count integer,
  elite_override boolean,
  computed_at timestamptz
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
    select s.partner_id, s.month, s.tier, s.active_subscription_count,
           s.elite_override, s.computed_at
    from public.partner_tier_snapshots s
    where p_partner_id is null or s.partner_id = p_partner_id
    order by s.month desc, s.partner_id
    limit greatest(coalesce(p_limit, 200), 1);
end $$;

revoke all on function public.gellatti_admin_partner_tier_snapshots_v1(uuid, integer) from public, anon;
grant execute on function public.gellatti_admin_partner_tier_snapshots_v1(uuid, integer) to authenticated;

-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   drop function if exists public.gellatti_admin_partner_tier_snapshots_v1(uuid, integer);
--   drop function if exists public.gellatti_admin_tier_snapshot_gaps_v1(integer);
--   drop function if exists public.gellatti_catchup_partner_tier_snapshots_v1(timestamptz, integer);
--   drop function if exists public.gellatti_missing_tier_snapshot_months_v1(timestamptz);
--   drop function if exists public.gellatti_partner_referred_count_asof_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_tier_reconstruction_blocker_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_subscription_state_asof_v1(text, timestamptz);
--   drop table if exists public.partner_tier_snapshot_gaps;
--   drop function if exists public.gellatti_write_partner_tier_snapshots_v1(date, timestamptz);
--   drop function if exists public.gellatti_partner_elite_active_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_partner_active_referred_count_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_gold_threshold_v1();
-- Written snapshots are NOT removed by a rollback: they are the tier authority
-- for commissions already earned, and deleting them would make those entries
-- unresolvable.
-- ============================================================================
