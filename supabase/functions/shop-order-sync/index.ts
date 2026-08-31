/**
 * shop-order-sync — Edge Function (Deno).
 *
 * Reconciles one Gellatti shop order against Stripe.
 *
 * Payment truth comes from Stripe, never from the browser: the caller may only
 * name an order it owns (or be a FINANCE admin), and the function then asks
 * Stripe for that order's Checkout Session and writes back the real payment
 * status. This is what makes the success page trustworthy even before a
 * webhook arrives, and it is the same call Admin's "Sync ze Stripe" makes.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(500, { error: 'shop_not_configured' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const user = userData.user;

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const orderId = String(body.orderId ?? '').trim();
  if (orderId === '') return json(400, { error: 'order_id_required' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: order, error: orderError } = await admin
    .from('shop_orders')
    .select('id,user_id,status,paid_at,stripe_checkout_session_id,order_number')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) return json(500, { error: 'order_lookup_failed' });
  if (!order) return json(404, { error: 'order_not_found' });

  if (order.user_id !== user.id) {
    const { data: isAdmin } = await userClient.rpc('gellatti_admin_has_permission_v1', {
      p_permission: 'FINANCE',
      p_actor_user_id: user.id,
    });
    if (isAdmin !== true) return json(403, { error: 'forbidden' });
  }
  if (!order.stripe_checkout_session_id) return json(409, { error: 'order_has_no_session' });

  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
  } catch (error) {
    console.error('shop-order-sync: stripe retrieve failed', error);
    return json(502, { error: 'stripe_lookup_failed' });
  }

  const paid = session.payment_status === 'paid';
  const expired = session.status === 'expired';
  /* A refund is recorded against the order, not against the session — Stripe
     still reports the session as paid afterwards. Re-syncing must never walk a
     refunded order back to `paid`. */
  const status =
    order.status === 'refunded'
      ? 'refunded'
      : paid
        ? 'paid'
        : expired
          ? 'cancelled'
          : order.status;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  /* Everything the person packing the parcel needs, written onto the order so
     fulfilment never has to open Stripe: the destination, what shipping and tax
     were actually charged, and the real total Stripe settled. */
  const shipping = session.collected_information?.shipping_details ?? null;
  const address = shipping?.address ?? null;
  const totals = session.total_details ?? null;

  const { error: updateError } = await admin
    .from('shop_orders')
    .update({
      status,
      stripe_payment_intent_id: paymentIntentId,
      /* Stamped once, when the money actually arrived. Re-syncing an order must
         not keep moving the moment it was paid, and must not blank it out. */
      ...(paid && !order.paid_at ? { paid_at: new Date().toISOString() } : {}),
      ...(session.amount_total !== null && session.amount_total !== undefined
        ? { total_cents: session.amount_total }
        : {}),
      ...(totals ? { shipping_cents: totals.amount_shipping ?? 0, tax_cents: totals.amount_tax ?? 0 } : {}),
      /* Only overwrite the destination when the session HAS one. A later sync
         of a session that returns nothing must not erase the address the parcel
         is being packed against. */
      ...(address
        ? {
            shipping_name: shipping?.name ?? null,
            shipping_line1: address.line1 ?? null,
            shipping_line2: address.line2 ?? null,
            shipping_postal_code: address.postal_code ?? null,
            shipping_city: address.city ?? null,
            shipping_state: address.state ?? null,
            shipping_country: address.country ?? null,
            shipping_phone: session.customer_details?.phone ?? null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (updateError) return json(500, { error: 'order_update_failed' });

  /* The confirmation screen has to close the purchase: order number, what was
     bought, what was paid and where it is going. The cart has already been
     cleared by then, so the browser cannot reconstruct any of it — the order
     travels back with the payment verdict instead. */
  const { data: full } = await admin
    .from('shop_orders')
    .select(
      'id,order_number,status,fulfillment_status,contains_preorder,lead_time_weeks,' +
        'subtotal_cents,shipping_cents,tax_cents,total_cents,currency,created_at,paid_at,' +
        'shipped_at,shipping_name,shipping_line1,shipping_line2,shipping_postal_code,' +
        'shipping_city,shipping_state,shipping_country,shipping_phone,tracking_carrier,' +
        'tracking_number,shop_order_items(sku,title,pack_size_g,unit_price_cents,quantity,is_preorder)',
    )
    .eq('id', order.id)
    .maybeSingle();

  console.log(`shop-order-sync: order ${order.order_number} -> ${status}`);
  return json(200, {
    orderId: order.id,
    orderNumber: order.order_number,
    status,
    paymentStatus: session.payment_status,
    order: full
      ? {
          id: full.id,
          orderNumber: full.order_number,
          status: full.status,
          fulfillmentStatus: full.fulfillment_status,
          containsPreorder: full.contains_preorder,
          leadTimeWeeks: full.lead_time_weeks,
          subtotalCents: full.subtotal_cents,
          shippingCents: full.shipping_cents,
          taxCents: full.tax_cents,
          totalCents: full.total_cents,
          currency: full.currency,
          created_at: full.created_at,
          paidAt: full.paid_at,
          shippedAt: full.shipped_at,
          shipping: {
            name: full.shipping_name,
            line1: full.shipping_line1,
            line2: full.shipping_line2,
            postalCode: full.shipping_postal_code,
            city: full.shipping_city,
            state: full.shipping_state,
            country: full.shipping_country,
            phone: full.shipping_phone,
          },
          tracking: { carrier: full.tracking_carrier, number: full.tracking_number },
          items: (full.shop_order_items ?? []).map((item: Record<string, unknown>) => ({
            sku: item.sku,
            title: item.title,
            packSizeG: item.pack_size_g,
            unitPriceCents: item.unit_price_cents,
            quantity: item.quantity,
            isPreorder: item.is_preorder,
          })),
        }
      : null,
  });
});
