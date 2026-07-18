/**
 * Active offer flags — whether the launch (Home) and founding (Pro) promotional
 * prices are currently exposed to NEW customers.
 *
 * Owner rule (2026-07-18): a promotional price is shown ONLY when the active
 * server-side offer catalogue exposes it — never merely because the Stripe Price
 * exists, and NEVER hardcoded by a UI date. Until a runtime server offer endpoint
 * exists, the flags come from build-time env vars and DEFAULT TO OFF, so the
 * standard list prices (Home 9,99 €, Pro 24,99 €) are what a new customer sees
 * unless a deploy explicitly turns a promotion on. Existing continuously-active
 * founding subscriptions keep their historical price via the billing rules — this
 * flag governs only what is OFFERED to new customers.
 */
import type { OfferFlags } from './priceCatalog';

/** Safe default: no promotion is public. */
export const DEFAULT_OFFER_FLAGS: OfferFlags = Object.freeze({
  launchEnabled: false,
  foundingEnabled: false,
});

const isOn = (v: unknown): boolean => v === 'true' || v === '1' || v === true;

/**
 * Resolve the active offer flags. `env` defaults to `import.meta.env`; a null/
 * missing value keeps the promotion OFF. Pure given its input.
 */
export function resolveActiveOfferFlags(
  env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>,
): OfferFlags {
  return {
    launchEnabled: isOn(env.VITE_OFFER_LAUNCH_ENABLED),
    foundingEnabled: isOn(env.VITE_OFFER_FOUNDING_ENABLED),
  };
}
