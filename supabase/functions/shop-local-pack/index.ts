/**
 * shop-local-pack — Edge Function (Deno).
 *
 * Creates a 0 EUR LOCAL_STARTER_PACK order: the same seven canonical components
 * as the physical pack, bought locally, delivered as a PDF shopping list.
 *
 * A free order is still an order, so the same authority rules apply:
 *  - the caller is authenticated from the JWT — no user id is ever read from
 *    the body;
 *  - the client names a COUNTRY; it never names a price, a product list or a
 *    supplier. Everything is resolved server-side;
 *  - the country must be genuinely LIVE — operator intent AND a complete
 *    mapping, read from `shop_country_local_readiness`. A client cannot talk
 *    its way into a pack for a country that is still missing links;
 *  - the exact component rows used are frozen into `local_pack_snapshot`, so a
 *    supplier URL edited next month changes future PDFs and leaves this order
 *    historically coherent;
 *  - NO payment provider is involved. There is no 1 EUR placeholder and no fake
 *    session: 0 EUR means no charge at all.
 *
 * Required env: the auto-injected SUPABASE_* values only. This function
 * deliberately has no payment credentials.
 */
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

const text = (value: unknown, max = 200): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
};

interface ComponentRow {
  local_product_name: string;
  supplier_name: string;
  purchase_url: string;
  pack_size: string | null;
  display_price: string | null;
  notes: string | null;
  sort_order: number;
  shop_products: { sku: string; title: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const user = userData.user;

  let body: {
    countryIso2?: string;
    address?: {
      name?: string;
      line1?: string;
      line2?: string;
      postalCode?: string;
      city?: string;
      state?: string;
      phone?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const countryIso2 = String(body.countryIso2 ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryIso2)) return json(400, { error: 'country_required' });

  /* D: a delivery/contact address is REQUIRED even at 0 EUR. It is what lets us
     offer this customer a physical pack later without asking again. */
  const address = {
    name: text(body.address?.name, 120),
    line1: text(body.address?.line1, 200),
    line2: text(body.address?.line2, 200),
    postalCode: text(body.address?.postalCode, 32),
    city: text(body.address?.city, 120),
    state: text(body.address?.state, 120),
    phone: text(body.address?.phone, 40),
  };
  if (!address.name || !address.line1 || !address.city || !address.postalCode) {
    return json(400, { error: 'address_incomplete' });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  /* THE gate. `local_starter_pack_live` is computed by the database from the
     canonical bundle: intent, active, and every component carrying a real link.
     Trusting a client flag here would let a half-mapped country ship a PDF with
     dead "Buy" links. */
  const { data: readiness, error: readinessError } = await admin
    .from('shop_country_local_readiness')
    .select('iso2,name,local_starter_pack_live,components_required,components_ready')
    .eq('iso2', countryIso2)
    .maybeSingle();
  if (readinessError) return json(500, { error: 'readiness_unavailable' });
  if (!readiness) return json(400, { error: 'country_unknown' });
  if (readiness.local_starter_pack_live !== true) {
    return json(400, {
      error: 'local_pack_not_available',
      componentsReady: readiness.components_ready,
      componentsRequired: readiness.components_required,
    });
  }

  const { data: componentRows, error: componentsError } = await admin
    .from('shop_country_components')
    .select(
      'local_product_name,supplier_name,purchase_url,pack_size,display_price,notes,sort_order,' +
        'shop_products!inner(sku,title)',
    )
    .eq('country_iso2', countryIso2)
    .eq('active', true)
    .not('purchase_url', 'is', null)
    .not('local_product_name', 'is', null)
    .not('supplier_name', 'is', null)
    .order('sort_order', { ascending: true });
  if (componentsError) return json(500, { error: 'components_unavailable' });
  const components = (componentRows ?? []) as unknown as ComponentRow[];
  if (components.length === 0) return json(400, { error: 'local_pack_not_available' });

  /* G: the snapshot. Everything the PDF needs, frozen at order time, so the
     document can always be regenerated exactly as it was issued. */
  const snapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    country: { iso2: countryIso2, name: readiness.name },
    components: components.map((row) => ({
      sku: row.shop_products?.sku ?? '',
      componentTitle: row.shop_products?.title ?? '',
      localProductName: row.local_product_name,
      supplierName: row.supplier_name,
      purchaseUrl: row.purchase_url,
      packSize: row.pack_size,
      displayPrice: row.display_price,
      notes: row.notes,
    })),
  };

  /* The reusable address. One default per user, upserted rather than piled up. */
  await admin
    .from('shop_customer_addresses')
    .delete()
    .eq('user_id', user.id)
    .eq('is_default', true);
  /* Columns named explicitly. Spreading `address` would have carried its
     camelCase `postalCode` into the insert as an unknown column and failed the
     whole write — the address is the reason this 0 EUR order exists, so it
     cannot be a casualty of a convenient spread. */
  await admin.from('shop_customer_addresses').insert({
    user_id: user.id,
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    postal_code: address.postalCode,
    city: address.city,
    state: address.state,
    phone: address.phone,
    country: countryIso2,
    is_default: true,
  });

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
      order_type: 'LOCAL_STARTER_PACK',
      /* A 0 EUR order is SETTLED on creation: there is nothing to collect, so
         it is `paid` with a zero total rather than left pending forever. The
         revenue split reads `order_type`, so this never inflates Shop revenue. */
      status: 'paid',
      fulfillment_status: 'delivered',
      contains_preorder: false,
      subtotal_cents: 0,
      shipping_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      currency: 'eur',
      expected_total_cents: 0,
      expected_currency: 'eur',
      paid_at: new Date().toISOString(),
      local_pack_country: countryIso2,
      local_pack_snapshot: snapshot,
      local_pack_generated_at: new Date().toISOString(),
      shipping_name: address.name,
      shipping_line1: address.line1,
      shipping_line2: address.line2,
      shipping_postal_code: address.postalCode,
      shipping_city: address.city,
      shipping_state: address.state,
      shipping_country: countryIso2,
      shipping_phone: address.phone,
    })
    .select('id,order_number')
    .single();
  if (orderError || !order) return json(500, { error: 'order_create_failed' });

