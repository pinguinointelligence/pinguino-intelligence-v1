import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
/* One result shape for both systems: the caller must not have to know which
   authority answered in order to read the reason or the canonical limit. */
import type {
  ClampGelatoStabilizerComponentResult,
  StabilizerClampReason,
} from './gelatoStabilizerSystemAuthority';

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
): ClampGelatoStabilizerComponentResult {
  if (!sorbetStabilizerSystemApplies(input.category)) {
    return { grams: requestedGrams, clamped: false, messagePl: null, reason: null, limitGrams: 0 };
  }
  const line = input.items.find((item) => item.id === lineId);
  if (!line || resolveFunctionalRole(line.ingredient) !== 'stabilizer') {
    return { grams: requestedGrams, clamped: false, messagePl: null, reason: null, limitGrams: 0 };
  }
  const band = sorbetStabilizerWholeGramBand(input.target_batch_grams);
  const otherGrams = sorbetStabilizerSystemItems(input.items)
    .filter((item) => item.id !== lineId)
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const maximumForLine = Math.max(0, Math.floor(band.maxGrams - otherGrams));
  const rounded = Math.max(0, Math.round(requestedGrams));
  const grams = Math.min(maximumForLine, rounded);
  const clamped = !Object.is(grams, requestedGrams);
  const reason: StabilizerClampReason =
    requestedGrams > maximumForLine ? 'aggregate_limit' : clamped ? 'whole_gram' : null;
  return {
    grams,
    clamped,
    reason,
    limitGrams: band.maxGrams,
    messagePl:
      reason === 'aggregate_limit'
        ? `Łączny limit systemu stabilizującego Sorbet wynosi ${band.maxGrams} g.`
        : reason === 'whole_gram'
          ? 'Składniki systemu stabilizującego Sorbet muszą mieć pełne gramy.'
          : null,
  };
}
