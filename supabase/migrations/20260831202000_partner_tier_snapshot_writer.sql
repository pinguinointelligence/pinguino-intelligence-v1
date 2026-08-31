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
-- 3 March writes March. On its own that means a missed 1 February run would
-- leave February with no snapshot forever — and a February commission would
-- defer on `tier_snapshot_missing` indefinitely, because dispatch.ts refuses to
-- borrow another month's tier.
--
-- This finds the gaps and fills them.
--
-- HONESTY ABOUT WHAT A BACKFILL CAN AND CANNOT KNOW:
-- `customer_subscriptions` is a cache of CURRENT state, not a history, so a
-- snapshot written late is computed from TODAY's counts, not from what was true
-- on the 1st of the missed month. That is visible rather than hidden: `month`
-- and `computed_at` sit side by side on the row, so a February snapshot with a
-- March computed_at is self-evidently late. A late snapshot is still far better
-- than none, because none blocks every commission in that month permanently.
-- The correct operational response to a large gap is to check the run log, not
-- to trust the backfilled count as historical truth.

-- Which months are missing a snapshot? Observable on its own, so Admin can see
-- a gap before anything is written.
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
      -- from the earliest month any still-active partner existed in
      coalesce(
        (select date_trunc('month', (min(p.created_at) at time zone 'Europe/Madrid'))::date
         from public.partners p where p.status = 'active'),
        date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date
      ),
      date_trunc('month', (p_now at time zone 'Europe/Madrid'))::date,
      interval '1 month'
    )::date as month
  )
  select m.month,
         count(p.id)::integer as partners_missing
  from months m
  join public.partners p
    on p.status = 'active'
   -- a partner needs no snapshot for a month that predates them
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

-- Fill every missing month. Bounded, so a misconfigured call cannot walk years.
-- Each month is written by the SAME writer, so the on-conflict-do-nothing
-- immutability rule still holds: a month that already has a snapshot is skipped,
-- and running this twice writes nothing the second time.
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
  v_filled integer := 0;
  v_result jsonb;
  v_months jsonb := '[]'::jsonb;
begin
  for v_month in
    select month from public.gellatti_missing_tier_snapshot_months_v1(p_now)
    order by month
    limit greatest(coalesce(p_max_months, 12), 1)
  loop
    -- p_count_at stays p_now: we cannot know the historical count (see above),
    -- and computed_at then makes the lateness visible on the row.
    v_result := public.gellatti_write_partner_tier_snapshots_v1(v_month, p_now);
    v_filled := v_filled + 1;
    v_months := v_months || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'monthsFilled', v_filled,
    'details', v_months,
    'late', v_filled > 0
  );
end $$;

revoke all on function public.gellatti_catchup_partner_tier_snapshots_v1(timestamptz, integer)
  from public, anon, authenticated;

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
--   drop function if exists public.gellatti_catchup_partner_tier_snapshots_v1(timestamptz, integer);
--   drop function if exists public.gellatti_missing_tier_snapshot_months_v1(timestamptz);
--   drop function if exists public.gellatti_write_partner_tier_snapshots_v1(date, timestamptz);
--   drop function if exists public.gellatti_partner_elite_active_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_partner_active_referred_count_v1(uuid, timestamptz);
--   drop function if exists public.gellatti_gold_threshold_v1();
-- Written snapshots are NOT removed by a rollback: they are the tier authority
-- for commissions already earned, and deleting them would make those entries
-- unresolvable.
-- ============================================================================
