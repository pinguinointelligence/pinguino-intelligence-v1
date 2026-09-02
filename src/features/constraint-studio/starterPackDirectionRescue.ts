import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  buildRecipeDirectionPlan,
  hasActiveExactDirectionObjective,
} from '@/features/recipe-direction/recipeDirectionTargets';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import {
  compareDirectionDistance,
  directionDistance,
  requestedDirectionBands,
} from '@/features/recipe-direction/directionBandDistance';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { verifyMainIngredientIdentity } from '@/features/formulation/mainIngredientContract';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  buildStarterPackRescueCandidatePreview,
  starterPackRescueConstraintsPreserved,
  type BuildPreviewResult,
  type ConstraintPreview,
  type OptimizePreviewOptions,
} from './applyPipeline';
import {
  STARTER_PACK_RESCUE_MAPPER_IDS,
  starterPackRescueEligibility,
  starterPackRescueIngredient,
  starterPackRescueLineId,
  starterPackRescueProbeGrams,
  withStarterPackRescueCandidate,
  type StarterPackRescueEligibility,
  type StarterPackRescueMapperId,
} from './starterPackRescuePalette';

export {
  STARTER_PACK_RESCUE_MAPPER_IDS,
  starterPackRescueEligibility,
  type StarterPackRescueEligibility,
  type StarterPackRescueMapperId,
};

export interface StarterPackRescueRecord {
  mapperId: StarterPackRescueMapperId;
  namePl: string;
  eligible: boolean;
  reason: StarterPackRescueEligibility['reason'] | string;
  bestGramsTested: number | null;
  targetReached: boolean;
  npac: number | null;
  pod: number | null;
  score: number | null;
  bandDistance: number | null;
  totalRecipeMovement: number | null;
  hardGates: 'PASS' | 'FAIL' | 'SKIPPED';
  mainPreserved: boolean | null;
  runtimeMs: number;
  preview: ConstraintPreview | null;
}

export interface StarterPackDirectionRescueReport {
  palette: readonly StarterPackRescueMapperId[];
  records: StarterPackRescueRecord[];
  best: StarterPackRescueRecord | null;
  totalRuntimeMs: number;
  timing: {
    candidatePreparationMs: number;
    productBehaviorMs: number;
    solverSearchMs: number;
    practicalizationScoringMs: number;
    finalVerificationMs: number;
  };
  budgetExhausted: boolean;
}

interface NormalDirectionResult {
  ok: boolean;
  code?: string;
  preview?: ConstraintPreview;
}

export interface StarterPackDirectionRescueBuildInput {
  input: RecipeInput;
  set: ConstraintSet;
  createdAt: string;
  normalResult: NormalDirectionResult;
  options?: OptimizePreviewOptions;
  evaluateCandidate?: (input: {
    simulatedInput: RecipeInput;
    candidate: {
      mapperId: StarterPackRescueMapperId;
      lineId: string;
      probeGrams: number;
      ingredient: NonNullable<ReturnType<typeof starterPackRescueIngredient>>;
    };
  }) => BuildPreviewResult;
}

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/** Normal current-ingredient search always owns the first attempt. */
export function shouldRunStarterPackDirectionRescue(
  input: RecipeInput,
  normalResult: NormalDirectionResult,
): boolean {
  if (!hasActiveExactDirectionObjective(input)) return false;
  if (input.category === 'protein_gelato') return false;
  const plan = buildRecipeDirectionPlan(input);
  if (!plan.axes.some((axis) => axis.status === 'working')) return false;
  const currentDirection = assessRecipeDirection(input, calculateRecipe(input));
  if (currentDirection.active && currentDirection.reached) return false;
  if (normalResult.ok) {
    const direction = normalResult.preview?.directionAssessment;
    return (
      normalResult.preview?.diagnosticOnly === true ||
      (direction?.active === true && direction.supportedAxisCount > 0 && !direction.reached)
    );
  }
  return normalResult.code === 'no_proposal' || normalResult.code === 'unsafe_proposal';
}

const recipeMovement = (before: RecipeInput, after: RecipeInput): number => {
  const beforeById = new Map(before.items.map((item) => [item.id, item.planned_grams] as const));
  const afterById = new Map(after.items.map((item) => [item.id, item.planned_grams] as const));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  let movement = 0;
  for (const id of ids) movement += Math.abs((afterById.get(id) ?? 0) - (beforeById.get(id) ?? 0));
  return movement;
};

const rankRecords = (left: StarterPackRescueRecord, right: StarterPackRescueRecord): number => {
  if (left.targetReached !== right.targetReached) return left.targetReached ? -1 : 1;
  if (left.hardGates !== right.hardGates) return left.hardGates === 'PASS' ? -1 : 1;
  const distance =
    (left.bandDistance ?? Number.POSITIVE_INFINITY) -
    (right.bandDistance ?? Number.POSITIVE_INFINITY);
  if (Math.abs(distance) > 1e-9) return distance;
  if (left.score !== right.score) return (right.score ?? -1) - (left.score ?? -1);
  if (left.bestGramsTested !== right.bestGramsTested) {
    return (
      (left.bestGramsTested ?? Number.POSITIVE_INFINITY) -
      (right.bestGramsTested ?? Number.POSITIVE_INFINITY)
    );
  }
  if (left.totalRecipeMovement !== right.totalRecipeMovement) {
    return (
      (left.totalRecipeMovement ?? Number.POSITIVE_INFINITY) -
      (right.totalRecipeMovement ?? Number.POSITIVE_INFINITY)
    );
  }
  return (
    STARTER_PACK_RESCUE_MAPPER_IDS.indexOf(left.mapperId) -
    STARTER_PACK_RESCUE_MAPPER_IDS.indexOf(right.mapperId)
  );
};

