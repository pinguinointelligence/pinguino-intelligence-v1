-- ============================================================================
-- Migration 0018 — partner_tier_snapshots, commission_rules,
--                  commission_entries, commission_adjustments (§14.11–§14.12)
-- ============================================================================
-- The commission LEDGER (locked decision 3): `commission_entries` is
-- immutable financial history — corrections/reversals are APPEND-ONLY
-- `commission_adjustments` rows, never edits. Rates are versioned in
-- `commission_rules` so historical entries always reference the rate table
-- that was in force when they were earned. Month boundaries are computed in
-- Europe/Madrid by the pure calendar module (decision 4) and stored as the
-- first day of the month.
--
-- Writes: service-role only (webhook commission recorder, monthly snapshot
-- job, admin corrections). Partners read their OWN aggregates.

-- ── partner_tier_snapshots: the tier in force for a commission month ────────
create table if not exists public.partner_tier_snapshots (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),

  -- first day of the commission month in Europe/Madrid (decision 4);
  -- the CHECK pins the day so two snapshots can never straddle one month
  month date not null check (extract(day from month) = 1),

  tier text not null check (tier in ('standard', 'gold', 'elite')),
  -- Gold threshold input (AFFILIATE_GOLD_ACTIVE_SUBSCRIPTIONS, default 100)
  active_subscription_count integer not null default 0
    check (active_subscription_count >= 0),
  -- Elite is a manual override, never computed — kept explicit for audit
  elite_override boolean not null default false,

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- §14.14: one snapshot per partner per month — the rate lookup for a month
  -- must be deterministic
  constraint partner_tier_snapshots_month_uniq unique (partner_id, month)
);

create index if not exists partner_tier_snapshots_partner_idx
  on public.partner_tier_snapshots (partner_id, month desc);

-- ── commission_rules: versioned rate table (§14.11) ─────────────────────────
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  version integer not null check (version >= 1),
  product text not null check (product in ('home', 'pro')),
  -- commission cadence (billing_price_catalog.commission_cadence): yearly AND
  -- 15-month offers both pay from the 'annual' row
  cadence text not null check (cadence in ('monthly', 'annual')),
  tier text not null check (tier in ('standard', 'gold', 'elite')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur' check (currency = 'eur'),
  created_at timestamptz not null default now(),

  -- a (version, product, cadence, tier) cell exists exactly once — an entry's
  -- rate lookup can never be ambiguous
  constraint commission_rules_cell_uniq unique (version, product, cadence, tier)
);

-- Seed: rate table v1 — the 12 locked rates (master spec §14.11)
insert into public.commission_rules (version, product, cadence, tier, amount_cents)
values
  (1, 'home', 'monthly', 'standard',  199),
  (1, 'home', 'monthly', 'gold',      249),
  (1, 'home', 'monthly', 'elite',     299),
  (1, 'home', 'annual',  'standard',  900),
  (1, 'home', 'annual',  'gold',     1400),
  (1, 'home', 'annual',  'elite',    1900),
  (1, 'pro',  'monthly', 'standard',  499),
  (1, 'pro',  'monthly', 'gold',      599),
  (1, 'pro',  'monthly', 'elite',     699),
  (1, 'pro',  'annual',  'standard', 2900),
  (1, 'pro',  'annual',  'gold',     3900),
  (1, 'pro',  'annual',  'elite',    4900)
on conflict on constraint commission_rules_cell_uniq do nothing;

