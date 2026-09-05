import {
  applyAutoFix,
  calculateRecipe,
  detectViolations,
  proposeBatchRecovery,
  proposeAutoFix,
  type CorrectionAction,
  type CorrectionProposal,
  type RecipeInput,
  type RecipeResult,
  type TargetMetric,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  practicalizeRecipeCandidate,
  type PracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  rescaleBatchToTarget,
  verifyConstraintsPreserved,
  type ConstraintSet,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { isTemplateControlledStabilizer } from '@/features/formulation/stabilizerDosage';
import type { ProductionRescueStableOptionId } from '@/features/pro-core/productionContracts';
import {
  PRODUCTION_GRAMS_EPSILON,
  buildProductionForecastInput,
  type ProductionSession,
} from './productionSession';
import { evaluateProductionRescueTerminalAuthority } from './productionRescueAuthority';

export type ProductionRescueOptionId = ProductionRescueStableOptionId;

/**
 * Production-specific Rescue orchestration contract. Engine/config versions
 * continue to identify the formulas and calibrated data; this stamp identifies
 * the option-selection and practicalization layer authorized by the server.
 */
export const PRODUCTION_RESCUE_MODEL_VERSION = 'production-rescue-v7' as const;

export interface ProductionRescueInstruction {
  lineId: string | null;
  ingredientName: string;
  kind: 'add' | 'reduce_pending_plan';
  grams: number;
  /** Final row target. Add instructions should still be spoken as `+ grams`. */
  finalTargetGrams: number;
}

export interface ProductionRescueOption {
  id: ProductionRescueOptionId;
  title: string;
  explanation: string;
  finalMassG: number;
  scoreDisplay: string;
  /** Solver output retained for audit only. It is never sent to the vessel. */
  exactCandidateInput: RecipeInput;
  /** The only recipe vector exposed to Apply/Production. */
  candidateInput: RecipeInput;
  practicalAudit: ProductionRescueExecutionAudit;
  instructions: ProductionRescueInstruction[];
  verifiedByEngine: true;
}

export type ProductionTenthGramAudit = Omit<PracticalRecipeAudit, 'modelVersion'> & {
  modelVersion: 'production-tenth-gram-v1';
};

export type ProductionRescueExecutionAudit = PracticalRecipeAudit | ProductionTenthGramAudit;

export interface ProductionRescueAssessment {
  state: 'not_needed' | 'options' | 'impossible';
  forecastInput: RecipeInput;
  forecastResult: RecipeResult;
  forecastScoreDisplay: string;
  hardSafety: ProductionHardSafetyAssessment;
  hasConfirmedDeviation: boolean;
  options: ProductionRescueOption[];
  reason: string | null;
  strategyTrace: Partial<Record<ProductionRescueOptionId, ProductionRescueStrategyTrace>>;
  diagnostics: ProductionRescueDiagnostics;
}

export interface ProductionRescueViolationDiagnostic {
  metric: TargetMetric;
  direction: 'low' | 'high';
  value: number;
  min: number;
  max: number;
}

export interface ProductionRescueFixedTargetDiagnostic {
  attempted: true;
  candidateMassG: number;
  violationDetails: ProductionRescueViolationDiagnostic[];
  capacityExceeded: boolean;
  provisional: boolean;
  nativeProfileValidated: boolean;
  terminalIssueCodes: string[];
}

export interface ProductionRescueIrreducibleDiagnostic extends ProductionRescueViolationDiagnostic {
  basis: 'confirmed_physical_floor_at_target';
}

export interface ProductionRescueDiagnostics {
  physicalConfirmedG: number;
  forecastMassG: number;
  originalTargetG: number;
  machineCapacityG: number | null;
  forecastViolationDetails: ProductionRescueViolationDiagnostic[];
  fixedTargetRebalance: ProductionRescueFixedTargetDiagnostic | null;
  irreducibleConfirmedViolations: ProductionRescueIrreducibleDiagnostic[];
}

export interface ProductionRescueStrategyTrace {
  solverProposalCount: number;
  evaluatedCandidateCount: number;
  generatedSafeCandidateCount: number;
  acceptedCandidateCount: number;
  hardReasonSets: string[][];
  authorityIssueSets: string[][];
  finalCandidateGrams: number[];
}

const violationDiagnosticsFor = (result: RecipeResult): ProductionRescueViolationDiagnostic[] =>
  detectViolations(result).flatMap((violation) =>
    violation.value === null || violation.band === null
      ? []
      : [
          {
            metric: violation.metric,
            direction: violation.direction,
            value: violation.value,
            min: violation.band.min,
            max: violation.band.max,
          },
        ],
  );

export interface ProductionHardSafetyAssessment {
  safe: boolean;
  violationMetrics: TargetMetric[];
  provisional: boolean;
  capacityExceeded: boolean;
  nativeProfileValidated: boolean;
}

export type ProductionContinuationPath =
  | 'no_correction_required'
  | 'authorized_correction'
  | 'safe_unchanged_acceptance'
  | 'recovery_required';

/**
 * P0 liveness invariant for every evaluated revision. The browser may continue
 * only through one of these four explicit domain paths; an empty option list
 * is a recovery state, never a disabled decision panel with no next action.
 */
export function productionContinuationPath(
  assessment: ProductionRescueAssessment,
): ProductionContinuationPath {
  if (assessment.state === 'not_needed') return 'no_correction_required';
  if (assessment.options.some((option) => option.id !== 'leave_as_is')) {
    return 'authorized_correction';
  }
  if (
    assessment.hardSafety.safe &&
    assessment.options.some((option) => option.id === 'leave_as_is')
  ) {
    return 'safe_unchanged_acceptance';
  }
  return 'recovery_required';
}

/**
 * OWNER RULE §17 — a batch size is spoken exactly as the Engine verified it.
 * 1086 g is reported as 1086 g; it is never rounded up to a tidier 1100 g.
 */
export const formatBatchMassG = (grams: number): string =>
  Number.isInteger(grams) ? grams.toFixed(0) : grams.toFixed(1).replace(/\.0$/, '');

const totalFor = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + (item.actual_grams ?? item.planned_grams), 0);

