/**
 * Stripe configuration validator — PURE (no IO, no SDK, no env access).
 *
 * The future startup check and the protected diagnostics endpoint both call
 * this module: they gather `envValues` (and optionally the Price objects
 * fetched from Stripe by lookup key) and pass them in; this module compares
 * everything against the locked price catalog and returns a structured
 * report.
 *
 * SECRECY INVARIANT (test-pinned): the report NEVER contains an env value or
 * a Stripe object id — only env var NAMES, offer keys, public catalog
 * constants (lookup keys, amounts, intervals) and non-identifying Stripe
 * shape fields (unit_amount, currency, interval, tax_behavior, livemode,
 * active). A leaked report must never leak configuration.
 */
import {
  PRICE_CATALOG,
  type OfferKey,
  type PriceEnvVarName,
  type PriceOffer,
} from './priceCatalog';

/** The subset of a fetched Stripe Price the validator inspects. */
export interface FetchedPrice {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  product: string;
  tax_behavior: string | null;
  livemode: boolean;
  active: boolean;
}

export interface ConfigValidatorInput {
  /** Raw env values by name (values stay inside this function). */
  envValues: Record<string, string | undefined>;
  /** Prices fetched from Stripe (by lookup key), when available. */
  fetchedPrices?: FetchedPrice[];
}

/** One concrete problem on one offer. Never carries ids or env values. */
export type OfferProblem =
  | { field: 'price_not_fetched'; expectedLookupKey: string }
  | { field: 'configured_id_mismatch' }
  | { field: 'unit_amount'; expected: number; actual: number | null }
  | { field: 'currency'; expected: 'eur'; actual: string }
  | { field: 'not_recurring' }
  | { field: 'interval'; expected: 'month' | 'year'; actual: string }
  | { field: 'interval_count'; expected: number; actual: number }
  | { field: 'not_active' };

export interface OfferFinding {
  offerKey: OfferKey;
  envVarName: PriceEnvVarName;
  problems: OfferProblem[];
}

/** Cross-price consistency checks (only computed when prices were fetched). */
export interface CrossChecks {
  /** All fetched catalog prices share one tax behavior (handoff §1). */
  taxBehaviorUniform: boolean;
  /** All fetched catalog prices come from the same mode (test vs live). */
  livemodeUniform: boolean;
  /**
   * Home prices share one Stripe product, Pro prices share another, and the
   * two products differ.
   */
  productConsistency: boolean;
}

export interface ConfigReport {
  ok: boolean;
  /** Env var names that are absent entirely. */
  missingEnv: PriceEnvVarName[];
  /** Env var names whose value is empty or looks like a placeholder. */
  placeholderEnv: PriceEnvVarName[];
  /** Offers with at least one problem (empty when everything matches). */
  offerFindings: OfferFinding[];
  /** Null when `fetchedPrices` was not provided. */
  crossChecks: CrossChecks | null;
  /** How many catalog offers were checked (always the full catalog). */
  checkedOfferCount: number;
  fetchedPricesChecked: boolean;
}

/**
 * A value is a placeholder when it is empty/whitespace, contains obvious
 * fill-me-in markers, or does not have the `price_<alnum>` shape of a real
 * Stripe price id. The VALUE never leaves this function.
 */
export function isPlaceholderPriceId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (/placeholder|changeme|change_me|todo|xxx|<|>|_{3,}/i.test(trimmed)) return true;
  return !/^price_[A-Za-z0-9]+$/.test(trimmed);
}

