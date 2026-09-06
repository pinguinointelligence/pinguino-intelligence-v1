import type { RecipeInput } from '@/engine';
import { sorbetStabilizerSystemApplies } from './sorbetStabilizerSystemAuthority';
import { planOwnerStabilizerSystemRescale } from './ownerStabilizerRescaleProjection';

/**
 * Sorbet-scoped view of the canonical batch-rescale projection.
 *
 * PC-02 (`1e9580e0`) proved this algorithm for Sorbet; it now lives in
 * `planOwnerStabilizerSystemRescale`, bound to the OWNER authority so every
 * product type that publishes a whole-gram stabilizer band is projected the
 * same way. This entry point keeps the Sorbet contract exactly as it was: the
 * Sorbet guard first, then the shared projection, which for a Sorbet recipe
 * resolves to the very band and assessment this function used before.
 */
export function planSorbetStabilizerSystemRescale(
  source: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  scaled: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): ReadonlyMap<string, number> | null {
  if (!sorbetStabilizerSystemApplies(scaled.category)) return null;
  return planOwnerStabilizerSystemRescale(source, scaled);
}
