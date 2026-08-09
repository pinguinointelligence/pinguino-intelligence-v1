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
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';
import {
  PRODUCTION_GRAMS_EPSILON,
  buildProductionForecastInput,
  type ProductionSession,
} from './productionSession';

export type ProductionRescueOptionId = 'keep_original_batch' | 'enlarge_batch' | 'leave_as_is';

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
  candidateInput: RecipeInput;
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

const totalFor = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + (item.actual_grams ?? item.planned_grams), 0);

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
    const beforeGrams = beforeItem
      ? (beforeItem.actual_grams ?? beforeItem.planned_grams)
      : 0;
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
  title: string,
  explanation: string,
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
    if (context === 'actual_batch' && proposal.actions.some((action) => action.type !== 'add')) continue;
    const candidateInput = candidateFromProposal(forecastInput, proposal, context);
    if (!candidateInput || !preservesPhysicalReality(session, candidateInput)) continue;
    const mass = totalFor(candidateInput);
    if (!acceptMass(mass)) continue;
    const result = calculateRecipe(candidateInput);
    if (!nativeSafe(candidateInput, result)) continue;
    const score = recipeFitForInput(candidateInput, result);
    candidates.push({
      id,
      title,
      explanation,
      finalMassG: mass,
      scoreDisplay: score.display,
      candidateInput,
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
    'Skoryguj pozostałe',
    'Zmienia wyłącznie to, czego jeszcze nie potwierdzono, i zachowuje docelową masę partii.',
    session,
    forecastInput,
    'planning',
    (mass) => Math.abs(mass - originalTarget) <= 0.1,
  );
  if (keep) options.push(keep);

  const enlarge = bestOption(
    'enlarge_batch',
    'Powiększ partię',
    'Pokazuje najmniejszą znalezioną, zweryfikowaną przez Engine większą partię.',
    session,
    forecastInput,
    'actual_batch',
    (mass) => mass > originalTarget + 0.1,
  );
  if (enlarge) options.push(enlarge);

  if (nativeSafe(forecastInput, forecastResult)) {
    options.push({
      id: 'leave_as_is',
      title: 'Zostaw tak',
      explanation: 'Przewidywana gotowa partia pozostaje w zatwierdzonych zakresach technologicznych.',
      finalMassG: forecastResult.total_batch_g,
      scoreDisplay: forecastScore.display,
      candidateInput: forecastInput,
      instructions: [],
      verifiedByEngine: true,
    });
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
