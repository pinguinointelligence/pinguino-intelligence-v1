-- ============================================================================
-- Migration 0014 — billing_price_catalog (Billing/Partner Platform §14.1)
-- ============================================================================
-- Server-owned price catalog: the ONLY authority mapping a Stripe price to a
-- PINGÜINO product (home|pro), cadence and variant. Closes the documented
-- `planFromSubscription` price-id-agnostic gap (IMPLEMENTATION_STATUS §1):
-- the UI only ever receives server-resolved offer keys, never raw price ids.
--
-- Locked decisions honoured here (IMPLEMENTATION_STATUS §2):
--  * money is integer cents, EUR only, no floats (decision 2);
--  * the 11 lookup keys are seeded verbatim — Stripe product/price ids stay
--    NULL until Nicolas provides Sandbox ids (never invented, decision 5);
--  * 15-month partner offers renew onto their mapped 12-month price via
--    `renewal_offer_key` (Subscription Schedules, decision 6);
--  * commission cadence is derived from the offer: monthly offers pay the
--    monthly commission; yearly AND 15-month offers pay the annual commission
--    (master spec §14.1 — enforced by a CHECK below, not by convention).
--
-- Writes: service-role only (webhook/admin tooling). Clients may read ONLY
-- rows with public_enabled = true (pricing page); partner-benefit 15m offers
-- are seeded non-public and are resolved server-side during checkout.

create table if not exists public.billing_price_catalog (
  id uuid primary key default gen_random_uuid(),

  -- stable internal offer identity (what the app reasons about)
  offer_key text not null unique,
  product text not null check (product in ('home', 'pro')),
  cadence text not null
    check (cadence in ('monthly', 'annual', 'initial_15_month')),
  variant text not null
    check (variant in ('standard', 'home_launch', 'pro_founding')),

  -- Stripe identity — nullable until Nicolas configures Sandbox/Live objects.
  -- lookup_key is the verbatim Stripe Price lookup key (NICOLAS_STRIPE_HANDOFF
  -- §3); the startup validator compares env-provided ids against these rows.
  stripe_product_id text,
  stripe_price_id text,
  lookup_key text not null unique,

  -- money: integer cents, EUR pinned (decision 2 — no floats, single currency)
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = 'eur'),

  -- Stripe recurring shape (15-month offers = interval month × 15).
  -- "interval" is quoted: it is a Postgres keyword (type name) and must be a
  -- plain identifier here.
  "interval" text not null check ("interval" in ('month', 'year')),
  interval_count integer not null check (interval_count in (1, 15)),

  -- tax behavior stays NULL until the accountant decision lands (handoff §1);
  -- all mutually-replaceable prices must then share the same value.
  tax_behavior text check (tax_behavior in ('inclusive', 'exclusive')),

  -- public_enabled: readable on the pricing surface. 15m partner offers are
  -- NEVER public — they are granted through the partner benefit flow only.
  public_enabled boolean not null default false,

  -- 15-month offers MUST name the 12-month offer they renew onto (schedule
  -- phase 2, decision 6); non-15m offers renew onto themselves (NULL here).
  renewal_offer_key text references public.billing_price_catalog (offer_key),

  -- which commission table a qualifying payment on this offer pays out from
  commission_cadence text not null
    check (commission_cadence in ('monthly', 'annual')),

  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- §14.1: exactly the 15-month offers carry a renewal mapping
  constraint billing_price_catalog_renewal_shape check (
    (cadence = 'initial_15_month' and renewal_offer_key is not null)
    or (cadence <> 'initial_15_month' and renewal_offer_key is null)
  ),
  -- §14.1: monthly offers pay monthly commission; yearly + 15m pay annual —
  -- a rate can never silently drift onto the wrong commission table.
  constraint billing_price_catalog_commission_cadence check (
    (cadence = 'monthly' and commission_cadence = 'monthly')
    or (cadence <> 'monthly' and commission_cadence = 'annual')
  ),
  -- 15-month offers are Stripe interval month × 15; everything else × 1
  constraint billing_price_catalog_interval_shape check (
    (cadence = 'initial_15_month' and "interval" = 'month' and interval_count = 15)
    or (cadence = 'monthly' and "interval" = 'month' and interval_count = 1)
    or (cadence = 'annual' and "interval" = 'year' and interval_count = 1)
  )
);

