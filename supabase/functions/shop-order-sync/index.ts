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
    .select('id,user_id,status,stripe_checkout_session_id,order_number')
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
  const status = paid ? 'paid' : expired ? 'cancelled' : order.status;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { error: updateError } = await admin
    .from('shop_orders')
    .update({
      status,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (updateError) return json(500, { error: 'order_update_failed' });

  console.log(`shop-order-sync: order ${order.order_number} -> ${status}`);
  return json(200, {
    orderId: order.id,
    orderNumber: order.order_number,
    status,
    paymentStatus: session.payment_status,
  });
});
