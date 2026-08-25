import {
  calculateRecipe,
  type NutritionPer100g,
  type RecipeCosts,
  type RecipeInput,
  type RecipeItem,
  type RecipeResult,
} from '@/engine';
import {
  recipeCompositionFromState,
  type RecipeCompositionMetadata,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  calculateFinalProduct,
  type FinalProductItem,
  type ProductLabelNutritionPer100g,
} from '@/features/recipe-composition/finalProduct';
import {
  buildRecipeBehaviorAuthority,
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  recipeBehaviorModuleGate,
  recipeInputFromFrozenBehavior,
  recipeToppingsFromFrozenBehavior,
  type ProductProcessReadinessDetail,
  type ProductionThermalMode,
} from '@/features/product-intelligence';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';

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
  /** The operator changed the editable value but has not physically confirmed it yet. */
  draftActualEdited: boolean;
  /** Material already confirmed as physically added to the vessel. */
  physicalAddedGrams: number;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmationOrder: number | null;
  recordCorrectionCount: number;
}

export interface ProductionDeviationDecision {
  strategy: 'keep_original_batch' | 'enlarge_batch' | 'leave_as_is';
  acceptedAt: string;
  sourceActualRevision: number;
  rescueRevision: number;
  finalMassG: number;
  scoreDisplay: string;
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
  finalProduct: {
    items: FinalProductItem[];
    nutritionPer100g: NutritionPer100g | null;
    labelNutritionPer100g: ProductLabelNutritionPer100g | null;
    costs: RecipeCosts | null;
    baseMassG: number;
    toppingMassG: number;
    finalMassG: number;
  };
  productComposition: RecipeCompositionMetadata;
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
  /** Assigned once when the physical run is completed. Legacy snapshots use
   * the same deterministic run/date derivation when they are read. */
  lotCode?: string;
  operatorUserId: string | null;
  substitutions: ProductionSubstitution[];
  customerLabelNote: string;
  internalProductionNote: string;
}

export function productionLotCodeForRun(sessionId: string, completedAt: string): string {
  const date = completedAt.slice(0, 10).replaceAll('-', '');
  const stableRunToken = sessionId
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 10)
    .toUpperCase();
  return `LOT-${date}-${stableRunToken || 'RUN'}`;
}

export interface ProductionSession {
  schemaVersion: 2;
  sessionId: string;
  ownerUserId: string | null;
  source: ProductionSource;
  sourceFingerprint: string;
  status: ProductionSessionStatus;
  startedAt: string;
  completedAt: string | null;
  plannedInput: RecipeInput;
  plannedComposition: RecipeCompositionMetadata;
  /** Durable server-owned authority for this physical run. Null is legacy
   * unknown, never implicit READY. */
  thermalMode: ProductionThermalMode | null;
  processReadiness: 'READY' | 'READY_WITH_INFO' | null;
  processAdvisories: ProductProcessReadinessDetail[];
  /** §2 — the operator's single confirmation that they read the heat reminder. */
  heatInformationAcknowledgedAt: string | null;
  /** Frozen server truth for this run; acknowledgement survives reload. */
  degassingRequired: boolean;
  degassingAcknowledged: boolean;
  degassingAcknowledgedAt: string | null;
  carbonatedProductIds: string[];
  /** Timestamp of the latest Rescue snapshot durably accepted by the server. */
  durableRescueAcceptedAt: string | null;
  /** Monotonic durable Rescue revision used for lost-response reconciliation. */
  durableRescueRevision: number;
  /** Monotonic durable actual revision used for lost-response reconciliation. */
  durableActualRevision: number;
  /** Latest explicit decision that resolved a confirmed deviation. */
  lastDeviationDecision: ProductionDeviationDecision | null;
  /** Solver-verified additions required after production starts. The frozen plan remains untouched. */
  rescueAddedItems: RecipeItem[];
  lines: ProductionLineState[];
  addonLines: ProductionLineState[];
  stage: 'base' | 'addons';
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
  plannedComposition?: RecipeCompositionMetadata;
  thermalMode?: ProductionThermalMode | null;
  processReadiness?: 'READY' | 'READY_WITH_INFO' | null;
  processAdvisories?: ProductProcessReadinessDetail[];
  heatInformationAcknowledgedAt?: string | null;
  degassingRequired?: boolean;
  degassingAcknowledged?: boolean;
  degassingAcknowledgedAt?: string | null;
  carbonatedProductIds?: string[];
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

export function productionSourceFingerprint(
  input: RecipeInput,
  composition?: RecipeCompositionMetadata,
): string {
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
      carbonationStatus: item.ingredient.carbonation_status ?? 'UNKNOWN',
    })),
    composition: composition
      ? {
          baseOrder: composition.baseOrder,
          behaviorSnapshots: Object.entries(composition.behaviorSnapshots ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([lineId, snapshot]) => ({
              lineId,
              productVersionId: snapshot.productVersionId,
              factsFingerprint: snapshot.factsFingerprint,
              behaviorBindingId: snapshot.behaviorBindingId,
              behaviorBindingVersion: snapshot.behaviorBindingVersion,
              taxonomyVersion: snapshot.taxonomyVersion,
              resolverVersion: snapshot.resolverVersion,
            })),
          toppings: composition.toppings.map((item) => ({
            lineId: item.id,
            ingredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
            grams: item.planned_grams,
            position: item.addon_sort_order,
          })),
        }
      : null,
  });
}

