/**
 * create-connect-onboarding-link — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * Mints a hosted Stripe Connect onboarding link (Express-style dashboard,
 * transfers + bank payouts capabilities per handoff §7) for an APPROVED and
 * ACTIVE partner.
 *
 * Invariants (test-pinned via logic.ts + source scans):
 *  - caller authenticated via Supabase JWT; the partner record is looked up
 *    server-side by user id — never taken from the body;
 *  - partner must be approved + active (typed refusals otherwise);
 *  - return/refresh URLs must pass the env origin allowlist;
 *  - the connected account id is stored/read server-side only.
 *
 * Required env (names only): STRIPE_SECRET_KEY, STRIPE_API_VERSION,
 * BILLING_REDIRECT_URL_ALLOWLIST, plus auto-injected SUPABASE_URL /
 * SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 */
import Stripe from 'npm:stripe@18';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedRedirectUrl, parseUrlAllowlist } from '../_shared/urlAllowlist.ts';
import { decideOnboardingEligibility } from './logic.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
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

  // 2. Validate return/refresh URLs against the origin allowlist.
  let body: { returnUrl?: string; refreshUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const allowlist = parseUrlAllowlist(Deno.env.get('BILLING_REDIRECT_URL_ALLOWLIST'));
  if (!isAllowedRedirectUrl(body.returnUrl, allowlist) || !isAllowedRedirectUrl(body.refreshUrl, allowlist)) {
    return json(400, { error: 'redirect_url_not_allowed' });
  }

  // 3. Partner must be approved + active (server-side record, track D table).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: partner, error: partnerError } = await admin
    .from('partners')
    .select('status, active, stripe_account_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (partnerError) return json(500, { error: 'partner_lookup_failed' });

  const eligibility = decideOnboardingEligibility(partner);
  if (!eligibility.ok) return json(403, { error: eligibility.reason });

  // 4. Mint the hosted onboarding link for the partner's connected account.
  const accountId: string | null = partner?.stripe_account_id ?? null;
  if (!accountId) return json(409, { error: 'partner_account_not_provisioned' });

  const apiVersion = Deno.env.get('STRIPE_API_VERSION') ?? '2025-06-30.basil';
  const stripe = new Stripe(stripeKey, { apiVersion: apiVersion as Stripe.LatestApiVersion });
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: body.returnUrl!,
      refresh_url: body.refreshUrl!,
    });
    console.log('create-connect-onboarding-link: link created');
    return json(200, { url: link.url });
  } catch {
    return json(502, { error: 'stripe_account_link_failed' });
  }
});
