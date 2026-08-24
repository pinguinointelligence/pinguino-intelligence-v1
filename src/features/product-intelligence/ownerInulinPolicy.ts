import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { ConstraintSet } from '@/features/recipe-constraints';

export const OWNER_INULIN_POLICY = Object.freeze({
  policyId: 'gellatti-generic-inulin',
  version: 1,
  provenance: 'owner-approved Gellatti formulation policy',
  mapperIngredientId: 'PI-ING-000456',
  minPercent: 2,
  preferredPercent: 4,
  maxPercent: 8,
  presenceSemantics: 'optional_zero_or_range' as const,
});

export interface OwnerInulinGramBand {
  minGrams: number;
  preferredGrams: number;
  maxGrams: number;
}

export function ownerInulinGramBand(baseGrams: number): OwnerInulinGramBand {
  return {
    minGrams: (baseGrams * OWNER_INULIN_POLICY.minPercent) / 100,
    preferredGrams: (baseGrams * OWNER_INULIN_POLICY.preferredPercent) / 100,
    maxGrams: (baseGrams * OWNER_INULIN_POLICY.maxPercent) / 100,
  };
}

export function ownerInulinPresentDoseIsValid(baseGrams: number, grams: number): boolean {
  const band = ownerInulinGramBand(baseGrams);
  return grams >= band.minGrams && grams <= band.maxGrams;
}

export type OwnerInulinPolicyIssueCode =
  | 'inulin_below_owner_minimum'
  | 'inulin_above_owner_maximum';

export interface OwnerInulinPolicyIssue {
  code: OwnerInulinPolicyIssueCode;
  lineIds: string[];
  grams: number;
  minGrams: number;
  maxGrams: number;
  provenance: typeof OWNER_INULIN_POLICY.provenance;
}

/** Exact canonical Inulin lines governed by the published Gellatti policy.
 * This deliberately does not borrow the policy for another fibre/inulin SKU. */
export const ownerInulinPolicyLineIds = (input: RecipeInput): string[] =>
  input.items
    .filter(
      (item) => canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId,
    )
    .map((item) => item.id);

/**
 * Published internal authority: canonical Inulin is optional when absent/0 g;
 * once present, its aggregate dose must be inside 2–8% of the target mix.
 * This is Gellatti formulation science, not a manufacturer dosage field.
 */
export function ownerInulinPolicyIssues(input: RecipeInput): OwnerInulinPolicyIssue[] {
  const lineIds = ownerInulinPolicyLineIds(input);
  if (lineIds.length === 0) return [];
  const governed = new Set(lineIds);
  const grams = input.items
    .filter((item) => governed.has(item.id))
    .reduce((sum, item) => sum + item.planned_grams, 0);
  if (!(grams > 0)) return [];
  const band = ownerInulinGramBand(input.target_batch_grams);
  const base = {
    lineIds,
    grams,
    minGrams: band.minGrams,
    maxGrams: band.maxGrams,
    provenance: OWNER_INULIN_POLICY.provenance,
  };
  if (grams < band.minGrams - 1e-9) {
    return [{ ...base, code: 'inulin_below_owner_minimum' }];
  }
  if (grams > band.maxGrams + 1e-9) {
    return [{ ...base, code: 'inulin_above_owner_maximum' }];
  }
  return [];
}

/**
 * Solver-side projection of the same single authority. It is orchestration
 * state only (never persisted as a user lock). Explicit owner constraints win.
 * The published presence semantics make absence and 0 g equivalent, so only a
 * positive canonical Inulin line receives the 2–8% solver range.
 */
export function withOwnerInulinPolicyHold(input: RecipeInput, set: ConstraintSet): ConstraintSet {
  const lineIds = input.items
    .filter(
      (item) =>
        item.planned_grams > 0 &&
        canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId,
    )
    .map((item) => item.id)
    .filter((lineId) => {
      const existing = set.byLineId[lineId];
      return existing === undefined || existing.mode === 'ai';
    });
  if (lineIds.length === 0) return set;
  const band = ownerInulinGramBand(input.target_batch_grams);
  const byLineId = { ...set.byLineId };
  for (const lineId of lineIds) {
    byLineId[lineId] = {
      mode: 'range',
      minGrams: band.minGrams,
      maxGrams: band.maxGrams,
    };
  }
  return { byLineId };
}
