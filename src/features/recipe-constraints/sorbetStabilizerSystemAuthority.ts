import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';

export const SORBET_STABILIZER_SYSTEM_POLICY = Object.freeze({
  policyId: 'gellatti-sorbet-stabilizer-system',
  version: 1,
  provenance: 'owner-approved Gellatti Sorbet formulation policy',
  minPercent: 0.2,
  preferredPercent: 0.4,
  maxPercent: 0.5,
  gramSemantics: 'whole_grams' as const,
  optionalWhenAbsent: true,
});

export interface SorbetStabilizerWholeGramBand {
  minGrams: number;
  preferredGrams: number;
  maxGrams: number;
}

export type SorbetStabilizerSystemIssueCode =
  | 'aggregate_below_minimum'
  | 'aggregate_above_maximum'
  | 'component_not_whole_grams';

export interface SorbetStabilizerSystemIssue {
  code: SorbetStabilizerSystemIssueCode;
  lineIds: string[];
  messagePl: string;
  totalGrams: number;
  minGrams: number;
  maxGrams: number;
}

export interface SorbetStabilizerSystemAssessment {
  applicable: boolean;
  present: boolean;
  totalGrams: number;
  lineIds: string[];
  band: SorbetStabilizerWholeGramBand | null;
  issues: SorbetStabilizerSystemIssue[];
}

export const sorbetStabilizerSystemApplies = (category: ProductCategory): boolean =>
  category === 'sorbet';

/** Hard limits round inward, so whole-gram execution cannot broaden the
 * owner-approved percentage envelope. */
export function sorbetStabilizerWholeGramBand(baseGrams: number): SorbetStabilizerWholeGramBand {
  if (!Number.isFinite(baseGrams) || baseGrams <= 0) {
    return { minGrams: 0, preferredGrams: 0, maxGrams: 0 };
  }
  const minGrams = Math.ceil((baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.minPercent) / 100);
  const maxGrams = Math.floor((baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.maxPercent) / 100);
  const rawPreferred = Math.round(
    (baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.preferredPercent) / 100,
  );
  return {
    minGrams,
    preferredGrams: Math.min(maxGrams, Math.max(minGrams, rawPreferred)),
    maxGrams,
  };
}

export const sorbetStabilizerSystemItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

/** Rebuild an already-present Sorbet stabilizer system at the preferred
 * executable total. This never inserts a product when the recipe has none. */
export function projectSorbetStabilizerSystemToWholeGramPreferred(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): RecipeItem[] {
  if (!sorbetStabilizerSystemApplies(input.category)) return [...input.items];
  const stabilizerIds = new Set(sorbetStabilizerSystemItems(input.items).map((item) => item.id));
  if (stabilizerIds.size === 0) return [...input.items];

  const next = input.items.map((item) =>
    stabilizerIds.has(item.id)
      ? { ...item, planned_grams: Math.max(0, Math.round(item.planned_grams)) }
      : item,
  );
  const preferredGrams = sorbetStabilizerWholeGramBand(input.target_batch_grams).preferredGrams;
  const candidates = next
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => stabilizerIds.has(item.id))
    .sort((a, b) => b.item.planned_grams - a.item.planned_grams || a.item.id.localeCompare(b.item.id));
  const total = candidates.reduce((sum, { item }) => sum + item.planned_grams, 0);
  let excess = Math.max(0, total - preferredGrams);
  const deficit = Math.max(0, preferredGrams - total);
  if (deficit > 0 && candidates.length > 0) {
    const item = next[candidates[0]!.index]!;
    next[candidates[0]!.index] = { ...item, planned_grams: item.planned_grams + deficit };
  }
  for (const { index } of candidates) {
    if (excess === 0) break;
    const item = next[index]!;
    const reduction = Math.min(excess, item.planned_grams);
    next[index] = { ...item, planned_grams: item.planned_grams - reduction };
    excess -= reduction;
  }
  return next;
}

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
  const components = sorbetStabilizerSystemItems(scaled.items);
  if (components.length === 0) return null;
  const band = sorbetStabilizerWholeGramBand(scaled.target_batch_grams);

  const weights = components.map((item) =>
    Number.isFinite(item.planned_grams) ? Math.max(0, item.planned_grams) : 0,
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  // The system already carried its own minimum, so keeping it legal is a
  // correction; inflating one that never did would be an invention.
  const before = assessSorbetStabilizerSystem(source);
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

export function assessSorbetStabilizerSystem(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): SorbetStabilizerSystemAssessment {
  if (!sorbetStabilizerSystemApplies(input.category)) {
    return { applicable: false, present: false, totalGrams: 0, lineIds: [], band: null, issues: [] };
  }
  const positive = sorbetStabilizerSystemItems(input.items).filter(
    (item) => item.planned_grams > 0,
  );
  const lineIds = positive.map((item) => item.id);
  const totalGrams = positive.reduce((sum, item) => sum + item.planned_grams, 0);
  const band = sorbetStabilizerWholeGramBand(input.target_batch_grams);
  const issues: SorbetStabilizerSystemIssue[] = [];
  if (positive.length === 0) {
    return { applicable: true, present: false, totalGrams: 0, lineIds: [], band, issues };
  }
  const fractional = positive.filter((item) => !Number.isInteger(item.planned_grams));
  if (fractional.length > 0) {
    issues.push({
      code: 'component_not_whole_grams',
      lineIds: fractional.map((item) => item.id),
      messagePl: 'Składniki systemu stabilizującego Sorbet muszą mieć pełne gramy.',
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  }
  if (totalGrams < band.minGrams) {
    issues.push({
      code: 'aggregate_below_minimum',
      lineIds,
      messagePl: `Łączny system stabilizujący Sorbet wymaga co najmniej ${band.minGrams} g.`,
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  } else if (totalGrams > band.maxGrams) {
    issues.push({
      code: 'aggregate_above_maximum',
      lineIds,
      messagePl: `Łączny limit systemu stabilizującego Sorbet wynosi ${band.maxGrams} g.`,
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  }
  return { applicable: true, present: positive.length > 0, totalGrams, lineIds, band, issues };
}

export function clampSorbetStabilizerComponentGrams(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  lineId: string,
  requestedGrams: number,
): { grams: number; clamped: boolean; messagePl: string | null } {
  if (!sorbetStabilizerSystemApplies(input.category)) {
    return { grams: requestedGrams, clamped: false, messagePl: null };
  }
  const line = input.items.find((item) => item.id === lineId);
  if (!line || resolveFunctionalRole(line.ingredient) !== 'stabilizer') {
    return { grams: requestedGrams, clamped: false, messagePl: null };
  }
  const band = sorbetStabilizerWholeGramBand(input.target_batch_grams);
  const otherGrams = sorbetStabilizerSystemItems(input.items)
    .filter((item) => item.id !== lineId)
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const maximumForLine = Math.max(0, Math.floor(band.maxGrams - otherGrams));
  const rounded = Math.max(0, Math.round(requestedGrams));
  const grams = Math.min(maximumForLine, rounded);
  return {
    grams,
    clamped: !Object.is(grams, requestedGrams),
    messagePl:
      requestedGrams > maximumForLine
        ? `Łączny limit systemu stabilizującego Sorbet wynosi ${band.maxGrams} g.`
        : !Object.is(grams, requestedGrams)
          ? 'Składniki systemu stabilizującego Sorbet muszą mieć pełne gramy.'
          : null,
  };
}
