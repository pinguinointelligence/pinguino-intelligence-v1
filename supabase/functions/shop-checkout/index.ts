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

/**
 * SHIPPING IS NOT DECLARED HERE.
 *
 * This function used to carry its own country list and its own flat rate, kept
 * equal to the cart's copy by a test. A drift detector is not an authority: two
 * places could still be edited apart, and the customer would only find out from
 * a card statement.
 *
 * Both sides now resolve `shop_shipping_rates`. The rate charged is re-read
 * server-side at session time, so a client cannot propose one, and Admin can
 * change a price or add a carrier without a deploy.
 */
interface ShippingRateRow {
  country_iso2: string;
  carrier: string;
  service: string | null;
  customer_price_cents: number;
  currency: string;
  eta_min_days: number | null;
  eta_max_days: number | null;
}

/**
 * The query surface this function actually uses. Typed structurally instead of
 * with `any`: it only ever chains `.select().eq().eq().eq().order()`, and naming
 * that shape keeps the dependency honest — an `any` here would let any future
 * call slip through unchecked on the path that decides what a customer pays.
 */
interface RateQuery {
  select: (columns: string) => RateQuery;
  eq: (column: string, value: unknown) => RateQuery;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/** Every country with an enabled physical rate, cheapest-priority first. */
const loadShippingRates = async (db: {
  from: (table: string) => RateQuery;
}): Promise<ShippingRateRow[]> => {
  const { data, error } = await db
    .from('shop_shipping_rates')
    .select(
      'country_iso2,carrier,service,customer_price_cents,currency,eta_min_days,eta_max_days,sort_order',
    )
    .eq('enabled', true)
    .eq('active', true)
    .eq('physical_starter_pack_allowed', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShippingRateRow[];
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
    /* WHERE ARE YOU STARTING? — chosen in the Shop before checkout opens, so
       the exact rate is known here. Without it the session would have to offer
       every country's rate and `expected_total_cents` could not be written,
       which is the settlement authority. */
    countryIso2?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const allowlist = parseUrlAllowlist(Deno.env.get('BILLING_REDIRECT_URL_ALLOWLIST'));
  if (
    !isAllowedRedirectUrl(body.successUrl, allowlist) ||
    !isAllowedRedirectUrl(body.cancelUrl, allowlist)
  ) {
    return json(400, { error: 'redirect_url_not_allowed' });
  }

  const countryIso2 = String(body.countryIso2 ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryIso2)) return json(400, { error: 'country_required' });

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
    .in(
      'sku',
      requested.map((item) => item.sku),
    );
  if (productError) return json(500, { error: 'catalog_lookup_failed' });

  const bySku = new Map<string, ProductRow>(
    (products ?? []).map((row) => [row.sku, row as ProductRow]),
  );
  const lines: Array<{ product: ProductRow; quantity: number }> = [];
  for (const item of requested) {
    const product = bySku.get(item.sku);
    if (!product || !product.active)
      return json(400, { error: 'product_unavailable', sku: item.sku });
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

  /* DOUBLE-CLICK / BACK-BUTTON GUARD.
     A second request for the same cart must not mint a second order. The
     browser already disables the button, but a double submit, a retried fetch
     or a customer who pressed Back and clicked Pay again all arrive here as a
     genuine second request. If this user has an unpaid order for exactly this
     cart from the last half hour, they are sent back to ITS session rather than
     given a new one — Stripe sessions live 24 h, so the link is still good. */
  const cartKey = [...requested]
    .map((item) => `${item.sku}:${item.quantity}`)
    .sort()
    .join('|');
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: openOrders } = await admin
    .from('shop_orders')
    .select('id,order_number,stripe_checkout_session_id,shop_order_items(sku,quantity)')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .gte('created_at', since)
    .not('stripe_checkout_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);
  const duplicate = (openOrders ?? []).find((row) => {
    const items = (row.shop_order_items ?? []) as Array<{ sku: string; quantity: number }>;
    return (
      items.length === requested.length &&
      items
        .map((item) => `${item.sku}:${item.quantity}`)
        .sort()
        .join('|') === cartKey
    );
  });
  if (duplicate) {
    const apiVersionForReuse = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
    const reuseStripe = new Stripe(stripeKey, {
      apiVersion: apiVersionForReuse as Stripe.LatestApiVersion,
    });
    try {
      const existing = await reuseStripe.checkout.sessions.retrieve(
        duplicate.stripe_checkout_session_id!,
      );
      if (existing.status === 'open' && existing.url) {
        console.log(`shop-checkout: reusing session for order ${duplicate.order_number}`);
        return json(200, {
          url: existing.url,
          orderId: duplicate.id,
          orderNumber: duplicate.order_number,
          reused: true,
        });
      }
    } catch (error) {
      // An unreadable session is not a reason to refuse a sale — fall through
      // and create a fresh order.
      console.error('shop-checkout: could not reuse session', error);
    }
  }

  // The order exists before Stripe does, so a session always maps to one order.
  /* THE rate, re-resolved server-side. A client may propose a country; it may
     never propose a price. No enabled row means no physical offer for that
     country — refused rather than defaulted. */
  const shippingRates = await loadShippingRates(admin);
  const shippingRate = shippingRates.find((rate) => rate.country_iso2 === countryIso2);
  if (!shippingRate) return json(400, { error: 'shipping_unavailable_for_country' });
  const shippingCents = shippingRate.customer_price_cents;
  const shippingCountries = [countryIso2];

  const orderNumber = `G-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto
    .randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;
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
      /* IMMUTABLE settlement authority. Written once, here, from the same
         numbers handed to the provider below: items + the flat courier rate.
         Tax is 0 (provider-side tax calculation is not enabled) and no
         discounts exist. Settlement refuses any event whose amount_total does
         not match this exactly. */
      shipping_cents: shippingCents,
      shipping_country: countryIso2,
      order_type: 'PHYSICAL',
      expected_total_cents: subtotal + shippingCents,
      expected_currency: currency,
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
        /* A parcel needs a destination. Checkout collects the address, and
           `shop-order-sync` writes it back onto the order so whoever packs it
           can read it without opening Stripe. */
        shipping_address_collection: { allowed_countries: shippingCountries },
        phone_number_collection: { enabled: true },
        /* One option per enabled country rate. Stripe shows the customer the
           row that matches the address they enter, and the amount is the one
           Admin configured — never a literal from this file. */
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: shippingCents, currency },
              display_name: shippingRate.service
                ? `${shippingRate.carrier} · ${shippingRate.service}`
                : shippingRate.carrier,
              ...(shippingRate.eta_min_days != null && shippingRate.eta_max_days != null
                ? {
                    delivery_estimate: {
                      minimum: { unit: 'business_day', value: shippingRate.eta_min_days },
                      maximum: { unit: 'business_day', value: shippingRate.eta_max_days },
                    },
                  }
                : {}),
            },
          },
        ],
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