export function buildStarterPackDirectionRescue(
  request: StarterPackDirectionRescueBuildInput,
): StarterPackDirectionRescueReport {
  const started = nowMs();
  const timing = {
    candidatePreparationMs: 0,
    productBehaviorMs: 0,
    solverSearchMs: 0,
    practicalizationScoringMs: 0,
    finalVerificationMs: 0,
  };
  if (!shouldRunStarterPackDirectionRescue(request.input, request.normalResult)) {
    return {
      palette: STARTER_PACK_RESCUE_MAPPER_IDS,
      records: [],
      best: null,
      totalRuntimeMs: nowMs() - started,
      timing,
      budgetExhausted: false,
    };
  }
  const bands = requestedDirectionBands(request.input);
  const currentDistance = directionDistance(request.input, bands);
  const records: StarterPackRescueRecord[] = [];

  for (const mapperId of STARTER_PACK_RESCUE_MAPPER_IDS) {
    const candidateStarted = nowMs();
    const preparationStarted = nowMs();
    const ingredient = starterPackRescueIngredient(mapperId);
    const eligibility = starterPackRescueEligibility(
      mapperId,
      request.input.category,
      request.input,
    );
    timing.candidatePreparationMs += nowMs() - preparationStarted;
    if (!eligibility.eligible || ingredient === null) {
      records.push({
        mapperId,
        namePl: ingredient?.name ?? mapperId,
        eligible: false,
        reason: ingredient === null ? 'authority_unavailable' : eligibility.reason,
        bestGramsTested: null,
        targetReached: false,
        npac: null,
        pod: null,
        score: null,
        bandDistance: null,
        totalRecipeMovement: null,
        hardGates: 'SKIPPED',
        mainPreserved: null,
        runtimeMs: nowMs() - candidateStarted,
        preview: null,
      });
      continue;
    }
    const probeRecords: StarterPackRescueRecord[] = [];
    for (const probeGrams of starterPackRescueProbeGrams(mapperId, request.input)) {
      const probePreparationStarted = nowMs();
      const simulatedInput = withStarterPackRescueCandidate(request.input, mapperId, probeGrams)!;
      timing.candidatePreparationMs += nowMs() - probePreparationStarted;
      const solverStarted = nowMs();
      const result = request.evaluateCandidate
        ? request.evaluateCandidate({
            simulatedInput,
            candidate: {
              mapperId,
              lineId: starterPackRescueLineId(mapperId),
              probeGrams,
              ingredient,
            },
          })
        : buildStarterPackRescueCandidatePreview(
            request.input,
            request.set,
            mapperId,
            request.createdAt,
            request.options,
            undefined,
            probeGrams,
          );
      timing.solverSearchMs += nowMs() - solverStarted;
      if (!result.ok) {
        probeRecords.push({
          mapperId,
          namePl: ingredient.name,
          eligible: true,
          reason: result.code,
          bestGramsTested: probeGrams,
          targetReached: false,
          npac: null,
          pod: null,
          score: null,
          bandDistance: null,
          totalRecipeMovement: null,
          hardGates: 'FAIL',
          mainPreserved: null,
          runtimeMs: nowMs() - candidateStarted,
          preview: null,
        });
        continue;
      }
      const preview = result.preview;
      const output = preview.proposedInput;
      const scoringStarted = nowMs();
      const recipeResult = calculateRecipe(output);
      const direction = assessRecipeDirection(output, recipeResult);
      const distance = directionDistance(output, bands, recipeResult);
      const score = recipeFitForInput(output, recipeResult).score;
      const totalRecipeMovement = recipeMovement(request.input, output);
      timing.practicalizationScoringMs += nowMs() - scoringStarted;
      const verificationStarted = nowMs();
      const constraintsPreserved = starterPackRescueConstraintsPreserved(request.set, output);
      const mainPreserved = verifyMainIngredientIdentity(
        request.input,
        output,
        request.set.byLineId,
      ).ok;
      const hardValid =
        preview.diagnosticOnly !== true &&
        detectViolations(recipeResult).length === 0 &&
        constraintsPreserved &&
        mainPreserved;
      timing.finalVerificationMs += nowMs() - verificationStarted;
      const candidateLine = output.items.find(
        (item) => item.id === starterPackRescueLineId(mapperId),
      );
      const materiallyHelps =
        direction.reached ||
        (hardValid && (compareDirectionDistance(distance, currentDistance) ?? 0) < 0);
      probeRecords.push({
        mapperId,
        namePl: ingredient.name,
        eligible: true,
        reason: materiallyHelps ? 'candidate' : 'no_material_improvement',
        bestGramsTested: candidateLine?.planned_grams ?? probeGrams,
        targetReached: direction.reached,
        npac: recipeResult.npac_points,
        pod: recipeResult.pod_points,
        score,
        bandDistance: distance.total,
        totalRecipeMovement,
        hardGates: hardValid ? 'PASS' : 'FAIL',
        mainPreserved,
        runtimeMs: nowMs() - candidateStarted,
        preview: hardValid && materiallyHelps ? preview : null,
      });
      if (direction.reached && hardValid) break;
    }
    const bestProbe = probeRecords.sort(rankRecords)[0]!;
    records.push({ ...bestProbe, runtimeMs: nowMs() - candidateStarted });
  }

  const best =
    records
      .filter(
        (record) =>
          record.preview !== null && record.hardGates === 'PASS' && record.bestGramsTested !== null,
      )
      .sort(rankRecords)[0] ?? null;
  return {
    palette: STARTER_PACK_RESCUE_MAPPER_IDS,
    records,
    best,
    totalRuntimeMs: nowMs() - started,
    timing,
    budgetExhausted: false,
  };
}
