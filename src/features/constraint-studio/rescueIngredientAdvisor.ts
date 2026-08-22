import {
  calculateRecipe,
  DEFAULT_CORRECTION_CANDIDATES,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  VEGAN_VERIFIED_CANONICAL_IDS,
  VERIFIED_VEGAN_FORMULATION_CANDIDATES,
} from '@/data/ingredients/verifiedVeganToolbox';
import { VERIFIED_PROTEIN_FORMULATION_CANDIDATES } from '@/data/ingredients/verifiedProteinToolbox';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { canonicalToolboxIdentity } from '@/features/formulation/toolboxCanonical';
import { assessProteinTarget } from '@/features/protein-gelato/proteinTarget';
import {
  assessRecipeDirection,
  type RecipeDirectionAssessment,
} from '@/features/recipe-direction/recipeDirectionAssessment';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  buildOptimizePreview,
  type ConstraintPreview,
  type OptimizePreviewOptions,
} from './applyPipeline';

/**
 * GLOBAL RESCUE INGREDIENT ADVISOR (owner authority 2026-08-22) — ONE shared
 * Engine capability for Gelato, Sorbet, Vegan and Protein.
 *
 * When the exact Direction target cannot be reached with the CURRENT
 * ingredients, PI does not simply stop: it evaluates, by SIMULATION only,
 * whether adding ONE new legal ingredient would materially improve the
 * achievable result. For every allowed candidate of the profile's small
 * approved family:
 *
 *   current recipe + candidate line → the normal legal optimization
 *   (`buildOptimizePreview`, every Main / Multi-Main ratio / gram lock /
 *   percent lock / exclusion / ProductBehavior / profile hard gate intact)
 *   → the executable Preview's own Direction assessment and target distance
 *
 * and compares that against the best candidate reachable with the current
 * ingredients. A recommendation is returned ONLY when the simulation proves a
 * material improvement; otherwise the honest answer is "no recommendation".
 * Nothing here is a heuristic ("try fructose"), nothing is hardcoded per
 * score, and the advisor NEVER adds an ingredient: the user adds it through
 * the normal ingredient flow and runs a NEW Preview.
 *
 * Determinism / bounds: a fixed, ordered candidate family per profile, capped
 * at `MAX_RESCUE_CANDIDATES`, each simulated exactly once with the same
 * deterministic optimizer. No Mapper scan, no network, no paid calls.
 */

/** Deterministic simulation budget (ingredients tried per Przelicz). */
export const MAX_RESCUE_CANDIDATES = 4;

/**
 * MATERIAL-IMPROVEMENT EVIDENCE (not a band, not a score floor): a rescue is
 * recommended when the simulated Preview reaches MORE Direction axes (higher
 * owner score), or — at the same score — cuts the remaining target distance
 * (Engine severity of the exact-target bands) at least in HALF and by at least
 * `MIN_ABSOLUTE_SEVERITY_GAIN` points. Equal or negligible outcomes are never
 * shown ("8/10 → 8/10: do not recommend").
 */
export const MATERIAL_RELATIVE_SEVERITY_GAIN = 0.5;
export const MIN_ABSOLUTE_SEVERITY_GAIN = 0.2;

export interface RescueCandidateIngredient {
  /** Stable canonical identity (Mapper `PI-ING-…` id when bound). */
  canonicalIngredientId: string;
  /** Polish display name used in the hint. */
  namePl: string;
  ingredient: EngineIngredient;
  /** Provenance of the approved payload. */
  source: 'formulation_toolbox' | 'verified_vegan_toolbox' | 'verified_protein_toolbox';
}

export interface RescueOutcomeMeasure {
  score: number | null;
  reachedAxisCount: number;
  supportedAxisCount: number;
  severityPoints: number;
}

export interface RescueIngredientAdvice {
  candidate: RescueCandidateIngredient;
  /** Best outcome reachable with the CURRENT ingredients (the staged candidate
   * or, without one, the unchanged draft). */
  current: RescueOutcomeMeasure;
  /** Outcome of the simulated legal optimization with the candidate added. */
  rescue: RescueOutcomeMeasure;
  /** Whole grams the simulation actually used for the candidate line. */
  simulatedGrams: number;
  /** Short truthful reason for the UI. */
  reasonPl: string;
  /** Candidates simulated (for provenance / QA), in deterministic order. */
  simulatedCandidateIds: string[];
}

