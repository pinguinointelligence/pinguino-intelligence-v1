-- ============================================================================
-- Migration 0017 — referral_clicks, referral_attributions,
--                  partner_benefit_uses (§14.9–§14.10)
-- ============================================================================
-- Attribution authority lives HERE (locked decision 7): the signed cookie /
-- referral link is EVIDENCE recorded on the click; the referral_attributions
-- row is the AUTHORITY, locked on the first commissionable payment. The
-- 30-day window (AFFILIATE_REFERRAL_WINDOW_DAYS) is enforced by the domain
-- logic; the DB stores the computed window so it is auditable.
--
-- Writes: service-role only. Clients: a customer may read attributions of
-- their OWN subscriptions; clicks and benefit uses are NOT client-readable
-- (clicks are traffic evidence; benefit state surfaces via the readable
-- `customer_subscriptions.benefit_used` flag instead).

-- ── referral_clicks: click/landing evidence (no PII, never authority) ────────
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  partner_code_id uuid not null references public.partner_codes (id),
  -- denormalised for reporting (code → partner is stable but joins are
  -- avoidable on the hot aggregation path)
  partner_id uuid not null references public.partners (id),

  occurred_at timestamptz not null default now(),
  landing_path text,
  -- salted hash of coarse client characteristics for dedupe/fraud review —
  -- NEVER a raw IP, user agent, or anything reversible (privacy rule)
  visitor_hash text,
  context jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists referral_clicks_partner_idx
  on public.referral_clicks (partner_id, occurred_at desc);
create index if not exists referral_clicks_code_idx
  on public.referral_clicks (partner_code_id);

-- ── referral_attributions: WHO owns a referred subscription (§14.9) ─────────
-- State machine:
--   pending  — evidence captured (signup/checkout started inside the window)
--   active   — LOCKED on first commissionable payment; owns the subscription
--   superseded — replaced (explicit code overrode an unconverted cookie)
--   expired  — window elapsed without a commissionable payment
--   revoked  — admin/fraud reversal
create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  partner_code_id uuid references public.partner_codes (id),
  click_id uuid references public.referral_clicks (id),

  -- the referred CUSTOMER. No cascade: an active attribution is commission
  -- evidence — user erasure is a documented manual process, never a silent
  -- cascade that would detach paid commissions from their justification.
  user_id uuid not null references auth.users (id),

  -- soft link to the subscription cache row; SET NULL keeps the attribution
  -- (financial history) alive even if the cache row is ever removed — the
  -- durable Stripe id below survives regardless
  subscription_id uuid references public.customer_subscriptions (id)
    on delete set null,
  stripe_subscription_id text,

  -- how the attribution was established (explicit code beats unconverted
  -- cookie per decision 7)
  method text not null check (method in ('referral_link', 'explicit_code')),

  status text not null default 'pending' check (status in
    ('pending', 'active', 'superseded', 'expired', 'revoked')),

  -- evidence + the computed 30-day window (AFFILIATE_REFERRAL_WINDOW_DAYS)
  clicked_at timestamptz,
  window_expires_at timestamptz not null,
  -- set when the first commissionable payment locks the attribution
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §14.14: a subscription has AT MOST ONE active attribution owner — two
-- partners can never both earn on the same subscription. Partial: superseded/
-- expired/revoked history rows accumulate freely.
create unique index if not exists referral_attributions_active_owner_uniq
  on public.referral_attributions (subscription_id)
  where status = 'active' and subscription_id is not null;
-- same guarantee on the durable Stripe id (survives cache-row deletion)
create unique index if not exists referral_attributions_active_stripe_uniq
  on public.referral_attributions (stripe_subscription_id)
  where status = 'active' and stripe_subscription_id is not null;

create index if not exists referral_attributions_partner_idx
  on public.referral_attributions (partner_id, status);
create index if not exists referral_attributions_user_idx
  on public.referral_attributions (user_id);

drop trigger if exists referral_attributions_touch on public.referral_attributions;
create trigger referral_attributions_touch
  before update on public.referral_attributions
  for each row execute function public.touch_updated_at();

-- ── partner_benefit_uses: the 15-month benefit is single-use (§14.10) ────────
-- One row per CONSUMED benefit. The HARD unique constraints (not partial —
-- there is no state that ever frees a use up again) make double-granting the
-- 15-month phase impossible at the DB layer (§14.14), regardless of any
-- Edge-Function retry or race.
create table if not exists public.partner_benefit_uses (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  -- the benefiting CUSTOMER (no cascade — financial history, see above)
  user_id uuid not null references auth.users (id),

  subscription_id uuid unique
    references public.customer_subscriptions (id) on delete set null,
  -- durable hard-unique key: a Stripe subscription consumes the benefit ONCE
  stripe_subscription_id text not null unique,

  offer_key text not null references public.billing_price_catalog (offer_key),
  attribution_id uuid references public.referral_attributions (id),

  used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists partner_benefit_uses_partner_idx
  on public.partner_benefit_uses (partner_id);
create index if not exists partner_benefit_uses_user_idx
  on public.partner_benefit_uses (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.referral_clicks enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.partner_benefit_uses enable row level security;

-- a customer reads attributions of their OWN subscriptions (user_id IS the
-- subscription owner on this table); partners see the OUTCOME through the
-- commission ledger (0018), not the raw attribution rows
create policy referral_attributions_select_own on public.referral_attributions
  for select using (auth.uid() = user_id);

-- referral_clicks: NO select policy ON PURPOSE — raw traffic evidence is
-- server-side only (aggregates surface through service-role reporting).
-- partner_benefit_uses: NO select policy ON PURPOSE — the customer-facing
-- signal is customer_subscriptions.benefit_used (read-own, 0015).

-- ── Grants: SELECT only where a policy exists; writes service-role only ─────
grant select on public.referral_attributions to authenticated;
-- intentionally NO grants at all on referral_clicks / partner_benefit_uses to
-- anon or authenticated, and NO insert/update/delete grants anywhere here:
-- attribution is money-adjacent — a client that could write it could steal
-- commissions.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first (attribution capture disabled = no new clicks/attributions).
-- Attributions/benefit uses justify paid commissions: NEVER deleted in
-- production. Dev/sandbox only:
--   drop table if exists public.partner_benefit_uses;
--   drop table if exists public.referral_attributions;
--   drop table if exists public.referral_clicks;
-- ============================================================================
