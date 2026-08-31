-- The immutable checkout authority for a shop order.
--
-- Settlement must be able to say "this event carries EXACTLY the money we
-- asked for". It could not: `total_cents` starts as the item subtotal and is
-- then OVERWRITTEN by `shop-order-sync` with whatever the provider reports, so
-- comparing against it is circular — the provider would be validating itself.
--
-- `expected_total_cents` is written ONCE, by `shop-checkout`, at the moment the
-- Checkout Session is created, from the same numbers handed to the provider:
-- items + shipping (+ tax and - discounts when those exist). Nothing else may
-- write it. A settlement whose `amount_total` differs from it is refused.
--
-- Nullable because orders created before this column exists have no such
-- authority; settlement refuses those rather than guessing a total for them.

alter table public.shop_orders
  add column if not exists expected_total_cents integer
    check (expected_total_cents is null or expected_total_cents >= 0),
  add column if not exists expected_currency text;

comment on column public.shop_orders.expected_total_cents is
  'IMMUTABLE. The exact total handed to the payment provider when the Checkout '
  'Session was created: items + shipping (+ tax, - discounts). Written once by '
  'shop-checkout; never updated. Settlement refuses any event whose amount '
  'does not match it exactly. Null on pre-2026-08-31 orders, which therefore '
  'cannot be settled by the webhook.';

comment on column public.shop_orders.expected_currency is
  'IMMUTABLE. The currency handed to the provider alongside expected_total_cents.';