/** Per-candidate simulation outcome — QA/provenance evidence of the decision. */
export interface RescueSimulationRecord {
  canonicalIngredientId: string;
  namePl: string;
  outcome:
    | 'recommended'
    | 'not_material'
    | 'unused'
    | 'hard_gate'
    | 'protein_authority'
    | 'no_preview';
  /** Optimizer failure code / diagnostic reason when no legal preview exists. */
  code?: string;
  simulatedGrams: number;
  rescue: RescueOutcomeMeasure | null;
}

export interface RescueAdvisorReport {
  advice: RescueIngredientAdvice | null;
  current: RescueOutcomeMeasure | null;
  simulations: RescueSimulationRecord[];
}

export interface RescueAdvisorArgs {
  input: RecipeInput;
  set: ConstraintSet;
  createdAt: string;
  options: OptimizePreviewOptions;
  /** The best candidate reachable with current ingredients (preview or the
   * consent candidate), or null when the optimizer returned no correction. */
  bestCurrent: ConstraintPreview | null;
  /** Test/QA seam: override the candidate family (deterministic order). */
  candidates?: readonly RescueCandidateIngredient[];
}

const RESCUE_LINE_PREFIX = 'rescue-sim:';

const toolboxCandidate = (toolboxId: string): RescueCandidateIngredient | null => {
  const identity = canonicalToolboxIdentity(toolboxId);
  const payloads = approvedFormulationToolboxIngredients(toolboxId);
  // The science-frozen toolbox payload (built-in id) is what the optimizer
  // simulates; the canonical Mapper identity is what the hint names. A
  // simulated line carries no ProductBehavior snapshot — the real line the
  // user adds through the picker does.
  const ingredient = payloads[0];
  if (!identity || !ingredient) return null;
  return {
    canonicalIngredientId: identity.mapperId,
    namePl: identity.namePl,
    ingredient,
    source: 'formulation_toolbox',
  };
};

const isCategoryAllowed = (toolboxId: string, category: RecipeInput['category']): boolean => {
  const candidate = DEFAULT_CORRECTION_CANDIDATES.find((entry) => entry.id === toolboxId);
  if (!candidate) return false;
  return !candidate.allowed_categories || candidate.allowed_categories.includes(category);
};

/**
 * Ordered candidate family for a profile — small, approved, deterministic.
 * The ORDER follows the missed Direction axes (which lever the Engine is most
 * likely to need), the simulation alone decides whether anything is shown.
 */
export function rescueCandidateFamily(
  input: RecipeInput,
  assessment: RecipeDirectionAssessment | null,
): RescueCandidateIngredient[] {
  const missed = assessment?.residuals.filter((residual) => !residual.reached) ?? [];
  const needsMorePod = missed.some((r) => r.axis === 'sweetness' && r.side === 'below');
  const needsLessPod = missed.some((r) => r.axis === 'sweetness' && r.side === 'above');
  const needsMoreNpac = missed.some((r) => r.axis === 'softness' && r.side === 'below');
  const needsLessNpac = missed.some((r) => r.axis === 'softness' && r.side === 'above');
  const ordered: string[] = [];
  const push = (...ids: string[]) => {
    for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  };
  // Sugar levers first when the target asks for more sweetness or more
  // freezing-point depression; diluents / body when it asks for less.
  if (needsMorePod || needsMoreNpac) push('dextrose', 'sucrose');
  if (needsLessPod || needsLessNpac) push('water', 'inulin', 'milk_3_5', 'smp');
  push('dextrose', 'sucrose', 'inulin', 'water', 'smp', 'milk_3_5', 'cream_30');

  const family: RescueCandidateIngredient[] = [];
  if (input.category === 'vegan_gelato') {
    // VEGAN: only VEGAN_VERIFIED identities — never VEGAN_FALSE / UNKNOWN /
    // CONFLICT. The verified vegan toolbox is the complete candidate universe.
    for (const id of ordered) {
      const candidate = toolboxCandidate(id);
      if (candidate && VEGAN_VERIFIED_CANONICAL_IDS.has(candidate.canonicalIngredientId)) {
        family.push(candidate);
      }
    }
    for (const ingredient of VERIFIED_VEGAN_FORMULATION_CANDIDATES) {
      const canonical = ingredient.canonical_ingredient_id ?? ingredient.id;
      if (!VEGAN_VERIFIED_CANONICAL_IDS.has(canonical)) continue;
      if (family.some((entry) => entry.canonicalIngredientId === canonical)) continue;
      family.push({
        canonicalIngredientId: canonical,
        namePl: ingredient.name,
        ingredient,
        source: 'verified_vegan_toolbox',
      });
    }
    return family;
  }
  for (const id of ordered) {
    if (!isCategoryAllowed(id, input.category)) continue;
    const candidate = toolboxCandidate(id);
    if (candidate) family.push(candidate);
  }
  if (input.category === 'protein_gelato') {
    for (const ingredient of VERIFIED_PROTEIN_FORMULATION_CANDIDATES) {
      const canonical = ingredient.canonical_ingredient_id ?? ingredient.id;
      if (family.some((entry) => entry.canonicalIngredientId === canonical)) continue;
      family.push({
        canonicalIngredientId: canonical,
        namePl: ingredient.name,
        ingredient,
        source: 'verified_protein_toolbox',
      });
    }
  }
  return family;
}