/**
 * Rescue recovery already chooses the operator's 0.1 g grid. Canonicalize only
 * values that are within floating-point epsilon of that grid so the trusted
 * JSON snapshot contains `48.8`, not `48.800000000000004`. This changes no
 * physical target; it makes the scored/displayed decimal identical to the
 * value enforced by the database Apply boundary.
 */
const canonicalProductionTenthGram = (grams: number): number => {
  const tenths = Math.round(grams * 10);
  return Math.abs(grams * 10 - tenths) <= 1e-8 ? tenths / 10 : grams;
};

export const productionRescueCandidateFingerprint = (input: RecipeInput): string =>
  JSON.stringify({
    mode: input.mode,
    category: input.category,
    temperature: input.target_temperature_c,
    batch: input.target_batch_grams,
    machine: input.machine_capacity_grams,
    goals: input.goals ?? null,
    items: input.items.map((item) => ({
      lineId: item.id,
      canonicalId: canonicalIngredientId(item.ingredient),
      grams: item.planned_grams,
      actual: item.actual_grams,
      lock: item.lock_type,
      composition: item.ingredient.composition,
    })),
  });

/**
 * The correction solver may express a top-up as a new toolbox line. Production
 * cannot turn that into a second canonical ingredient: the operator is adding
 * more of the same material already present in the plan. Fold only solver-new
 * lines into the matching base line and leave genuinely new ingredients alone.
 */
function foldCanonicalTopUps(base: RecipeInput, proposed: RecipeInput): RecipeInput {
  const baseLineIds = new Set(base.items.map((item) => item.id));
  const baseLineByCanonical = new Map(
    base.items.map((item) => [canonicalIngredientId(item.ingredient), item.id]),
  );
  const folded = proposed.items.map((item) => ({ ...item }));
  const byLineId = new Map(folded.map((item) => [item.id, item]));
  const removeIds = new Set<string>();

  for (const item of folded) {
    if (baseLineIds.has(item.id)) continue;
    const baseLineId = baseLineByCanonical.get(canonicalIngredientId(item.ingredient));
    if (!baseLineId) continue;
    const target = byLineId.get(baseLineId);
    if (!target) continue;
    const topUpGrams = item.actual_grams ?? item.planned_grams;
    if (target.actual_grams !== null) {
      target.actual_grams += topUpGrams;
    } else {
      target.planned_grams += topUpGrams;
    }
    removeIds.add(item.id);
  }

  if (removeIds.size === 0) return proposed;
  return { ...proposed, items: folded.filter((item) => !removeIds.has(item.id)) };
}

export function assessProductionHardSafety(
  input: RecipeInput,
  result: RecipeResult,
): ProductionHardSafetyAssessment {
  const violationMetrics = detectViolations(result).map((violation) => violation.metric);
  const provisional = result.indicators.some(
    (indicator) =>
      indicator.category_fallback ||
      indicator.temperature_fallback ||
      indicator.band_status === 'estimated',
  );
  const capacityExceeded =
    input.machine_capacity_grams !== null &&
    result.total_batch_g > input.machine_capacity_grams + PRODUCTION_GRAMS_EPSILON;
  const nativeProfileValidated = recipeFitForInput(input, result).validatedNative;
  return {
    safe:
      violationMetrics.length === 0 && !provisional && !capacityExceeded && nativeProfileValidated,
    violationMetrics,
    provisional,
    capacityExceeded,
    nativeProfileValidated,
  };
}

const nativeSafe = (input: RecipeInput, result: RecipeResult): boolean =>
  assessProductionHardSafety(input, result).safe;

export const productionRescueTerminalAuthority = (input: RecipeInput, session: ProductionSession) =>
  evaluateProductionRescueTerminalAuthority(input, session.plannedComposition);

const terminallyAuthorized = (input: RecipeInput, session: ProductionSession): boolean =>
  productionRescueTerminalAuthority(input, session).valid;

function preservesPhysicalReality(session: ProductionSession, candidate: RecipeInput): boolean {
  const candidateById = new Map(candidate.items.map((item) => [item.id, item]));
  return session.lines.every((line) => {
    if (line.physicalAddedGrams <= PRODUCTION_GRAMS_EPSILON) return true;
    const item = candidateById.get(line.lineId);
    if (!item) return false;
    const finalGrams = item.actual_grams ?? item.planned_grams;
    return finalGrams + PRODUCTION_GRAMS_EPSILON >= line.physicalAddedGrams;
  });
}

function candidateFromProposal(
  forecastInput: RecipeInput,
  proposal: CorrectionProposal,
  context: 'planning' | 'actual_batch',
): RecipeInput | null {
  const applied = applyAutoFix({ input: forecastInput, proposal, context });
  if (!applied.success) return null;
  const canonicalCandidate = foldCanonicalTopUps(forecastInput, applied.newInput);
  const total = totalFor(canonicalCandidate);
  return { ...canonicalCandidate, target_batch_grams: total };
}

