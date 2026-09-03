-- ============================================================================
-- A PARCEL AND A PDF CANNOT WEAR EACH OTHER'S LIFECYCLE.
--
-- Enforced in the DATABASE rather than by UI convention, because the damage is
-- silent and customer-facing: a Local order marked "shipped" tells someone a
-- box is in the post when nothing was ever packed, and a physical order
-- carrying a PDF snapshot hands out a shopping list for a pack already on its
-- way. Neither shows up as an error anywhere — it just reads as a lie.
--
-- Proven on staging: setting `fulfillment_status='shipped'` on a
-- LOCAL_STARTER_PACK row is refused (23514 shop_orders_local_is_not_shipped),
-- and attaching `local_pack_snapshot` to a PHYSICAL row is refused
-- (23514 shop_orders_physical_has_no_pack).
-- ============================================================================
alter table public.shop_orders drop constraint if exists shop_orders_local_is_not_shipped;
alter table public.shop_orders add constraint shop_orders_local_is_not_shipped
  check (
    order_type <> 'LOCAL_STARTER_PACK'
    or (fulfillment_status in ('delivered', 'cancelled')
        and coalesce(total_cents, 0) = 0
        and coalesce(shipping_cents, 0) = 0
        and tracking_number is null
        and shipped_at is null)
  );

alter table public.shop_orders drop constraint if exists shop_orders_physical_has_no_pack;
alter table public.shop_orders add constraint shop_orders_physical_has_no_pack
  check (
    order_type <> 'PHYSICAL'
    or (local_pack_snapshot is null
        and local_pack_country is null
        and local_pack_generated_at is null)
  );
