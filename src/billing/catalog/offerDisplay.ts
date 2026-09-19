/**
 * Offer DISPLAY layer — the single source of user-facing plan prices.
 *
 * Every price shown anywhere in the app (landing, plan cards, /subscription, the
 * recipe paywall, the Monitor paywall, upgrade prompts, pre-checkout) is derived
 * HERE from the canonical `PRICE_CATALOG`, so a displayed amount can never drift
 * from the Stripe lookup key the checkout selects. No component hardcodes a price.
 *
 * Pure: no IO, no SDK. Amounts come from the catalog (integer cents, EUR); the
 * only thing added is Polish formatting + eligibility selection given the active
 * offer flags (`resolveActiveOfferFlags`).
 */
import {
  eligibleOffersFor,
  type BillingProduct,
  type OfferFlags,
  type PriceOffer,
  type StripeInterval,
} from './priceCatalog';
import { DEFAULT_OFFER_FLAGS } from './offerFlags';

/** Polish EUR: 999 → "9,99 €", 4900 → "49 €", 14900 → "149 €". */
export function formatEur(amountCents: number): string {
  const whole = Math.trunc(amountCents / 100);
  const cents = amountCents % 100;
  return cents === 0 ? `${whole} €` : `${whole},${String(cents).padStart(2, '0')} €`;
}

/** Polish interval noun. */
export const INTERVAL_PL: Record<StripeInterval, string> = { month: 'miesiąc', year: 'rok' };
/** Compact interval noun for tight CTAs. */
export const INTERVAL_PL_SHORT: Record<StripeInterval, string> = { month: 'mies.', year: 'rok' };

export interface DisplayOffer {
  offerKey: PriceOffer['offerKey'];
  product: BillingProduct;
  lookupKey: string;
  amountCents: number;
  interval: StripeInterval;
  variant: PriceOffer['variant'];
  /** e.g. "9,99 € / miesiąc". */
  label: string;
}

export function toDisplayOffer(offer: PriceOffer): DisplayOffer {
  return {
    offerKey: offer.offerKey,
    product: offer.product,
    lookupKey: offer.lookupKey,
    amountCents: offer.amountCents,
    interval: offer.interval,
    variant: offer.variant,
    label: `${formatEur(offer.amountCents)} / ${INTERVAL_PL[offer.interval]}`,
  };
}

const cheapest = (offers: readonly PriceOffer[]): PriceOffer | null =>
  offers.length === 0 ? null : offers.reduce((lo, o) => (o.amountCents < lo.amountCents ? o : lo));

export interface ProductOffers {
  /** The eligible monthly offer (promotional when its flag is on, else standard). */
  monthly: DisplayOffer | null;
  /** The eligible yearly offer (promotional when its flag is on, else standard). */
  yearly: DisplayOffer | null;
}

/**
 * The public monthly + yearly offers to display for a product, given the active
 * flags. When a promotion is on, its cheaper variant wins per cadence; otherwise
 * the standard price is shown. 15-month partner offers are never public.
 */
export function publicOffersForProduct(
  product: BillingProduct,
  flags: OfferFlags = DEFAULT_OFFER_FLAGS,
): ProductOffers {
  const eligible = eligibleOffersFor(flags).filter((o) => o.product === product);
  const monthly = cheapest(eligible.filter((o) => o.cadence === 'monthly'));
  const yearly = cheapest(eligible.filter((o) => o.cadence === 'annual'));
  return {
    monthly: monthly ? toDisplayOffer(monthly) : null,
    yearly: yearly ? toDisplayOffer(yearly) : null,
  };
}

/**
 * The "from" price for a product — the cheapest eligible public offer across
 * cadences — as "Od 9,99 € / miesiąc". Used on compact CTAs (the recipe paywall
 * buttons) so a customer sees the entry price without a second click.
 */
export function fromPriceLabel(
  product: BillingProduct,
  flags: OfferFlags = DEFAULT_OFFER_FLAGS,
): string | null {
  const lowest = lowestOffer(product, flags);
  if (!lowest) return null;
  return `Od ${formatEur(lowest.amountCents)} / ${INTERVAL_PL[lowest.interval]}`;
}

/** Compact "od 9,99 €/mies." for tight CTAs (the recipe paywall buttons). */
export function fromPriceCompact(
  product: BillingProduct,
  flags: OfferFlags = DEFAULT_OFFER_FLAGS,
): string | null {
  const lowest = lowestOffer(product, flags);
  if (!lowest) return null;
  return `od ${formatEur(lowest.amountCents)}/${INTERVAL_PL_SHORT[lowest.interval]}`;
}