const sourceItemFor = (
  session: ProductionSession,
  lineId: string,
): RecipeInput['items'][number] | undefined =>
  [...session.plannedInput.items, ...session.rescueAddedItems].find((item) => item.id === lineId);

/**
 * The immutable recipe version remains the audit origin, while accepted Rescue
 * targets become the canonical plan for the next deviation. Rebuild that plan
 * from Production lines so a second restore scales the accepted revision, not
 * a stale 1000 g source vector.
 */
function currentCanonicalProductionPlan(session: ProductionSession): RecipeInput {
  const lineById = new Map(session.lines.map((line) => [line.lineId, line]));
  const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
    const line = lineById.get(item.id);
    if (!line) throw new Error(`Production line missing for ${item.id}.`);
    return {
      ...item,
      planned_grams: line.targetGrams,
      actual_grams: null,
      lock_type: item.lock_type === 'already_added' ? ('unlocked' as const) : item.lock_type,
    };
  });
  return {
    ...session.plannedInput,
    target_batch_grams: totalFor({ ...session.plannedInput, items }),
    items,
  };
}

function persistedProductionConstraint(
  source: RecipeInput['items'][number] | undefined,
  candidate: RecipeInput['items'][number],
  sourceBatchGrams: number,
): IngredientConstraint | null {
  if (source?.grams_constraint !== undefined) {
    return { mode: 'locked', grams: source.grams_constraint.grams };
  }
  if (source?.percent_constraint !== undefined) {
    return { mode: 'percent', percent: source.percent_constraint.percent };
  }
  if (source?.range_constraint !== undefined) {
    return {
      mode: 'range',
      minGrams: source.range_constraint.min_grams,
      maxGrams: source.range_constraint.max_grams,
    };
  }
  if (source?.lock_type === 'grams') {
    return { mode: 'locked', grams: source.planned_grams };
  }
  if (source?.lock_type === 'percent' && sourceBatchGrams > 0) {
    return {
      mode: 'percent',
      percent: (source.planned_grams / sourceBatchGrams) * 100,
    };
  }
  if (candidate.range_constraint !== undefined) {
    return {
      mode: 'range',
      minGrams: candidate.range_constraint.min_grams,
      maxGrams: candidate.range_constraint.max_grams,
    };
  }
  return null;
}

function productionConstraintSet(
  session: ProductionSession,
  exactPlanningCandidate: RecipeInput,
): ConstraintSet {
  const byLineId: Record<string, IngredientConstraint> = {};
  const lineById = new Map(session.lines.map((line) => [line.lineId, line]));
  for (const item of exactPlanningCandidate.items) {
    const line = lineById.get(item.id);
    if (line && line.physicalAddedGrams > PRODUCTION_GRAMS_EPSILON) {
      // Physical mass is a floor, never a value to round down. The solver's
      // exact final target is the upper edge; the practicalizer may choose the
      // nearest whole gram inside that honest interval.
      byLineId[item.id] = {
        mode: 'range',
        minGrams: line.physicalAddedGrams,
        maxGrams: Math.max(line.physicalAddedGrams, Math.ceil(item.planned_grams)),
      };
      continue;
    }
    const source = sourceItemFor(session, item.id);
    const persisted = persistedProductionConstraint(
      source,
      item,
      session.plannedInput.target_batch_grams,
    );
    if (persisted) {
      byLineId[item.id] = persisted;
    }
  }
  return { byLineId };
}

interface ProductionRescueCandidateSeed {
  input: RecipeInput;
  actions: CorrectionAction[];
  precision: 'whole' | 'tenth';
}

/**
 * Rescue's add-only recovery is the right authority once every useful gram is
 * already in the vessel. During weighing, however, the still-unconfirmed rows
 * remain an honest planning surface: their targets may be rescaled around the
 * immutable confirmed facts while the total batch remains unchanged.
 *
 * This uses the existing constraint-aware batch rescaler, then projects only
 * its free pending rows onto Production's 0.1 g execution grid by deterministic
 * largest remainder. No technical band is invented here; the completed vector
 * still has to pass the canonical Engine and terminal ProductBehavior gates in
 * `bestOption` before it can be exposed or authorized.
 */
