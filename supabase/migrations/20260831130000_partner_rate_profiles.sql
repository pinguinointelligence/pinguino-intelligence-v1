-- ============================================================================
-- GELLATTI — WORK WITH US §11: per-partner, versioned ELITE rate profiles
-- ============================================================================
-- Owner override, 2026-08-31. Elite stops being a fixed global tier and becomes
-- a per-partner commission profile that an admin configures and versions.
--
-- The TS authority is src/billing/domain/partnerRateProfiles.ts (RP1..RP8);
-- this migration is the DB enforcement of the same rules, and
-- partnerRateProfiles.migration.test.ts asserts the two stay in lockstep.
--
-- What does NOT change:
--   * Standard and Gold keep the global versioned table in commission_rules.
--   * commission_rules' Elite row is KEPT. The ledger is immutable and historical
--     entries reference the rule version in force when they were earned, so
--     deleting it would make historical Elite entries unresolvable. It is now
--     only a historical re-resolution table and the source of the §11 default
--     SUGGESTIONS (299/1900/699/4900) — never the forward authority.
--   * commission_entries stays immutable. One additive nullable column records
--     WHICH profile version paid an elite entry.
--
-- Writes: service-role only. Partners read their own profile; nobody reads
-- anybody else's.

-- ── partner_rate_profiles ────────────────────────────────────────────────────
-- RP3: append-only versions. Editing a rate inserts a new row and closes the
-- previous one; rows are never updated in place except to set effective_end or
-- revoke.
create table if not exists public.partner_rate_profiles (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),

  -- RP2/RP8: the four rates, positive integer cents, EUR
  home_monthly_cents integer not null check (home_monthly_cents > 0),
  home_annual_cents  integer not null check (home_annual_cents  > 0),
  pro_monthly_cents  integer not null check (pro_monthly_cents  > 0),
  pro_annual_cents   integer not null check (pro_annual_cents   > 0),
  currency text not null default 'eur' check (currency = 'eur'),

  -- RP3: effective window. End is EXCLUSIVE so touching windows never overlap.
  effective_start timestamptz not null,
  effective_end   timestamptz,
  constraint partner_rate_profiles_window_ordered
    check (effective_end is null or effective_end > effective_start),

  -- RP3: audit — every one of these is required by the owner spec
  reason text not null check (btrim(reason) <> ''),
  admin_actor_user_id uuid not null references auth.users (id),
  note text,
  prior_version_id uuid references public.partner_rate_profiles (id),

  -- RP3: revocation before the natural end
  revoked_at timestamptz,
  revoked_reason text,
  constraint partner_rate_profiles_revocation_ordered
    check (revoked_at is null or revoked_at >= effective_start),

  created_at timestamptz not null default now()
);

create index if not exists partner_rate_profiles_partner_idx
  on public.partner_rate_profiles (partner_id, effective_start desc);

-- RP4: at most ONE open-ended (still-current) version per partner. A closed
-- window is bounded by effective_end, so only the open one needs a unique guard.
create unique index if not exists partner_rate_profiles_one_open_uniq
  on public.partner_rate_profiles (partner_id)
  where effective_end is null and revoked_at is null;

-- RP4: refuse overlapping declared windows. btree_gist is not enabled in this
-- project, so the exclusion is enforced by trigger rather than by an EXCLUDE
-- constraint. Same guarantee, stated explicitly.
create or replace function public.enforce_partner_rate_profile_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict uuid;
begin
  select p.id into v_conflict
  from public.partner_rate_profiles p
  where p.partner_id = new.partner_id
    and p.id is distinct from new.id
    -- half-open intervals [start, end) overlap when each starts before the
    -- other ends; a null end means "open forever".
    and (new.effective_end is null or p.effective_start < new.effective_end)
    and (p.effective_end   is null or new.effective_start < p.effective_end)
  limit 1;

  if v_conflict is not null then
    raise exception
      'partner_rate_profile_overlap: partner % already has rate version % covering this window',
      new.partner_id, v_conflict
      using errcode = 'exclusion_violation';
  end if;

  return new;
