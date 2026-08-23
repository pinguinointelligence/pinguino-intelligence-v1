import {
  calculateRecipe,
  DEFAULT_CORRECTION_CANDIDATES,
  detectViolations,
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
import { assessProteinFormulation } from '@/features/protein-gelato/proteinAuthority';
import {
  assessRecipeDirection,
  type RecipeDirectionAssessment,
} from '@/features/recipe-direction/recipeDirectionAssessment';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { compareVeganStructuralCandidates } from '@/features/vegan-structure';
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

/**
 * WHY a rescue is being offered. Direction and operational health are SEPARATE
 * problems: a profile may legitimately have no approved Direction calibration
 * (Vegan has none today) and still be operationally broken. Rescue must answer
 * the second question even when the first one cannot be asked.
 */
export type RescueTrigger = 'direction' | 'operational';

export interface RescueOutcomeMeasure {
  score: number | null;
  reachedAxisCount: number;
  supportedAxisCount: number;
  /** Distance to the exact Direction target. Meaningful only when Direction is active. */
  severityPoints: number;
  /** Hard (non-provisional) band metrics currently violated. Direction-free. */
  hardMetricCount: number;
  /** Total Engine violation severity across every violated metric. Direction-free. */
  engineSeverityPoints: number;
}

export interface RescueIngredientAdvice {
  /** Which problem this advice answers. */
  trigger: RescueTrigger;
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
  /** Null when nothing needed rescuing at all. */
  trigger: RescueTrigger | null;
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
  // Direction-free fallback: when no Direction assessment can be made (profiles
  // without an approved calibration, e.g. Vegan), the OPERATIONAL problem is
  // read straight from the Engine's own band violations. Same levers, same
  // order, derived from what is actually out of band.
  const engineViolations = missed.length === 0 ? detectViolations(calculateRecipe(input)) : [];
  const violated = (metric: string, direction: 'low' | 'high') =>
    engineViolations.some((v) => v.metric === metric && v.direction === direction);
  const needsMorePod =
    missed.some((r) => r.axis === 'sweetness' && r.side === 'below') || violated('pod', 'low');
  const needsLessPod =
    missed.some((r) => r.axis === 'sweetness' && r.side === 'above') || violated('pod', 'high');
  const needsMoreNpac =
    missed.some((r) => r.axis === 'softness' && r.side === 'below') ||
    violated('npac', 'low') ||
    violated('ice_fraction', 'high');
  const needsLessNpac =
    missed.some((r) => r.axis === 'softness' && r.side === 'above') ||
    violated('npac', 'high') ||
    violated('ice_fraction', 'low');
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
  const result = calculateRecipe(input);
  const assessment = assessRecipeDirection(input, result);
  // The operational fields are derived from the SAME `calculateRecipe` result as
  // the Direction fields. `classifyViolationBands` would recompute the whole
  // recipe, and this runs once per simulated candidate — the advisor stays a
  // bounded, cheap simulation. The provisional-band rule below mirrors
  // `classifyViolationBands` exactly (a provisional indicator is a SOFT band).
  const violations = detectViolations(result);
  const indicatorByKey = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));
  const hardMetrics = new Set<string>();
  let engineSeverityPoints = 0;
  for (const violation of violations) {
    engineSeverityPoints += violation.severity_points;
    const indicator = indicatorByKey.get(violation.metric);
    const provisional =
      indicator?.category_fallback === true ||
      indicator?.temperature_fallback === true ||
      indicator?.band_status === 'estimated';
    if (!provisional) hardMetrics.add(violation.metric);
  }
  return {
    score: assessment.score,
    reachedAxisCount: assessment.reachedAxisCount,
    supportedAxisCount: assessment.supportedAxisCount,
    severityPoints: recipeDirectionViolations(input).reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    ),
    hardMetricCount: hardMetrics.size,
    engineSeverityPoints,
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

