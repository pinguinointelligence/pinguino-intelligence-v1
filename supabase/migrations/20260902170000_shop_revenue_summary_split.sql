-- ============================================================================
-- SHOP REVENUE, READABLE ON ITS OWN.
--
-- The operational dashboard mixed the two businesses, so neither could be read.
-- This returns the SHOP side only; subscription metrics keep their own
-- authority, and a combined view can add them without either becoming a
-- component of the other.
--
-- Three honesty rules are enforced here rather than in the UI, so no future
-- screen can present them differently:
--
--   1. Product revenue EXCLUDES shipping. Collecting postage is not selling
--      anything; adding it would overstate what the Shop earns.
--   2. A 0 EUR Local Starter Pack is a real ORDER and NOT revenue. It is
--      counted on its own line so it can never quietly inflate a figure.
--   3. Carrier cost is reported only where a rate row actually records one.
--      `carrierCostKnown` says whether ANY cost is known — margin stays
--      unavailable rather than guessed, because revenue labelled "profit"
--      against unknown costs is a lie the dashboard would tell every day.
-- ============================================================================
create or replace function public.gellatti_shop_revenue_summary_v1()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select case
    when not public.gellatti_admin_has_permission_v1('FINANCE', auth.uid())
      then jsonb_build_object('error', 'forbidden')
    else (
      select jsonb_build_object(
        'orders', count(*),
        'paid', count(*) filter (where o.status = 'paid' and o.order_type = 'PHYSICAL'),
        'awaitingFulfilment', count(*) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'
            and o.fulfillment_status in ('awaiting','preparing')),
        'shipped', count(*) filter (where o.fulfillment_status = 'shipped'),
        'refunded', count(*) filter (where o.status = 'refunded'),
        'productRevenueCents', coalesce(sum(o.subtotal_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        'shippingCollectedCents', coalesce(sum(o.shipping_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        'localPackOrders', count(*) filter (where o.order_type = 'LOCAL_STARTER_PACK'),
        'carrierCostKnownCents', coalesce((
          select sum(r.carrier_cost_cents)
          from public.shop_orders p
          join public.shop_shipping_rates r on r.country_iso2 = p.shipping_country
          where p.status = 'paid' and p.order_type = 'PHYSICAL'
            and r.carrier_cost_cents is not null), 0),
        'carrierCostKnown', exists (
          select 1 from public.shop_shipping_rates r where r.carrier_cost_cents is not null)
      )
      from public.shop_orders o
    )
  end;
$function$;

revoke all on function public.gellatti_shop_revenue_summary_v1() from public;
grant execute on function public.gellatti_shop_revenue_summary_v1() to authenticated;
