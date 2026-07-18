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
  offers.length === 0
    ? null
    : offers.reduce((lo, o) => (o.amountCents < lo.amountCents ? o : lo));

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
