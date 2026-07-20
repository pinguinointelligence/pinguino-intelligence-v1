/**
 * Billing checkout (client) — starts a Stripe Checkout Session for a signed-in
 * user via the `create-checkout-session` Edge Function.
 *
 * The vendor call stays behind this `src/services/**` boundary (the UI/store
 * layer never imports the Supabase client). The client submits an OFFER KEY
 * only — NEVER a price id (the server resolves the price from env). Redirect
 * URLs are this origin's `/subscription` callbacks, which must be present in the
 * function's `BILLING_REDIRECT_URL_ALLOWLIST`.
 *
 * Every failure is HONEST and typed — the caller shows a real message, never a
 * dead button and never a false "success".
 */
import { supabase } from '@/lib/supabase/client';

export type BillingProductId = 'home' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

/**
 * The standard direct-checkout offer key for a plan + billing cycle. Matches the
 * `PURCHASABLE_OFFERS` / `PRICE_CATALOG` keys (`home_monthly_standard`, …). The
 * founding/launch variants are server-flag-gated and are NOT offered here.
 */
export function checkoutOfferKey(product: BillingProductId, cycle: BillingCycle): string {
  return `${product}_${cycle}_standard`;
}

export type CheckoutFailureReason = 'unavailable' | 'not_signed_in' | 'already_subscribed' | 'failed';

export type StartCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: CheckoutFailureReason };

/**
 * Ask the Edge Function for a Checkout Session URL. Returns `not_signed_in`
 * without calling the function when there is no session (the function
 * authenticates from the JWT, not the body), `already_subscribed` on a
 * conflicting active subscription (409), `unavailable` when the backend is not
 * configured, and `failed` for anything else. On success the caller redirects
 * the browser to `url`.
 */
export async function startCheckout(offerKey: string): Promise<StartCheckoutResult> {
  if (supabase === null) return { ok: false, reason: 'unavailable' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: 'not_signed_in' };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      offerKey,
      successUrl: `${origin}/subscription?checkout=success`,
      cancelUrl: `${origin}/subscription?checkout=cancelled`,
    },
  });

  if (error) return { ok: false, reason: await classifyInvokeError(error) };

  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url === 'string' && url.length > 0) return { ok: true, url };
  return { ok: false, reason: 'failed' };
}

/**
 * Map a Supabase FunctionsHttpError to a typed reason by reading the function's
 * structured `{ error }` body when available. Anything unrecognised → 'failed'.
 */
async function classifyInvokeError(error: unknown): Promise<CheckoutFailureReason> {
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = (await (context as Response).json()) as { error?: string };
      if (body?.error === 'conflicting_active_subscription') return 'already_subscribed';
      if (body?.error === 'unauthorized') return 'not_signed_in';
      if (body?.error === 'billing_not_configured' || body?.error === 'offer_price_not_configured') {
        return 'unavailable';
      }
    } catch {
      /* fall through to 'failed' */
    }
  }
  return 'failed';
}
