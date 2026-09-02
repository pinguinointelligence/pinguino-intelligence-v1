import type { RecipeInput } from '@/engine';

export type HeatProcessStatus =
  | 'cold_process_ok'
  | 'heat_required_for_function'
  | 'heat_required_for_safety'
  | 'heat_required_for_both'
  | 'unknown';

export type HeatProcessReasonType =
  | 'ingredient_function'
  | 'food_safety'
  | 'hydration'
  | 'raw_ingredient'
  | 'process_requirement'
  | 'missing_data';

export type ProcessEvidenceDecision =
  | 'cold_process_approved'
  | 'heat_required_for_function'
  | 'heat_required_for_safety';

export interface ProcessEvidenceSource {
  /** Stable internal evidence identifier. */
  id: string;
  label: string;
  reference: string;
  verificationStatus: 'verified' | 'provisional' | 'unknown';
}

export interface RecipeProcessEvidence {
  decision: ProcessEvidenceDecision;
  reasonType: Exclude<HeatProcessReasonType, 'missing_data'>;
  /** Exact ingredient identities covered by this evidence. No category/name matching. */
  affectedIngredientIds: readonly string[];
  explanation: string;
  /** Optional source-backed handling warning; never inferred from an ingredient name. */
  lateAdditionGuidance?: string | null;
  source: ProcessEvidenceSource;
}

export interface HeatProcessReason {
  type: HeatProcessReasonType;
  ingredientId: string | null;
  explanation: string;
  evidenceSource: ProcessEvidenceSource | null;
}

export interface HeatProcessClassification {
  status: HeatProcessStatus;
  reasons: readonly HeatProcessReason[];
  affectedIngredientIds: readonly string[];
  decisionSources: readonly ProcessEvidenceSource[];
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const isVerified = (evidence: RecipeProcessEvidence): boolean =>
  evidence.source.verificationStatus === 'verified' && evidence.source.reference.trim().length > 0;

const reasonFromEvidence = (evidence: RecipeProcessEvidence): HeatProcessReason => ({
  type: evidence.reasonType,
  ingredientId: evidence.affectedIngredientIds[0] ?? null,
  explanation: evidence.explanation,
  evidenceSource: evidence.source,
});

const lateAdditionReasonFromEvidence = (
  evidence: RecipeProcessEvidence,
): HeatProcessReason | null => {
  const explanation = evidence.lateAdditionGuidance?.trim();
  if (!explanation) return null;
  return {
    type: 'process_requirement',
    ingredientId: evidence.affectedIngredientIds[0] ?? null,
    explanation,
    evidenceSource: evidence.source,
  };
};

/**
 * Evidence-only process classifier. It never reads names, categories, warnings,
 * target bands or Engine scores. Positive cold approval must cover every exact
 * ingredient identity in the current recipe; absence of a heat warning is never
 * converted into cold-process permission.
 */
export function classifyHeatProcess({
  ingredientIds,
  evidence,
}: {
  ingredientIds: readonly string[];
  evidence: readonly RecipeProcessEvidence[];
}): HeatProcessClassification {
  const currentIds = unique(ingredientIds.filter((id) => id.trim().length > 0));
  const current = new Set(currentIds);
  const verified = evidence.filter(
    (entry) =>
      isVerified(entry) &&
      entry.affectedIngredientIds.some((ingredientId) => current.has(ingredientId)),
  );
  const functional = verified.filter((entry) => entry.decision === 'heat_required_for_function');
  const safety = verified.filter((entry) => entry.decision === 'heat_required_for_safety');
  const heatEvidence = [...functional, ...safety];
  const lateAdditionEvidence = verified.filter((entry) => entry.lateAdditionGuidance?.trim());
  const lateAdditionReasons = lateAdditionEvidence
    .map(lateAdditionReasonFromEvidence)
    .filter((reason): reason is HeatProcessReason => reason !== null);

  if (functional.length > 0 || safety.length > 0) {
    const status: HeatProcessStatus =
      functional.length > 0 && safety.length > 0
        ? 'heat_required_for_both'
        : functional.length > 0
          ? 'heat_required_for_function'
          : 'heat_required_for_safety';
    return {
      status,
      reasons: [...heatEvidence.map(reasonFromEvidence), ...lateAdditionReasons],
      affectedIngredientIds: unique(
        [...heatEvidence, ...lateAdditionEvidence].flatMap((entry) => entry.affectedIngredientIds),
      ),
      decisionSources: uniqueSources([...heatEvidence, ...lateAdditionEvidence]),
    };
  }

  const cold = verified.filter((entry) => entry.decision === 'cold_process_approved');
  const coldCoverage = new Set(cold.flatMap((entry) => entry.affectedIngredientIds));
  const missing = currentIds.filter((ingredientId) => !coldCoverage.has(ingredientId));
  if (currentIds.length > 0 && missing.length === 0) {
    return {
      status: 'cold_process_ok',
      reasons: [...cold.map(reasonFromEvidence), ...lateAdditionReasons],
      affectedIngredientIds: currentIds,
      decisionSources: uniqueSources([...cold, ...lateAdditionEvidence]),
    };
  }

  return {
    status: 'unknown',
    reasons: [
      {
        type: 'missing_data',
        ingredientId: missing[0] ?? null,
        explanation: 'Brak zweryfikowanego procesu obejmującego wszystkie składniki receptury.',
        evidenceSource: null,
      },
    ],
    affectedIngredientIds: missing,
    decisionSources: [],
  };
}

function uniqueSources(evidence: readonly RecipeProcessEvidence[]): ProcessEvidenceSource[] {
  const byId = new Map<string, ProcessEvidenceSource>();
  for (const entry of evidence) byId.set(entry.source.id, entry.source);
  return [...byId.values()];
}

/** Exact canonical identity used by education, preserving Mapper identity when available. */
export function processIdentityForItem(item: RecipeInput['items'][number]): string {
  return item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
}

/**
 * The current runtime has no normalized process evidence adapter. Keep the
 * registry deliberately empty: name fragments such as UHT/pasteurised and
 * generic stabilizer notes are audit clues, not decision-grade evidence.
 */
export const CURRENT_VERIFIED_PROCESS_EVIDENCE: readonly RecipeProcessEvidence[] = [];

export function classifyCurrentRecipeProcess(input: RecipeInput): HeatProcessClassification {
  return classifyHeatProcess({
    ingredientIds: input.items.map(processIdentityForItem),
    evidence: CURRENT_VERIFIED_PROCESS_EVIDENCE,
  });
}
