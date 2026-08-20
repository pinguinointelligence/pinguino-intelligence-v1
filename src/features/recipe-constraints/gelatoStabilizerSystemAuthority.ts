import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';

export const GELATO_STABILIZER_SYSTEM_POLICY = Object.freeze({
  policyId: 'gellatti-gelato-stabilizer-system',
  version: 1,
  provenance: 'owner-approved Gellatti formulation policy',
  minPercent: 0.2,
  preferredPercent: 0.3,
  maxPercent: 0.5,
  gramSemantics: 'whole_grams' as const,
});

const GELATO_CATEGORIES = new Set<ProductCategory>([
  'milk_gelato',
  'fruit_gelato',
  'nut_gelato',
  'chocolate_gelato',
  'alcohol_gelato',
]);

export interface GelatoStabilizerWholeGramBand {
  minGrams: number;
  preferredGrams: number;
  maxGrams: number;
}

export type GelatoStabilizerSystemIssueCode =
  | 'aggregate_below_minimum'
  | 'aggregate_above_maximum'
  | 'component_not_whole_grams';

export interface GelatoStabilizerSystemIssue {
  code: GelatoStabilizerSystemIssueCode;
  lineIds: string[];
  messagePl: string;
  totalGrams: number;
  minGrams: number;
  maxGrams: number;
}

export interface GelatoStabilizerSystemAssessment {
  applicable: boolean;
  present: boolean;
  totalGrams: number;
  lineIds: string[];
  band: GelatoStabilizerWholeGramBand | null;
  issues: GelatoStabilizerSystemIssue[];
}

export const gelatoStabilizerSystemApplies = (category: ProductCategory): boolean =>
  GELATO_CATEGORIES.has(category);

/** Owner-approved integer feasibility conversion. Hard bounds are rounded
 * inward, so rounding can never broaden the percentage authority. */
export function gelatoStabilizerWholeGramBand(baseGrams: number): GelatoStabilizerWholeGramBand {
  if (!Number.isFinite(baseGrams) || baseGrams <= 0) {
    return { minGrams: 0, preferredGrams: 0, maxGrams: 0 };
  }
  const minimumGrams = Math.ceil((baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.minPercent) / 100);
  const maximumGrams = Math.floor((baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.maxPercent) / 100);
  const rawPreferred = Math.round(
    (baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.preferredPercent) / 100,
  );
  return {
    minGrams: minimumGrams,
    preferredGrams: Math.min(maximumGrams, Math.max(minimumGrams, rawPreferred)),
    maxGrams: maximumGrams,
  };
}

export const gelatoStabilizerSystemItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

/** Canonical aggregate assessment used by terminal recipe authority. Individual
 * products may impose a tighter ProductBehavior ceiling in parallel. */
export function assessGelatoStabilizerSystem(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): GelatoStabilizerSystemAssessment {
  if (!gelatoStabilizerSystemApplies(input.category)) {
    return {
      applicable: false,
      present: false,
      totalGrams: 0,
      lineIds: [],
      band: null,
      issues: [],
    };
  }
  const stabilizers = gelatoStabilizerSystemItems(input.items);
  const positive = stabilizers.filter((item) => item.planned_grams > 0);
  const lineIds = positive.map((item) => item.id);
  const totalGrams = positive.reduce((sum, item) => sum + item.planned_grams, 0);
  const band = gelatoStabilizerWholeGramBand(input.target_batch_grams);
  const issues: GelatoStabilizerSystemIssue[] = [];

  // This policy governs an existing Gelato stabilizer system. It is not
  // permission to silently insert a stabilizer into a recipe that has none.
  if (positive.length === 0) {
    return { applicable: true, present: false, totalGrams: 0, lineIds: [], band, issues: [] };
  }

  const fractional = positive.filter((item) => !Number.isInteger(item.planned_grams));
  if (fractional.length > 0) {
    issues.push({
      code: 'component_not_whole_grams',
      lineIds: fractional.map((item) => item.id),
      messagePl: 'Składniki systemu stabilizującego Gelato muszą mieć pełne gramy.',
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  }
  if (totalGrams < band.minGrams) {
    issues.push({
      code: 'aggregate_below_minimum',
      lineIds,
      messagePl:
        `Łączny system stabilizujący dla tej partii wymaga co najmniej ` + `${band.minGrams} g.`,
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  } else if (totalGrams > band.maxGrams) {
    issues.push({
      code: 'aggregate_above_maximum',
      lineIds,
      messagePl:
        `Łączny limit systemu stabilizującego dla tej partii został osiągnięty: ` +
        `${band.maxGrams} g.`,
      totalGrams,
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    });
  }

  return {
    applicable: true,
    present: positive.length > 0,
    totalGrams,
    lineIds,
    band,
    issues,
  };
}

export interface ClampGelatoStabilizerComponentResult {
  grams: number;
  clamped: boolean;
  messagePl: string | null;
}

/** Manual-edit helper: the requested line stays a whole gram and cannot push
 * the aggregate past the batch-specific owner ceiling. */
export function clampGelatoStabilizerComponentGrams(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  lineId: string,
  requestedGrams: number,
): ClampGelatoStabilizerComponentResult {
  if (!gelatoStabilizerSystemApplies(input.category)) {
    return { grams: requestedGrams, clamped: false, messagePl: null };
  }
  const line = input.items.find((item) => item.id === lineId);
  if (!line || resolveFunctionalRole(line.ingredient) !== 'stabilizer') {
    return { grams: requestedGrams, clamped: false, messagePl: null };
  }
  const band = gelatoStabilizerWholeGramBand(input.target_batch_grams);
  const otherGrams = gelatoStabilizerSystemItems(input.items)
    .filter((item) => item.id !== lineId)
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const maximumForLine = Math.max(0, Math.floor(band.maxGrams - otherGrams));
  const rounded = Math.max(0, Math.round(requestedGrams));
  const grams = Math.min(maximumForLine, rounded);
  const clamped = !Object.is(grams, requestedGrams);
  return {
    grams,
    clamped,
    messagePl:
      requestedGrams > maximumForLine
        ? `Łączny limit systemu stabilizującego dla tej partii został osiągnięty: ${band.maxGrams} g.`
        : clamped
          ? 'Składniki systemu stabilizującego Gelato muszą mieć pełne gramy.'
          : null,
  };
}
