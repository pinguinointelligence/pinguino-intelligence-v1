/**
 * Price catalog — the single typed source of truth for the ELEVEN locked
 * offers (mirrors `docs/billing-partner/NICOLAS_STRIPE_HANDOFF.md` §3 and the
 * server-owned `billing_price_catalog` table from the locked architecture).
 *
 * PURE data + helpers: no IO, no SDK, no env access. Actual Stripe price ids
 * are NEVER hardcoded — each offer names the env var
 * (`STRIPE_PRICE_*`) that carries its id; callers pass the resolved
 * `ConfiguredPriceIds` map in.
 *
 * Locked invariants (test-pinned):
 *  - exactly 11 offers, lookup keys verbatim from the handoff;
 *  - amounts in integer cents, EUR only (999/4900/3900/4900/3900/2499/1999/
 *    19900/14900/19900/14900);
 *  - 15-month offers are `interval: month`, `interval_count: 15`, and each
 *    maps to its 12-month renewal counterpart (standard→yearly_standard,
 *    launch→yearly_launch, founding→yearly_founding);
 *  - commission cadence: monthly offers → 'monthly'; ALL yearly AND 15-month
 *    offers → 'annual';
 *  - public listing policy: standard offers are publicly listable by default;
 *    launch/founding variants sit behind SERVER flags; 15-month offers are
 *    NEVER publicly listed — they are selected exclusively by the referral
 *    schedule orchestration (see scheduleOrchestration.ts).
 */

export type BillingProduct = 'home' | 'pro';
export type OfferCadence = 'monthly' | 'annual' | 'initial_15_month';
export type OfferVariant = 'standard' | 'home_launch' | 'pro_founding';
export type CommissionCadence = 'monthly' | 'annual';
export type StripeInterval = 'month' | 'year';

export type OfferKey =
  | 'home_monthly_standard'
  | 'home_yearly_standard'
  | 'home_yearly_launch'
  | 'home_15m_standard_partner'
  | 'home_15m_launch_partner'
  | 'pro_monthly_standard'
  | 'pro_monthly_founding'
  | 'pro_yearly_standard'
  | 'pro_yearly_founding'
  | 'pro_15m_standard_partner'
  | 'pro_15m_founding_partner';

export type PriceEnvVarName =
  | 'STRIPE_PRICE_HOME_MONTHLY_STANDARD'
  | 'STRIPE_PRICE_HOME_YEARLY_STANDARD'
  | 'STRIPE_PRICE_HOME_YEARLY_LAUNCH'
  | 'STRIPE_PRICE_HOME_15M_STANDARD_PARTNER'
  | 'STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER'
  | 'STRIPE_PRICE_PRO_MONTHLY_STANDARD'
  | 'STRIPE_PRICE_PRO_MONTHLY_FOUNDING'
  | 'STRIPE_PRICE_PRO_YEARLY_STANDARD'
  | 'STRIPE_PRICE_PRO_YEARLY_FOUNDING'
  | 'STRIPE_PRICE_PRO_15M_STANDARD_PARTNER'
  | 'STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER';

/** Server flag gating a non-standard public offer (null = no flag needed). */
export type OfferServerFlag = 'launch' | 'founding' | null;

export interface PriceOffer {
  offerKey: OfferKey;
  product: BillingProduct;
  cadence: OfferCadence;
  variant: OfferVariant;
  /** Exact locked Stripe lookup key — the app validates it verbatim. */
  lookupKey: string;
  /** Integer cents. Never floats anywhere in billing. */
  amountCents: number;
  currency: 'eur';
  interval: StripeInterval;
  intervalCount: 1 | 15;
  /**
   * For 15-month offers: the 12-month offer the schedule renews into
   * (phase 2 of the subscription schedule). Null for everything else.
   */
  renewalOfferKey: OfferKey | null;
  /** 'monthly' for monthlies; 'annual' for ALL yearly + 15-month offers. */
  commissionCadence: CommissionCadence;
  /**
   * Default public-listing policy: true only for standard offers. Launch/
   * founding variants become listable when their server flag is on;
   * 15-month offers are never listable regardless of flags.
   */
  publicEnabled: boolean;
  /** Which server flag can enable a non-standard, non-15m offer. */
  requiredServerFlag: OfferServerFlag;
  /** Env var NAME carrying the expected Stripe price id (never the value). */
  envVarName: PriceEnvVarName;
}

