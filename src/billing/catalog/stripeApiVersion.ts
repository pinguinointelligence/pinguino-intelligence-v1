/**
 * Pinned Stripe API version — repo constant per locked architecture
 * decision 11 (IMPLEMENTATION_STATUS.md §2).
 *
 * The DEPLOYED value comes from the `STRIPE_API_VERSION` env var (secret
 * manager); this constant is the documented fallback/expectation the config
 * validator and Edge Function sources reference. It is a PLACEHOLDER until
 * Nicolas's sandbox account pins the real version (handoff §5) — at that
 * point this constant is updated deliberately in one commit.
 */
export const STRIPE_API_VERSION_ENV = 'STRIPE_API_VERSION';

/** Placeholder: the version the existing v1 webhook source was written for. */
export const EXPECTED_STRIPE_API_VERSION = '2025-06-30.basil';