/**
 * OPERATIONAL evidence rule — the Direction-free twin of
 * `isMaterialRescueImprovement`. A rescue is material when it removes a hard
 * band violation outright, or — at the same hard-metric count — cuts the total
 * Engine violation severity by the same margin the Direction rule demands.
 */
export function isMaterialOperationalImprovement(
  current: RescueOutcomeMeasure,
  rescue: RescueOutcomeMeasure,
): boolean {
  if (rescue.hardMetricCount < current.hardMetricCount) {
    return rescue.engineSeverityPoints <= current.engineSeverityPoints + 1e-9;
  }
  if (rescue.hardMetricCount > current.hardMetricCount) return false;
  const gain = current.engineSeverityPoints - rescue.engineSeverityPoints;
  return (
    gain >= MIN_ABSOLUTE_SEVERITY_GAIN &&
    rescue.engineSeverityPoints <=
      current.engineSeverityPoints * (1 - MATERIAL_RELATIVE_SEVERITY_GAIN)
  );
}

/**
 * Decide WHICH problem the advisor is answering — the decoupling itself.
 *
 *  - `direction`   — Direction is active, supported and not yet reached.
 *  - `operational` — Direction cannot be asked (no approved calibration for this
 *                    profile, or the user set no target) but the recipe is
 *                    operationally broken: a hard band is violated.
 *  - `null`        — nothing to rescue.
 *
 * Direction being unavailable NEVER disables operational rescue. This is the
 * invariant the Vegan profile depends on: it has no approved Direction
 * calibration and must still receive rescue advice.
 */
