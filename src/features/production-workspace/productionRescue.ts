import {
  applyAutoFix,
  calculateRecipe,
  detectViolations,
  proposeAutoFix,
  type CorrectionAction,
  type CorrectionProposal,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  practicalizeRecipeCandidate,
  type PracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import type { ConstraintSet, IngredientConstraint } from '@/features/recipe-constraints';
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
export const PRODUCTION_RESCUE_MODEL_VERSION = 'production-rescue-v1' as const;

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
  practicalAudit: PracticalRecipeAudit;
  instructions: ProductionRescueInstruction[];
  verifiedByEngine: true;
}

export interface ProductionRescueAssessment {
  state: 'not_needed' | 'options' | 'impossible';
  forecastInput: RecipeInput;
  forecastResult: RecipeResult;
  forecastScoreDisplay: string;
  hasConfirmedDeviation: boolean;
  options: ProductionRescueOption[];
  reason: string | null;
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

function nativeSafe(input: RecipeInput, result: RecipeResult): boolean {
  if (detectViolations(result).length > 0) return false;
  if (
    result.indicators.some(
      (indicator) =>
        indicator.category_fallback ||
        indicator.temperature_fallback ||
        indicator.band_status === 'estimated',
    )
  ) {
    return false;
  }
  if (
    input.machine_capacity_grams !== null &&
    result.total_batch_g > input.machine_capacity_grams + PRODUCTION_GRAMS_EPSILON
  ) {
    return false;
  }
  return recipeFitForInput(input, result).validatedNative;
}

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
): ProductionRescueOption | null {
  const proposed = proposeAutoFix({
    input: forecastInput,
    context,
    exactCorrectionGrams: true,
    maxProposals: 6,
  });
  if (proposed.redacted) return null;
  const candidates: ProductionRescueOption[] = [];
  for (const proposal of proposed.proposals) {
    if (proposal.kind !== 'correction' || proposal.actions.length === 0) continue;
    if (context === 'actual_batch' && proposal.actions.some((action) => action.type !== 'add'))
      continue;
    const exactCandidateInput = candidateFromProposal(forecastInput, proposal, context);
    if (!exactCandidateInput || !preservesPhysicalReality(session, exactCandidateInput)) continue;
    const exactMass = totalFor(exactCandidateInput);
    const practical = practicalizeProductionRescueCandidate(
      session,
      exactCandidateInput,
      id === 'keep_original_batch'
        ? session.plannedInput.target_batch_grams
        : Math.round(exactMass),
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
      instructions: instructionsFor(forecastInput, candidateInput, proposal.actions),
      verifiedByEngine: true,
    });
  }
  candidates.sort(
    (a, b) =>
      a.finalMassG - b.finalMassG ||
      a.instructions.reduce((sum, instruction) => sum + instruction.grams, 0) -
        b.instructions.reduce((sum, instruction) => sum + instruction.grams, 0),
  );
  return candidates[0] ?? null;
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
      hasConfirmedDeviation,
      options: [],
      reason: null,
    };
  }

  const options: ProductionRescueOption[] = [];
  const originalTarget = session.plannedInput.target_batch_grams;
  const keep = bestOption(
    'keep_original_batch',
    (mass) => `Napraw do ${formatBatchMassG(mass)} g`,
    () => 'Zmienia wyłącznie to, czego jeszcze nie potwierdzono, i zachowuje docelową masę partii.',
    session,
    forecastInput,
    'planning',
    (mass) => Math.abs(mass - originalTarget) <= 0.1,
  );
  if (keep) options.push(keep);

  const enlarge = bestOption(
    'enlarge_batch',
    (mass) => `Powiększ do ${formatBatchMassG(mass)} g`,
    (mass) =>
      `Najmniejsza partia powyżej ${formatBatchMassG(originalTarget)} g, którą Engine potwierdził ` +
      `dla tego, co jest już w naczyniu: ${formatBatchMassG(mass)} g.`,
    session,
    forecastInput,
    'actual_batch',
    (mass) => mass > originalTarget + 0.1,
  );
  if (enlarge) options.push(enlarge);

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
    hasConfirmedDeviation,
    options,
    reason:
      options.length > 0
        ? null
        : 'Brak zweryfikowanej korekty, która zachowuje fizycznie dodane składniki i natywne zakresy Engine.',
  };
}
