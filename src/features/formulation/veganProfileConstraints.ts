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
 * lock or percent always wins, and the hold is never persisted as a
 * user-visible §17 constraint.
 *
 * A line that already carries a solver-side RANGE is a different case, and
 * getting it wrong breached this very ceiling. Another authority's dosage
 * PREFERENCE can be written onto the same inulin line, and this hold used to
 * step aside for it entirely — so on a vegan draft the preference band replaced
 * the structural ceiling, and widening that preference under a ±2 request took
 * inulin to 95 g against a calibrated maximum of 83.1 g
 * (`recipeVectorProximity.test.ts`). A structural ceiling is not a preference:
 * it NARROWS whatever interval the line already carries and never widens it, so
 * whichever authority writes first, the tighter limit is what the search sees.
 */
export function withVeganInulinEnvelopeHold(input: RecipeInput, set: ConstraintSet): ConstraintSet {
  if (input.category !== 'vegan_gelato') return set;
  // THE CEILING IS TAKEN AGAINST THE TARGET BATCH, AND IT MUST STAY THERE.
  //
  // A measured wrong turn, kept here so it is not taken twice. The 95 g breach
  // this hold exists to stop was first blamed on the ceiling being measured
  // against the TARGET batch while the vector the search moves is routinely off
  // batch: a line at the ceiling of an 840 g working vector is 9.5 % of it, and
  // the rescale to 1000 g carries that share through the 8.31 % envelope. So
  // the window was made relative to the vector's own mass.
  //
  // That is rescale-invariant and it is also WRONG, because it makes the
  // feasible region MOVE every time the search moves mass. A constraint the
  // search cannot hold still is a constraint the search cannot converge
  // against: measured on the vegan Strawberry refusal cell
  // (`veganDirectionHistoryRegression.test.ts`, S−2/H−2), the relative window
  // took one Preview from 1.35 s to 7.1–10.8 s — a 5.3x regression, and past
  // the 5 s default timeout — for an answer that is a refusal either way.
  //
  // The breach was never this line's to fix. It came from the hold STEPPING
  // ASIDE for another authority's preference band, and it is fixed below by
  // INTERSECTING instead; `ownerInulinPolicy.permittedInulinBand` closes the
  // same hole on the formulation side. With both in place the isolated solver
  // lane is green (23/23) against the target-batch ceiling, so the relative
  // window bought nothing and cost 5.3x.
  const total = input.target_batch_grams;
  if (!Number.isFinite(total) || total <= 0) return set;
  const ceilingGrams = (VEGAN_INULIN_CALIBRATION_MAX_PERCENT / 100) * total;
  const lineIds = veganInulinLineIds(input).filter((lineId) => {
    const existing = set.byLineId[lineId];
    return existing === undefined || existing.mode === 'ai' || existing.mode === 'range';
  });
  if (lineIds.length === 0) return set;
  // Several inulin lines share ONE envelope; hold each at the shared ceiling so
  // no single line can breach it. The post-hoc total check still owns the sum.
  return {
    byLineId: {
      ...set.byLineId,
      ...Object.fromEntries(
        lineIds.map((lineId) => {
          const existing = set.byLineId[lineId];
          // INTERSECT, never replace: the floor is the higher of the two and
          // the ceiling the lower, so no authority can be widened by another.
          const minGrams = existing?.mode === 'range' ? Math.max(0, existing.minGrams) : 0;
          const maxGrams =
            existing?.mode === 'range'
              ? Math.min(ceilingGrams, existing.maxGrams)
              : ceilingGrams;
          return [
            lineId,
            {
              mode: 'range',
              minGrams: Math.min(minGrams, maxGrams),
              maxGrams,
              // A VERIFIED CALIBRATION ENVELOPE, not a dosage preference: the
              // profile places this line, the generic search does not.
              structural: true,
            } as const,
          ];
        }),
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
