-- ============================================================================
-- customer_subscriptions — scheduled plan change (Account → Plan i rozliczenia)
-- ============================================================================
-- EXTENDS (never replaces) the 0015 `customer_subscriptions` cache. A
-- downgrade (PRO → HOME, yearly → monthly) never removes an already-paid plan
-- mid-period: the manage-subscription Edge Function attaches a Stripe
-- Subscription Schedule whose next phase starts at current_period_end, and
-- the stripe-webhook subscription sync mirrors that pending phase here so the
-- account panel can say "PRO pozostaje aktywny do <date>, potem HOME" from
-- the billing authority — never from a date computed in the browser.
--
-- Stripe remains the source of truth (the schedule object); these two columns
-- are a server-written mirror, resolved through billing_price_catalog (the
-- next phase's price id → offer key). A schedule whose next price is unknown
-- to the catalog mirrors as NULL (never a guessed offer).
--
-- Writes: service-role only (webhook). Clients keep their 0015 read-own
-- SELECT; no write grant is added here.

alter table public.customer_subscriptions
  add column if not exists scheduled_offer_key text
    references public.billing_price_catalog (offer_key),
  add column if not exists scheduled_change_at timestamptz;

-- A pending change is either fully described (offer + when) or absent.
alter table public.customer_subscriptions
  drop constraint if exists customer_subscriptions_scheduled_change_shape;
alter table public.customer_subscriptions
  add constraint customer_subscriptions_scheduled_change_shape check (
    (scheduled_offer_key is null and scheduled_change_at is null)
    or (scheduled_offer_key is not null and scheduled_change_at is not null)
  );

comment on column public.customer_subscriptions.scheduled_offer_key is
  'Offer the subscription switches to at scheduled_change_at (Stripe Subscription Schedule next phase, mirrored by stripe-webhook). NULL = no pending plan change.';
comment on column public.customer_subscriptions.scheduled_change_at is
  'When the scheduled_offer_key phase starts (= current_period_end for a period-end downgrade). NULL = no pending plan change.';

-- ============================================================================
-- ROLLBACK PLAN (not applied):
--   alter table public.customer_subscriptions
--     drop constraint if exists customer_subscriptions_scheduled_change_shape,
--     drop column if exists scheduled_offer_key,
--     drop column if exists scheduled_change_at;
-- ============================================================================
