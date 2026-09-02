-- ============================================================================
-- Migration 0015 — customer_subscriptions, entitlements,
--                  subscription_conversion_intents (§14.2–§14.5)
-- ============================================================================
-- EXTENDS (never drops) the 0003 `subscriptions` cache: 0003 stays the v1
-- read path for the existing `planFromSubscription` gate; this richer cache
-- carries the offer/product/variant resolution, schedule linkage and the
-- 15-month benefit flags the partner platform needs. Both are server-written
-- caches — Stripe remains the subscription source of truth; entitlements are
-- the ACCESS source of truth (locked decision 8).
--
-- Writes: service-role only (webhook v2 / benefit orchestrator / admin).
-- Clients read their OWN rows and can never write billing state.

-- ── customer_subscriptions: catalog-aware Stripe subscription cache ─────────
create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  -- subscription schedule driving a 15-month → 12-month phase plan; NULL for
  -- plain subscriptions (decision 6). Unique: one cache row per schedule.
  stripe_schedule_id text unique,

  -- server-resolved offer identity (billing_price_catalog is the authority;
  -- product/cadence/variant are denormalised for cheap reads + RLS-free joins)
  offer_key text not null references public.billing_price_catalog (offer_key),
  product text not null check (product in ('home', 'pro')),
  cadence text not null
    check (cadence in ('monthly', 'annual', 'initial_15_month')),
  variant text not null
    check (variant in ('standard', 'home_launch', 'pro_founding')),

  -- Stripe status kept as TEXT (0003 precedent: a future status must never
  -- break an old cached row)
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  cancelled_at timestamptz,

  latest_invoice_id text,
  latest_payment_intent_id text,

  -- referral attribution owning this subscription (soft link — the
  -- attribution ledger in 0017 is authoritative; no FK here because 0017
  -- is created later and attribution rows must outlive this cache row)
  attribution_id uuid,

  -- 15-month benefit lifecycle (§14.5): continuity = the schedule's 12-month
  -- phase 2 is armed; benefit_used = this subscription consumed a partner
  -- benefit (hard-unique ledger row lives in partner_benefit_uses, 0017)
  continuity_armed boolean not null default false,
  benefit_used boolean not null default false,

  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_subscriptions_user_id_idx
  on public.customer_subscriptions (user_id);
create index if not exists customer_subscriptions_customer_idx
  on public.customer_subscriptions (stripe_customer_id);
create index if not exists customer_subscriptions_status_idx
  on public.customer_subscriptions (status);

drop trigger if exists customer_subscriptions_touch on public.customer_subscriptions;
create trigger customer_subscriptions_touch
  before update on public.customer_subscriptions
  for each row execute function public.touch_updated_at();

-- ── entitlements: explicit access grants — the resolver's input (§14.3) ─────
-- One row per (grant source × scope). paid_subscription rows mirror Stripe;
-- approved_partner/admin_grant/invite_home_trial rows NEVER touch Stripe
-- (locked decision 8). The pure resolver (src/billing/entitlements) reads
-- these verbatim — expiry/overlap logic lives there, not in SQL.
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  scope text not null check (scope in ('home', 'pro', 'partner')),
  source_type text not null check (source_type in
    ('paid_subscription', 'approved_partner', 'admin_grant', 'invite_home_trial')),
  -- id of the granting record (customer_subscriptions.id / partners.id /
  -- invite_codes.id / audit_log.id). Polymorphic on purpose — no FK; the
  -- partial-unique below is what prevents duplicate grants.
  source_id uuid not null,

  starts_at timestamptz not null default now(),
  -- NULL = open-ended (runs until revoked); invite trials MUST be bounded
  ends_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),

  -- actors as text: 'system:webhook', 'system:invite', or an admin user uuid
  granted_by text not null default 'system',
  revoked_by text,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entitlements_window_valid
    check (ends_at is null or ends_at > starts_at),
  -- §14.3 / §22.7: an invite grants HOME only and is always time-bounded
  constraint entitlements_invite_home_bounded check (
    source_type <> 'invite_home_trial'
    or (scope = 'home' and ends_at is not null)
  )
);

-- §14.14: a given source may hold at most ONE active grant per (user, scope) —
-- re-granting requires expiring/revoking the previous row first. Partial so
-- history (revoked/expired rows) accumulates freely.
create unique index if not exists entitlements_active_source_uniq
  on public.entitlements (user_id, scope, source_type, source_id)
  where status = 'active';

create index if not exists entitlements_user_status_idx
  on public.entitlements (user_id, status);

drop trigger if exists entitlements_touch on public.entitlements;
create trigger entitlements_touch
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- ── subscription_conversion_intents: 15m → 12m conversion machine (§14.5) ───
-- Records a customer's monthly→yearly / 15-month continuity conversion as an
-- idempotent, resumable intent. Stripe I/O happens in Edge Functions; the
-- intent row is the durable state machine:
--   pending → processing → completed
--   pending|processing → failed | cancelled | expired
create table if not exists public.subscription_conversion_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null
    references public.customer_subscriptions (id),

  from_offer_key text not null references public.billing_price_catalog (offer_key),
  to_offer_key text not null references public.billing_price_catalog (offer_key),

  status text not null default 'pending' check (status in
    ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
  -- deterministic key (subscription + target offer + attempt window) so a
  -- retried Edge Function call can never create a second Stripe mutation
  idempotency_key text not null unique,
  stripe_schedule_id text,
  failure_reason text,

  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversion_intents_offer_change
    check (from_offer_key <> to_offer_key)
);

-- §14.5: at most one IN-FLIGHT intent per subscription; completed/failed
-- history accumulates
create unique index if not exists conversion_intents_active_uniq
  on public.subscription_conversion_intents (subscription_id)
  where status in ('pending', 'processing');

create index if not exists conversion_intents_user_idx
  on public.subscription_conversion_intents (user_id);

drop trigger if exists conversion_intents_touch on public.subscription_conversion_intents;
create trigger conversion_intents_touch
  before update on public.subscription_conversion_intents
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security: read-own only; writes are service-role only ─────────
alter table public.customer_subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.subscription_conversion_intents enable row level security;

create policy customer_subscriptions_select_own on public.customer_subscriptions
  for select using (auth.uid() = user_id);

create policy entitlements_select_own on public.entitlements
  for select using (auth.uid() = user_id);

create policy conversion_intents_select_own on public.subscription_conversion_intents
  for select using (auth.uid() = user_id);

-- ── Grants: SELECT only — no client may write billing/access state ──────────
grant select on public.customer_subscriptions to authenticated;
grant select on public.entitlements to authenticated;
grant select on public.subscription_conversion_intents to authenticated;
-- intentionally NO insert/update/delete grants to anon or authenticated:
-- a client that could write entitlements could self-promote (0003 precedent).

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first; these caches may be dropped ONLY in dev/sandbox — in
-- production entitlement history is access-audit history: never delete.
--   drop table if exists public.subscription_conversion_intents;
--   drop table if exists public.entitlements;
--   drop table if exists public.customer_subscriptions;
-- ============================================================================