function pendingPlanRebalanceCandidate(
  session: ProductionSession,
  forecastInput: RecipeInput,
  targetBatchGrams: number,
): ProductionRescueCandidateSeed | null {
  if (totalFor(forecastInput) <= targetBatchGrams + PRODUCTION_GRAMS_EPSILON) return null;

  const canonicalPlan = currentCanonicalProductionPlan(session);
  const canonicalById = new Map(canonicalPlan.items.map((item) => [item.id, item] as const));
  const lineById = new Map(session.lines.map((line) => [line.lineId, line] as const));
  const planningInput: RecipeInput = {
    ...forecastInput,
    target_batch_grams: targetBatchGrams,
    items: forecastInput.items.map((item) => ({
      ...item,
      planned_grams: item.actual_grams ?? item.planned_grams,
      actual_grams: null,
      lock_type: canonicalById.get(item.id)?.lock_type ?? item.lock_type,
    })),
  };
  const byLineId: Record<string, IngredientConstraint> = {};
  for (const item of planningInput.items) {
    const line = lineById.get(item.id);
    if (!line) return null;
    if (line.confirmed) {
      byLineId[item.id] = { mode: 'locked', grams: line.physicalAddedGrams };
      continue;
    }
    const persisted = persistedProductionConstraint(
      sourceItemFor(session, item.id),
      item,
      canonicalPlan.target_batch_grams,
    );
    if (persisted) byLineId[item.id] = persisted;
  }
  const constraints: ConstraintSet = { byLineId };
  const rescaled = rescaleBatchToTarget(planningInput, constraints, targetBatchGrams);
  if (!rescaled.ok) return null;

  const protectedIds = new Set(Object.keys(byLineId));
  const adjustable = rescaled.input.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !protectedIds.has(item.id));
  if (adjustable.length === 0) return null;

  const fixed = rescaled.input.items.filter((item) => protectedIds.has(item.id));
  const fixedTenths = fixed.reduce((sum, item) => {
    const tenths = item.planned_grams * 10;
    return sum + (Math.abs(tenths - Math.round(tenths)) <= 1e-8 ? Math.round(tenths) : Number.NaN);
  }, 0);
  const targetTenths = targetBatchGrams * 10;
  if (!Number.isFinite(fixedTenths) || Math.abs(targetTenths - Math.round(targetTenths)) > 1e-8) {
    return null;
  }

  const allocations = adjustable.map(({ item, index }) => {
    const exactTenths = item.planned_grams * 10;
    const floorTenths = Math.floor(exactTenths + 1e-8);
    return {
      index,
      lineId: item.id,
      exactTenths,
      floorTenths,
      fraction: exactTenths - floorTenths,
    };
  });
  const requiredAdjustableTenths = Math.round(targetTenths) - fixedTenths;
  let remainder =
    requiredAdjustableTenths - allocations.reduce((sum, item) => sum + item.floorTenths, 0);
  if (remainder < 0 || remainder > allocations.length) return null;
  const byLargestRemainder = [...allocations].sort(
    (left, right) => right.fraction - left.fraction || left.lineId.localeCompare(right.lineId),
  );
  const tenthsByIndex = new Map(allocations.map((item) => [item.index, item.floorTenths] as const));
  for (const allocation of byLargestRemainder) {
    if (remainder <= 0) break;
    tenthsByIndex.set(allocation.index, allocation.floorTenths + 1);
    remainder -= 1;
  }
  if (remainder !== 0) return null;

  const candidate: RecipeInput = {
    ...rescaled.input,
    target_batch_grams: targetBatchGrams,
    items: rescaled.input.items.map((item, index) => {
      const tenths = tenthsByIndex.get(index);
      return tenths === undefined ? item : { ...item, planned_grams: tenths / 10 };
    }),
  };
  if (!verifyConstraintsPreserved(constraints, candidate).ok) return null;
  if (Math.abs(totalFor(candidate) - targetBatchGrams) > PRODUCTION_GRAMS_EPSILON) return null;

  const actions: CorrectionAction[] = [];
  const beforeById = new Map(forecastInput.items.map((item) => [item.id, item] as const));
  for (const item of candidate.items) {
    const before = beforeById.get(item.id);
    if (!before) continue;
    const beforeGrams = before.actual_grams ?? before.planned_grams;
    const delta = item.planned_grams - beforeGrams;
    if (Math.abs(delta) <= PRODUCTION_GRAMS_EPSILON) continue;
    actions.push({
      type: delta > 0 ? 'add' : 'reduce',
      ingredient_id: item.ingredient.id,
      ingredient_name: item.ingredient.name,
      ingredient_category: item.ingredient.category,
      grams: Math.abs(delta),
      target_line_id: item.id,
    });
  }
  return actions.length > 0 ? { input: candidate, actions, precision: 'tenth' } : null;
}

/**
 * Prove the strongest useful fixed-target lower bound without inventing a new
 * recipe. Confirmed physical rows are immutable. All remaining mass is assigned
 * to the pending ingredient with the lowest lactose contribution, and the
 * canonical Engine calculates the resulting value. If that optimistic vector
 * is still above the hard lactose band, no legal redistribution of the pending
 * rows can repair the original target mass.
 */
function confirmedPhysicalFloorDiagnostics(
  session: ProductionSession,
  forecastInput: RecipeInput,
  targetBatchGrams: number,
): ProductionRescueIrreducibleDiagnostic[] {
  const lineById = new Map(session.lines.map((line) => [line.lineId, line] as const));
  const confirmedMassG = session.lines.reduce(
    (sum, line) => sum + (line.confirmed ? line.physicalAddedGrams : 0),
    0,
  );
  const remainingMassG = targetBatchGrams - confirmedMassG;
  if (remainingMassG < -PRODUCTION_GRAMS_EPSILON) return [];

  const pending = forecastInput.items
    .filter((item) => !lineById.get(item.id)?.confirmed)
    .sort(
      (left, right) =>
        left.ingredient.composition.lactose_percent -
          right.ingredient.composition.lactose_percent || left.id.localeCompare(right.id),
    );
  const optimisticFiller = pending[0];
  if (!optimisticFiller && remainingMassG > PRODUCTION_GRAMS_EPSILON) return [];

  const optimisticInput: RecipeInput = {
    ...forecastInput,
    target_batch_grams: targetBatchGrams,
    items: forecastInput.items.map((item) => {
      const line = lineById.get(item.id);
      const grams = line?.confirmed
        ? line.physicalAddedGrams
        : item.id === optimisticFiller?.id
          ? Math.max(0, remainingMassG)
          : 0;
      return { ...item, planned_grams: grams, actual_grams: null };
    }),
  };
  const optimisticResult = calculateRecipe(optimisticInput);
  return violationDiagnosticsFor(optimisticResult)
    .filter((violation) => violation.metric === 'lactose' && violation.direction === 'high')
    .map((violation) => ({ ...violation, basis: 'confirmed_physical_floor_at_target' }));
}

