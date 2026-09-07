import type { RecipeInput } from '@/engine';
import { sorbetStabilizerSystemApplies } from './sorbetStabilizerSystemAuthority';
import { planOwnerStabilizerSystemRescale } from './ownerStabilizerRescaleProjection';

/**
 * Project an EXISTING Sorbet stabilizer system onto the whole-gram band of a
 * NEW batch, preserving its composition as closely as whole grams allow.
 *
 * A batch change scales every ordinary line by one proportional factor. The
 * stabilizer system cannot travel that way: its ceiling is a PERCENTAGE of the
 * batch that rounds INWARD to whole grams, so a proportional factor produces
 * fractional grams, and because the ceiling floors while the mass does not,
 * shrinking the batch also lands ABOVE the new ceiling. A legal 5 g system at
 * 1000 g becomes 3.35 g against a 3 g ceiling at 670 g.
 *
 * `scaled` is the proportional result the batch resize already computed, so the
 * customer's intended ratio is the input to the projection rather than a
 * re-derived one. Nothing here defines a limit: every number comes from
 * `sorbetStabilizerWholeGramBand`, i.e. from the policy percentages.
 *
 * Rules, in order:
 *  - the aggregate is the proportional total rounded to whole grams, then
 *    capped by the new ceiling — scaling UP is therefore never clamped away;
 *  - the aggregate is raised to the new minimum only when the system already
 *    held its own minimum before the change, so an already-invalid draft is
 *    never handed mass it did not have;
 *  - the aggregate is split by largest remainder, which keeps the existing
 *    proportion as closely as whole grams permit and is fully deterministic;
 *  - no component is invented, none goes negative, and a component only reaches
 *    0 g when the whole-gram ceiling leaves no room for it.
 *
 * Returns `null` when there is nothing to project — a non-Sorbet recipe, or a
 * Sorbet with no stabilizer line — so callers can leave those untouched.
 */
export function planSorbetStabilizerSystemRescale(
  source: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  scaled: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): ReadonlyMap<string, number> | null {
  if (!sorbetStabilizerSystemApplies(scaled.category)) return null;
  return planOwnerStabilizerSystemRescale(source, scaled);
}