function checkOfferAgainstPrice(
  offer: PriceOffer,
  price: FetchedPrice,
  configuredId: string | null,
): OfferProblem[] {
  const problems: OfferProblem[] = [];
  if (configuredId !== null && price.id !== configuredId) {
    problems.push({ field: 'configured_id_mismatch' });
  }
  if (price.unit_amount !== offer.amountCents) {
    problems.push({ field: 'unit_amount', expected: offer.amountCents, actual: price.unit_amount });
  }
  if (price.currency.toLowerCase() !== offer.currency) {
    problems.push({ field: 'currency', expected: 'eur', actual: price.currency });
  }
  if (!price.recurring) {
    problems.push({ field: 'not_recurring' });
  } else {
    if (price.recurring.interval !== offer.interval) {
      problems.push({
        field: 'interval',
        expected: offer.interval,
        actual: price.recurring.interval,
      });
    }
    if (price.recurring.interval_count !== offer.intervalCount) {
      problems.push({
        field: 'interval_count',
        expected: offer.intervalCount,
        actual: price.recurring.interval_count,
      });
    }
  }
  if (!price.active) {
    problems.push({ field: 'not_active' });
  }
  return problems;
}

function allEqual<T>(values: T[]): boolean {
  return values.every((value) => value === values[0]);
}

export function validateBillingConfig(input: ConfigValidatorInput): ConfigReport {
  const missingEnv: PriceEnvVarName[] = [];
  const placeholderEnv: PriceEnvVarName[] = [];
  const offerFindings: OfferFinding[] = [];

  const configuredIdByOffer = new Map<OfferKey, string | null>();
  for (const offer of PRICE_CATALOG) {
    const raw = input.envValues[offer.envVarName];
    if (raw === undefined) {
      missingEnv.push(offer.envVarName);
      configuredIdByOffer.set(offer.offerKey, null);
    } else if (isPlaceholderPriceId(raw)) {
      placeholderEnv.push(offer.envVarName);
      configuredIdByOffer.set(offer.offerKey, null);
    } else {
      configuredIdByOffer.set(offer.offerKey, raw.trim());
    }
  }

  let crossChecks: CrossChecks | null = null;
  if (input.fetchedPrices) {
    const matched: Array<{ offer: PriceOffer; price: FetchedPrice }> = [];
    for (const offer of PRICE_CATALOG) {
      const price = input.fetchedPrices.find((p) => p.lookup_key === offer.lookupKey) ?? null;
      if (!price) {
        offerFindings.push({
          offerKey: offer.offerKey,
          envVarName: offer.envVarName,
          problems: [{ field: 'price_not_fetched', expectedLookupKey: offer.lookupKey }],
        });
        continue;
      }
      matched.push({ offer, price });
      const problems = checkOfferAgainstPrice(
        offer,
        price,
        configuredIdByOffer.get(offer.offerKey) ?? null,
      );
      if (problems.length > 0) {
        offerFindings.push({ offerKey: offer.offerKey, envVarName: offer.envVarName, problems });
      }
    }

    const homeProducts = [
      ...new Set(matched.filter((m) => m.offer.product === 'home').map((m) => m.price.product)),
    ];
    const proProducts = [
      ...new Set(matched.filter((m) => m.offer.product === 'pro').map((m) => m.price.product)),
    ];
    crossChecks = {
      taxBehaviorUniform: allEqual(matched.map((m) => m.price.tax_behavior)),
      livemodeUniform: allEqual(matched.map((m) => m.price.livemode)),
      productConsistency:
        homeProducts.length <= 1 &&
        proProducts.length <= 1 &&
        (homeProducts.length === 0 ||
          proProducts.length === 0 ||
          homeProducts[0] !== proProducts[0]),
    };
  }

  const crossOk =
    crossChecks === null ||
    (crossChecks.taxBehaviorUniform && crossChecks.livemodeUniform && crossChecks.productConsistency);

  return {
    ok:
      missingEnv.length === 0 &&
      placeholderEnv.length === 0 &&
      offerFindings.length === 0 &&
      crossOk,
    missingEnv,
    placeholderEnv,
    offerFindings,
    crossChecks,
    checkedOfferCount: PRICE_CATALOG.length,
    fetchedPricesChecked: input.fetchedPrices !== undefined,
  };
}