  /* H: delivery through the ONE transactional mail path. The mail carries a
     link into Account -> Orders rather than an attachment, so the document is
     always regenerated from the snapshot above and can never go stale.

     `environment` is NOT NULL and `metadata.area` is a CLOSED vocabulary that
     `email_jobs` enforces — the first version of this omitted both and the row
     was silently refused, leaving a real order with no mail. The error is now
     READ rather than ignored: a failed queue must not invalidate the order (the
     PDF stays in the account and Admin can see the gap), but it must not vanish
     either. */
  const appOrigin = Deno.env.get('APP_PUBLIC_ORIGIN') ?? 'https://staging.pinguinoai.com';
  const environment = appOrigin.includes('gellatti.com') ? 'production' : 'staging';
  const orderUrl = `${appOrigin}/account?section=orders&order=${order.id}`;
  /* Queued through the CANONICAL enqueue RPC rather than a direct insert. It
     owns idempotency (`on conflict (idempotency_key) do nothing`), normalises
     the recipient and sets `next_attempt_at`, so this function does not carry a
     second, slightly different version of how a Gellatti email is created. */
  const { data: enqueued, error: emailError } = await admin.rpc('gellatti_enqueue_email_v1', {
    p_idempotency_key: `local-pack:${order.id}`,
    p_subject_key: 'shop.localStarterPack.ready',
    p_subject: 'Twój Lokalny Zestaw Startowy Gellatti',
    p_recipient: user.email ?? '',
    p_body_html:
      `<p>Twój Lokalny Zestaw Startowy (${readiness.name}) jest gotowy.</p>` +
      `<p><a href="${orderUrl}">Otwórz swoją listę zakupów</a></p>` +
      `<p><a href="https://www.gellatti.com">www.gellatti.com</a></p>`,
    p_body_text:
      `Twój Lokalny Zestaw Startowy (${readiness.name}) jest gotowy.\n\n` +
      `Lista zakupów: ${orderUrl}\n\nwww.gellatti.com\n`,
    p_environment: environment,
    p_metadata: { area: 'SHOP', event: 'local_starter_pack_ready', order_id: order.id },
    p_max_attempts: 5,
  });
  const emailJob = enqueued as { id?: string; status?: string; deduplicated?: boolean } | null;

  if (emailJob?.id) {
    await admin
      .from('shop_orders')
      .update({ local_pack_email_job_id: emailJob.id })
      .eq('id', order.id);
  } else if (emailError) {
    console.error('local-pack email queue failed', order.id, emailError.message);
  }

  return json(200, {
    orderId: order.id,
    orderNumber: order.order_number,
    country: readiness.name,
    components: snapshot.components.length,
    /* Reported, not hidden: the order is valid either way, but an operator
       should not have to query the database to learn the mail never queued. */
    emailQueued: Boolean(emailJob?.id),
  });
});
