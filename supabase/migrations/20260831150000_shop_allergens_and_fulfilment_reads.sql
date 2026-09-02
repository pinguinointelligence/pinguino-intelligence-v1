-- Gellatti Shop — an allergen field the card can label, and the order reads a
-- parcel actually needs.
--
-- 1. ALLERGENS. The shop already publishes „Zawiera mleko" / „Zawiera jaja",
--    but buried in the middle of a prose description, where it is easy to miss
--    and impossible to render as a labelled field. The canonical ingredient
--    rows carry no allergen data (all seven are null), so this is a shop-owned
--    field. Nothing new is CLAIMED here: the values restate exactly the
--    statements the owner already authored, structured. Where no statement
--    exists the value stays null — the card then says nothing, because
--    "contains no allergens" is a regulatory claim, not a default.
--
-- 2. ORDER READS. `shop_orders` gained an address, shipping, tax and tracking;
--    the read functions never returned them, so Admin still could not see where
--    a parcel goes.

alter table public.shop_products
  add column if not exists allergens text;

comment on column public.shop_products.allergens is
  'Comma-separated allergen tokens (milk, egg) shown as labelled chips. Null '
  'means no allergen statement exists for this article — never render that as '
  'an absence-of-allergens claim.';

update public.shop_products set allergens = 'milk'     where sku in ('GEL-SMP-500', 'GEL-CRP-500');
update public.shop_products set allergens = 'egg'      where sku = 'GEL-YOL-500';
update public.shop_products set allergens = 'milk,egg' where sku = 'GEL-STARTER-PACK';

create or replace function public.gellatti_shop_catalog_v1()
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(jsonb_agg(entry order by ord, name), '[]'::jsonb)
  from (
    select p.sort_order as ord, p.title as name, jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'slug', p.slug, 'kind', p.kind,
      'title', p.title, 'description', p.description,
      'canonicalIngredientId', p.canonical_ingredient_id,
      'packSizeG', p.pack_size_g, 'priceCents', p.price_cents, 'currency', p.currency,
      'imageUrl', p.image_url, 'availability', p.availability,
      'leadTimeWeeks', p.lead_time_weeks,
      'allergens', coalesce(
        (select jsonb_agg(trim(token)) from unnest(string_to_array(p.allergens, ',')) token),
        '[]'::jsonb),
      'contents', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'sku', c.sku,
                 'title', c.title,
                 'packSizeG', coalesce(b.packed_grams, c.pack_size_g),
                 'quantity', b.quantity)
                          order by coalesce(b.packed_grams, c.pack_size_g) desc, c.title)
        from public.shop_bundle_items b
        join public.shop_products c on c.id = b.item_product_id
        where b.bundle_product_id = p.id
      ), '[]'::jsonb),
      'contentsTotalG', (
        select sum(coalesce(b.packed_grams, c.pack_size_g) * b.quantity)
        from public.shop_bundle_items b
        join public.shop_products c on c.id = b.item_product_id
        where b.bundle_product_id = p.id
      )
    ) as entry
    from public.shop_products p
    where p.active = true
  ) rows;
$function$;

-- The customer's own orders: where it is going, what shipping cost, and the
-- tracking number once it exists.
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

-- Admin: the same, plus who bought it and the provider references.
create or replace function public.gellatti_admin_shop_orders_v1(p_limit integer default 200)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
$function$;

-- Marking a parcel shipped is not a label change: it is the moment a tracking
-- number and a timestamp come into existence. One action records all three so
-- the two can never drift.
create or replace function public.gellatti_admin_shop_order_action_v1(
  p_order_id uuid,
  p_fulfillment_status text,
  p_tracking_carrier text default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if p_fulfillment_status not in ('awaiting','preparing','shipped','delivered','cancelled') then
    raise exception 'unsupported_fulfillment_status';
  end if;
  update public.shop_orders
    set fulfillment_status = p_fulfillment_status,
        tracking_carrier = coalesce(nullif(trim(coalesce(p_tracking_carrier, '')), ''), tracking_carrier),
        tracking_number  = coalesce(nullif(trim(coalesce(p_tracking_number, '')), ''), tracking_number),
        -- `shipped_at` is stamped once, the first time it ships.
        shipped_at = case when p_fulfillment_status = 'shipped'
                          then coalesce(shipped_at, now()) else shipped_at end,
        cancelled_at = case when p_fulfillment_status = 'cancelled'
                            then coalesce(cancelled_at, now()) else cancelled_at end,
        updated_at = now()
    where id = p_order_id;
  if not found then raise exception 'shop_order_not_found'; end if;
  perform public.gellatti_write_audit_v1(
    'shop.order_' || p_fulfillment_status, 'shop_orders', p_order_id::text,
    jsonb_build_object('fulfillmentStatus', p_fulfillment_status,
                       'trackingCarrier', p_tracking_carrier,
                       'trackingNumber', p_tracking_number), null,
    p_order_id::text, 'admin', v_admin::text
  );
  return jsonb_build_object('id', p_order_id, 'fulfillmentStatus', p_fulfillment_status);
end;
$function$;
