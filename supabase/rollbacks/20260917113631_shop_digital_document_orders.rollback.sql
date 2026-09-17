-- Rollback for 20260917113631_shop_digital_document_orders.sql (applied to the shared project as ledger version 20260917113631).
-- Refuses to run once any DIGITAL_DOCUMENT order exists: those orders entitle customers to a
-- file, so removing the type is an owner decision about them first (stop new orders with
-- availability = 'OFF' instead). Function bodies below are the LIVE definitions read before
-- the change (pg_get_functiondef, 2026-09-17).

do $$
begin
  if exists (select 1 from public.shop_orders where order_type = 'DIGITAL_DOCUMENT') then
    raise exception 'rollback_refused_digital_document_orders_exist';
  end if;
end $$;

drop function if exists public.gellatti_admin_shop_documents_v1(integer);
drop function if exists public.gellatti_my_shop_documents_v1();
drop function if exists public.gellatti_shop_document_download_v1(uuid, uuid);
drop function if exists public.gellatti_shop_document_order_v1(uuid, text, text);
drop function if exists public.gellatti_shop_document_availability_v1(text);

CREATE OR REPLACE FUNCTION public.gellatti_my_shop_orders_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.gellatti_admin_shop_orders_v1(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.gellatti_shop_revenue_summary_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
        -- Product revenue EXCLUDES shipping: collecting postage is not selling
        -- anything, and mixing them would overstate what the Shop earns.
        'productRevenueCents', coalesce(sum(o.subtotal_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        'shippingCollectedCents', coalesce(sum(o.shipping_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        -- A 0 EUR Local pack is a real order and NOT revenue. Counted on its
        -- own line so it can never quietly inflate a revenue figure.
        'localPackOrders', count(*) filter (where o.order_type = 'LOCAL_STARTER_PACK'),
        -- Actual carrier cost, only where a rate row records one. Null means
        -- unknown, and margin stays unavailable rather than guessed.
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

CREATE OR REPLACE FUNCTION public.gellatti_admin_shop_order_action_v1(p_order_id uuid, p_fulfillment_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if p_fulfillment_status not in ('awaiting','preparing','shipped','delivered','cancelled') then
    raise exception 'unsupported_fulfillment_status';
  end if;
  update public.shop_orders
    set fulfillment_status = p_fulfillment_status, updated_at = now()
    where id = p_order_id;
  if not found then raise exception 'shop_order_not_found'; end if;
  perform public.gellatti_write_audit_v1(
    'shop.order_' || p_fulfillment_status, 'shop_orders', p_order_id::text,
    jsonb_build_object('fulfillmentStatus', p_fulfillment_status), null,
    p_order_id::text, 'admin', v_admin::text
  );
  return jsonb_build_object('id', p_order_id, 'fulfillmentStatus', p_fulfillment_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gellatti_admin_shop_order_action_v1(p_order_id uuid, p_fulfillment_status text, p_tracking_carrier text DEFAULT NULL::text, p_tracking_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

drop index if exists public.shop_orders_document_once_per_user_idx;
alter table public.shop_orders drop constraint if exists shop_orders_document_is_not_a_parcel;
alter table public.shop_orders drop constraint if exists shop_orders_document_fields_belong_to_documents;
alter table public.shop_orders drop constraint if exists shop_orders_order_type_check;
alter table public.shop_orders add constraint shop_orders_order_type_check
  check (order_type in ('PHYSICAL', 'LOCAL_STARTER_PACK'));
alter table public.shop_orders
  drop column if exists document_email_job_id,
  drop column if exists document_sha256,
  drop column if exists document_version,
  drop column if exists document_key,
  drop column if exists document_id;

drop trigger if exists shop_digital_documents_immutable on public.shop_digital_documents;
drop function if exists public.shop_digital_documents_keep_version_immutable();
drop table if exists public.shop_digital_documents;

-- The private `shop-documents` bucket is intentionally left in place: Supabase refuses direct
-- SQL deletes from storage tables (storage.protect_delete). It has no browser policies, so it
-- is inert. Remove its objects and the bucket through the Storage API only after the owner has
-- decided about every order that pointed at them.
