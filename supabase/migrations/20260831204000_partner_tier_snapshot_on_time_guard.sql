-- ============================================================================
-- GELLATTI — a LIVE-STATE writer may never manufacture HISTORICAL truth
-- ============================================================================
-- Owner ruling, 2026-08-31, after the tier-snapshot writer was applied and
-- proven. Forward-only: 20260831202000 is registered as 20260831190352 and is
-- NOT edited.
--
-- ── THE GAP ─────────────────────────────────────────────────────────────────
-- `gellatti_write_partner_tier_snapshots_v1(p_month, p_count_at)` accepts an
-- arbitrary month but reads LIVE subscription state. So:
--
--     write_partner_tier_snapshots_v1('2026-02-01', now())
--       -> today's eligibility
--       -> written as FEBRUARY's snapshot
--       -> on conflict do nothing
--       -> February's tier frozen wrong, permanently
--
-- Proven live during the acceptance run: with 105 actives at the February
-- boundary and 87 today, calling the live writer for February produced
-- `standard/87` — February's real answer is `gold/105`. The catch-up path,
-- which reconstructs state AT the boundary, returned `gold/105` correctly.
--
-- ── THE TWO AUTHORITIES ─────────────────────────────────────────────────────
--   A. THIS function — live state, and therefore ONLY ever the current month.
--   B. gellatti_catchup_partner_tier_snapshots_v1 — reconstructs state at a
--      past boundary from provider events, and writes NOTHING when it cannot
--      prove the state (typed reconciliation gap instead).
--
-- A past month has exactly one legitimate route: B.
--
-- ── SAME-MONTH LATE EXECUTION (owner §5) ────────────────────────────────────
-- Audited before implementing, and deliberately NOT closed with an invented
-- grace period.
--
--  * Intended cadence is `45 2 1 * *` — 02:45 UTC on the 1st, i.e. 03:45/04:45
--    Madrid. So the intended invocation already carries HOURS of drift from the
--    Madrid boundary by design. There is no "exactly at the boundary" contract
--    to enforce, and any window constant would be arbitrary.
--  * No execution-window authority exists anywhere in the repo — searched for
--    execution_window / snapshot_window / grace_period / boundary_tolerance /
--    max_drift / run_window: nothing.
--  * The monthly job already runs `tier_snapshot_catchup` BEFORE
--    `tier_snapshots`, and the catch-up's month range INCLUDES the current
--    month. So on a normal run the boundary-exact authority gets first claim
--    and this function is a no-op (`on conflict do nothing`). The live writer
--    is the fallback for the case catch-up cannot serve: a system whose event
--    history does not reach the boundary, where live state is the only truth
--    available.
--  * The residual exposure is therefore a MANUAL mid-month invocation that
--    beats catch-up to the row. That requires service_role — this function is
--    revoked from public, anon and authenticated, and this migration does not
--    change that.
--
-- Closing that residue needs an owner-set constant (how much drift is still
-- "the boundary"), which is a business decision, not one to invent here. It is
-- reported rather than guessed. The guard below removes the unbounded case —
-- any past month — which is the part that needs no constant to decide.

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
  v_current_month date;
  v_threshold integer := public.gellatti_gold_threshold_v1();
  v_written integer := 0;
  v_skipped integer := 0;
  v_considered integer := 0;
begin
  v_month := coalesce(
    p_month,
    date_trunc('month', (p_count_at at time zone 'Europe/Madrid'))::date
  );

  if extract(day from v_month) <> 1 then
    raise exception 'tier_snapshot_month_must_be_first_of_month';
  end if;

  -- ── THE GUARD ─────────────────────────────────────────────────────────────
  -- Derived from SERVER time, never from the caller's p_month or p_count_at:
  -- trusting either would let the caller redefine which month is "current" and
  -- walk straight back through the hole this guard exists to close.
  v_current_month := date_trunc('month', (now() at time zone 'Europe/Madrid'))::date;

  if v_month < v_current_month then
    -- The only route to a past month is reconstruction at ITS boundary.
    -- Explicit refusal rather than an internal redirect: silently rerouting
    -- would hide a caller doing something it should not, and the catch-up has
    -- different semantics (it can legitimately decline to write at all).
    raise exception 'historical_month_requires_catchup';
  end if;

  if v_month > v_current_month then
    -- A month that has not begun has no boundary state to measure.
    raise exception 'future_month_not_snapshottable';
  end if;

  -- A measurement instant in the future is not a measurement.
  if p_count_at > now() then
    raise exception 'tier_snapshot_count_instant_in_future';
  end if;

  with candidates as (
    select
      p.id as partner_id,
      public.gellatti_partner_active_referred_count_v1(p.id, p_count_at) as active_count,
      public.gellatti_partner_elite_active_v1(p.id, p_count_at) as elite
    from public.partners p
    where p.status = 'active'
  ),
  resolved as (
    select
      partner_id,
      active_count,
      elite,
      case
        when elite then 'elite'
        when active_count >= v_threshold then 'gold'
        else 'standard'
      end as tier
    from candidates
  ),
  inserted as (
    insert into public.partner_tier_snapshots
      (partner_id, month, tier, active_subscription_count, elite_override, computed_at)
    select partner_id, v_month, tier, active_count, elite, p_count_at
    from resolved
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
    'snapshotsSkipped', v_skipped,
    'countedAt', p_count_at
  );
end $$;

-- Grants restated, NOT broadened. anon, authenticated and a partner gain
-- nothing here; the surface is identical to what 20260831202000 established.
revoke all on function public.gellatti_write_partner_tier_snapshots_v1(date, timestamptz)
  from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK: re-apply the 20260831202000 body of
-- gellatti_write_partner_tier_snapshots_v1, which accepts any month while
-- reading live state. Doing so restores the ability to freeze a wrong
-- historical tier permanently. There is no reason to do it.
-- ============================================================================