export function resolveRescueTrigger(
  directionActive: boolean,
  directionSupportedAxes: number,
  directionReached: boolean,
  measure: RescueOutcomeMeasure,
): RescueTrigger | null {
  if (directionActive && directionSupportedAxes > 0 && !directionReached) return 'direction';
  return measure.hardMetricCount > 0 ? 'operational' : null;
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
  const none = (
    current: RescueOutcomeMeasure | null,
    trigger: RescueTrigger | null = null,
  ): RescueAdvisorReport => ({
    advice: null,
    current,
    simulations: [],
    trigger,
  });
  if (input.items.some((item) => item.actual_grams !== null)) return none(null);
  const currentInput = bestCurrent?.proposedInput ?? input;
  const currentAssessment = assessRecipeDirection(currentInput, calculateRecipe(currentInput));
  const current = measureRescueOutcome(currentInput);
  // DECOUPLED (owner authority): Direction and operational health are separate
  // questions. A profile with no approved Direction calibration — Vegan today —
  // still gets operational rescue whenever a hard band is violated.
  const trigger = resolveRescueTrigger(
    input.goals?.direction_targets_active === true && currentAssessment.active,
    currentAssessment.supportedAxisCount,
    currentAssessment.reached,
    current,
  );
  if (trigger === null) return none(current);
  const currentProtein = assessProteinFormulation(currentInput);

  const excluded = new Set(options.excludedIngredientIds ?? []);
  const family = (
    args.candidates ??
    rescueCandidateFamily(input, trigger === 'direction' ? currentAssessment : null)
  ).filter(
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
  /** Executable projection behind `best` — the Vegan v2 structural tie-break
   * needs the recipe, not only its Direction measure. */
  let bestInput: RecipeInput | null = null;
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
    // PROTEIN v2: a rescue may never cost the product its HIGH PROTEIN claim,
    // and — the owner's rule — may never be recommended merely because it
    // raises protein. A candidate that keeps the claim but WORSENS structural
    // quality is rejected even when it delivers more protein.
    const rescueProtein = assessProteinFormulation(preview.proposedInput);
    if (rescueProtein.applicable) {
      const losesClaim =
        !rescueProtein.qualification.qualified && currentProtein.qualification.qualified;
      const worseStructure =
        rescueProtein.qualification.qualified &&
        currentProtein.qualification.qualified &&
        (rescueProtein.structure.score ?? 0) < (currentProtein.structure.score ?? 0) - 1e-9;
      if (losesClaim || worseStructure) {
        record(candidate, 'protein_authority', simulatedGrams, rescue);
        continue;
      }
    }
    const material =
      trigger === 'direction'
        ? isMaterialRescueImprovement(current, rescue)
        : isMaterialOperationalImprovement(current, rescue);
    if (!material) {
      record(candidate, 'not_material', simulatedGrams, rescue);
      continue;
    }
    record(candidate, 'recommended', simulatedGrams, rescue);
    // VEGAN v2 (additive): when two rescue candidates reach the SAME Direction
    // axes at the SAME remaining distance, prefer the one whose executable
    // projection has the structurally stronger plant system. Ranking only —
    // eligibility is untouched (the family is already VEGAN_VERIFIED-only), no
    // ingredient is auto-added, and an UNKNOWN structural side never loses.
    const tieOnPrimary =
      trigger === 'direction'
        ? best !== null &&
          rescue.reachedAxisCount === best.rescue.reachedAxisCount &&
          Math.abs(rescue.severityPoints - best.rescue.severityPoints) <= 1e-9
        : best !== null &&
          rescue.hardMetricCount === best.rescue.hardMetricCount &&
          Math.abs(rescue.engineSeverityPoints - best.rescue.engineSeverityPoints) <= 1e-9;
    const structurallyBetter =
      best !== null &&
      bestInput !== null &&
      tieOnPrimary &&
      compareVeganStructuralCandidates(preview.proposedInput, bestInput) < 0;
    const strictlyBetter =
      best === null ||
      (trigger === 'direction'
        ? rescue.reachedAxisCount > best.rescue.reachedAxisCount ||
          (rescue.reachedAxisCount === best.rescue.reachedAxisCount &&
            rescue.severityPoints < best.rescue.severityPoints - 1e-9)
        : rescue.hardMetricCount < best.rescue.hardMetricCount ||
          (rescue.hardMetricCount === best.rescue.hardMetricCount &&
            rescue.engineSeverityPoints < best.rescue.engineSeverityPoints - 1e-9));
    if (!(strictlyBetter || structurallyBetter)) continue;
    const reasonPl =
      trigger === 'operational'
        ? `Receptura wykracza poza zatwierdzone zakresy (${current.hardMetricCount} \u2192 ` +
          `${rescue.hardMetricCount}). Dodanie sk\u0142adnika \u201e${candidate.namePl}\u201d pozwala Engine ` +
          `wr\u00f3ci\u0107 do legalnego profilu (symulacja ${simulatedGrams} g).`
        : rescue.reachedAxisCount > current.reachedAxisCount
          ? `Z obecnymi sk\u0142adnikami najlepszy wynik to ${formatScore(current)}. ` +
            `Dodanie sk\u0142adnika \u201e${candidate.namePl}\u201d pozwala Engine osi\u0105gn\u0105\u0107 lepszy legalny profil ` +
            `(${formatScore(rescue)}, symulacja ${simulatedGrams} g).`
          : `Z obecnymi sk\u0142adnikami najlepszy wynik to ${formatScore(current)} ` +
            `(dystans do celu ${current.severityPoints.toFixed(2)}). ` +
            `Dodanie sk\u0142adnika \u201e${candidate.namePl}\u201d pozwala Engine zbli\u017cy\u0107 si\u0119 do celu ` +
            `(dystans ${rescue.severityPoints.toFixed(2)}, symulacja ${simulatedGrams} g) ` +
            `przy zachowaniu wszystkich twardych zakres\u00f3w.`;
    best = { trigger, candidate, current, rescue, simulatedGrams, reasonPl, simulatedCandidateIds };
    bestInput = preview.proposedInput;
  }
  return { advice: best, current, simulations, trigger };
}
