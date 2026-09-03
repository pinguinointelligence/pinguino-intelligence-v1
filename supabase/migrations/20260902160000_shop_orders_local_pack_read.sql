-- ============================================================================
-- The customer's own orders now carry their FULFILMENT MODE.
--
-- `Account -> Zamówienia` has to distinguish a parcel from a PDF. A physical
-- order is answered by "has it shipped, where is it going, what did it cost";
-- a 0 EUR Local pack by "which country, is my list ready, can I open it". The
-- same row shape cannot answer both unless it says which one it is.
--
-- Adds `orderType`, `localPackCountry`, whether a PDF snapshot exists, and the
-- delivery state of the notification mail — the last one joined from
-- `email_jobs` so there is no second copy of a send status. Provider references
-- stay out: this is the customer's view.
-- ============================================================================
create or replace function public.gellatti_my_shop_orders_v1()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(jsonb_agg(entry order by entry->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'status', o.status,
      'fulfillmentStatus', o.fulfillment_status, 'containsPreorder', o.contains_preorder,
      'leadTimeWeeks', o.lead_time_weeks,
      'subtotalCents', o.subtotal_cents, 'shippingCents', o.shipping_cents,
      'taxCents', o.tax_cents, 'totalCents', o.total_cents,
      'currency', o.currency, 'created_at', o.created_at, 'paidAt', o.paid_at,
      'shippedAt', o.shipped_at,
      'orderType', coalesce(o.order_type, 'PHYSICAL'),
      'localPackCountry', o.local_pack_country,
      -- The PDF is regenerated from the snapshot on demand, so "ready" is
      -- simply whether the snapshot exists. Never a second stored flag.
      'localPackReady', (o.local_pack_snapshot is not null),
      'localPackEmailStatus', (
        select j.status from public.email_jobs j where j.id = o.local_pack_email_job_id
      ),
      'shipping', jsonb_build_object(
        'name', o.shipping_name, 'line1', o.shipping_line1, 'line2', o.shipping_line2,
        'postalCode', o.shipping_postal_code, 'city', o.shipping_city,
        'state', o.shipping_state, 'country', o.shipping_country,
        'phone', o.shipping_phone),
      'tracking', jsonb_build_object(
        'carrier', o.tracking_carrier, 'number', o.tracking_number),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'sku', i.sku, 'title', i.title, 'packSizeG', i.pack_size_g,
          'unitPriceCents', i.unit_price_cents, 'quantity', i.quantity,
          'isPreorder', i.is_preorder))
        from public.shop_order_items i where i.order_id = o.id
      ), '[]'::jsonb)
    ) as entry
    from public.shop_orders o
    where o.user_id = auth.uid()
  ) rows;
$function$;