export const PRICE_CATALOG: readonly PriceOffer[] = [
  {
    offerKey: 'home_monthly_standard',
    product: 'home',
    cadence: 'monthly',
    variant: 'standard',
    lookupKey: 'pi_home_monthly_standard_eur',
    amountCents: 999,
    currency: 'eur',
    interval: 'month',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'monthly',
    publicEnabled: true,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_HOME_MONTHLY_STANDARD',
  },
  {
    offerKey: 'home_yearly_standard',
    product: 'home',
    cadence: 'annual',
    variant: 'standard',
    lookupKey: 'pi_home_yearly_standard_eur',
    amountCents: 4900,
    currency: 'eur',
    interval: 'year',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'annual',
    publicEnabled: true,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_HOME_YEARLY_STANDARD',
  },
  {
    offerKey: 'home_yearly_launch',
    product: 'home',
    cadence: 'annual',
    variant: 'home_launch',
    lookupKey: 'pi_home_yearly_launch_eur',
    amountCents: 3900,
    currency: 'eur',
    interval: 'year',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: 'launch',
    envVarName: 'STRIPE_PRICE_HOME_YEARLY_LAUNCH',
  },
  {
    offerKey: 'home_15m_standard_partner',
    product: 'home',
    cadence: 'initial_15_month',
    variant: 'standard',
    lookupKey: 'pi_home_15m_standard_partner_eur',
    amountCents: 4900,
    currency: 'eur',
    interval: 'month',
    intervalCount: 15,
    renewalOfferKey: 'home_yearly_standard',
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_HOME_15M_STANDARD_PARTNER',
  },
  {
    offerKey: 'home_15m_launch_partner',
    product: 'home',
    cadence: 'initial_15_month',
    variant: 'home_launch',
    lookupKey: 'pi_home_15m_launch_partner_eur',
    amountCents: 3900,
    currency: 'eur',
    interval: 'month',
    intervalCount: 15,
    renewalOfferKey: 'home_yearly_launch',
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER',
  },
  {
    offerKey: 'pro_monthly_standard',
    product: 'pro',
    cadence: 'monthly',
    variant: 'standard',
    lookupKey: 'pi_pro_monthly_standard_eur',
    amountCents: 2499,
    currency: 'eur',
    interval: 'month',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'monthly',
    publicEnabled: true,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_PRO_MONTHLY_STANDARD',
  },
  {
    offerKey: 'pro_monthly_founding',
    product: 'pro',
    cadence: 'monthly',
    variant: 'pro_founding',
    lookupKey: 'pi_pro_monthly_founding_eur',
    amountCents: 1999,
    currency: 'eur',
    interval: 'month',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'monthly',
    publicEnabled: false,
    requiredServerFlag: 'founding',
    envVarName: 'STRIPE_PRICE_PRO_MONTHLY_FOUNDING',
  },
  {
    offerKey: 'pro_yearly_standard',
    product: 'pro',
    cadence: 'annual',
    variant: 'standard',
    lookupKey: 'pi_pro_yearly_standard_eur',
    amountCents: 19900,
    currency: 'eur',
    interval: 'year',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'annual',
    publicEnabled: true,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_PRO_YEARLY_STANDARD',
  },
  {
    offerKey: 'pro_yearly_founding',
    product: 'pro',
    cadence: 'annual',
    variant: 'pro_founding',
    lookupKey: 'pi_pro_yearly_founding_eur',
    amountCents: 14900,
    currency: 'eur',
    interval: 'year',
    intervalCount: 1,
    renewalOfferKey: null,
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: 'founding',
    envVarName: 'STRIPE_PRICE_PRO_YEARLY_FOUNDING',
  },
  {
    offerKey: 'pro_15m_standard_partner',
    product: 'pro',
    cadence: 'initial_15_month',
    variant: 'standard',
    lookupKey: 'pi_pro_15m_standard_partner_eur',
    amountCents: 19900,
    currency: 'eur',
    interval: 'month',
    intervalCount: 15,
    renewalOfferKey: 'pro_yearly_standard',
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_PRO_15M_STANDARD_PARTNER',
  },
  {
    offerKey: 'pro_15m_founding_partner',
    product: 'pro',
    cadence: 'initial_15_month',
    variant: 'pro_founding',
    lookupKey: 'pi_pro_15m_founding_partner_eur',
    amountCents: 14900,
    currency: 'eur',
    interval: 'month',
    intervalCount: 15,
    renewalOfferKey: 'pro_yearly_founding',
    commissionCadence: 'annual',
    publicEnabled: false,
    requiredServerFlag: null,
    envVarName: 'STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER',
  },
] as const;

