import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { permittedGramBand } from '@/features/recipe-direction/directionRelaxation';
import { VEGAN_INULIN_CALIBRATION_MAX_PERCENT } from '@/features/formulation/veganProfileConstraints';

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

/**
 * The same question asked of a DRAFT rather than of two numbers, so it can see
 * the draft's own Direction request.
 *
 * At ±1 this is exactly `ownerInulinPresentDoseIsValid`. At ±2 the controlled
 * relaxation applies and the permitted interval is the extended one: a dose the
 * owner's preferred band excludes is then VALID but LESS IDEAL, never rejected
 * (owner decision 2026-09-19 § 12). It is priced by
 * `relaxableRangePolicy.relaxationScorePenalty`, not refused here.
 */
export function ownerInulinDoseIsPermitted(input: RecipeInput, grams: number): boolean {
  const band = permittedInulinBand(input);
  return grams >= band.minGrams - 1e-9 && grams <= band.maxGrams + 1e-9;
}

/**
 * THE BAND THIS DRAFT MAY ACTUALLY OCCUPY — a PREFERENCE widened by the
 * controlled ±2 relaxation, then INTERSECTED with every STRUCTURAL limit that
 * governs the same line.
 *
 * Relaxing a preference must never relax a structural ceiling. The Vegan
 * calibration envelope is one: widening this dosage preference under a ±2
 * request took a vegan draft to 95 g against a calibrated maximum of 83.1 g,
 * and the whole Preview was then refused — the customer lost an answer because
 * two authorities disagreed about the same line
 * (`recipeVectorProximity.test.ts`). The tighter limit always wins.
 */
export function permittedInulinBand(input: RecipeInput): OwnerInulinGramBand {
  const normal = ownerInulinGramBand(input.target_batch_grams);
  const permitted = permittedGramBand(input, normal);
  const structuralMaxGrams =
    input.category === 'vegan_gelato'
      ? (VEGAN_INULIN_CALIBRATION_MAX_PERCENT / 100) * input.target_batch_grams
      : Number.POSITIVE_INFINITY;
  const maxGrams = Math.min(permitted.maxGrams, structuralMaxGrams);
  return {
    minGrams: Math.min(permitted.minGrams, maxGrams),
    preferredGrams: normal.preferredGrams,
    maxGrams,
  };
}

export type OwnerInulinPolicyIssueCode =
  | 'inulin_below_owner_minimum'
  | 'inulin_above_owner_maximum';

export interface OwnerInulinPolicyIssue {
  code: OwnerInulinPolicyIssueCode;
  lineIds: string[];
  grams: number;
  /** The owner's PREFERRED band — unchanged, whatever the Direction request. */
  minGrams: number;
  maxGrams: number;
  /** What the draft was actually allowed: the preferred band, or the
   * controlled extreme band when ±2 was requested. */
  permittedMinGrams: number;
  permittedMaxGrams: number;
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
  // CONTROLLED ±2 RELAXATION (owner decision 2026-09-19 § 12). At ±1 the
  // permitted interval IS the preferred band and nothing below changes. At ±2 a
  // dose outside the preferred band but inside the controlled extreme band is a
  // valid — merely less ideal — result, so it must not be reported as a policy
  // breach here: everything downstream of this function treats an issue as a
  // refusal. Leaving the preferred band is charged by the canonical fit score.
  const permitted = permittedInulinBand(input);
  const base = {
    lineIds,
    grams,
    minGrams: band.minGrams,
    maxGrams: band.maxGrams,
    permittedMinGrams: permitted.minGrams,
    permittedMaxGrams: permitted.maxGrams,
    provenance: OWNER_INULIN_POLICY.provenance,
  };
  if (grams < permitted.minGrams - 1e-9) {
    return [{ ...base, code: 'inulin_below_owner_minimum' }];
  }
  if (grams > permitted.maxGrams + 1e-9) {
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