function productionRescueDiagnostics(
  session: ProductionSession,
  forecastInput: RecipeInput,
  forecastResult: RecipeResult,
  targetBatchGrams: number,
  pendingRebalance: ProductionRescueCandidateSeed | null,
): ProductionRescueDiagnostics {
  const fixedTargetRebalance = pendingRebalance
    ? (() => {
        const result = calculateRecipe(pendingRebalance.input);
        const hardSafety = assessProductionHardSafety(pendingRebalance.input, result);
        const authority = productionRescueTerminalAuthority(pendingRebalance.input, session);
        return {
          attempted: true as const,
          candidateMassG: result.total_batch_g,
          violationDetails: violationDiagnosticsFor(result),
          capacityExceeded: hardSafety.capacityExceeded,
          provisional: hardSafety.provisional,
          nativeProfileValidated: hardSafety.nativeProfileValidated,
          terminalIssueCodes: authority.issues.map((issue) => issue.code),
        };
      })()
    : null;
  return {
    physicalConfirmedG: session.lines.reduce(
      (sum, line) => sum + (line.confirmed ? line.physicalAddedGrams : 0),
      0,
    ),
    forecastMassG: forecastResult.total_batch_g,
    originalTargetG: targetBatchGrams,
    machineCapacityG: forecastInput.machine_capacity_grams,
    forecastViolationDetails: violationDiagnosticsFor(forecastResult),
    fixedTargetRebalance,
    irreducibleConfirmedViolations: confirmedPhysicalFloorDiagnostics(
      session,
      forecastInput,
      targetBatchGrams,
    ),
  };
}

/**
 * Convert a solver rescue into the actual whole-gram plan the operator will
 * execute. Confirmed physical history stays in `ProductionSession`; this copy
 * deliberately represents final planned targets so Engine evaluates exactly
 * the same vector that the UI and Apply use.
 */
export function practicalizeProductionRescueCandidate(
  session: ProductionSession,
  exactCandidate: RecipeInput,
  targetBatchGrams: number,
): ReturnType<typeof practicalizeRecipeCandidate> {
  const exactPlanningCandidate: RecipeInput = {
    ...exactCandidate,
    target_batch_grams: targetBatchGrams,
    items: exactCandidate.items.map((item) => ({
      ...item,
      planned_grams: item.actual_grams ?? item.planned_grams,
      actual_grams: null,
      lock_type: item.lock_type === 'already_added' ? 'unlocked' : item.lock_type,
    })),
  };
  return practicalizeRecipeCandidate(
    exactPlanningCandidate,
    productionConstraintSet(session, exactPlanningCandidate),
  );
}

/**
 * Physical Production entries already support 0.1 g precision (the owner case
 * itself contains 58.5 g). An Engine recovery may therefore remain a tenth-
 * gram execution plan instead of being distorted by the separate whole-gram
 * recipe-publication model. This is validation only: the candidate still comes
 * from Engine Rescue and is re-run by the canonical Engine here.
 */
