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
  verifyConstraintsPreserved,
  type ConstraintSet,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import type { ProductionRescueStableOptionId } from '@/features/pro-core/productionContracts';
import {
  PRODUCTION_GRAMS_EPSILON,
  buildProductionForecastInput,
  type ProductionSession,
} from './productionSession';

export type ProductionRescueOptionId = ProductionRescueStableOptionId;

/**
 * Production-specific Rescue orchestration contract. Engine/config versions
 * continue to identify the formulas and calibrated data; this stamp identifies
 * the option-selection and practicalization layer authorized by the server.
 */
export const PRODUCTION_RESCUE_MODEL_VERSION = 'production-rescue-v2' as const;

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
}

export interface ProductionRescueStrategyTrace {
  solverProposalCount: number;
  evaluatedCandidateCount: number;
  generatedSafeCandidateCount: number;
  acceptedCandidateCount: number;
  hardReasonSets: string[][];
  finalCandidateGrams: number[];
}

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
 * itself contains 58.5 g). A minimum-material rescue may therefore remain a
 * tenth-gram execution plan instead of being distorted by the separate
 * whole-gram recipe-publication model. This is validation only: the candidate
 * still comes from Engine Rescue and is re-run by the canonical Engine here.
 */
function tenthGramProductionAudit(
  session: ProductionSession,
  exactCandidate: RecipeInput,
): ProductionTenthGramAudit | null {
  const executableInput: RecipeInput = {
    ...exactCandidate,
    items: exactCandidate.items.map((item) => ({
      ...item,
      planned_grams: item.actual_grams ?? item.planned_grams,
      actual_grams: null,
      lock_type: item.lock_type === 'already_added' ? 'unlocked' : item.lock_type,
    })),
  };
  executableInput.target_batch_grams = totalFor(executableInput);
  if (
    executableInput.items.some(
      (item) => Math.abs(item.planned_grams * 10 - Math.round(item.planned_grams * 10)) > 1e-8,
    )
  ) {
    return null;
  }
  const constraints = productionConstraintSet(session, executableInput);
  if (!verifyConstraintsPreserved(constraints, executableInput).ok) return null;
  const exactResult = calculateRecipe(exactCandidate);
  const executableResult = calculateRecipe(executableInput);
  const exactHardMetrics = detectViolations(exactResult).map((violation) => violation.metric);
  const executableHardMetrics = detectViolations(executableResult).map(
    (violation) => violation.metric,
  );
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
    hardGatePassed: executableHardMetrics.length === 0,
  };
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
): { option: ProductionRescueOption | null; trace: ProductionRescueStrategyTrace } {
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
  const recovery = recoveryObjective
    ? proposeBatchRecovery({
        input: forecastInput,
        baselineInput: session.plannedInput,
        objective: recoveryObjective,
      })
    : null;
  const completedCandidates = [
    ...solverCandidates,
    ...(recovery?.candidates.map((candidate) => ({
      input: candidate.input,
      actions: candidate.actions,
      precision: recoveryObjective === 'minimum_safe' ? ('tenth' as const) : ('whole' as const),
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
        ? [session.plannedInput.target_batch_grams]
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
      finalCandidateGrams: candidates.map((candidate) => candidate.finalMassG),
    },
  };
}

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
    };
  }

  const options: ProductionRescueOption[] = [];
  const originalTarget = session.plannedInput.target_batch_grams;
  const shouldOfferRecovery =
    !nativeSafe(forecastInput, forecastResult) || forecastScore.display !== '10/10';
  const keepSearch = bestOption(
    'keep_original_batch',
    (mass) => `Napraw do ${formatBatchMassG(mass)} g`,
    () => 'Zmienia wyłącznie to, czego jeszcze nie potwierdzono, i zachowuje docelową masę partii.',
    session,
    forecastInput,
    'planning',
    (mass) => Math.abs(mass - originalTarget) <= 0.1,
  );
  if (shouldOfferRecovery && keepSearch.option) options.push(keepSearch.option);

  const enlargeSearch = bestOption(
    'enlarge_batch',
    (mass) => `Minimalna bezpieczna korekta · ${formatBatchMassG(mass)} g`,
    (mass) =>
      `Najmniejsza bezpieczna partia powyżej ${formatBatchMassG(originalTarget)} g ` +
      `dla tego, co jest już w naczyniu: ${formatBatchMassG(mass)} g.`,
    session,
    forecastInput,
    'actual_batch',
    (mass) => mass > originalTarget + 0.1,
    'minimum_safe',
  );
  if (shouldOfferRecovery && enlargeSearch.option) options.push(enlargeSearch.option);

  const restoreSearch = bestOption(
    'restore_original_recipe',
    (mass) => `Przywróć oryginalną recepturę · ${formatBatchMassG(mass)} g`,
    (mass) =>
      `Skaluje wyjściową recepturę do ${formatBatchMassG(mass)} g i może ponownie ` +
      'otworzyć potwierdzone produkty wyłącznie jako dodatnie dolewki.',
    session,
    forecastInput,
    'actual_batch',
    (mass) => mass > originalTarget + 0.1,
    'restore_original_profile',
  );
  if (shouldOfferRecovery && restoreSearch.option) options.push(restoreSearch.option);

  if (nativeSafe(forecastInput, forecastResult)) {
    const practical = practicalizeProductionRescueCandidate(
      session,
      forecastInput,
      Math.round(totalFor(forecastInput)),
    );
    if (
      practical.ok &&
      nativeSafe(practical.audit.executableInput, practical.audit.executableResult)
    ) {
      const candidateInput = practical.audit.executableInput;
      options.push({
        id: 'leave_as_is',
        title: 'Kontynuuj bez korekty',
        explanation:
          'Przewidywana gotowa partia pozostaje w zatwierdzonych zakresach technologicznych.',
        finalMassG: practical.audit.executableResult.total_batch_g,
        scoreDisplay: recipeFitForInput(candidateInput, practical.audit.executableResult).display,
        exactCandidateInput: forecastInput,
        candidateInput,
        practicalAudit: practical.audit,
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
  };
}
