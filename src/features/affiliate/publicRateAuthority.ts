/**
 * GELLATTI AFFILIATE — the PUBLIC rate authority.
 *
 * There is exactly ONE commission rate table in this product:
 * `src/billing/domain/commissionRules.ts` (`RATE_TABLE_V1`), mirrored by the
 * seeded `public.commission_rules` rows. This module does not restate a single
 * number — it READS that authority and narrows it to what a public page may
 * show. A second hardcoded rate source in the UI is the failure this module
 * exists to prevent.
 *
 * THE ELITE RULE IS STRUCTURAL, NOT EDITORIAL.
 *
 *   `PublicAffiliateTier` is `'standard' | 'gold'`. It is NOT the billing
 *   `Tier`, which also carries `'elite'`. Every public reader in this module
 *   takes a `PublicAffiliateTier`, so asking this module for an Elite rate is
 *   a type error at the call site, not a review comment. `elite` never appears
 *   as a value anywhere below, so no cast, no `as`, and no accidental
 *   `Object.values(...)` sweep can produce one either.
 *
 *   Elite's real per-partner rate lives in `partner_rate_profiles` and is
 *   resolved server-side by `gellatti_partner_elite_rate_v1` for the partner
 *   themselves. That is a PRIVATE, authenticated read — see
 *   `src/billing/domain/partnerRateProfiles.ts`. It must never reach a public
 *   surface, and this module gives it no route to one.
 *
 * Pure. No IO, no Date.now(), integer cents in, integer cents out.
 */

import { resolveCommission } from '@/billing/domain/commissionRules';
import { DEFAULT_GOLD_THRESHOLD } from '@/billing/domain/tierSnapshots';
import { DEFAULT_PAYOUT_THRESHOLD_CENTS } from '@/billing/domain/payoutNetting';
import { HOLD_ELIGIBILITY_MONTH_OFFSET } from '@/billing/domain/holdCalendar';
import { frozen, type Cadence, type Product } from '@/billing/domain/types';

/** The rate-table version the public page quotes. */
export const PUBLIC_RULE_VERSION = 'v1' as const;

/**
 * The tiers whose exact rates may be shown publicly. Deliberately a NARROWER
 * type than the billing `Tier`: Elite is absent by construction.
 */
export type PublicAffiliateTier = 'standard' | 'gold';

/** Public tiers in display order. Cannot contain `elite` — see the type. */
export const PUBLIC_AFFILIATE_TIERS: readonly PublicAffiliateTier[] = frozen([
  'standard',
  'gold',
] as const);

/**
 * The tier that has NO public rate. It is named here as an identity so the page
 * can render it, and it is never a key into any rate lookup in this module.
 */
export const CUSTOM_TERMS_TIER = 'elite' as const;

/** One publicly quotable cell. */
export interface PublicRate {
  readonly tier: PublicAffiliateTier;
  readonly product: Product;
  readonly cadence: Cadence;
  readonly amountCents: number;
}

/**
 * The single public rate reader. Delegates to `resolveCommission`, so the
 * public page and the ledger can never disagree: if the rate table changes,
 * this changes with it.
 */
export function publicRate(
  tier: PublicAffiliateTier,
  product: Product,
  cadence: Cadence,
): PublicRate {
  const snapshot = resolveCommission(PUBLIC_RULE_VERSION, product, cadence, tier);
  return frozen({ tier, product, cadence, amountCents: snapshot.amountCents });
}

/** The four publicly quotable cells of one tier, in display order. */
export function publicRateCard(tier: PublicAffiliateTier): readonly PublicRate[] {
  return frozen([
    publicRate(tier, 'home', 'monthly'),
    publicRate(tier, 'pro', 'monthly'),
    publicRate(tier, 'home', 'annual'),
    publicRate(tier, 'pro', 'annual'),
  ] as const);
}

/**
 * STARTER PACK — owner-frozen 2026-09-02.
 *
 * Retail 59 € + shipping; commission is 9 € (Standard) / 19 € (Gold) per pack
 * sold, and Elite is individual like every other Elite figure. It is a ONE-OFF
 * sale, so a pack enters a year once and is never multiplied by twelve.
 *
 * Why it lives HERE and not in `commissionRules`: that module mirrors the
 * `commission_rules` LEDGER table, whose product column carries only home and
 * pro. Declaring a starter-pack product there would put the code and the
 * database into exactly the disagreement this file exists to prevent. So this
 * is the single public source for the figure, and it is deliberately visible
 * that the ledger cannot yet BOOK it — quoting a rate and paying it are two
 * different capabilities.
 */
export const PUBLIC_STARTER_PACK_RETAIL_CENTS = 5_900 as const;

const STARTER_PACK_COMMISSION_CENTS: Readonly<Record<PublicAffiliateTier, number>> = frozen({
  standard: 900,
  gold: 1_900,
});

/** The publicly quotable Starter Pack commission for one tier. */
export function publicStarterPackRate(tier: PublicAffiliateTier): number {
  return STARTER_PACK_COMMISSION_CENTS[tier];
}

/**
 * The Gold entry threshold, read from the tier authority — never restated.
 * `gellatti_gold_threshold_v1()` returns the same 100 in the database.
 */
export const PUBLIC_GOLD_THRESHOLD: number = DEFAULT_GOLD_THRESHOLD;

/** The payout minimum, read from the payout authority — never restated. */
export const PUBLIC_MINIMUM_PAYOUT_CENTS: number = DEFAULT_PAYOUT_THRESHOLD_CENTS;

/**
 * How many FULL calendar months a commission is held before it becomes
 * payable. The authority expresses the same rule as a month OFFSET (earned in
 * M → eligible on the 1st of M+3), so the number of full months in between is
 * that offset minus one. Derived, never restated.
 */
export const PUBLIC_HOLD_FULL_MONTHS: number = HOLD_ELIGIBILITY_MONTH_OFFSET - 1;

/** Format integer cents as Polish EUR for public display. */
export function formatEuro(amountCents: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(amountCents / 100) ? 0 : 2,
    maximumFractionDigits,
  }).format(amountCents / 100);
}
