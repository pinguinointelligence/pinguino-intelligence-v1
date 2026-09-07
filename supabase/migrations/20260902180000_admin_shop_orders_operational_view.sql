-- ============================================================================
-- ADMIN ORDERS — enough to actually fulfil, and honest about a digital order.
--
-- The operator view lacked the fulfilment facts (§O): which carrier, what the
-- carrier costs us, and — now that the Shop has two fulfilment modes — whether
-- this is a parcel at all.
--
-- `orderType` is what stops the physical lifecycle being forced onto a 0 EUR
-- Local pack. PAID -> AWAITING FULFILMENT -> SHIPPED describes a journey a PDF
-- never takes; a Local row instead answers country, PDF generated, mail sent
-- or failed.
--
-- `carrierCostCents` is read from the shipping authority and may be NULL. That
-- is deliberate: margin is shown only where a cost is genuinely recorded, never
-- inferred, so no screen can label revenue as profit.
-- ============================================================================
create or replace function public.gellatti_admin_shop_orders_v1(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(entry order by entry->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', o.id, 'orderNumber', o.order_number, 'email', o.email, 'userId', o.user_id,
        'status', o.status, 'fulfillmentStatus', o.fulfillment_status,
        'containsPreorder', o.contains_preorder, 'leadTimeWeeks', o.lead_time_weeks,
        'subtotalCents', o.subtotal_cents, 'shippingCents', o.shipping_cents,
        'taxCents', o.tax_cents, 'totalCents', o.total_cents, 'currency', o.currency,
        'stripeCheckoutSessionId', o.stripe_checkout_session_id,
        'stripePaymentIntentId', o.stripe_payment_intent_id,
        'paidAt', o.paid_at, 'created_at', o.created_at,
        'shippedAt', o.shipped_at, 'cancelledAt', o.cancelled_at, 'refundedAt', o.refunded_at,
        'orderType', coalesce(o.order_type, 'PHYSICAL'),
        'localPackCountry', o.local_pack_country,
        'localPackReady', (o.local_pack_snapshot is not null),
        'localPackEmailStatus', (
          select j.status from public.email_jobs j where j.id = o.local_pack_email_job_id),
        'carrier', (
          select r.carrier from public.shop_shipping_rates r
          where r.country_iso2 = o.shipping_country and r.active order by r.sort_order limit 1),
        'carrierCostCents', (
          select r.carrier_cost_cents from public.shop_shipping_rates r
          where r.country_iso2 = o.shipping_country and r.active order by r.sort_order limit 1),
        'shipping', jsonb_build_object(
          'name', o.shipping_name, 'line1', o.shipping_line1, 'line2', o.shipping_line2,
          'postalCode', o.shipping_postal_code, 'city', o.shipping_city,
          'state', o.shipping_state, 'country', o.shipping_country,
          'phone', o.shipping_phone),
        'tracking', jsonb_build_object(
          'carrier', o.tracking_carrier, 'number', o.tracking_number),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('sku', i.sku, 'title', i.title,
            'packSizeG', i.pack_size_g, 'unitPriceCents', i.unit_price_cents,
            'quantity', i.quantity, 'isPreorder', i.is_preorder))
          from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb)
      ) as entry
      from public.shop_orders o
      order by o.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) rows
  ), '[]'::jsonb);
end;
$$;