function tenthGramProductionAudit(
  session: ProductionSession,
  exactCandidate: RecipeInput,
): ProductionTenthGramAudit | null {
  const baseExecutableInput: RecipeInput = {
    ...exactCandidate,
    items: exactCandidate.items.map((item) => ({
      ...item,
      planned_grams: canonicalProductionTenthGram(item.actual_grams ?? item.planned_grams),
      actual_grams: null,
      lock_type: item.lock_type === 'already_added' ? 'unlocked' : item.lock_type,
    })),
  };
  const physicalById = new Map(
    session.lines.map((line) => [line.lineId, line.physicalAddedGrams] as const),
  );
  let executableCandidates = [baseExecutableInput];
  for (const [index, item] of baseExecutableInput.items.entries()) {
    if (!isTemplateControlledStabilizer(item.ingredient)) continue;
    const physicalFloor = physicalById.get(item.id) ?? 0;
    // The whole-gram stabilizer rule belongs to recipe publication, not to a
    // physical Production correction. Once a stabilizer has been weighed at
    // supported 0.1 g precision, replacing that truth with 3 → 4 g can make a
    // safe continuation or proportional restore disappear. Keep the exact
    // tenth-gram target for physically present stabilizers; retain the legacy
    // whole-gram choices for still-unweighed recipe-plan lines.
    const choices = (
      physicalFloor > PRODUCTION_GRAMS_EPSILON
        ? [item.planned_grams]
        : [
            Math.round(item.planned_grams),
            Math.floor(item.planned_grams),
            Math.ceil(item.planned_grams),
          ]
    ).filter(
      (grams, position, values) =>
        grams > 0 &&
        Math.abs(grams * 10 - Math.round(grams * 10)) <= 1e-8 &&
        grams + PRODUCTION_GRAMS_EPSILON >= physicalFloor &&
        values.indexOf(grams) === position,
    );
    executableCandidates = executableCandidates
      .flatMap((candidate) =>
        choices.map((grams) => ({
          ...candidate,
          items: candidate.items.map((candidateItem, candidateIndex) =>
            candidateIndex === index ? { ...candidateItem, planned_grams: grams } : candidateItem,
          ),
        })),
      )
      .slice(0, 128);
  }
  const exactResult = calculateRecipe(exactCandidate);
  const exactHardMetrics = detectViolations(exactResult).map((violation) => violation.metric);
  executableCandidates = executableCandidates
    .map((candidate) => ({ ...candidate, target_batch_grams: totalFor(candidate) }))
    .sort(
      (left, right) =>
        left.items.reduce((sum, item, index) => {
          const exactItem = exactCandidate.items[index]!;
          return (
            sum + Math.abs(item.planned_grams - (exactItem.actual_grams ?? exactItem.planned_grams))
          );
        }, 0) -
        right.items.reduce((sum, item, index) => {
          const exactItem = exactCandidate.items[index]!;
          return (
            sum + Math.abs(item.planned_grams - (exactItem.actual_grams ?? exactItem.planned_grams))
          );
        }, 0),
    );
  for (const executableInput of executableCandidates) {
    if (
      executableInput.items.some(
        (item) => Math.abs(item.planned_grams * 10 - Math.round(item.planned_grams * 10)) > 1e-8,
      )
    ) {
      continue;
    }
    const constraints = productionConstraintSet(session, executableInput);
    if (!verifyConstraintsPreserved(constraints, executableInput).ok) continue;
    const executableResult = calculateRecipe(executableInput);
    const executableHardMetrics = detectViolations(executableResult).map(
      (violation) => violation.metric,
    );
    if (executableHardMetrics.length > 0) continue;
    return {
      modelVersion: 'production-tenth-gram-v1',
      exactInput: exactCandidate,
      exactResult,
      executableInput,
      executableResult,
      lines: executableInput.items.map((item) => {
        const exact = exactCandidate.items.find((candidate) => candidate.id === item.id)!;
        const exactGrams = exact.actual_grams ?? exact.planned_grams;
        return {
          lineId: item.id,
          ingredientName: item.ingredient.name,
          exactGrams,
          practicalGrams: item.planned_grams,
          deltaGrams: item.planned_grams - exactGrams,
          residualAdjusted: false,
          protection: session.lines.some(
            (line) => line.lineId === item.id && line.physicalAddedGrams > PRODUCTION_GRAMS_EPSILON,
          )
            ? 'physical'
            : 'editable',
        };
      }),
      targetBatchGrams: executableInput.target_batch_grams,
      exactTotalGrams: exactResult.total_batch_g,
      executableTotalGrams: executableResult.total_batch_g,
      residualBeforeReconciliationGrams: 0,
      residualAfterReconciliationGrams: 0,
      exactHardMetrics,
      executableHardMetrics,
      hardGatePassed: true,
    };
  }
  return null;
}

function instructionsFor(
  before: RecipeInput,
  after: RecipeInput,
  actions: readonly CorrectionAction[],
): ProductionRescueInstruction[] {
  const beforeById = new Map(before.items.map((item) => [item.id, item]));
  const actionNameByLine = new Map(
    actions
      .filter((action) => action.target_line_id)
      .map((action) => [action.target_line_id!, action.ingredient_name]),
  );
  const instructions: ProductionRescueInstruction[] = [];
  for (const item of after.items) {
    const beforeItem = beforeById.get(item.id);
    const beforeGrams = beforeItem ? (beforeItem.actual_grams ?? beforeItem.planned_grams) : 0;
    const afterGrams = item.actual_grams ?? item.planned_grams;
    const delta = afterGrams - beforeGrams;
    if (Math.abs(delta) <= PRODUCTION_GRAMS_EPSILON) continue;
    instructions.push({
      lineId: beforeItem ? item.id : null,
      ingredientName: actionNameByLine.get(item.id) ?? item.ingredient.name,
      kind: delta > 0 ? 'add' : 'reduce_pending_plan',
      grams: Math.abs(delta),
      finalTargetGrams: afterGrams,
    });
  }
  return instructions.sort(
    (a, b) =>
      (a.kind === 'add' ? 0 : 1) - (b.kind === 'add' ? 0 : 1) ||
      a.ingredientName.localeCompare(b.ingredientName),
  );
}

