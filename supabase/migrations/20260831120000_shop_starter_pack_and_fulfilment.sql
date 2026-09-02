-- Gellatti Shop — canonical Starter Pack contents, and the data a parcel needs.
--
-- TWO defects, both found by reading the live commerce data rather than the copy.
--
-- 1. STARTER PACK CONTENTS WERE WRONG IN THE DATABASE, not just in the UI copy.
--    `shop_bundle_items` linked the bundle to the seven 500 g retail SKUs at
--    quantity 1, which reads as 3 500 g. The pack Gellatti actually packs is
--    1 125 g:
--
--      Odtłuszczone mleko w proszku   250 g
--      Dekstroza                      250 g
--      Inulina                        125 g
--      Fruktoza                       125 g
--      Śmietanka w proszku 42%        125 g
--      Suszone żółtko jaja            125 g
--      Gellatti Stabilizer            125 g
--
--    The bundle keeps pointing at the same product rows — that link is what
--    carries identity, canonical ingredient and allergen authority — but the
--    packed amount is now stated explicitly. A bundle line is a description of
--    what is in the box; it is not a purchase of the retail pack.
--
--    The individual 500 g SKUs are deliberately UNTOUCHED. They are their own
--    products with their own authority and are audited separately.
--
--    The Starter Pack PRICE is deliberately UNTOUCHED at 5900 (€59.00). That is
--    the value already in the commerce source and in three existing orders; it
--    is not this migration's business to invent a new one.
--
-- 2. AN ORDER COULD NOT BE SHIPPED. `shop_orders` carried no address, no
--    shipping cost and no tax, and Stripe Checkout was never asked to collect
--    an address. Whoever packs the parcel had no destination. The columns are
--    added here; the collection and the write-back land with the checkout and
--    sync functions.

-- ── 1. The packed amount a bundle line actually contains ──────────────────
alter table public.shop_bundle_items
  add column if not exists packed_grams integer
    check (packed_grams is null or packed_grams > 0);

comment on column public.shop_bundle_items.packed_grams is
  'Grams of this item actually packed in the bundle. Null falls back to the '
  'referenced product''s own pack_size_g. The Starter Pack packs 250/125 g '
  'portions, which are not sold as standalone retail SKUs.';

-- ── 2. What a parcel needs ────────────────────────────────────────────────
alter table public.shop_orders
  add column if not exists shipping_name text,
  add column if not exists shipping_line1 text,
  add column if not exists shipping_line2 text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_country text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_cents integer not null default 0
    check (shipping_cents >= 0),
  add column if not exists tax_cents integer not null default 0
    check (tax_cents >= 0),
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz;

comment on column public.shop_orders.shipping_cents is
  'Shipping charged on the order, from the Stripe session. Part of total_cents.';
comment on column public.shop_orders.tax_cents is
  'Tax on the order, from the Stripe session. Part of total_cents.';

-- The lifecycle states the operator works from already exist and are reused as
-- they are: status pending|paid|failed|cancelled|refunded and
-- fulfillment_status awaiting|preparing|shipped|delivered|cancelled. Nothing is
-- duplicated here — "to ship" is paid + awaiting, and "waiting on preorder" is
-- paid + contains_preorder, both derived rather than stored twice.

-- ── 3. Correct the Starter Pack to what is actually packed ────────────────
update public.shop_bundle_items bi
set packed_grams = v.grams
from (
  values
    ('GEL-SMP-500', 250),
    ('GEL-DEX-500', 250),
    ('GEL-INU-500', 125),
    ('GEL-FRU-500', 125),
    ('GEL-CRP-500', 125),
    ('GEL-YOL-500', 125),
    ('GEL-STB-500', 125)
) as v(sku, grams)
where bi.item_product_id = (select id from public.shop_products where sku = v.sku)
  and bi.bundle_product_id = (select id from public.shop_products where sku = 'GEL-STARTER-PACK');

-- Fulfilment queues are read by status; keep them cheap.
create index if not exists shop_orders_fulfilment_idx
  on public.shop_orders (status, fulfillment_status, created_at desc);
