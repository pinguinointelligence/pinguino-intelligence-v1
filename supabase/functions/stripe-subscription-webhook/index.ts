/**
 * stripe-subscription-webhook — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * The Phase 2B.3 subscription-freshness writer: Stripe is the source of
 * truth, this function is the ONLY writer of the server-maintained
 * public.subscriptions cache (clients have zero write grants there — 0003).
 * Deploying requires explicit owner approval plus the checklist in
 * docs/spine/STRIPE_SUBSCRIPTION_WEBHOOK_PLAN.md (deploy with JWT
 * verification disabled — Stripe cannot send a JWT; the Stripe SIGNATURE is
 * the authentication).
 *
 * Security invariants (test-pinned via mapping.ts + source scans):
 *  - every request must carry a VALID Stripe signature over the RAW body —
 *    unsigned/invalid/replayed-tampered requests get 400 and write nothing;
 *  - tier can never be client-supplied: the ONLY inputs are the verified
 *    Stripe event object, the env price allowlist and the server-side
 *    billing_customers mapping;
 *  - an unconfigured or unlisted price NEVER grants tier (acknowledged
 *    no-op) — a random Stripe product cannot become PI Pro;
 *  - a subscription event whose customer has no user mapping yet returns
 *    non-2xx so Stripe REDELIVERS (checkout race self-heals);
 *  - the upsert payload is a CLOSED field list built by buildSubscriptionRow
 *    (no spread of Stripe objects into the DB) keyed on the unique
 *    stripe_subscription_id → redelivered events are idempotent;
 *  - writes touch exactly two tables: subscriptions and billing_customers.
 *    Never accepted_corrections, Mapper, products, PAC/POD, statuses,
 *    recipes, or stock;
 *  - logs carry event type + object ids only — never payloads, emails,
 *    amounts, or any secret. Env names are referenced, values never appear.
 *
 * Required env (documented, NOT committed): STRIPE_WEBHOOK_SIGNING_SECRET,
 * STRIPE_SECRET_KEY (SDK construction only in v1 — no API calls are made),
 * STRIPE_PRO_PRICE_IDS (comma-separated allowlist), plus the auto-injected
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildSubscriptionRow,
  decideSubscriptionAction,
  parsePriceAllowlist,
  routeEvent,
} from './mapping.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const signingSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!signingSecret || !stripeKey) return json(500, { error: 'webhook_not_configured' });

  // 1. Authenticate the request: a valid Stripe signature over the RAW body.
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json(400, { error: 'missing_signature' });
  const rawBody = await req.text();

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-06-30.basil' });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      signingSecret,
      undefined,
      cryptoProvider,
    );
  } catch {
    return json(400, { error: 'invalid_signature' });
  }

  const route = routeEvent(event.type);
  console.log(`stripe-webhook: ${event.type} → ${route}`); // type + route only, never payloads

  // 2. Unsupported / deliberately-no-op events are acknowledged so Stripe
  //    does not retry them (invoice transitions arrive again as
  //    customer.subscription.updated — our single source of truth).
  if (route === 'acknowledge_unsupported' || route === 'acknowledge_noop') {
    return json(200, { received: true, route });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 3. checkout.session.completed → user ↔ Stripe-customer mapping. The
  //    checkout creator (2B.2) MUST set client_reference_id to the auth user
  //    id — without it there is nothing safe to map (acknowledged no-op).
  if (route === 'customer_mapping') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const customerId =
      typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
    if (!userId || !customerId) {
      console.log(`stripe-webhook: session ${session.id} without user/customer ref — no-op`);
      return json(200, { received: true, route, mapped: false });
    }
    const { error } = await admin
      .from('billing_customers')
      .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
    if (error) return json(500, { error: 'customer_mapping_failed' });
    return json(200, { received: true, route, mapped: true });
  }

  // 4. customer.subscription.created|updated|deleted → the cache upsert.
  const subscription = event.data.object as Stripe.Subscription;
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const allowlist = parsePriceAllowlist(Deno.env.get('STRIPE_PRO_PRICE_IDS'));

  const { data: mapping } = await admin
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  const userId: string | null = mapping?.user_id ?? null;

  const action = decideSubscriptionAction({ priceId, allowlist, userId });
  console.log(`stripe-webhook: ${subscription.id} → ${action}`);

  if (action === 'ignore_no_allowlist_configured' || action === 'ignore_unlisted_price') {
    // Never grant tier on unconfigured/foreign prices; 200 so Stripe stops.
    return json(200, { received: true, route, action });
  }
  if (action === 'retry_unmapped_customer') {
    // Non-2xx: Stripe redelivers with backoff until the checkout mapping lands.
    return json(409, { error: 'customer_not_mapped_yet' });
  }

  // Version-robust period extraction: older Stripe API versions carry
  // current_period_end on the Subscription, 2025+ ("Basil") moved it to the
  // SubscriptionItem — read both so past_due grace never silently nulls out.
  const topLevel = subscription as unknown as { current_period_end?: number | null };
  const firstItem = subscription.items?.data?.[0] as unknown as
    | { current_period_end?: number | null }
    | undefined;
  const currentPeriodEndEpoch = topLevel.current_period_end ?? firstItem?.current_period_end ?? null;

  const row = buildSubscriptionRow({
    userId: userId as string,
    eventType: event.type,
    subscription: {
      id: subscription.id,
      customer: customerId,
      status: subscription.status,
      priceId,
      currentPeriodEndEpoch,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    },
  });
  const { error } = await admin
    .from('subscriptions')
    .upsert(row, { onConflict: 'stripe_subscription_id' });
  if (error) return json(500, { error: 'subscription_upsert_failed' });

  return json(200, { received: true, route, action });
});
