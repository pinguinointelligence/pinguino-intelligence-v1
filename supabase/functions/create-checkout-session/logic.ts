/**
 * create-checkout-session — PURE eligibility/decision logic (no IO, no Deno
 * APIs, no SDK). index.ts is the thin Deno shell.
 *
 * Locked rules (test-pinned):
 *  - the client submits an OFFER KEY, never a price id: the server maps the
 *    offer to its env-configured Stripe price. An unknown offer key, a
 *    flag-gated offer without its server flag, or ANY 15-month offer
 *    (referral-orchestration-only, never direct checkout) is refused;
 *  - a user with a conflicting ACTIVE subscription (paid semantics identical
 *    to planFromSubscription: active | trialing, past_due within grace) is
 *    refused — no double subscriptions;
 *  - the Checkout metadata correlation payload is a CLOSED field list
 *    carrying the internal user id + offer key + attribution id, so every
 *    later webhook can be correlated without guessing;
 *  - idempotency keys are deterministic functions of (user, offer,
 *    attribution) — a retried request can never create a second session
 *    with different semantics.
 *
 * OFFER TABLE LOCKSTEP: this module is deployment-self-contained, so it
 * carries its own minimal offer table; a vitest lockstep test pins it 1:1
 * against src/billing/catalog/priceCatalog.ts (same keys, same env var
 * names, same flags, same purchasability).
 */

export type ServerFlag = 'launch' | 'founding' | null;

export interface PurchasableOffer {
  offerKey: string;
  /** Env var NAME whose value is the Stripe price id (value never here). */
  envVarName: string;
  /** Flag required before this offer may be sold (null = always). */
  requiredServerFlag: ServerFlag;
}

/**
 * Direct-checkout offers ONLY — the 15-month partner offers are deliberately
 * absent: they exist solely inside the referral schedule orchestration.
 */
export const PURCHASABLE_OFFERS: readonly PurchasableOffer[] = [
  { offerKey: 'home_monthly_standard', envVarName: 'STRIPE_PRICE_HOME_MONTHLY_STANDARD', requiredServerFlag: null },
  { offerKey: 'home_yearly_standard', envVarName: 'STRIPE_PRICE_HOME_YEARLY_STANDARD', requiredServerFlag: null },
  { offerKey: 'home_yearly_launch', envVarName: 'STRIPE_PRICE_HOME_YEARLY_LAUNCH', requiredServerFlag: 'launch' },
  { offerKey: 'pro_monthly_standard', envVarName: 'STRIPE_PRICE_PRO_MONTHLY_STANDARD', requiredServerFlag: null },
  { offerKey: 'pro_monthly_founding', envVarName: 'STRIPE_PRICE_PRO_MONTHLY_FOUNDING', requiredServerFlag: 'founding' },
  { offerKey: 'pro_yearly_standard', envVarName: 'STRIPE_PRICE_PRO_YEARLY_STANDARD', requiredServerFlag: null },
  { offerKey: 'pro_yearly_founding', envVarName: 'STRIPE_PRICE_PRO_YEARLY_FOUNDING', requiredServerFlag: 'founding' },
];

export interface CheckoutFlags {
  launchEnabled: boolean;
  foundingEnabled: boolean;
}

export type OfferResolution =
  | { ok: true; offerKey: string; envVarName: string }
  | { ok: false; reason: 'unknown_or_unpurchasable_offer' | 'launch_not_enabled' | 'founding_not_enabled' };

/**
 * Resolve a CLIENT-SUBMITTED offer key to the env var carrying its price id.
 * 15-month offers are not in the table → they resolve to
 * 'unknown_or_unpurchasable_offer' exactly like garbage input.
 */
export function resolvePurchasableOffer(
  offerKeyRaw: string | null | undefined,
  flags: CheckoutFlags,
): OfferResolution {
  const offer = PURCHASABLE_OFFERS.find((o) => o.offerKey === (offerKeyRaw ?? '').trim());
  if (!offer) return { ok: false, reason: 'unknown_or_unpurchasable_offer' };
  if (offer.requiredServerFlag === 'launch' && !flags.launchEnabled) {
    return { ok: false, reason: 'launch_not_enabled' };
  }
  if (offer.requiredServerFlag === 'founding' && !flags.foundingEnabled) {
    return { ok: false, reason: 'founding_not_enabled' };
  }
  return { ok: true, offerKey: offer.offerKey, envVarName: offer.envVarName };
}

/** The subscription-row subset the conflict check needs. */
export interface ExistingSubscription {
  subscription_status: string;
  current_period_end: string | null;
}

/**
 * Paid-subscription conflict — SAME semantics as the app's
 * planFromSubscription (lockstep-tested): active | trialing always conflict;
 * past_due conflicts while inside the current_period_end grace window.
 */
export function hasConflictingActiveSubscription(
  subscriptions: readonly ExistingSubscription[],
  now: Date,
): boolean {
  return subscriptions.some((sub) => {
    const status = sub.subscription_status;
    if (status === 'active' || status === 'trialing') return true;
    if (status === 'past_due') {
      const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
      return end !== null && end.getTime() > now.getTime();
    }
    return false;
  });
}

/** Normalized inputs the attribution resolver (track E) consumes. */
export interface AttributionResolutionInput {
  userId: string;
  /** Explicit partner code typed/linked by the user (trim/empty → null). */
  explicitCode: string | null;
  /** Signed referral-cookie attribution id, if a valid cookie rode along. */
  cookieAttributionId: string | null;
}

export function buildAttributionResolutionInput(input: {
  userId: string;
  explicitCode?: string | null;
  cookieAttributionId?: string | null;
}): AttributionResolutionInput {
  const norm = (value: string | null | undefined): string | null => {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    userId: input.userId,
    explicitCode: norm(input.explicitCode),
    cookieAttributionId: norm(input.cookieAttributionId),
  };
}

/** CLOSED metadata correlation payload — exactly these keys, all strings. */
export interface CheckoutMetadata {
  pi_user_id: string;
  pi_offer_key: string;
  pi_attribution_id: string;
}

export function buildCheckoutMetadata(input: {
  userId: string;
  offerKey: string;
  attributionId: string | null;
}): CheckoutMetadata {
  return {
    pi_user_id: input.userId,
    pi_offer_key: input.offerKey,
    pi_attribution_id: input.attributionId ?? '',
  };
}

/** Deterministic Stripe idempotency key for the session-create call. */
export function buildCheckoutIdempotencyKey(input: {
  userId: string;
  offerKey: string;
  attributionId: string | null;
}): string {
  return `checkout:${input.userId}:${input.offerKey}:${input.attributionId ?? 'none'}`;
}