/** The cheapest eligible public offer for a product across cadences. */
function lowestOffer(product: BillingProduct, flags: OfferFlags): DisplayOffer | null {
  const { monthly, yearly } = publicOffersForProduct(product, flags);
  const candidates = [monthly, yearly].filter((o): o is DisplayOffer => o !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((lo, o) => (o.amountCents < lo.amountCents ? o : lo));
}

/* ------------------------------------------------- annual economics (§) -- */

/**
 * The REAL economics of paying yearly instead of monthly, derived from the
 * catalogue — never a hand-written marketing number.
 *
 * Owner rule (2026-09-18): the annual variant must sell its benefit on sight,
 * with true figures — the yearly price, the effective monthly price, the euro
 * saving and the percentage. „2 miesiące gratis" is BANNED because it
 * understates the real benefit (Home's annual price is ~7 monthly payments
 * short of twelve, not two).
 *
 * Rounding is deliberately asymmetric and always in the customer's favour to
 * state, never ours:
 *  - `savingsPercent` and `freeMonthsEquivalent` are FLOORED, so the headline
 *    discount is never overstated (Home 59.12 % → 59 %, Pro 33.64 % → 33 %);
 *  - `effectiveMonthlyCents` is rounded to the nearest cent — it is a division
 *    result shown as „≈", not a chargeable amount.
 *
 * Integer cents throughout: no floats ever reach a displayed price.
 */
export interface AnnualEconomics {
  /** The yearly offer's own price, e.g. 4900. */
  annualCents: number;
  /** The monthly offer's price, e.g. 999. */
  monthlyCents: number;
  /** What twelve monthly payments actually cost, e.g. 11988. */
  twelveMonthlyCents: number;
  /** twelveMonthlyCents − annualCents, e.g. 7088. Always ≥ 0 when meaningful. */
  savingsCents: number;
  /** Floored whole-percent saving vs twelve monthly payments, e.g. 59. */
  savingsPercent: number;
  /** annualCents / 12, rounded to the cent, e.g. 408. */
  effectiveMonthlyCents: number;
  /**
   * Whole months of the monthly price covered by the saving, FLOORED — the
   * honest equivalent of „X miesięcy gratis" (Home 7, Pro 4). Null when the
   * annual price buys less than a full free month.
   */
  freeMonthsEquivalent: number | null;
  /** "49 €" */
  annualLabel: string;
  /** "9,99 €" */
  monthlyLabel: string;
  /** "119,88 €" */
  twelveMonthlyLabel: string;
  /** "70,88 €" */
  savingsLabel: string;
  /** "4,08 €" */
  effectiveMonthlyLabel: string;
}

/**
 * Annual economics for a product, or null when the product has no eligible
 * monthly AND yearly pair under the active flags (nothing to compare → show no
 * saving rather than an invented one), or when yearly is not actually cheaper.
 */
export function annualEconomics(
  product: BillingProduct,
  flags: OfferFlags = DEFAULT_OFFER_FLAGS,
): AnnualEconomics | null {
  const { monthly, yearly } = publicOffersForProduct(product, flags);
  if (!monthly || !yearly) return null;

  const monthlyCents = monthly.amountCents;
  const annualCents = yearly.amountCents;
  const twelveMonthlyCents = monthlyCents * 12;
  const savingsCents = twelveMonthlyCents - annualCents;
  if (savingsCents <= 0) return null;

  const freeMonths = Math.floor(savingsCents / monthlyCents);

  return {
    annualCents,
    monthlyCents,
    twelveMonthlyCents,
    savingsCents,
    savingsPercent: Math.floor((savingsCents * 100) / twelveMonthlyCents),
    effectiveMonthlyCents: Math.round(annualCents / 12),
    freeMonthsEquivalent: freeMonths >= 1 ? freeMonths : null,
    annualLabel: formatEur(annualCents),
    monthlyLabel: formatEur(monthlyCents),
    twelveMonthlyLabel: formatEur(twelveMonthlyCents),
    savingsLabel: formatEur(savingsCents),
    effectiveMonthlyLabel: formatEur(Math.round(annualCents / 12)),
  };
}

/**
 * Polish GENITIVE form of „miesiąc", which is the case the only construction
 * using it requires: „równowartość 1 miesiąca", „równowartość 7 miesięcy".
 * Nominative („7 miesiące") would be ungrammatical there, so the genitive is
 * what this helper returns — the name says so to keep it from drifting into a
 * nominative context.
 */
export function monthsGenitivePl(n: number): string {
  return n === 1 ? 'miesiąca' : 'miesięcy';
}
