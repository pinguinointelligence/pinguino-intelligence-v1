import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { internalStabilizerProfileIssues } from './stabilizerDosage';

/** Highest owner-supplied external Vegan body reference (83.1 g / 1000 g).
 * This is a fail-closed calibration envelope, NOT a universal dosage claim. */
export const VEGAN_INULIN_CALIBRATION_MAX_PERCENT = 8.31;

/** Exact pure-inulin Mapper identities covered by the owner calibration envelope. */
const PURE_INULIN_CANONICAL_IDS = new Set(['PI-ING-000455', 'PI-ING-000456']);

export type VeganProfileConstraintCode = 'stabilizer_missing' | 'inulin_above_calibration_envelope';

export interface VeganProfileConstraintIssue {
  code: VeganProfileConstraintCode;
  lineId: string | null;
  ingredientName: string;
  grams: number;
  minGrams: number | null;
  maxGrams: number | null;
  provenance: string;
}

const plannedSum = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

/** Recipe lines that carry the pure-inulin identity this envelope governs. */
export function veganInulinLineIds(input: RecipeInput): string[] {
  return input.items
    .filter((item) => {
      const id = canonicalIngredientId(item.ingredient);
      return PURE_INULIN_CANONICAL_IDS.has(id) || item.ingredient.id === 'inulin';
    })
    .map((item) => item.id);
}

/**
 * RC-2 (owner authority 2026-08-23): turn the fail-closed inulin envelope into a
 * bound the SEARCH respects, instead of a post-hoc rejection that throws away an
 * otherwise legal Preview.
 *
 * Asked for lower sweetness the Direction ladder used to remove sugar and
 * compensate by inflating Inulin to 94–137 g against the approved 83.1 g / 1000 g
 * ceiling. The candidate was built, then rejected by
 * `veganProfileConstraintIssues`, and the whole Preview was discarded as
 * `ok:false` — so a preference that is merely infeasible destroyed the result.
 *
 * The envelope is NOT relaxed here. It becomes an internal solver hold exactly
 * like `withTemplateControlledStabilizerLocks`: a `range` whose maximum is the
 * approved ceiling. The search can therefore only ever propose legal inulin, and
 * an unreachable exact target degrades to the nearest legal candidate.
 *
 * Only lines the user left to the solver (`ai`) are held — an explicit owner
 * lock, percent or range always wins, and the hold is never persisted as a
 * user-visible §17 constraint.
 */
export function withVeganInulinEnvelopeHold(input: RecipeInput, set: ConstraintSet): ConstraintSet {
  if (input.category !== 'vegan_gelato') return set;
  const total = input.target_batch_grams;
  if (!Number.isFinite(total) || total <= 0) return set;
  const ceilingGrams = (VEGAN_INULIN_CALIBRATION_MAX_PERCENT / 100) * total;
  const lineIds = veganInulinLineIds(input).filter((lineId) => {
    const existing = set.byLineId[lineId];
    return existing === undefined || existing.mode === 'ai';
  });
  if (lineIds.length === 0) return set;
  // Several inulin lines share ONE envelope; hold each at the shared ceiling so
  // no single line can breach it. The post-hoc total check still owns the sum.
  return {
    byLineId: {
      ...set.byLineId,
      ...Object.fromEntries(
        lineIds.map((lineId) => [
          lineId,
          { mode: 'range', minGrams: 0, maxGrams: ceilingGrams } as const,
        ]),
      ),
    },
  };
}

export function veganProfileConstraintIssues(input: RecipeInput): VeganProfileConstraintIssue[] {
  if (input.category !== 'vegan_gelato') return [];
  const total = plannedSum(input);
  const issues: VeganProfileConstraintIssue[] = [];
  if (internalStabilizerProfileIssues(input).some((issue) => issue.code === 'stabilizer_missing')) {
    issues.push({
      code: 'stabilizer_missing',
      lineId: null,
      ingredientName: 'Stabilizator',
      grams: 0,
      minGrams: null,
      maxGrams: null,
      provenance: 'Vegan final task §32: 0 g requires an explicitly verified process profile',
    });
  }

  const inulinLines = input.items.filter((item) => {
    const id = canonicalIngredientId(item.ingredient);
    return PURE_INULIN_CANONICAL_IDS.has(id) || item.ingredient.id === 'inulin';
  });
  const inulinGrams = inulinLines.reduce((sum, item) => sum + item.planned_grams, 0);
  const inulinMax = (VEGAN_INULIN_CALIBRATION_MAX_PERCENT / 100) * total;
  if (total > 0 && inulinGrams > inulinMax + 1e-9) {
    issues.push({
      code: 'inulin_above_calibration_envelope',
      lineId: inulinLines[0]?.id ?? null,
      ingredientName: inulinLines[0]?.ingredient.name ?? 'Inulina',
      grams: inulinGrams,
      minGrams: null,
      maxGrams: inulinMax,
      provenance:
        'Owner external Vegan high-inulin reference: 83.1 g per 1000 g; Mapper has no approved inulin dosage window',
    });
  }
  return issues;
}

export function veganProfileConstraintMessagePl(
  issues: readonly VeganProfileConstraintIssue[],
): string {
  const details = issues.map((issue) => {
    if (issue.code === 'stabilizer_missing') return 'brak zweryfikowanej dawki stabilizatora';
    const range =
      issue.minGrams !== null && issue.maxGrams !== null
        ? ` (dozwolone ${issue.minGrams.toFixed(2)}–${issue.maxGrams.toFixed(2)} g)`
        : issue.maxGrams !== null
          ? ` (maks. ${issue.maxGrams.toFixed(2)} g)`
          : '';
    return `${issue.ingredientName}: ${issue.grams.toFixed(2)} g${range}`;
  });
  return (
    'Receptura Wegańska przekracza zweryfikowaną kopertę formulacji: ' +
    details.join(', ') +
    '. Zastosowanie zmian pozostaje zablokowane do czasu potwierdzenia danych.'
  );
}