end $$;

revoke all on function public.enforce_partner_rate_profile_no_overlap() from public, anon, authenticated;

drop trigger if exists partner_rate_profiles_no_overlap on public.partner_rate_profiles;
create trigger partner_rate_profiles_no_overlap
  before insert or update of effective_start, effective_end, partner_id
  on public.partner_rate_profiles
  for each row execute function public.enforce_partner_rate_profile_no_overlap();

-- ── Ledger link ──────────────────────────────────────────────────────────────
-- RP5: every earned commission snapshots the rate that produced it. amount_cents
-- already does that; this records WHICH elite version was in force, so an audit
-- can reproduce the number years later. Additive and nullable: standard/gold
-- entries leave it null, and no historical row changes.
alter table public.commission_entries
  add column if not exists rate_profile_version_id uuid
    references public.partner_rate_profiles (id);

comment on column public.commission_entries.rate_profile_version_id is
  'Elite only: the partner_rate_profiles version in force when this commission was earned. Null for standard/gold, which resolve from commission_rules.';

-- ── RP2/RP5/RP7: the resolver ────────────────────────────────────────────────
-- Resolution is keyed on the instant the commission was EARNED, never on now(),
-- which is what makes "no retroactive rewriting" hold: appending a version can
-- never change what an earlier instant resolves to.
--
-- RP7: returns NULL when no version is in force. The caller MUST treat that as
-- a retryable deferral, never as a fallback to the old fixed elite row and never
-- as the standard rate. Paying a wrong amount is worse than deferring for an
-- admin to fix.
create or replace function public.gellatti_partner_elite_rate_v1(
  p_partner_id uuid,
  p_product text,
  p_cadence text,
  p_at timestamptz
) returns table (amount_cents integer, rate_profile_version_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_product = 'home' and p_cadence = 'monthly' then p.home_monthly_cents
      when p_product = 'home' and p_cadence = 'annual'  then p.home_annual_cents
      when p_product = 'pro'  and p_cadence = 'monthly' then p.pro_monthly_cents
      when p_product = 'pro'  and p_cadence = 'annual'  then p.pro_annual_cents
    end as amount_cents,
    p.id as rate_profile_version_id
  from public.partner_rate_profiles p
  where p.partner_id = p_partner_id
    and p.effective_start <= p_at
    -- revocation narrows the window; whichever ends first wins
    and (p.effective_end is null or p_at < p.effective_end)
    and (p.revoked_at    is null or p_at < p.revoked_at)
  limit 1;
$$;

revoke all on function public.gellatti_partner_elite_rate_v1(uuid, text, text, timestamptz)
  from public, anon, authenticated;

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.partner_rate_profiles enable row level security;

-- A partner may read their OWN rate history — §15 step 3 shows them their
-- actual exact commission table, and §16 needs it in the dashboard.
create policy partner_rate_profiles_select_own on public.partner_rate_profiles
  for select using (
    exists (
      select 1 from public.partners pr
      where pr.id = partner_id and pr.user_id = auth.uid()
    )
  );

grant select on public.partner_rate_profiles to authenticated;
-- Intentionally NO insert/update/delete grants: a partner setting their own
-- commission rate must be impossible at the DB layer, not merely in the UI.

-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   alter table public.commission_entries drop column if exists rate_profile_version_id;
--   drop function if exists public.gellatti_partner_elite_rate_v1(uuid, text, text, timestamptz);
--   drop trigger if exists partner_rate_profiles_no_overlap on public.partner_rate_profiles;
--   drop function if exists public.enforce_partner_rate_profile_no_overlap();
--   drop table if exists public.partner_rate_profiles;
-- Dropping the table orphans the ledger's rate_profile_version_id references,
-- so in production drop the column FIRST and only when no elite entry uses it.
-- ============================================================================
