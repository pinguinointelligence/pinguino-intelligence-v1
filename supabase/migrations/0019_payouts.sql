-- ============================================================================
-- Migration 0019 — payout_batches, partner_payouts, partner_payout_items
--                  (§14.13)
-- ============================================================================
-- Monthly payout run (locked decision 10): one idempotent batch per
-- (month, currency, livemode) executed under an advisory lock; per-partner
-- netting (eligible entries + adjustments), EUR 25 threshold
-- (AFFILIATE_PAYOUT_MINIMUM_CENTS) and negative carry-forward; Stripe
-- Connect transfers with deterministic idempotency keys.
-- `partner_payout_items` pins EXACTLY which ledger rows a transfer paid, so
-- every cent in a payout is traceable to an immutable entry/adjustment.
--
-- Writes: service-role only (payout job + admin retry). Partners read their
-- OWN payouts and items; batches are operator-level (no client read).

-- ── payout_batches: one run per month × currency × livemode ─────────────────
create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),

  -- first day of the payout month in Europe/Madrid (decision 4)
  month date not null check (extract(day from month) = 1),
  currency text not null default 'eur' check (currency = 'eur'),
  livemode boolean not null default false,

  status text not null default 'pending' check (status in
    ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),

  -- run aggregates (audit convenience; the items are the authority)
  partner_count integer not null default 0 check (partner_count >= 0),
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),

  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- §14.14: re-running a month can never create a second batch — the job
  -- resumes the existing one (idempotent monthly run)
  constraint payout_batches_month_uniq unique (month, currency, livemode)
);

drop trigger if exists payout_batches_touch on public.payout_batches;
create trigger payout_batches_touch
  before update on public.payout_batches
  for each row execute function public.touch_updated_at();

-- ── partner_payouts: one partner's net result inside a batch ────────────────
create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches (id),
  partner_id uuid not null references public.partners (id),

  -- net amount transferred this run (post netting); 0 for skipped rows
  amount_cents integer not null default 0 check (amount_cents >= 0),
  -- balance carried into the next month: below-threshold positives or a
  -- negative balance after clawbacks (may be negative — that is the point)
  carry_forward_cents integer not null default 0,
  currency text not null default 'eur' check (currency = 'eur'),

  status text not null default 'pending' check (status in
    ('pending', 'processing', 'paid', 'failed',
     'skipped_below_threshold', 'skipped_negative_balance',
     'skipped_not_payable')),

  -- deterministic key (batch month + partner) — a retried Stripe transfer
  -- call can never pay twice (§14.14, decision 10)
  idempotency_key text not null unique,
  stripe_transfer_id text unique,
  failure_reason text,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- one row per partner per batch — netting is computed once
  constraint partner_payouts_batch_partner_uniq unique (batch_id, partner_id)
);

create index if not exists partner_payouts_partner_idx
  on public.partner_payouts (partner_id);
create index if not exists partner_payouts_status_idx
  on public.partner_payouts (status);

drop trigger if exists partner_payouts_touch on public.partner_payouts;
create trigger partner_payouts_touch
  before update on public.partner_payouts
  for each row execute function public.touch_updated_at();

-- ── partner_payout_items: which ledger rows this payout settled ─────────────
-- Each row applies EXACTLY ONE entry OR ONE adjustment to a payout.
create table if not exists public.partner_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.partner_payouts (id),

  commission_entry_id uuid references public.commission_entries (id),
  commission_adjustment_id uuid references public.commission_adjustments (id),

  -- the amount this item contributed to the net (adjustment items negative)
  amount_cents integer not null,
  created_at timestamptz not null default now(),

  -- exactly one of entry / adjustment (XOR)
  constraint partner_payout_items_one_source check (
    (commission_entry_id is null) <> (commission_adjustment_id is null)
  )
);

-- §14.14: an entry (or adjustment) is settled by AT MOST ONE payout ever —
-- global partial-unique, not per-payout, so money can never be paid twice
-- across batches
create unique index if not exists partner_payout_items_entry_uniq
  on public.partner_payout_items (commission_entry_id)
  where commission_entry_id is not null;
create unique index if not exists partner_payout_items_adjustment_uniq
  on public.partner_payout_items (commission_adjustment_id)
  where commission_adjustment_id is not null;

create index if not exists partner_payout_items_payout_idx
  on public.partner_payout_items (payout_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.payout_batches enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_payout_items enable row level security;

-- a partner reads their own payouts…
create policy partner_payouts_select_own on public.partner_payouts
  for select using (
    exists (
      select 1 from public.partners p
      where p.id = partner_id and p.user_id = auth.uid()
    )
  );

-- …and the items behind them (join through their own payout rows)
create policy partner_payout_items_select_own on public.partner_payout_items
  for select using (
    exists (
      select 1
      from public.partner_payouts pp
      join public.partners p on p.id = pp.partner_id
      where pp.id = payout_id and p.user_id = auth.uid()
    )
  );

-- payout_batches: NO select policy ON PURPOSE — batches are cross-partner
-- operator state; a partner's view is their own partner_payouts rows.

-- ── Grants: SELECT only where a policy exists; writes service-role only ─────
grant select on public.partner_payouts to authenticated;
grant select on public.partner_payout_items to authenticated;
-- intentionally NO grants on payout_batches to anon or authenticated, and NO
-- insert/update/delete grants anywhere: transfers of real money are written
-- exclusively by the service-role payout job.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first (payout job disabled — nothing else may run transfers).
-- Payout history is financial history: NEVER deleted in production.
-- Dev/sandbox only:
--   drop table if exists public.partner_payout_items;
--   drop table if exists public.partner_payouts;
--   drop table if exists public.payout_batches;
-- ============================================================================
