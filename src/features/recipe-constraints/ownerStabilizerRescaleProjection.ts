import type { RecipeInput } from '@/engine';
import {
  assessOwnerStabilizerSystem,
  ownerStabilizerSystemItems,
  stabilizerSystemAuthorityFor,
} from './ownerStabilizerSystemAuthority';

/**
 * Project an existing stabilizer system through the authority of the selected
 * formulation family. This owns no dose percentages: Gelato and Sorbet obtain
 * their distinct bands from their published authorities, while Vegan and
 * Protein keep their separate presence-only/template-held rule.
 *
 * All four families share PRO's whole-gram execution boundary. The aggregate
 * is therefore rounded once and split deterministically by largest remainder.
 * A banded family is additionally kept inside its own derived range. A
 * presence-only family receives no invented range or preferred dose; an
 * already-positive system simply stays positive after quantization.
 */
export function planOwnerStabilizerSystemRescale(
  source: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  scaled: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): ReadonlyMap<string, number> | null {
  const authority = stabilizerSystemAuthorityFor(scaled.category);
  if (!authority) return null;
  const components = ownerStabilizerSystemItems(scaled.items);
  if (components.length === 0) return null;

  const weights = components.map((item) =>
    Number.isFinite(item.planned_grams) ? Math.max(0, item.planned_grams) : 0,
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const sourceAssessment = assessOwnerStabilizerSystem(source);
  const band = authority.wholeGramBand?.(scaled.target_batch_grams) ?? null;

  let totalGrams = Math.max(0, Math.round(weightTotal));
  if (band) {
    totalGrams = Math.min(totalGrams, band.maxGrams);
    const sourceHeldMinimum =
      sourceAssessment.applicable &&
      sourceAssessment.present &&
      sourceAssessment.band !== null &&
      sourceAssessment.totalGrams >= sourceAssessment.band.minGrams;
    if (sourceHeldMinimum) totalGrams = Math.max(totalGrams, band.minGrams);
    totalGrams = Math.min(totalGrams, band.maxGrams);
  } else if (sourceAssessment.present && weightTotal > 0) {
    totalGrams = Math.max(1, totalGrams);
  }

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
    .sort((a, b) => b.fraction - a.fraction || b.weight - a.weight || a.id.localeCompare(b.id));
  for (const entry of byLargestRemainder) {
    if (remainder <= 0) break;
    grams[entry.index] = grams[entry.index]! + 1;
    remainder -= 1;
  }

  return new Map(components.map((item, index) => [item.id, grams[index]!]));
}
