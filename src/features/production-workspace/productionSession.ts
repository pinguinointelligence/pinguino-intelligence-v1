import type { RecipeInput, RecipeItem, RecipeResult } from '@/engine';

export const PRODUCTION_GRAMS_EPSILON = 0.000_001;

export type ProductionSessionStatus = 'in_progress' | 'completed';

export interface ProductionSource {
  recipeId: string | null;
  recipeVersionId: string | null;
  recipeVersionNumber: number | null;
  recipeName: string;
}

export interface ProductionLineState {
  lineId: string;
  canonicalIngredientId: string | null;
  name: string;
  /** Immutable quantity copied from the source recipe. */
  plannedGrams: number;
  /** Expected final quantity after any accepted rescue. */
  targetGrams: number;
  /** Value shown in the always-visible stepper. Defaults to planned. */
  draftActualGrams: number;
  /** Material already confirmed as physically added to the vessel. */
  physicalAddedGrams: number;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmationOrder: number | null;
  recordCorrectionCount: number;
}

export interface ProductionSubstitution {
  originalLineId: string;
  originalCanonicalIngredientId: string | null;
  substituteCanonicalIngredientId: string | null;
  substituteName: string;
  grams: number;
  reason: string;
}

export interface ProductionCompletionSnapshot {
  sessionId: string;
  ownerUserId: string | null;
  source: ProductionSource;
  plannedInput: RecipeInput;
  finalActualInput: RecipeInput;
  finalResult: RecipeResult;
  confirmedOrder: Array<{
    lineId: string;
    canonicalIngredientId: string | null;
    actualGrams: number;
    confirmedAt: string;
    order: number;
  }>;
  originalBatchTargetG: number;
  actualFinalMassG: number;
  machineCapacityG: number | null;
  servingTemperatureC: number;
  productionCompletedAt: string;
  operatorUserId: string | null;
  substitutions: ProductionSubstitution[];
  customerLabelNote: string;
  internalProductionNote: string;
}

export interface ProductionSession {
  schemaVersion: 1;
  sessionId: string;
  ownerUserId: string | null;
  source: ProductionSource;
  sourceFingerprint: string;
  status: ProductionSessionStatus;
  startedAt: string;
  completedAt: string | null;
  plannedInput: RecipeInput;
  /** Solver-verified additions required after production starts. The frozen plan remains untouched. */
  rescueAddedItems: RecipeItem[];
  lines: ProductionLineState[];
  substitutions: ProductionSubstitution[];
  customerLabelNote: string;
  internalProductionNote: string;
  completionSnapshot: ProductionCompletionSnapshot | null;
}

export interface CreateProductionSessionInput {
  sessionId: string;
  ownerUserId: string | null;
  source: ProductionSource;
  plannedInput: RecipeInput;
  startedAt: string;
}

function cloneRecipeInput(input: RecipeInput): RecipeInput {
  return {
    ...input,
    goals: input.goals ? { ...input.goals } : undefined,
    items: input.items.map((item) => ({
      ...item,
      ingredient: {
        ...item.ingredient,
        composition: { ...item.ingredient.composition },
        flags: item.ingredient.flags ? { ...item.ingredient.flags } : undefined,
      },
      actual_grams: null,
    })),
  };
}

export function productionSourceFingerprint(input: RecipeInput): string {
  return JSON.stringify({
    category: input.category,
    temperature: input.target_temperature_c,
    batch: input.target_batch_grams,
    machine: input.machine_capacity_grams,
    items: input.items.map((item) => ({
      lineId: item.id,
      ingredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      grams: item.planned_grams,
      lockType: item.lock_type,
      productionStep: item.production_step ?? null,
    })),
  });
}

export function createProductionSession(input: CreateProductionSessionInput): ProductionSession {
  const plannedInput = cloneRecipeInput(input.plannedInput);
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    source: { ...input.source },
    sourceFingerprint: productionSourceFingerprint(plannedInput),
    status: 'in_progress',
    startedAt: input.startedAt,
    completedAt: null,
    plannedInput,
    rescueAddedItems: [],
    lines: plannedInput.items.map((item) => ({
      lineId: item.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
      name: item.ingredient.name,
      plannedGrams: item.planned_grams,
      targetGrams: item.planned_grams,
      draftActualGrams: item.planned_grams,
      physicalAddedGrams: 0,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: 0,
    })),
    substitutions: [],
    customerLabelNote: '',
    internalProductionNote: '',
    completionSnapshot: null,
  };
}