function bestOption(
  id: Exclude<ProductionRescueOptionId, 'leave_as_is'>,
  /**
   * OWNER RULE §14/§16/§17 — the operator is told the exact verified mass, not
   * a generic direction. The batch size is part of the decision, so it is part
   * of the CTA. Nothing is rounded to a "nice" number for presentation.
   */
  title: (finalMassG: number) => string,
  explanation: (finalMassG: number) => string,
  session: ProductionSession,
  forecastInput: RecipeInput,
  context: 'planning' | 'actual_batch',
  acceptMass: (mass: number) => boolean,
  recoveryObjective: 'minimum_safe' | 'restore_original_profile' | null = null,
  seededCandidates: readonly ProductionRescueCandidateSeed[] = [],
): { option: ProductionRescueOption | null; trace: ProductionRescueStrategyTrace } {
  const canonicalPlan = currentCanonicalProductionPlan(session);
  const authorityIssueSets = new Map<string, string[]>();
  const proposed = proposeAutoFix({
    input: forecastInput,
    context,
    exactCorrectionGrams: true,
    maxProposals: 12,
  });
  const solverCandidates = proposed.redacted
    ? []
    : proposed.proposals.flatMap((proposal) => {
        if (proposal.kind !== 'correction' || proposal.actions.length === 0) return [];
        const input = candidateFromProposal(forecastInput, proposal, context);
        return input ? [{ input, actions: proposal.actions, precision: 'whole' as const }] : [];
      });
  const acceptRecoveryCandidate = ({ input }: { input: RecipeInput }): boolean => {
    const audit = tenthGramProductionAudit(session, input);
    if (!audit?.hardGatePassed) return false;
    const executable = audit.executableInput;
    if (!preservesPhysicalReality(session, executable)) return false;
    const mass = totalFor(executable);
    if (!acceptMass(mass) || !nativeSafe(executable, audit.executableResult)) return false;
    const authority = productionRescueTerminalAuthority(executable, session);
    const issueCodes = authority.issues.map((issue) => issue.code).sort();
    authorityIssueSets.set(issueCodes.join('|'), issueCodes);
    return authority.valid;
  };
  const recovery = recoveryObjective
    ? proposeBatchRecovery({
        input: forecastInput,
        baselineInput: canonicalPlan,
        objective: recoveryObjective,
        acceptCandidate: acceptRecoveryCandidate,
      })
    : null;
  const completedCandidates = [
    ...seededCandidates,
    ...solverCandidates,
    ...(recovery?.candidates.map((candidate) => ({
      input: candidate.input,
      actions: candidate.actions,
      precision: 'tenth' as const,
    })) ?? []),
  ];
  const candidates: ProductionRescueOption[] = [];
  for (const completed of completedCandidates) {
    if (context === 'actual_batch' && completed.actions.some((action) => action.type !== 'add'))
      continue;
    const exactCandidateInput = foldCanonicalTopUps(forecastInput, completed.input);
    if (!exactCandidateInput || !preservesPhysicalReality(session, exactCandidateInput)) continue;
    const exactMass = totalFor(exactCandidateInput);
    if (completed.precision === 'tenth') {
      const audit = tenthGramProductionAudit(session, exactCandidateInput);
      if (!audit?.hardGatePassed) continue;
      const candidateInput = audit.executableInput;
      if (!preservesPhysicalReality(session, candidateInput)) continue;
      const mass = totalFor(candidateInput);
      if (!acceptMass(mass) || !nativeSafe(candidateInput, audit.executableResult)) continue;
      if (!terminallyAuthorized(candidateInput, session)) continue;
      const score = recipeFitForInput(candidateInput, audit.executableResult);
      candidates.push({
        id,
        title: title(mass),
        explanation: explanation(mass),
        finalMassG: mass,
        scoreDisplay: score.display,
        exactCandidateInput,
        candidateInput,
        practicalAudit: audit,
        instructions: instructionsFor(forecastInput, candidateInput, completed.actions),
        verifiedByEngine: true,
      });
      continue;
    }
    const practicalTargets =
      id === 'keep_original_batch'
        ? [canonicalPlan.target_batch_grams]
        : [
            ...new Set([
              Math.round(exactMass),
              Math.ceil(exactMass),
              Math.floor(exactMass),
              ...Array.from({ length: 11 }, (_, offset) => Math.ceil(exactMass) + offset),
            ]),
          ].sort((left, right) => Math.abs(left - exactMass) - Math.abs(right - exactMass));
    for (const practicalTarget of practicalTargets) {
      const practical = practicalizeProductionRescueCandidate(
        session,
        exactCandidateInput,
        practicalTarget,
      );
      if (!practical.ok) continue;
      const candidateInput = practical.audit.executableInput;
      if (!preservesPhysicalReality(session, candidateInput)) continue;
      const mass = totalFor(candidateInput);
      if (!acceptMass(mass)) continue;
      const result = practical.audit.executableResult;
      if (!nativeSafe(candidateInput, result)) continue;
      if (!terminallyAuthorized(candidateInput, session)) continue;
      const score = recipeFitForInput(candidateInput, result);
      candidates.push({
        id,
        title: title(mass),
        explanation: explanation(mass),
        finalMassG: mass,
        scoreDisplay: score.display,
        exactCandidateInput,
        candidateInput,
        practicalAudit: practical.audit,
        instructions: instructionsFor(forecastInput, candidateInput, completed.actions),
        verifiedByEngine: true,
      });
    }
  }
  candidates.sort(
    (a, b) =>
      a.finalMassG - b.finalMassG ||
      a.instructions.reduce((sum, instruction) => sum + instruction.grams, 0) -
        b.instructions.reduce((sum, instruction) => sum + instruction.grams, 0),
  );
  return {
    option: candidates[0] ?? null,
    trace: {
      solverProposalCount: proposed.redacted ? 0 : proposed.proposals.length,
      evaluatedCandidateCount: recovery?.trace.evaluatedCandidateCount ?? 0,
      generatedSafeCandidateCount:
        solverCandidates.length + (recovery?.trace.hardSafeCandidateCount ?? 0),
      acceptedCandidateCount: candidates.length,
      hardReasonSets: recovery?.trace.uniqueHardReasonSets ?? [],
      authorityIssueSets: [...authorityIssueSets.values()],
      finalCandidateGrams: candidates.map((candidate) => candidate.finalMassG),
    },
  };
}

const emptyStrategyTrace = (): ProductionRescueStrategyTrace => ({
  solverProposalCount: 0,
  evaluatedCandidateCount: 0,
  generatedSafeCandidateCount: 0,
  acceptedCandidateCount: 0,
  hardReasonSets: [],
  authorityIssueSets: [],
  finalCandidateGrams: [],
});

