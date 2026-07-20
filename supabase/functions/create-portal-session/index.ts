/**
 * create-portal-session — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * Creates a Stripe Customer Portal session for the signed-in user. The
 * portal handles payment-method updates, invoices and cancel-at-period-end
 * (handoff §6); the monthly→annual partner conversion deliberately stays
 * INSIDE the Pinguino app, never the portal.
 *
 * Invariants (test-pinned via logic.ts + source scans):
 *  - caller authenticated via Supabase JWT; the customer id comes ONLY from
 *    the server-side billing_customers mapping — never from the body;
 *  - no mapping → 404 refusal, no Stripe call;
 *  - the return URL must pass the env origin allowlist.
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION,
 * BILLING_REDIRECT_URL_ALLOWLIST, optional
 * STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID, plus auto-injected SUPABASE_URL /
 * SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedRedirectUrl, parseUrlAllowlist } from '../_shared/urlAllowlist.ts';
import { decidePortalEligibility } from './logic.ts';

// Browser-invoked → answer the cross-origin preflight (same CORS contract as
// create-accepted-correction / create-checkout-session).
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
  if (!stripeKey) return json(500, { error: 'billing_not_configured' });

  // 1. Authenticate the caller from the JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });

  // 2. Validate the return URL against the origin allowlist.
  let body: { returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const allowlist = parseUrlAllowlist(Deno.env.get('BILLING_REDIRECT_URL_ALLOWLIST'));
  if (!isAllowedRedirectUrl(body.returnUrl, allowlist)) {
    return json(400, { error: 'redirect_url_not_allowed' });
  }

  // 3. The customer id comes ONLY from the server-side mapping.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: mapping, error: mappingError } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (mappingError) return json(500, { error: 'customer_lookup_failed' });

  const eligibility = decidePortalEligibility(mapping);
  if (!eligibility.ok) return json(404, { error: eligibility.reason });

  // 4. Create the portal session.
  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  const portalConfiguration = Deno.env.get('STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID');
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: eligibility.customerId,
      return_url: body.returnUrl!,
      ...(portalConfiguration ? { configuration: portalConfiguration } : {}),
    });
    console.log('create-portal-session: session created');
    return json(200, { url: session.url });
  } catch {
    return json(502, { error: 'stripe_portal_create_failed' });
  }
});
