/**
 * What Gellatti charges to put a parcel in a courier's hands.
 *
 * The AUTHORITY is the `shop-checkout` Edge Function — that is what the
 * payment provider actually charges. This module exists so the cart can show the same
 * number BEFORE the customer reaches the payment page, instead of surprising
 * them with a line item they never saw. `shopShipping.test.ts` reads the edge
 * function source and fails if the two ever drift apart.
 *
 * The VALUE is an owner decision recorded in
 * `reports/SHOP_FINAL_PASS_2026-08-31.md`, not something this module gets to
 * change on its own.
 */

/** Flat courier rate, in cents, in the order currency. */
export const SHOP_SHIPPING_FLAT_CENTS = 990;

/** Where Gellatti ships today. Widening this is a business decision. */
export const SHOP_SHIPPING_COUNTRIES = [
  'PL', 'ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'CZ', 'SK', 'DK', 'SE', 'FI', 'IE',
] as const;

/**
 * What the customer pays, before the payment page.
 *
 * There is no tax line: provider-side tax calculation is not enabled, so the
 * session charges exactly the item amounts plus this shipping rate and returns
 * a zero tax amount.
 * Showing an invented VAT row would be a claim the checkout cannot honour —
 * the shop states instead that the amount shown is the amount charged, and the
 * VAT/invoicing decision is recorded for the owner.
 */
export const shopOrderTotals = (subtotalCents: number) => ({
  subtotalCents,
  shippingCents: subtotalCents > 0 ? SHOP_SHIPPING_FLAT_CENTS : 0,
  totalCents: subtotalCents > 0 ? subtotalCents + SHOP_SHIPPING_FLAT_CENTS : 0,
});
