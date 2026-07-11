/**
 * create-checkout-session — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * Creates a Stripe Checkout Session for a signed-in user. Source-only in
 * this slice; deployment requires owner approval + Sandbox configuration
 * (Nicolas handoff).
 *
 * Security invariants (test-pinned via logic.ts + source scans):
 *  - the request is authenticated with the caller's Supabase JWT — no user
 *    id is ever taken from the body;
 *  - the client submits an OFFER KEY only; the server resolves the price id
 *    from env (client can never inject a price id);
 *  - flag-gated offers refuse when the server flag is off; 15-month offers
 *    are never resolvable here at all;
 *  - a conflicting active subscription refuses BEFORE any Stripe call;
 *  - success/cancel URLs must pass the env origin allowlist;
 *  - metadata is the CLOSED correlation payload; client_reference_id is the
 *    internal user id (the webhook mapping contract);
 *  - the Stripe call carries a deterministic idempotency key.
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION,
 * BILLING_REDIRECT_URL_ALLOWLIST, OFFER_FLAG_HOME_LAUNCH_ENABLED,
 * OFFER_FLAG_PRO_FOUNDING_ENABLED, the STRIPE_PRICE_* vars named in
 * logic.ts, plus auto-injected SUPABASE_URL / SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedRedirectUrl, parseUrlAllowlist } from '../_shared/urlAllowlist.ts';
import {
  buildAttributionResolutionInput,
  buildCheckoutIdempotencyKey,
  buildCheckoutMetadata,
  hasConflictingActiveSubscription,
  resolvePurchasableOffer,
} from './logic.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(500, { error: 'billing_not_configured' });

  // 1. Authenticate the caller from the JWT — never from the body.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const userId = userData.user.id;

  // 2. Parse the request — offer key + redirect URLs + optional attribution.
  let body: {
    offerKey?: string;
    successUrl?: string;
    cancelUrl?: string;
    explicitCode?: string;
    cookieAttributionId?: string;
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

  // 3. Server-side offer eligibility — the client never names a price id.
  const flags = {
    launchEnabled: Deno.env.get('OFFER_FLAG_HOME_LAUNCH_ENABLED') === 'true',
    foundingEnabled: Deno.env.get('OFFER_FLAG_PRO_FOUNDING_ENABLED') === 'true',
  };
  const offer = resolvePurchasableOffer(body.offerKey, flags);
  if (!offer.ok) return json(400, { error: offer.reason });
  const priceId = Deno.env.get(offer.envVarName);
  if (!priceId) return json(500, { error: 'offer_price_not_configured' });

  // 4. Refuse a conflicting active subscription BEFORE any Stripe call.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: existing, error: existingError } = await admin
    .from('subscriptions')
    .select('subscription_status, current_period_end')
    .eq('user_id', userId);
  if (existingError) return json(500, { error: 'subscription_lookup_failed' });
  if (hasConflictingActiveSubscription(existing ?? [], new Date())) {
    return json(409, { error: 'conflicting_active_subscription' });
  }

  // 5. Attribution resolution input (track E resolver decides authority;
  //    the resulting attribution id rides in metadata for correlation).
  const attribution = buildAttributionResolutionInput({
    userId,
    explicitCode: body.explicitCode ?? null,
    cookieAttributionId: body.cookieAttributionId ?? null,
  });
  const attributionId = attribution.cookieAttributionId; // resolver integration point

  // 6. Create the session — deterministic idempotency key, closed metadata.
  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        client_reference_id: userId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: body.successUrl!,
        cancel_url: body.cancelUrl!,
        metadata: buildCheckoutMetadata({ userId, offerKey: offer.offerKey, attributionId }),
        subscription_data: {
          metadata: buildCheckoutMetadata({ userId, offerKey: offer.offerKey, attributionId }),
        },
        // Automatic payment methods: the dashboard's recurring-compatible
        // configuration (cards, wallets, Link, SEPA) applies — nothing is
        // hardcoded here.
      },
      {
        idempotencyKey: buildCheckoutIdempotencyKey({
          userId,
          offerKey: offer.offerKey,
          attributionId,
        }),
      },
    );
    console.log(`create-checkout-session: session created for offer ${offer.offerKey}`);
    return json(200, { url: session.url });
  } catch {
    return json(502, { error: 'stripe_session_create_failed' });
  }
});
