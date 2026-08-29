/**
 * shop-checkout — Edge Function (Deno).
 *
 * Creates a Gellatti shop order and a Stripe Checkout Session for it.
 *
 * Same security invariants as `create-checkout-session`:
 *  - the caller is authenticated from the JWT — no user id is ever read from
 *    the body;
 *  - the client submits SKUs and quantities only; every price, pack size,
 *    availability and preorder lead time is resolved SERVER-SIDE from
 *    `shop_products` (a client can never inject an amount);
 *  - success/cancel URLs must pass the env origin allowlist;
 *  - the Stripe call carries a deterministic idempotency key;
 *  - the order row is written BEFORE Stripe, so a session can always be
 *    correlated back to exactly one order.
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION,
 * BILLING_REDIRECT_URL_ALLOWLIST, plus the auto-injected SUPABASE_* values.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedRedirectUrl, parseUrlAllowlist } from '../_shared/urlAllowlist.ts';

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

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  pack_size_g: number | null;
  price_cents: number;
  currency: string;
  availability: string;
  lead_time_weeks: number | null;
  active: boolean;
}

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

  let body: {
    items?: Array<{ sku?: string; quantity?: number }>;
    successUrl?: string;
    cancelUrl?: string;
    idempotencySuffix?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const allowlist = parseUrlAllowlist(Deno.env.get('BILLING_REDIRECT_URL_ALLOWLIST'));
  if (!isAllowedRedirectUrl(body.successUrl, allowlist) || !isAllowedRedirectUrl(body.cancelUrl, allowlist)) {
    return json(400, { error: 'redirect_url_not_allowed' });
  }

  const requested = (body.items ?? [])
    .map((item) => ({
      sku: String(item?.sku ?? '').trim(),
      quantity: Math.min(20, Math.max(1, Math.trunc(Number(item?.quantity ?? 1)) || 1)),
    }))
    .filter((item) => item.sku !== '');
  if (requested.length === 0) return json(400, { error: 'cart_empty' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: products, error: productError } = await admin
    .from('shop_products')
    .select('id,sku,title,pack_size_g,price_cents,currency,availability,lead_time_weeks,active')
    .in('sku', requested.map((item) => item.sku));
  if (productError) return json(500, { error: 'catalog_lookup_failed' });

  const bySku = new Map<string, ProductRow>((products ?? []).map((row) => [row.sku, row as ProductRow]));
  const lines: Array<{ product: ProductRow; quantity: number }> = [];
  for (const item of requested) {
    const product = bySku.get(item.sku);
    if (!product || !product.active) return json(400, { error: 'product_unavailable', sku: item.sku });
    if (product.availability === 'out_of_stock') {
      return json(409, { error: 'product_out_of_stock', sku: item.sku });
    }
    lines.push({ product, quantity: item.quantity });
  }

  const currency = lines[0]!.product.currency;
  if (lines.some((line) => line.product.currency !== currency)) {
    return json(400, { error: 'mixed_currency_cart' });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.product.price_cents * line.quantity, 0);
  const preorderLines = lines.filter((line) => line.product.availability === 'preorder');
  const leadTimeWeeks = preorderLines.reduce(
    (max, line) => Math.max(max, line.product.lead_time_weeks ?? 0),
    0,
  );

  // The order exists before Stripe does, so a session always maps to one order.
  const orderNumber = `G-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${
    crypto.randomUUID().slice(0, 6).toUpperCase()
  }`;
  const { data: order, error: orderError } = await admin
    .from('shop_orders')
    .insert({
      order_number: orderNumber,
      user_id: user.id,
      email: user.email ?? '',
      status: 'pending',
      contains_preorder: preorderLines.length > 0,
      lead_time_weeks: leadTimeWeeks > 0 ? leadTimeWeeks : null,
      subtotal_cents: subtotal,
      total_cents: subtotal,
      currency,
    })
    .select('id,order_number')
    .single();
  if (orderError || !order) return json(500, { error: 'order_create_failed' });

  const { error: itemsError } = await admin.from('shop_order_items').insert(
    lines.map((line) => ({
      order_id: order.id,
      product_id: line.product.id,
      sku: line.product.sku,
      title: line.product.title,
      pack_size_g: line.product.pack_size_g,
      unit_price_cents: line.product.price_cents,
      quantity: line.quantity,
      is_preorder: line.product.availability === 'preorder',
    })),
  );
  if (itemsError) return json(500, { error: 'order_items_create_failed' });

  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: user.id,
        customer_email: user.email ?? undefined,
        line_items: lines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency,
            unit_amount: line.product.price_cents,
            product_data: {
              name: line.product.title,
              metadata: { pi_sku: line.product.sku },
            },
          },
        })),
        success_url: `${body.successUrl!}${body.successUrl!.includes('?') ? '&' : '?'}order=${order.id}`,
        cancel_url: body.cancelUrl!,
        metadata: {
          pi_user_id: user.id,
          pi_shop_order_id: order.id,
          pi_order_number: order.order_number,
        },
        payment_intent_data: {
          metadata: { pi_user_id: user.id, pi_shop_order_id: order.id },
        },
      },
      { idempotencyKey: `shop:${order.id}` },
    );
    await admin
      .from('shop_orders')
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    console.log(`shop-checkout: session for order ${order.order_number}`);
    return json(200, { url: session.url, orderId: order.id, orderNumber: order.order_number });
  } catch (error) {
    await admin.from('shop_orders').update({ status: 'failed' }).eq('id', order.id);
    console.error('shop-checkout: stripe session create failed', error);
    return json(502, { error: 'stripe_session_create_failed' });
  }
});
