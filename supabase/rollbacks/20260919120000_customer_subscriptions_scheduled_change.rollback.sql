-- ============================================================================
-- ROLLBACK — 20260919120000_customer_subscriptions_scheduled_change.sql
-- ============================================================================
-- Removes the pending-plan-change mirror from the 0015 subscription cache.
--
-- SAFE TO RUN: the two columns are a SERVER-WRITTEN MIRROR of the Stripe
-- Subscription Schedule, never an original record. Stripe keeps the schedule;
-- the next `customer.subscription.updated` / `subscription_schedule.*`
-- delivery re-derives everything this drops. No financial history, no
-- entitlement and no subscription row is touched.
--
-- ORDER MATTERS: the shape CHECK references both columns, so it goes first.
--
-- BEFORE RUNNING: deploy a `stripe-webhook` build that does not write these
-- columns (the writer's closed row would otherwise fail on every subscription
-- event), and make sure no client reads `scheduled_offer_key` —
-- `src/services/billing.ts` selects it by name.

alter table public.customer_subscriptions
  drop constraint if exists customer_subscriptions_scheduled_change_shape;

alter table public.customer_subscriptions
  drop column if exists scheduled_offer_key,
  drop column if exists scheduled_change_at;

-- Verification (expects zero rows):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'customer_subscriptions'
--      and column_name in ('scheduled_offer_key', 'scheduled_change_at');