-- ── commission_entries: IMMUTABLE earned-commission ledger (§14.12) ─────────
-- One row per qualifying payment. Financial fields are never edited after
-- insert; ONLY `status` advances (held → eligible → paid; reversed via an
-- adjustment row + status flip). Stripe ids are stored as durable text so the
-- ledger stands alone even if cache rows disappear.
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  attribution_id uuid references public.referral_attributions (id),
  subscription_id uuid references public.customer_subscriptions (id)
    on delete set null,

  stripe_subscription_id text not null,
  stripe_invoice_id text,
  stripe_payment_intent_id text,

  offer_key text not null references public.billing_price_catalog (offer_key),
  product text not null check (product in ('home', 'pro')),
  cadence text not null check (cadence in ('monthly', 'annual')),
  -- tier + rule version IN FORCE when earned (from the month's snapshot) —
  -- later tier changes never rewrite history
  tier text not null check (tier in ('standard', 'gold', 'elite')),
  rule_version integer not null check (rule_version >= 1),

  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur' check (currency = 'eur'),

  -- held → eligible (after AFFILIATE_HOLD_FULL_CALENDAR_MONTHS full calendar
  -- months, Europe/Madrid) → paid; reversed = refund/dispute clawback
  status text not null default 'held'
    check (status in ('held', 'eligible', 'paid', 'reversed')),
  earned_at timestamptz not null,
  eligible_at timestamptz not null,

  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §14.14: ONE commission per qualifying payment — the invoice id is the
-- commission key; a replayed webhook can never double-pay a partner
create unique index if not exists commission_entries_invoice_uniq
  on public.commission_entries (stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists commission_entries_partner_status_idx
  on public.commission_entries (partner_id, status);
create index if not exists commission_entries_eligible_idx
  on public.commission_entries (status, eligible_at);

drop trigger if exists commission_entries_touch on public.commission_entries;
create trigger commission_entries_touch
  before update on public.commission_entries
  for each row execute function public.touch_updated_at();

-- ── commission_adjustments: APPEND-ONLY corrections (§14.12) ────────────────
-- Refund/dispute reversals and manual corrections. Rows are never updated or
-- deleted (no updated_at, no touch trigger ON PURPOSE); the payout netting
-- sums entries + adjustments.
create table if not exists public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  commission_entry_id uuid not null references public.commission_entries (id),

  -- negative for clawbacks; a zero adjustment is meaningless noise
  amount_cents integer not null check (amount_cents <> 0),
  currency text not null default 'eur' check (currency = 'eur'),

  kind text not null
    check (kind in ('refund_reversal', 'dispute_reversal', 'manual')),
  reason text not null,
  -- the Stripe refund/dispute/event id that caused this adjustment
  source_event_key text,

  created_at timestamptz not null default now()
);

-- §14.14: one adjustment per source event — a replayed refund webhook can
-- never claw back twice. Partial: manual corrections carry no event key.
create unique index if not exists commission_adjustments_source_event_uniq
  on public.commission_adjustments (source_event_key)
  where source_event_key is not null;

create index if not exists commission_adjustments_partner_idx
  on public.commission_adjustments (partner_id);
create index if not exists commission_adjustments_entry_idx
  on public.commission_adjustments (commission_entry_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.partner_tier_snapshots enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.commission_adjustments enable row level security;

-- a partner reads their own tier history and ledger (join through their own
-- partner row — the subquery runs under the caller's RLS)
create policy partner_tier_snapshots_select_own on public.partner_tier_snapshots
  for select using (
    exists (
      select 1 from public.partners p
      where p.id = partner_id and p.user_id = auth.uid()
    )
  );

create policy commission_entries_select_own on public.commission_entries
  for select using (
    exists (
      select 1 from public.partners p
      where p.id = partner_id and p.user_id = auth.uid()
    )
  );

create policy commission_adjustments_select_own on public.commission_adjustments
  for select using (
    exists (
      select 1 from public.partners p
      where p.id = partner_id and p.user_id = auth.uid()
    )
  );

-- commission_rules: NO select policy ON PURPOSE — the rate table is served to
-- the partner UI through the server (typed domain module, track E); exposing
-- future rate versions early is a business decision, not a default.

-- ── Grants: SELECT only where a policy exists; writes service-role only ─────
grant select on public.partner_tier_snapshots to authenticated;
grant select on public.commission_entries to authenticated;
grant select on public.commission_adjustments to authenticated;
-- intentionally NO grants on commission_rules to anon or authenticated, and
-- NO insert/update/delete grants anywhere in the ledger: money rows are
-- written exclusively by the service role. Immutability of financial fields
-- is an application invariant on top of these missing write paths.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first (commission recording disabled). The ledger is financial
-- history: NEVER deleted or mutated in production — reversal is always an
-- appended adjustment. Dev/sandbox only:
--   drop table if exists public.commission_adjustments;
--   drop table if exists public.commission_entries;
--   drop table if exists public.commission_rules;
--   drop table if exists public.partner_tier_snapshots;
-- ============================================================================