export function measureRescueOutcome(input: RecipeInput): RescueOutcomeMeasure {
  const assessment = assessRecipeDirection(input, calculateRecipe(input));
  return {
    score: assessment.score,
    reachedAxisCount: assessment.reachedAxisCount,
    supportedAxisCount: assessment.supportedAxisCount,
    severityPoints: recipeDirectionViolations(input).reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    ),
  };
}

/** The evidence rule — exported so tests pin it. A higher owner score counts
 * only when the remaining target distance did not grow (reaching one axis by
 * pushing the other one further away is not an improvement). */
export function isMaterialRescueImprovement(
  current: RescueOutcomeMeasure,
  rescue: RescueOutcomeMeasure,
): boolean {
  if (rescue.reachedAxisCount > current.reachedAxisCount) {
    return rescue.severityPoints <= current.severityPoints + 1e-9;
  }
  if (rescue.reachedAxisCount < current.reachedAxisCount) return false;
  const gain = current.severityPoints - rescue.severityPoints;
  return (
    gain >= MIN_ABSOLUTE_SEVERITY_GAIN &&
    rescue.severityPoints <= current.severityPoints * (1 - MATERIAL_RELATIVE_SEVERITY_GAIN)
  );
}

const alreadyPresent = (input: RecipeInput, candidate: RescueCandidateIngredient): boolean =>
  input.items.some(
    (item) =>
      canonicalIngredientId(item.ingredient) === candidate.canonicalIngredientId ||
      item.ingredient.id === candidate.ingredient.id,
  );

const formatScore = (measure: RescueOutcomeMeasure): string =>
  measure.score === null ? '—' : `${measure.score}/10`;

/**
 * Run the bounded simulation and return a recommendation only with proof.
 * Pure and deterministic: same input → same advice. Never mutates the draft.
 */
export function assessRescueIngredientAdvice(
  args: RescueAdvisorArgs,
): RescueIngredientAdvice | null {
  return simulateRescueCandidates(args).advice;
}