/** All catalog env var names — the config validator's checklist. */
export const PRICE_ENV_VAR_NAMES: readonly PriceEnvVarName[] = PRICE_CATALOG.map(
  (offer) => offer.envVarName,
);

/**
 * Env-resolved Stripe price ids keyed by env var name. Values are OPAQUE to
 * this module — never logged, never embedded in reports.
 */
export type ConfiguredPriceIds = Partial<Record<PriceEnvVarName, string | undefined>>;

/** Look an offer up by its exact Stripe lookup key. Unknown → null. */
export function byLookupKey(lookupKey: string): PriceOffer | null {
  return PRICE_CATALOG.find((offer) => offer.lookupKey === lookupKey) ?? null;
}

/**
 * Look an offer up by offer key. Accepts untrusted strings (e.g. a
 * client-submitted offer key) and returns null for anything unknown.
 */
export function byOfferKey(offerKey: string): PriceOffer | null {
  return PRICE_CATALOG.find((offer) => offer.offerKey === offerKey) ?? null;
}

/**
 * Resolve a Stripe price id to its catalog offer via the env mapping.
 * Unknown/unconfigured price → null (fail-safe: never guess a product).
 */
export function offerForPriceId(
  priceId: string,
  configuredIds: ConfiguredPriceIds,
): PriceOffer | null {
  if (!priceId) return null;
  return (
    PRICE_CATALOG.find((offer) => {
      const configured = configuredIds[offer.envVarName];
      return typeof configured === 'string' && configured.length > 0 && configured === priceId;
    }) ?? null
  );
}

/** Resolve a Stripe price id to 'home' | 'pro' via the env mapping. */
export function productForPriceId(
  priceId: string,
  configuredIds: ConfiguredPriceIds,
): BillingProduct | null {
  return offerForPriceId(priceId, configuredIds)?.product ?? null;
}

/**
 * The 12-month offer a 15-month offer renews into (schedule phase 2).
 * Null when the offer has no renewal mapping (all non-15m offers).
 */
export function renewalOfferFor(offerKey: OfferKey): PriceOffer | null {
  const offer = byOfferKey(offerKey);
  if (!offer || !offer.renewalOfferKey) return null;
  return byOfferKey(offer.renewalOfferKey);
}

/**
 * Inverse of the renewal mapping: the 15-month partner offer whose schedule
 * renews into the given annual offer (used by referral orchestration to pick
 * the first phase). Null when the annual offer has no 15-month counterpart.
 */
export function initialFifteenMonthOfferForAnnual(annualOfferKey: OfferKey): PriceOffer | null {
  return (
    PRICE_CATALOG.find(
      (offer) => offer.cadence === 'initial_15_month' && offer.renewalOfferKey === annualOfferKey,
    ) ?? null
  );
}

export interface OfferFlags {
  launchEnabled: boolean;
  foundingEnabled: boolean;
}

/**
 * The offers currently offerable to the public given the server flags.
 * 15-month offers are NEVER in this list — they are selected exclusively by
 * referral schedule orchestration, never shown or purchasable directly.
 * (Which eligible offer a page highlights or hides is a presentation
 * decision layered on top; this is the hard eligibility boundary.)
 */
export function eligibleOffersFor(flags: OfferFlags): PriceOffer[] {
  return PRICE_CATALOG.filter((offer) => {
    if (offer.cadence === 'initial_15_month') return false;
    if (offer.publicEnabled) return true;
    if (offer.requiredServerFlag === 'launch') return flags.launchEnabled;
    if (offer.requiredServerFlag === 'founding') return flags.foundingEnabled;
    return false;
  });
}