function requireActive(session: ProductionSession): void {
  if (session.status !== 'in_progress') {
    throw new Error('Completed production is immutable.');
  }
}

function updateLine(
  session: ProductionSession,
  lineId: string,
  updater: (line: ProductionLineState) => ProductionLineState,
): ProductionSession {
  let found = false;
  const lines = session.lines.map((line) => {
    if (line.lineId !== lineId) return line;
    found = true;
    return updater(line);
  });
  if (!found) throw new Error(`Unknown production line: ${lineId}.`);
  return { ...session, lines };
}

export function setDraftActualGrams(
  session: ProductionSession,
  lineId: string,
  grams: number,
): ProductionSession {
  requireActive(session);
  if (!Number.isFinite(grams) || grams < 0) throw new Error('Actual grams must be finite and non-negative.');
  return updateLine(session, lineId, (line) => {
    if (line.confirmed) throw new Error('Use record correction before editing a confirmed line.');
    if (
      grams + PRODUCTION_GRAMS_EPSILON < line.physicalAddedGrams &&
      line.recordCorrectionCount < 1
    ) {
      throw new Error('A production adjustment cannot remove physically added material.');
    }
    return { ...line, draftActualGrams: grams };
  });
}

export function confirmProductionLine(
  session: ProductionSession,
  lineId: string,
  at: string,
): ProductionSession {
  requireActive(session);
  const nextOrder =
    session.lines.reduce((max, line) => Math.max(max, line.confirmationOrder ?? 0), 0) + 1;
  return updateLine(session, lineId, (line) => ({
    ...line,
    physicalAddedGrams: line.draftActualGrams,
    confirmed: true,
    confirmedAt: at,
    confirmationOrder: nextOrder,
  }));
}

/**
 * Explicitly reopen a confirmed entry because the recorded number was wrong.
 * This is an audit operation, not a physical subtraction. The caller must show
 * the owner-approved warning before invoking it.
 */
export function reopenProductionRecord(
  session: ProductionSession,
  lineId: string,
): ProductionSession {
  requireActive(session);
  return updateLine(session, lineId, (line) => {
    if (!line.confirmed) return line;
    return {
      ...line,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: line.recordCorrectionCount + 1,
    };
  });
}

export function correctRecordedPhysicalGrams(
  session: ProductionSession,
  lineId: string,
  grams: number,
): ProductionSession {
  requireActive(session);
  if (!Number.isFinite(grams) || grams < 0) throw new Error('Actual grams must be finite and non-negative.');
  return updateLine(session, lineId, (line) => {
    if (line.recordCorrectionCount < 1 || line.confirmed) {
      throw new Error('Record correction must be explicitly opened first.');
    }
    return { ...line, physicalAddedGrams: grams, draftActualGrams: grams };
  });
}

/** Confirmed actuals + pending target grams: the predicted finished batch. */
export function buildProductionForecastInput(session: ProductionSession): RecipeInput {
  const byId = new Map(session.lines.map((line) => [line.lineId, line]));
  const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
    const line = byId.get(item.id);
    if (!line) throw new Error(`Production line missing for ${item.id}.`);
    return {
      ...item,
      planned_grams: line.targetGrams,
      actual_grams: line.confirmed ? line.physicalAddedGrams : null,
      lock_type: line.confirmed ? ('already_added' as const) : item.lock_type,
    };
  });
  return { ...session.plannedInput, items };
}

/** Every line uses its actual confirmed mass; intended only at completion. */
export function buildFinalActualInput(session: ProductionSession): RecipeInput {
  if (session.lines.some((line) => !line.confirmed)) {
    throw new Error('Every ingredient must be confirmed before production completion.');
  }
  const byId = new Map(session.lines.map((line) => [line.lineId, line]));
  const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
    const line = byId.get(item.id)!;
    return {
      ...item,
      planned_grams: line.plannedGrams,
      actual_grams: line.physicalAddedGrams,
      lock_type: 'already_added' as const,
    };
  });
  const actualTotal = items.reduce((sum, item) => sum + (item.actual_grams ?? 0), 0);
  return { ...session.plannedInput, target_batch_grams: actualTotal, items };
}

export interface ProductionProgress {
  confirmedCount: number;
  totalCount: number;
  confirmedMassG: number;
  forecastFinalMassG: number;
  originalTargetMassG: number;
  coherent: boolean;
}