/** The full evidence: the decision plus every simulated candidate's outcome. */
export function simulateRescueCandidates(args: RescueAdvisorArgs): RescueAdvisorReport {
  const { input, set, createdAt, options, bestCurrent } = args;
  const none = (current: RescueOutcomeMeasure | null): RescueAdvisorReport => ({
    advice: null,
    current,
    simulations: [],
  });
  if (input.goals?.direction_targets_active !== true) return none(null);
  if (input.items.some((item) => item.actual_grams !== null)) return none(null);
  const currentInput = bestCurrent?.proposedInput ?? input;
  const currentAssessment = assessRecipeDirection(currentInput, calculateRecipe(currentInput));
  if (!currentAssessment.active || currentAssessment.supportedAxisCount === 0) return none(null);
  const current = measureRescueOutcome(currentInput);
  // Current ingredients already achieve the target → nothing to rescue.
  if (currentAssessment.reached) return none(current);
  const currentProtein = assessProteinTarget(currentInput);

  const excluded = new Set(options.excludedIngredientIds ?? []);
  const family = (args.candidates ?? rescueCandidateFamily(input, currentAssessment)).filter(
    (candidate) =>
      !alreadyPresent(input, candidate) &&
      !excluded.has(candidate.canonicalIngredientId) &&
      !excluded.has(candidate.ingredient.id),
  );
  const simulated = family.slice(0, MAX_RESCUE_CANDIDATES);
  const simulatedCandidateIds = simulated.map((candidate) => candidate.canonicalIngredientId);

  const simulations: RescueSimulationRecord[] = [];
  const record = (
    candidate: RescueCandidateIngredient,
    outcome: RescueSimulationRecord['outcome'],
    simulatedGrams: number,
    rescue: RescueOutcomeMeasure | null,
    code?: string,
  ) =>
    simulations.push({
      canonicalIngredientId: candidate.canonicalIngredientId,
      namePl: candidate.namePl,
      outcome,
      ...(code ? { code } : {}),
      simulatedGrams,
      rescue,
    });
  let best: RescueIngredientAdvice | null = null;
  for (const candidate of simulated) {
    const lineId = `${RESCUE_LINE_PREFIX}${candidate.canonicalIngredientId}`;
    // The simulated line enters as a 0 g unlocked placeholder: the optimizer
    // may raise it; if it stays unused the executable projection OMITS it
    // (zero-gram executable invariant) and the simulation proves "no benefit".
    const simulatedInput: RecipeInput = {
      ...input,
      items: [
        ...input.items,
        {
          id: lineId,
          ingredient: candidate.ingredient,
          planned_grams: 0,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    };
    const built = buildOptimizePreview(simulatedInput, set, createdAt, {
      ...options,
      // No ProductBehavior authority exists yet for a line the user has not
      // added; the existing lines keep theirs. The REAL run after the user adds
      // the product re-validates everything with server authority.
      rescueSimulationLineIds: [lineId],
    });
    if (!built.ok) {
      record(candidate, 'no_preview', 0, null, built.code);
      continue;
    }
    const preview = built.preview;
    const rescueLine = preview.proposedInput.items.find((item) => item.id === lineId);
    const simulatedGrams = rescueLine?.planned_grams ?? 0;
    if (
      preview.diagnosticOnly === true ||
      (preview.hardResidualMetrics?.length ?? 0) > 0 ||
      preview.practicalization?.status === 'blocked'
    ) {
      record(candidate, 'hard_gate', simulatedGrams, null, preview.diagnosticReason);
      continue;
    }
    if (!(simulatedGrams > 0)) {
      record(candidate, 'unused', 0, measureRescueOutcome(preview.proposedInput));
      continue; // the optimizer did not use it → no claim
    }
    const rescue = measureRescueOutcome(preview.proposedInput);
    // PROTEIN: a rescue may never break the Protein target / hard authority.
    const rescueProtein = assessProteinTarget(preview.proposedInput);
    if (
      rescueProtein.applicable &&
      !rescueProtein.reached &&
      (currentProtein.reached ||
        (rescueProtein.absoluteResidualPp ?? Infinity) >
          (currentProtein.absoluteResidualPp ?? Infinity) + 1e-9)
    ) {
      record(candidate, 'protein_authority', simulatedGrams, rescue);
      continue;
    }
    if (!isMaterialRescueImprovement(current, rescue)) {
      record(candidate, 'not_material', simulatedGrams, rescue);
      continue;
    }
    record(candidate, 'recommended', simulatedGrams, rescue);
    const better =
      best === null ||
      rescue.reachedAxisCount > best.rescue.reachedAxisCount ||
      (rescue.reachedAxisCount === best.rescue.reachedAxisCount &&
        rescue.severityPoints < best.rescue.severityPoints - 1e-9);
    if (!better) continue;
    const reasonPl =
      rescue.reachedAxisCount > current.reachedAxisCount
        ? `Z obecnymi składnikami najlepszy wynik to ${formatScore(current)}. ` +
          `Dodanie składnika „${candidate.namePl}” pozwala Engine osiągnąć lepszy legalny profil ` +
          `(${formatScore(rescue)}, symulacja ${simulatedGrams} g).`
        : `Z obecnymi składnikami najlepszy wynik to ${formatScore(current)} ` +
          `(dystans do celu ${current.severityPoints.toFixed(2)}). ` +
          `Dodanie składnika „${candidate.namePl}” pozwala Engine zbliżyć się do celu ` +
          `(dystans ${rescue.severityPoints.toFixed(2)}, symulacja ${simulatedGrams} g) ` +
          `przy zachowaniu wszystkich twardych zakresów.`;
    best = { candidate, current, rescue, simulatedGrams, reasonPl, simulatedCandidateIds };
  }
  return { advice: best, current, simulations };
}
