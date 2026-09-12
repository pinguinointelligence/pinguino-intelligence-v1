-- STARTER PACK COMMISSION — owner-frozen 2026-09-02.
--
-- 9 EUR (standard) / 19 EUR (gold) per PAID Starter Pack. One-off: a pack earns
-- once and never renews. Elite stays individual and is NOT seeded here — see
-- the note on the rules seed below.
--
-- This widens the EXISTING ledger rather than adding a second one. Everything
-- that already governs a commission still governs this one: the same
-- `referral_attributions` lock, the same `partner_tier_snapshots` month, the
-- same `commission_rules` version table, the same reversal lifecycle.

-- ── 1. the product and cadence vocabularies ────────────────────────────────
alter table public.commission_rules drop constraint if exists commission_rules_product_check;
alter table public.commission_rules add constraint commission_rules_product_check
  check (product = any (array['home', 'pro', 'shop_starter_pack']));

alter table public.commission_rules drop constraint if exists commission_rules_cadence_check;
alter table public.commission_rules add constraint commission_rules_cadence_check
  check (cadence = any (array['monthly', 'annual', 'one_off']));

alter table public.commission_entries drop constraint if exists commission_entries_product_check;
alter table public.commission_entries add constraint commission_entries_product_check
  check (product = any (array['home', 'pro', 'shop_starter_pack']));

alter table public.commission_entries drop constraint if exists commission_entries_cadence_check;
alter table public.commission_entries add constraint commission_entries_cadence_check
  check (cadence = any (array['monthly', 'annual', 'one_off']));

-- ── 2. a one-off entry has no subscription ────────────────────────────────
-- `stripe_subscription_id` was NOT NULL, which a shop order cannot satisfy.
-- Dropping the blanket NOT NULL would quietly permit a SUBSCRIPTION entry with
-- no subscription, so it is replaced by a conditional constraint that is
-- STRICTER than before: a subscription entry must still carry one, and a
-- one-off must not carry one at all.
alter table public.commission_entries alter column stripe_subscription_id drop not null;

alter table public.commission_entries drop constraint if exists commission_entries_subscription_shape;
alter table public.commission_entries add constraint commission_entries_subscription_shape
  check (
    (cadence = 'one_off' and stripe_subscription_id is null and subscription_id is null)
    or (cadence <> 'one_off' and stripe_subscription_id is not null)
  );

-- ── 3. what a one-off entry points at, and its idempotency key ────────────
-- The subscription ledger is keyed by invoice; a shop order has no invoice.
-- The order IS the business key: one paid order earns at most one entry, no
-- matter how many times Stripe delivers the event.
alter table public.commission_entries
  add column if not exists shop_order_id uuid references public.shop_orders (id) on delete restrict;

create unique index if not exists commission_entries_shop_order_uniq
  on public.commission_entries (shop_order_id)
  where shop_order_id is not null;

alter table public.commission_entries drop constraint if exists commission_entries_one_off_source;
alter table public.commission_entries add constraint commission_entries_one_off_source
  check (
    (cadence = 'one_off' and shop_order_id is not null)
    or (cadence <> 'one_off' and shop_order_id is null)
  );

-- ── 3b. a one-off has no catalogue offer ──────────────────────────────────
-- `offer_key` carries a FOREIGN KEY into billing_price_catalog, the
-- SUBSCRIPTION offer catalogue. A shop SKU is not an offer there, and adding
-- one would put a physical product into the table every subscription path
-- iterates. A one-off already points at its order, whose items name the SKU.
-- The old NOT NULL becomes a conditional constraint so the subscription
-- guarantee is unchanged.
alter table public.commission_entries alter column offer_key drop not null;

alter table public.commission_entries drop constraint if exists commission_entries_offer_key_shape;
alter table public.commission_entries add constraint commission_entries_offer_key_shape
  check (
    (cadence = 'one_off' and offer_key is null)
    or (cadence <> 'one_off' and offer_key is not null)
  );

-- ── 4. the rates themselves ───────────────────────────────────────────────
-- Standard and Gold only. ELITE IS DELIBERATELY ABSENT: `partner_rate_profiles`
-- has columns for home/pro × monthly/annual and nothing for a pack, so there is
-- no honest way to resolve an elite pack rate automatically. The writer refuses
-- to guess and records a note for the manual authority instead — an absent row
-- here is what makes that refusal impossible to bypass.
insert into public.commission_rules (product, cadence, tier, version, amount_cents, currency)
values
  ('shop_starter_pack', 'one_off', 'standard', 1, 900, 'eur'),
  ('shop_starter_pack', 'one_off', 'gold', 1, 1900, 'eur')
on conflict do nothing;

comment on column public.commission_entries.shop_order_id is
  'The paid shop order that earned a one-off commission. Unique, so a replayed webhook cannot book twice.';