export function productionProgress(session: ProductionSession): ProductionProgress {
  const confirmed = session.lines.filter((line) => line.confirmed);
  const forecast = buildProductionForecastInput(session);
  return {
    confirmedCount: confirmed.length,
    totalCount: session.lines.length,
    confirmedMassG: confirmed.reduce((sum, line) => sum + line.physicalAddedGrams, 0),
    forecastFinalMassG: forecast.items.reduce(
      (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
      0,
    ),
    originalTargetMassG: session.plannedInput.target_batch_grams,
    coherent: session.lines.length > 0 && confirmed.length === session.lines.length,
  };
}

export function applyVerifiedRescueInput(
  session: ProductionSession,
  candidate: RecipeInput,
): ProductionSession {
  requireActive(session);
  const candidateById = new Map(candidate.items.map((item) => [item.id, item]));
  const lines = session.lines.map((line) => {
    const item = candidateById.get(line.lineId);
    if (!item) throw new Error(`Verified rescue removed production line ${line.lineId}.`);
    const candidateFinalGrams = item.actual_grams ?? item.planned_grams;
    if (candidateFinalGrams + PRODUCTION_GRAMS_EPSILON < line.physicalAddedGrams) {
      throw new Error(`Verified rescue attempted to reduce physically added ${line.name}.`);
    }
    const needsTopUp = candidateFinalGrams > line.physicalAddedGrams + PRODUCTION_GRAMS_EPSILON;
    return {
      ...line,
      targetGrams: candidateFinalGrams,
      draftActualGrams: Math.max(line.draftActualGrams, candidateFinalGrams),
      confirmed: line.confirmed && !needsTopUp,
      confirmedAt: line.confirmed && !needsTopUp ? line.confirmedAt : null,
      confirmationOrder: line.confirmed && !needsTopUp ? line.confirmationOrder : null,
    };
  });
  const knownIds = new Set(session.lines.map((line) => line.lineId));
  const rescueAddedItems = candidate.items
    .filter((item) => !knownIds.has(item.id))
    .map((item) => ({ ...item, actual_grams: null }));
  const addedLines: ProductionLineState[] = rescueAddedItems.map((item) => ({
    lineId: item.id,
    canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
    name: item.ingredient.name,
    plannedGrams: 0,
    targetGrams: item.planned_grams,
    draftActualGrams: item.planned_grams,
    physicalAddedGrams: 0,
    confirmed: false,
    confirmedAt: null,
    confirmationOrder: null,
    recordCorrectionCount: 0,
  }));
  return { ...session, rescueAddedItems, lines: [...lines, ...addedLines] };
}

export function completeProductionSession(
  session: ProductionSession,
  finalResult: RecipeResult,
  completedAt: string,
  operatorUserId: string | null,
): ProductionSession {
  requireActive(session);
  const finalActualInput = buildFinalActualInput(session);
  const actualFinalMassG = finalActualInput.items.reduce(
    (sum, item) => sum + (item.actual_grams ?? 0),
    0,
  );
  const snapshot: ProductionCompletionSnapshot = {
    sessionId: session.sessionId,
    ownerUserId: session.ownerUserId,
    source: { ...session.source },
    plannedInput: cloneRecipeInput(session.plannedInput),
    finalActualInput,
    finalResult,
    confirmedOrder: session.lines
      .filter(
        (line): line is ProductionLineState & { confirmedAt: string; confirmationOrder: number } =>
          line.confirmedAt !== null && line.confirmationOrder !== null,
      )
      .sort((a, b) => a.confirmationOrder - b.confirmationOrder)
      .map((line) => ({
        lineId: line.lineId,
        canonicalIngredientId: line.canonicalIngredientId,
        actualGrams: line.physicalAddedGrams,
        confirmedAt: line.confirmedAt,
        order: line.confirmationOrder,
      })),
    originalBatchTargetG: session.plannedInput.target_batch_grams,
    actualFinalMassG,
    machineCapacityG: session.plannedInput.machine_capacity_grams,
    servingTemperatureC: session.plannedInput.target_temperature_c,
    productionCompletedAt: completedAt,
    operatorUserId,
    substitutions: session.substitutions.map((substitution) => ({ ...substitution })),
    customerLabelNote: session.customerLabelNote,
    internalProductionNote: session.internalProductionNote,
  };
  return {
    ...session,
    status: 'completed',
    completedAt,
    completionSnapshot: snapshot,
  };
}

export function productionStepForGrams(grams: number): number {
  if (grams < 10) return 0.1;
  if (grams < 100) return 0.5;
  return 1;
}
