import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { assessStabilizerDosage } from './stabilizerDosage';

/** Highest owner-supplied external Vegan body reference (83.1 g / 1000 g).
 * This is a fail-closed calibration envelope, NOT a universal dosage claim. */
export const VEGAN_INULIN_CALIBRATION_MAX_PERCENT = 8.31;

/** Exact pure-inulin Mapper identities covered by the owner calibration envelope. */
const PURE_INULIN_CANONICAL_IDS = new Set(['PI-ING-000455', 'PI-ING-000456']);

export type VeganProfileConstraintCode =
  | 'stabilizer_missing'
  | 'stabilizer_below_approved_window'
  | 'stabilizer_above_approved_window'
  | 'stabilizer_window_unknown'
  | 'inulin_above_calibration_envelope';

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

export function veganProfileConstraintIssues(input: RecipeInput): VeganProfileConstraintIssue[] {
  if (input.category !== 'vegan_gelato') return [];
  const total = plannedSum(input);
  const issues: VeganProfileConstraintIssue[] = [];
  const stabilizers = assessStabilizerDosage(input);
  if (stabilizers.length === 0) {
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
  for (const assessment of stabilizers) {
    const minGrams = assessment.window
      ? (assessment.window.minPercentOfTotalMix / 100) * total
      : null;
    const maxGrams = assessment.window
      ? (assessment.window.maxPercentOfTotalMix / 100) * total
      : null;
    if (assessment.status === 'within_window') continue;
    issues.push({
      code:
        assessment.status === 'below_window'
          ? 'stabilizer_below_approved_window'
          : assessment.status === 'above_window'
            ? 'stabilizer_above_approved_window'
            : 'stabilizer_window_unknown',
      lineId: assessment.lineId,
      ingredientName: assessment.ingredientName,
      grams: assessment.grams,
      minGrams,
      maxGrams,
      provenance:
        assessment.window?.provenance ??
        'No approved exact-identity dosage window in the current Mapper contract',
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
    '. PI nie udostępni Apply bez zatwierdzonych danych.'
  );
}
