import type { ShopCountry, ShopShippingRate } from '@/services/shopCountries';

/** Why a physical checkout may not start yet, or `null` when it may. */
export type ShopCheckoutBlock =
  | 'countriesUnavailable'
  | 'countryRequired'
  | 'countryNotShipped'
  | 'rateLoading'
  | 'rateUnavailable'
  | null;

/**
 * A parcel needs a destination the shop ships to and a rate for it.
 *
 * The checkout function refuses an empty country (`country_required`) and a country
 * without an enabled rate, so the cart answers first and points the customer at the
 * country picker instead of sending a request that can only fail. Signing in is never
 * blocked by this: it only gates the payment step.
 *
 * `rate` is `undefined` while the rate for the chosen country is still loading and
 * `null` once the shop knows there is none.
 */
export function shopCheckoutBlock(input: {
  countriesError: boolean;
  country: Pick<ShopCountry, 'physicalAvailable'> | null;
  rate: ShopShippingRate | null | undefined;
}): ShopCheckoutBlock {
  if (!input.country) return input.countriesError ? 'countriesUnavailable' : 'countryRequired';
  if (!input.country.physicalAvailable) return 'countryNotShipped';
  if (input.rate === undefined) return 'rateLoading';
  if (input.rate === null) return 'rateUnavailable';
  return null;
}