export function createProductionSession(input: CreateProductionSessionInput): ProductionSession {
  const plannedInput = cloneRecipeInput(input.plannedInput);
  const plannedComposition =
    input.plannedComposition ??
    recipeCompositionFromState({
      items: plannedInput.items,
      baseOrder: plannedInput.items.map((item) => item.id),
    });
  const basePosition = new Map(
    plannedComposition.baseOrder.map((lineId, index) => [lineId, index] as const),
  );
  const orderedBaseItems = plannedInput.items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort(
      (a, b) =>
        (basePosition.get(a.item.id) ?? a.sourceIndex) -
        (basePosition.get(b.item.id) ?? b.sourceIndex),
    )
    .map(({ item }) => item);
  return {
    schemaVersion: 2,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    source: { ...input.source },
    sourceFingerprint: productionSourceFingerprint(plannedInput, plannedComposition),
    status: 'in_progress',
    startedAt: input.startedAt,
    completedAt: null,
    plannedInput,
    plannedComposition,
    thermalMode: input.thermalMode ?? null,
    processReadiness: input.processReadiness ?? null,
    processAdvisories: structuredClone(input.processAdvisories ?? []),
    heatInformationAcknowledgedAt: input.heatInformationAcknowledgedAt ?? null,
    degassingRequired: input.degassingRequired ?? false,
    degassingAcknowledged: input.degassingAcknowledged ?? false,
    degassingAcknowledgedAt: input.degassingAcknowledgedAt ?? null,
    carbonatedProductIds: [...(input.carbonatedProductIds ?? [])],
    durableRescueAcceptedAt: null,
    durableRescueRevision: 0,
    durableActualRevision: 0,
    lastDeviationDecision: null,
    rescueAddedItems: [],
    lines: orderedBaseItems.map((item) => ({
      lineId: item.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
      name: item.ingredient.name,
      plannedGrams: item.planned_grams,
      targetGrams: item.planned_grams,
      draftActualGrams: item.planned_grams,
      draftActualEdited: false,
      physicalAddedGrams: 0,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: 0,
    })),
    addonLines: plannedComposition.toppings.map((item) => ({
      lineId: item.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
      name: item.ingredient.name,
      plannedGrams: item.planned_grams,
      targetGrams: item.planned_grams,
      draftActualGrams: item.planned_grams,
      draftActualEdited: false,
      physicalAddedGrams: 0,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: 0,
    })),
    stage: 'base',
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
  const addonLines = session.addonLines.map((line) => {
    if (line.lineId !== lineId) return line;
    found = true;
    return updater(line);
  });
  if (!found) throw new Error(`Unknown production line: ${lineId}.`);
  return { ...session, lines, addonLines };
}

function requireAddonStageIfNeeded(session: ProductionSession, lineId: string): void {
  if (
    session.addonLines.some((line) => line.lineId === lineId) &&
    (session.stage !== 'addons' || session.lines.some((line) => !line.confirmed))
  ) {
    throw new Error('Toppings can only be recorded after every Base ingredient is confirmed.');
  }
}

export function setDraftActualGrams(
  session: ProductionSession,
  lineId: string,
  grams: number,
): ProductionSession {
  requireActive(session);
  requireAddonStageIfNeeded(session, lineId);
  if (!Number.isFinite(grams) || grams < 0)
    throw new Error('Actual grams must be finite and non-negative.');
  return updateLine(session, lineId, (line) => {
    if (line.confirmed) throw new Error('Use record correction before editing a confirmed line.');
    if (
      grams + PRODUCTION_GRAMS_EPSILON < line.physicalAddedGrams &&
      line.recordCorrectionCount < 1
    ) {
      throw new Error('A production adjustment cannot remove physically added material.');
    }
    return { ...line, draftActualGrams: grams, draftActualEdited: true };
  });
}

export function confirmProductionLine(
  session: ProductionSession,
  lineId: string,
  at: string,
): ProductionSession {
  requireActive(session);
  requireAddonStageIfNeeded(session, lineId);
  const nextOrder =
    [...session.lines, ...session.addonLines].reduce(
      (max, line) => Math.max(max, line.confirmationOrder ?? 0),
      0,
    ) + 1;
  const updated = updateLine(session, lineId, (line) => ({
    ...line,
    physicalAddedGrams: line.draftActualGrams,
    draftActualEdited: false,
    confirmed: true,
    confirmedAt: at,
    confirmationOrder: nextOrder,
  }));
  const baseDone = updated.lines.length > 0 && updated.lines.every((line) => line.confirmed);
  return baseDone && updated.addonLines.length > 0 ? { ...updated, stage: 'addons' } : updated;
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
  requireAddonStageIfNeeded(session, lineId);
  return updateLine(session, lineId, (line) => {
    if (!line.confirmed) return line;
    return {
      ...line,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: line.recordCorrectionCount + 1,
      draftActualEdited: true,
    };
  });
}

/**
 * OWNER RULE §12/§19/§20 — how much more of this line the operator still has to
 * put in the vessel under the CURRENT plan. Zero once the line is at or above
 * its target; a line that was never added has nothing to "top up" — it is
 * simply still to be added.
 */
export function productionTopUpGrams(line: ProductionLineState): number {
  if (line.physicalAddedGrams <= PRODUCTION_GRAMS_EPSILON) return 0;
  return Math.max(0, line.targetGrams - line.physicalAddedGrams);
}

/**
 * OWNER RULE §12/§20 — the operator physically added more of a line that was
 * already confirmed. This is not a record correction and not a rescue: the
 * committed physical mass simply grows. It can never shrink, because nothing
 * can be taken back out of the vessel.
 */
export function topUpProductionLine(
  session: ProductionSession,
  lineId: string,
  totalGrams: number,
  at: string,
): ProductionSession {
  requireActive(session);
  requireAddonStageIfNeeded(session, lineId);
  if (!Number.isFinite(totalGrams)) throw new Error('Actual grams must be finite.');
  return updateLine(session, lineId, (line) => {
    if (!line.confirmed) {
      throw new Error('Only a confirmed line can be topped up; use the actual-grams control.');
    }
    if (totalGrams + PRODUCTION_GRAMS_EPSILON < line.physicalAddedGrams) {
      throw new Error('A top-up cannot remove physically added material.');
    }
    return {
      ...line,
      physicalAddedGrams: totalGrams,
      draftActualGrams: totalGrams,
      draftActualEdited: false,
      confirmedAt: at,
    };
  });
}

export function correctRecordedPhysicalGrams(
  session: ProductionSession,
  lineId: string,
  grams: number,
): ProductionSession {
  requireActive(session);
  requireAddonStageIfNeeded(session, lineId);
  if (!Number.isFinite(grams) || grams < 0)
    throw new Error('Actual grams must be finite and non-negative.');
  return updateLine(session, lineId, (line) => {
    if (line.recordCorrectionCount < 1 || line.confirmed) {
      throw new Error('Record correction must be explicitly opened first.');
    }
    return {
      ...line,
      physicalAddedGrams: grams,
      draftActualGrams: grams,
      draftActualEdited: true,
    };
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
  /**
   * OWNER RULE §22 — the batch the operator is executing RIGHT NOW: the sum of
   * the current line targets. It equals the original batch until a Rescue is
   * accepted, and it deliberately does not drift with a recorded deviation —
   * that drift is the forecast's job, not the plan's.
   */
  currentPlanMassG: number;
  /** What is still to be added under that current plan. Never negative. */
  remainingMassG: number;
  /** Physical mass already above the current plan. Never negative. */
  excessMassG: number;
  massBalanceState: 'below' | 'exact' | 'above';
  /** True once an accepted Rescue moved the plan away from the original batch. */
  targetChanged: boolean;
  coherent: boolean;
}

export function productionProgress(session: ProductionSession): ProductionProgress {
  const confirmed = session.lines.filter((line) => line.confirmed);
  const forecast = buildProductionForecastInput(session);
  const confirmedMassG = session.lines.reduce((sum, line) => sum + line.physicalAddedGrams, 0);
  const forecastFinalMassG = forecast.items.reduce(
    (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
    0,
  );
  const originalTargetMassG = session.plannedInput.target_batch_grams;
  const currentPlanMassG = session.lines.reduce((sum, line) => sum + line.targetGrams, 0);
  const balanceDeltaG = confirmedMassG - currentPlanMassG;
  return {
    confirmedCount: confirmed.length,
    totalCount: session.lines.length,
    // A rescue can reopen a previously confirmed line for an additional top-up.
    // The original physical amount remains in the vessel even while that line is
    // pending again, so the operator-facing vessel mass must sum every physical
    // floor rather than only lines whose current target is fully confirmed.
    confirmedMassG,
    forecastFinalMassG,
    originalTargetMassG,
    currentPlanMassG,
    remainingMassG: Math.max(0, currentPlanMassG - confirmedMassG),
    excessMassG: Math.max(0, balanceDeltaG),
    massBalanceState:
      Math.abs(balanceDeltaG) <= 0.05 ? 'exact' : balanceDeltaG > 0 ? 'above' : 'below',
    targetChanged: Math.abs(currentPlanMassG - originalTargetMassG) > 0.05,
    coherent: session.lines.length > 0 && confirmed.length === session.lines.length,
  };
}

export interface ToppingProductionProgress {
  confirmedCount: number;
  totalCount: number;
  confirmedMassG: number;
  forecastMassG: number;
  coherent: boolean;
}

export function toppingProductionProgress(session: ProductionSession): ToppingProductionProgress {
  const confirmed = session.addonLines.filter((line) => line.confirmed);
  return {
    confirmedCount: confirmed.length,
    totalCount: session.addonLines.length,
    confirmedMassG: session.addonLines.reduce((sum, line) => sum + line.physicalAddedGrams, 0),
    forecastMassG: session.addonLines.reduce(
      (sum, line) => sum + (line.confirmed ? line.physicalAddedGrams : line.targetGrams),
      0,
    ),
    coherent: session.addonLines.every((line) => line.confirmed),
  };
}

export function applyVerifiedRescueInput(
  session: ProductionSession,
  candidate: RecipeInput,
): ProductionSession {
  requireActive(session);
  const candidateBatchGrams = candidate.items.reduce((sum, item) => sum + item.planned_grams, 0);
  const authority = evaluateRecipeConstraintAuthority({
    // Rescue is authorized precisely because the future plan may increase or
    // reduce the original target. Validate the exact new composition against
    // its actual candidate mass without rewriting the frozen source target.
    recipe: { ...candidate, target_batch_grams: candidateBatchGrams },
    snapshots: session.plannedComposition.behaviorSnapshots ?? {},
    module: 'BATCH_RESCUE',
    technicalOnlyMainLineIds: session.plannedComposition.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!authority.valid) {
    throw new Error(
      authority.issues[0]?.messagePl ??
        'Production Rescue requires a fully verified recipe candidate.',
    );
  }
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
      draftActualGrams:
        line.confirmed && !needsTopUp ? line.physicalAddedGrams : candidateFinalGrams,
      draftActualEdited: false,
      confirmed: line.confirmed && !needsTopUp,
      confirmedAt: line.confirmed && !needsTopUp ? line.confirmedAt : null,
      confirmationOrder: line.confirmed && !needsTopUp ? line.confirmationOrder : null,
    };
  });
  // Rescue is cumulative. Compare with the immutable source plan, not the
  // current physical lines, so a second Rescue keeps every earlier addition
  // in the Engine/forecast vector.
  const originalIds = new Set(session.plannedInput.items.map((item) => item.id));
  const existingLineIds = new Set(session.lines.map((line) => line.lineId));
  const rescueAddedItems = candidate.items
    .filter((item) => !originalIds.has(item.id))
    .map((item) => ({ ...item, actual_grams: null }));
  const requiredRescueIds = productBehaviorRequiredLineIds({ items: rescueAddedItems });
  const rescueGate = productBehaviorModuleGate(
    session.plannedComposition.behaviorSnapshots ?? {},
    'PRODUCTION',
    requiredRescueIds,
  );
  if (!rescueGate.ready) {
    throw new Error(rescueGate.reason ?? 'Production rescue requires verified product behavior.');
  }
  const addedLines: ProductionLineState[] = rescueAddedItems
    .filter((item) => !existingLineIds.has(item.id))
    .map((item) => ({
      lineId: item.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
      name: item.ingredient.name,
      plannedGrams: 0,
      targetGrams: item.planned_grams,
      draftActualGrams: item.planned_grams,
      draftActualEdited: false,
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
  _finalResult: RecipeResult,
  completedAt: string,
  operatorUserId: string | null,
): ProductionSession {
  requireActive(session);
  const finalActualInput = buildFinalActualInput(session);
  if (session.addonLines.some((line) => !line.confirmed)) {
    throw new Error('Every topping must be confirmed before production completion.');
  }
  const addonById = new Map(session.addonLines.map((line) => [line.lineId, line]));
  const actualToppings = session.plannedComposition.toppings.map((item) => ({
    ...item,
    actual_grams: addonById.get(item.id)?.physicalAddedGrams ?? null,
  }));
  const authority = buildRecipeBehaviorAuthority({
    items: finalActualInput.items,
    toppings: actualToppings,
    snapshots: session.plannedComposition.behaviorSnapshots ?? {},
  });
  const productionGate = recipeBehaviorModuleGate(authority, 'PRODUCTION');
  const nutritionGate = recipeBehaviorModuleGate(authority, 'NUTRITION');
  if (!productionGate.ready || !nutritionGate.ready) {
    throw new Error(
      productionGate.reason ?? nutritionGate.reason ?? 'Production facts require revalidation.',
    );
  }
  const authoritativeInput = recipeInputFromFrozenBehavior(
    finalActualInput,
    authority,
    'nutrition',
  );
  const authoritativeToppings = recipeToppingsFromFrozenBehavior(
    actualToppings,
    authority,
    'nutrition',
  );
  const authoritativeResult = calculateRecipe(authoritativeInput);
  const finalProduct = calculateFinalProduct(
    authoritativeInput,
    authoritativeToppings,
    'actual_batch',
  );
  const actualFinalMassG = finalProduct.finalMassG;
  const frozenComposition: RecipeCompositionMetadata = {
    ...session.plannedComposition,
    toppings: authoritativeToppings,
  };
  const snapshot: ProductionCompletionSnapshot = {
    sessionId: session.sessionId,
    ownerUserId: session.ownerUserId,
    source: { ...session.source },
    plannedInput: cloneRecipeInput(session.plannedInput),
    finalActualInput: authoritativeInput,
    finalResult: authoritativeResult,
    finalProduct: {
      items: finalProduct.finalItems,
      nutritionPer100g: finalProduct.finalNutritionPer100g,
      labelNutritionPer100g: finalProduct.finalLabelNutritionPer100g,
      costs: finalProduct.finalCosts,
      baseMassG: finalProduct.baseMassG,
      toppingMassG: finalProduct.toppingMassG,
      finalMassG: finalProduct.finalMassG,
    },
    productComposition: frozenComposition,
    confirmedOrder: [...session.lines, ...session.addonLines]
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
    lotCode: productionLotCodeForRun(session.sessionId, completedAt),
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

/**
 * Rebuild the physical workspace from the server-authoritative run. The exact
 * immutable recipe version remains the source of ingredient facts; the run
 * contributes only its frozen scaled plan, validated Rescue snapshot and
 * recorded actuals. Any mismatch fails closed instead of guessing.
 */
export function hydrateProductionSessionFromRun(
  run: ProductionRun,
  source: ProductionSource,
  plannedInput: RecipeInput,
  plannedComposition: RecipeCompositionMetadata,
): ProductionSession {
  if (run.status === 'draft' || run.status === 'planned' || run.status === 'cancelled') {
    throw new Error(`Cannot hydrate a non-active Production run (${run.status}).`);
  }
  if (
    source.recipeId !== run.recipeId ||
    source.recipeVersionId !== run.recipeVersionId ||
    source.recipeVersionNumber !== run.recipeVersionNumber
  ) {
    throw new Error('Durable Production run does not match the exact recipe version.');
  }
  const expectedIds = [
    ...plannedComposition.baseOrder,
    ...plannedComposition.toppings
      .slice()
      .sort((a, b) => a.addon_sort_order - b.addon_sort_order)
      .map((item) => item.id),
  ];
  if (
    run.plannedItems.length !== expectedIds.length ||
    run.plannedItems.some(
      (line, index) =>
        line.id !== expectedIds[index] ||
        Math.abs(
          line.plannedGrams -
            (plannedInput.items.find((item) => item.id === line.id)?.planned_grams ??
              plannedComposition.toppings.find((item) => item.id === line.id)?.planned_grams ??
              Number.NaN),
        ) > PRODUCTION_GRAMS_EPSILON,
    )
  ) {
    throw new Error('Durable Production plan differs from the exact local recipe version.');
  }

  let session = createProductionSession({
    sessionId: run.runId,
    ownerUserId: run.ownerUserId,
    source,
    plannedInput,
    plannedComposition,
    thermalMode: run.thermalMode ?? null,
    processReadiness: run.processReadiness ?? null,
    processAdvisories: run.processAdvisories ?? [],
    heatInformationAcknowledgedAt: run.heatInformationAcknowledgedAt ?? null,
    degassingRequired: run.degassingRequired === true,
    degassingAcknowledged: run.degassingAcknowledged === true,
    degassingAcknowledgedAt: run.degassingAcknowledgedAt ?? null,
    carbonatedProductIds: [...(run.carbonatedProductIds ?? [])],
    startedAt: run.events.find((event) => event.type === 'started')?.at ?? run.createdAt,
  });
  if (run.rescue) {
    session = {
      ...session,
      plannedComposition: {
        ...session.plannedComposition,
        behaviorSnapshots: run.rescue.productComposition.behaviorSnapshots,
      },
    };
    session = applyVerifiedRescueInput(session, run.rescue.recipeInput);
    session = {
      ...session,
      durableRescueAcceptedAt: run.rescue.acceptedAt,
      durableRescueRevision: run.rescue.revision,
    };
  }

  const decisionEvent = [...run.events]
    .reverse()
    .find((event) => event.type === 'deviation_decision_accepted');
  const decision = decisionEvent?.amendment;
  const strategy = decision?.stableOptionId;
  if (
    decisionEvent &&
    (strategy === 'keep_original_batch' ||
      strategy === 'enlarge_batch' ||
      strategy === 'leave_as_is') &&
    typeof decision?.sourceActualRevision === 'number' &&
    typeof decision?.rescueRevision === 'number' &&
    typeof decision?.finalMassG === 'number' &&
    typeof decision?.scoreDisplay === 'string'
  ) {
    session = {
      ...session,
      lastDeviationDecision: {
        strategy,
        acceptedAt: decisionEvent.at,
        sourceActualRevision: decision.sourceActualRevision,
        rescueRevision: decision.rescueRevision,
        finalMassG: decision.finalMassG,
        scoreDisplay: decision.scoreDisplay,
      },
    };
  }

  if (run.actual) {
    const actualById = new Map(run.actual.items.map((item, index) => [item.id, { item, index }]));
    const restoreLine = (line: ProductionLineState): ProductionLineState => {
      const recorded = actualById.get(line.lineId);
      const grams = recorded?.item.actualGrams;
      if (!recorded || grams === null || grams === undefined) return line;
      return {
        ...line,
        draftActualGrams: grams,
        draftActualEdited: false,
        physicalAddedGrams: grams,
        confirmed: true,
        confirmedAt: recorded.item.confirmedAt ?? run.actual!.recordedAt,
        confirmationOrder: recorded.item.confirmationOrder ?? recorded.index + 1,
      };
    };
    session = {
      ...session,
      durableActualRevision: run.actual.revision,
      lines: session.lines.map(restoreLine),
      addonLines: session.addonLines.map(restoreLine),
      stage:
        session.lines.every((line) => actualById.get(line.lineId)?.item.actualGrams != null) &&
        session.addonLines.length > 0
          ? 'addons'
          : 'base',
      substitutions: run.actual.substitutions.map((item) => ({
        originalLineId: item.originalIngredientId,
        originalCanonicalIngredientId: item.originalIngredientId,
        substituteCanonicalIngredientId: null,
        substituteName: item.substituteName,
        grams: item.grams ?? 0,
        reason: item.reason,
      })),
      internalProductionNote: run.actual.operatorNotes ?? '',
    };
  }

  return run.status === 'completed'
    ? completeProductionSession(
        session,
        calculateRecipe(buildFinalActualInput(session)),
        run.completedAt ?? run.updatedAt,
        run.actual?.recordedBy ?? run.ownerUserId,
      )
    : session;
}

/**
 * Server state owns physical facts and durable revisions. Pending stepper edits
 * are local drafts only, so they may be carried over after hydration when the
 * same line is still unconfirmed and the draft does not cross the physical floor.
 */
export function mergePendingProductionDrafts(
  durable: ProductionSession,
  local: ProductionSession,
): ProductionSession {
  if (durable.sessionId !== local.sessionId) {
    throw new Error('Cannot merge drafts from a different Production run.');
  }
  const localById = new Map(
    [...local.lines, ...local.addonLines].map((line) => [line.lineId, line] as const),
  );
  const merge = (line: ProductionLineState): ProductionLineState => {
    if (line.confirmed) return line;
    const draft = localById.get(line.lineId);
    // A correction editor is meaningful only while the server still owns a
    // recorded physical fact for that line. Never resurrect a local correction
    // after durable reconciliation says that the line has no recorded material.
    if (
      line.physicalAddedGrams <= PRODUCTION_GRAMS_EPSILON &&
      line.recordCorrectionCount === 0 &&
      draft != null &&
      draft.recordCorrectionCount > 0
    ) {
      return line;
    }
    const draftWasEdited =
      draft &&
      (draft.draftActualEdited || draft.recordCorrectionCount > line.recordCorrectionCount);
    if (
      !draft ||
      !draftWasEdited ||
      draft.draftActualGrams + PRODUCTION_GRAMS_EPSILON < line.physicalAddedGrams
    ) {
      return line;
    }
    return {
      ...line,
      draftActualGrams: draft.draftActualGrams,
      draftActualEdited: draft.draftActualEdited,
      recordCorrectionCount: Math.max(line.recordCorrectionCount, draft.recordCorrectionCount),
    };
  };
  return {
    ...durable,
    lines: durable.lines.map(merge),
    addonLines: durable.addonLines.map(merge),
  };
}

export function productionStepForGrams(grams: number): number {
  if (grams < 10) return 0.1;
  if (grams < 100) return 0.5;
  return 1;
}
