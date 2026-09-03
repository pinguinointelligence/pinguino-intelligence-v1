/**
 * What Gellatti charges to put a parcel in a courier's hands.
 *
 * THE AUTHORITY IS `shop_shipping_rates`. It used to be a constant here and a
 * second constant inside the `shop-checkout` Edge Function, kept equal by a
 * test — which is a drift detector, not an authority. Two copies of a price
 * that must agree is the worst kind of commerce bug: invisible until a customer
 * reads their card statement.
 *
 * Now the cart resolves a rate from the database and checkout re-resolves the
 * SAME row server-side before charging. Neither owns a number. Adding a carrier
 * or changing a country's price is an Admin edit, not a deploy, and the carrier
 * is a column rather than an architecture — DHL today, Correos or UPS later,
 * without touching checkout.
 *
 * `shopShippingContract.test.ts` fails if either side reintroduces a literal.
 */

/**
 * What the customer pays, given a shipping amount already resolved from the
 * authority.
 *
 * Shipping is a parameter, deliberately: this module can no longer invent one.
 * A caller with no rate has no physical offer to make, and must say so rather
 * than fall back to a guess.
 *
 * There is no tax line — provider-side tax calculation is not enabled, so the
 * session charges exactly the item amounts plus shipping and returns a zero tax
 * amount. Showing an invented VAT row would be a claim checkout cannot honour.
 */
export const shopOrderTotals = (subtotalCents: number, shippingCents: number) => {
  const shipping = subtotalCents > 0 ? Math.max(0, Math.trunc(shippingCents)) : 0;
  return {
    subtotalCents,
    shippingCents: shipping,
    totalCents: subtotalCents > 0 ? subtotalCents + shipping : 0,
  };
};

/**
 * A 0 EUR Local Starter Pack is an order, not a purchase: nothing ships, so
 * nothing is charged and no shipping is added. Kept beside the paid totals so
 * the two fulfilment modes are read together rather than discovered apart.
 */
export const localStarterPackTotals = () => ({
  subtotalCents: 0,
  shippingCents: 0,
  totalCents: 0,
});
