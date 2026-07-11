/**
 * Pinned Stripe API version — repo constant per locked architecture
 * decision 11 (IMPLEMENTATION_STATUS.md §2).
 *
 * PINNED (2026-07-11): `2025-06-30.basil` — the stable "Basil" generation that
 * `stripe@18` (the version the deployed Edge Function sources import via
 * `npm:stripe@18`) declares as its `Stripe.LatestApiVersion`. Confirmed against
 * the connected Sandbox account `acct_1Ts0jzADcB1viept` (Test Mode). We do NOT
 * pin to the connector's `2026-07-29.preview` spec — production code never
 * targets a preview API version.
 *
 * Authority at runtime: the DEPLOYED value comes from the `STRIPE_API_VERSION`
 * env var (secret manager) and is the source of truth for the running Edge
 * Functions; this constant is the documented expectation the config validator
 * and Edge Function fallbacks reference. Any future bump is a deliberate
 * one-line commit here plus the matching env change.
 */
export const STRIPE_API_VERSION_ENV = 'STRIPE_API_VERSION';

/** Pinned expected Stripe API version (aligns with stripe@18 LatestApiVersion). */
export const EXPECTED_STRIPE_API_VERSION = '2025-06-30.basil';