/**
 * Product-layer rescue orchestration. It never invents quantities: every
 * exposed candidate was generated and re-run by the existing Engine. Options
 * that cannot be proven safe are omitted rather than rendered disabled.
 */
export function assessProductionRescue(session: ProductionSession): ProductionRescueAssessment {
  const forecastInput = buildProductionForecastInput(session);
  const forecastResult = calculateRecipe(forecastInput);
  const forecastScore = recipeFitForInput(forecastInput, forecastResult);
  const hardSafety = assessProductionHardSafety(forecastInput, forecastResult);
  const currentTarget = currentCanonicalProductionPlan(session).target_batch_grams;
  const hasConfirmedDeviation = session.lines.some(
    (line) =>
      line.confirmed &&
      Math.abs(line.physicalAddedGrams - line.plannedGrams) > PRODUCTION_GRAMS_EPSILON,
  );
  if (!hasConfirmedDeviation) {
    return {
      state: 'not_needed',
      forecastInput,
      forecastResult,
      forecastScoreDisplay: forecastScore.display,
      hardSafety,
      hasConfirmedDeviation,
      options: [],
      reason: null,
      strategyTrace: {},
      diagnostics: productionRescueDiagnostics(
        session,
        forecastInput,
        forecastResult,
        currentTarget,
        null,
      ),
    };
  }

  const options: ProductionRescueOption[] = [];
  const pendingRebalance = pendingPlanRebalanceCandidate(session, forecastInput, currentTarget);
  const keepSearch = bestOption(
    'keep_original_batch',
    (mass) => `Napraw do ${formatBatchMassG(mass)} g`,
    () => 'Zmienia wyłącznie to, czego jeszcze nie potwierdzono, i zachowuje docelową masę partii.',
    session,
    forecastInput,
    'planning',
    (mass) => Math.abs(mass - currentTarget) <= 0.1,
    null,
    pendingRebalance ? [pendingRebalance] : [],
  );
  if (keepSearch.option) options.push(keepSearch.option);

  const enlargeSearch = hardSafety.safe
    ? { option: null, trace: emptyStrategyTrace() }
    : bestOption(
        'enlarge_batch',
        (mass) => `Minimalna bezpieczna korekta · ${formatBatchMassG(mass)} g`,
        (mass) =>
          `Najmniejsza bezpieczna partia powyżej ${formatBatchMassG(currentTarget)} g ` +
          `dla tego, co jest już w naczyniu: ${formatBatchMassG(mass)} g.`,
        session,
        forecastInput,
        'actual_batch',
        (mass) => mass > currentTarget + 0.1,
        'minimum_safe',
      );
  if (enlargeSearch.option) options.push(enlargeSearch.option);

  const restoreSearch = bestOption(
    'restore_original_recipe',
    (mass) => `Przywróć oryginalną recepturę · ${formatBatchMassG(mass)} g`,
    (mass) =>
      `Przywraca lub skaluje wyjściową recepturę do ${formatBatchMassG(mass)} g i może ponownie ` +
      'otworzyć potwierdzone produkty wyłącznie jako dodatnie dolewki.',
    session,
    forecastInput,
    'actual_batch',
    (mass) => mass + PRODUCTION_GRAMS_EPSILON >= currentTarget,
    'restore_original_profile',
  );
  if (restoreSearch.option) options.push(restoreSearch.option);

  if (hardSafety.safe) {
    let continuationAudit: ProductionRescueExecutionAudit | null = tenthGramProductionAudit(
      session,
      forecastInput,
    );
    if (!continuationAudit) {
      const practical = practicalizeProductionRescueCandidate(
        session,
        forecastInput,
        Math.round(totalFor(forecastInput)),
      );
      continuationAudit = practical.ok ? practical.audit : null;
    }
    if (
      continuationAudit &&
      preservesPhysicalReality(session, continuationAudit.executableInput) &&
      nativeSafe(continuationAudit.executableInput, continuationAudit.executableResult) &&
      terminallyAuthorized(continuationAudit.executableInput, session)
    ) {
      const candidateInput = continuationAudit.executableInput;
      options.push({
        id: 'leave_as_is',
        title: 'Kontynuuj bez korekty',
        explanation:
          'Przewidywana gotowa partia pozostaje w zatwierdzonych zakresach technologicznych.',
        finalMassG: continuationAudit.executableResult.total_batch_g,
        scoreDisplay: recipeFitForInput(candidateInput, continuationAudit.executableResult).display,
        exactCandidateInput: forecastInput,
        candidateInput,
        practicalAudit: continuationAudit,
        instructions: instructionsFor(forecastInput, candidateInput, []),
        verifiedByEngine: true,
      });
    }
  }

  return {
    state: options.length > 0 ? 'options' : 'impossible',
    forecastInput,
    forecastResult,
    forecastScoreDisplay: forecastScore.display,
    hardSafety,
    hasConfirmedDeviation,
    options,
    reason:
      options.length > 0
        ? null
        : 'Brak bezpiecznej korekty, która zachowuje fizycznie dodane składniki i zatwierdzone zakresy receptury.',
    strategyTrace: {
      keep_original_batch: keepSearch.trace,
      enlarge_batch: enlargeSearch.trace,
      restore_original_recipe: restoreSearch.trace,
    },
    diagnostics: productionRescueDiagnostics(
      session,
      forecastInput,
      forecastResult,
      currentTarget,
      pendingRebalance,
    ),
  };
}