create index if not exists billing_price_catalog_product_idx
  on public.billing_price_catalog (product, cadence);
-- fast lookup by Stripe price id once configured (webhook → offer resolution)
create unique index if not exists billing_price_catalog_stripe_price_uniq
  on public.billing_price_catalog (stripe_price_id)
  where stripe_price_id is not null;

drop trigger if exists billing_price_catalog_touch on public.billing_price_catalog;
create trigger billing_price_catalog_touch
  before update on public.billing_price_catalog
  for each row execute function public.touch_updated_at();

-- ── Seed: the 11 locked offers (NICOLAS_STRIPE_HANDOFF §3, verbatim) ─────────
-- 12-month offers first (renewal_offer_key FK targets), then the 15m offers.
insert into public.billing_price_catalog
  (offer_key, product, cadence, variant, lookup_key, amount_cents, currency,
   "interval", interval_count, public_enabled, renewal_offer_key,
   commission_cadence, version)
values
  ('home_monthly_standard', 'home', 'monthly', 'standard',
   'pi_home_monthly_standard_eur', 999, 'eur', 'month', 1, true, null,
   'monthly', 1),
  ('home_yearly_standard', 'home', 'annual', 'standard',
   'pi_home_yearly_standard_eur', 4900, 'eur', 'year', 1, true, null,
   'annual', 1),
  ('home_yearly_launch', 'home', 'annual', 'home_launch',
   'pi_home_yearly_launch_eur', 3900, 'eur', 'year', 1, true, null,
   'annual', 1),
  ('pro_monthly_standard', 'pro', 'monthly', 'standard',
   'pi_pro_monthly_standard_eur', 2499, 'eur', 'month', 1, true, null,
   'monthly', 1),
  ('pro_monthly_founding', 'pro', 'monthly', 'pro_founding',
   'pi_pro_monthly_founding_eur', 1999, 'eur', 'month', 1, true, null,
   'monthly', 1),
  ('pro_yearly_standard', 'pro', 'annual', 'standard',
   'pi_pro_yearly_standard_eur', 19900, 'eur', 'year', 1, true, null,
   'annual', 1),
  ('pro_yearly_founding', 'pro', 'annual', 'pro_founding',
   'pi_pro_yearly_founding_eur', 14900, 'eur', 'year', 1, true, null,
   'annual', 1),
  -- 15-month partner-benefit offers: NOT public; renew onto the mapped
  -- 12-month offer (standard→yearly_standard, launch→yearly_launch,
  -- founding→yearly_founding) via the subscription schedule phase 2.
  ('home_15m_standard_partner', 'home', 'initial_15_month', 'standard',
   'pi_home_15m_standard_partner_eur', 4900, 'eur', 'month', 15, false,
   'home_yearly_standard', 'annual', 1),
  ('home_15m_launch_partner', 'home', 'initial_15_month', 'home_launch',
   'pi_home_15m_launch_partner_eur', 3900, 'eur', 'month', 15, false,
   'home_yearly_launch', 'annual', 1),
  ('pro_15m_standard_partner', 'pro', 'initial_15_month', 'standard',
   'pi_pro_15m_standard_partner_eur', 19900, 'eur', 'month', 15, false,
   'pro_yearly_standard', 'annual', 1),
  ('pro_15m_founding_partner', 'pro', 'initial_15_month', 'pro_founding',
   'pi_pro_15m_founding_partner_eur', 14900, 'eur', 'month', 15, false,
   'pro_yearly_founding', 'annual', 1)
on conflict (lookup_key) do nothing;

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.billing_price_catalog enable row level security;

-- clients see ONLY publicly offered rows; partner 15m offers stay server-side
create policy billing_price_catalog_select_public on public.billing_price_catalog
  for select to authenticated using (public_enabled = true);

-- ── Grants: read for authenticated; NO write (service-role writes only) ─────
grant select on public.billing_price_catalog to authenticated;
-- intentionally NO insert/update/delete grants to anon or authenticated:
-- prices are financial configuration — a client that could edit the catalog
-- could change what it pays.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- catalog rows are configuration, not financial history; safe to drop ONLY
-- while no customer_subscriptions/commission tables reference offer keys.
--   drop policy if exists billing_price_catalog_select_public on public.billing_price_catalog;
--   drop trigger if exists billing_price_catalog_touch on public.billing_price_catalog;
--   drop table if exists public.billing_price_catalog;
-- ============================================================================
