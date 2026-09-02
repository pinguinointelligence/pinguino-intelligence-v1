import type { RecipeInput } from '@/engine';
import {
  assessOwnerStabilizerSystem,
  ownerStabilizerSystemApplies,
  ownerStabilizerSystemItems,
  ownerStabilizerWholeGramBand,
} from './ownerStabilizerSystemAuthority';

/**
 * Project an EXISTING owner stabilizer system onto the whole-gram band of a NEW
 * batch, preserving its composition as closely as whole grams allow.
 *
 * A batch change scales every ordinary line by one proportional factor. The
 * stabilizer system cannot travel that way: its ceiling is a PERCENTAGE of the
 * batch that rounds INWARD to whole grams, so a proportional factor produces
 * fractional grams, and because the ceiling floors while the mass does not,
 * shrinking the batch also lands ABOVE the new ceiling. A legal 5 g system at
 * 1000 g becomes 3.35 g against a 3 g ceiling at 670 g.
 *
 * This is the algorithm PC-02 (`1e9580e0`) proved for Sorbet, now bound to the
 * OWNER authority so it serves every product type that publishes a whole-gram
 * stabilizer band — Sorbet and the five Gelato categories alike. Nothing here
 * defines a limit: every number comes from `ownerStabilizerWholeGramBand`, i.e.
 * from the published policy percentages, and the Sorbet path resolves to
 * exactly the band and assessment it used before.
 *
 * `scaled` is the proportional result the batch resize already computed, so the
 * customer's intended ratio is the input to the projection rather than a
 * re-derived one.
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
 * Returns `null` when there is nothing to project — a product type with no
 * published whole-gram stabilizer band, or one with no stabilizer line — so
 * callers leave those untouched.
 */
export function planOwnerStabilizerSystemRescale(
  source: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  scaled: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): ReadonlyMap<string, number> | null {
  if (!ownerStabilizerSystemApplies(scaled.category)) return null;
  const components = ownerStabilizerSystemItems(scaled.items);
  if (components.length === 0) return null;
  const band = ownerStabilizerWholeGramBand(scaled.category, scaled.target_batch_grams);

  const weights = components.map((item) =>
    Number.isFinite(item.planned_grams) ? Math.max(0, item.planned_grams) : 0,
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  // The system already carried its own minimum, so keeping it legal is a
  // correction; inflating one that never did would be an invention.
  const before = assessOwnerStabilizerSystem(source);
  const heldMinimum =
    before.applicable && before.present && before.band !== null
      ? before.totalGrams >= before.band.minGrams
      : false;

  let totalGrams = Math.min(Math.round(weightTotal), band.maxGrams);
  if (heldMinimum) totalGrams = Math.max(totalGrams, band.minGrams);
  totalGrams = Math.max(0, Math.min(totalGrams, band.maxGrams));

  const shares =
    weightTotal > 0
      ? weights.map((weight) => (totalGrams * weight) / weightTotal)
      : weights.map(() => totalGrams / components.length);
  const grams = shares.map((share) => Math.floor(share));
  let remainder = totalGrams - grams.reduce((sum, value) => sum + value, 0);
  const byLargestRemainder = shares
    .map((share, index) => ({
      index,
      fraction: share - Math.floor(share),
      weight: weights[index]!,
      id: components[index]!.id,
    }))
    .sort(
      (a, b) => b.fraction - a.fraction || b.weight - a.weight || a.id.localeCompare(b.id),
    );
  for (const entry of byLargestRemainder) {
    if (remainder <= 0) break;
    grams[entry.index] = grams[entry.index]! + 1;
    remainder -= 1;
  }

  return new Map(components.map((item, index) => [item.id, grams[index]!]));
}
