/**
 * PINGÜINO — Protein Engine v2 authority seam.
 *
 * OWNER DECISION IMPLEMENTED HERE (binding): the user never selects a protein
 * percentage. Protein % is an OUTPUT of the formulation. The Engine looks for
 * the best legal Protein recipe and reports what protein that recipe actually
 * contains.
 *
 * The optimizer objective changed accordingly:
 *
 *   v1  minimise |actual protein - 20 % by mass|   (no provenance, monotone
 *       "more protein is better" up to the target, score 10 only on the target)
 *
 *   v2  among hard-safe candidates that EARN the EU HIGH PROTEIN claim, take
 *       the one with the best measured structural quality; break ties toward
 *       LESS protein, because no controlled dataset shows more protein
 *       improving a frozen dessert.
 *
 * Nothing here changes Base Engine science. Every candidate is still validated
 * by the unchanged native Engine, Main and locks are never variables, and the
 * Mapper base is untouched.
 */
import { calculateRecipe, detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import {
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
} from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { recipeTechnicalFit, type TechnicalFitPresentation } from '@/features/recipe-score';
import { MATCH_SCORE_LABELS, type TenPointScore } from '@/features/recipe-score/recipeMatchScore';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';

import {
  assessProteinQualification,
  type ProteinQualificationAssessment,
} from './proteinQualification';
import {
  assessProteinStructure,
  type ProteinStructureAssessment,
} from './proteinStructureQuality';
import { PROTEIN_EVIDENCE_WINDOW } from './proteinScienceAuthority';

/**
 * The complete Protein verdict for one concrete recipe: one HARD field
 * (`qualified`) and one QUALITY field (`structure.score`), never conflated.
 */
export interface ProteinFormulationAssessment {
  applicable: boolean;
  /** Actual protein of the finished BASE, mass %. The number shown in the UI. */
  actualPercent: number | null;
  qualification: ProteinQualificationAssessment;
  structure: ProteinStructureAssessment;
  /** True when the unchanged native Engine accepts the candidate. */
  hardSafe: boolean;
  /** Protein-specific presentation score, 1-10, or null outside the profile. */
  score: number | null;
}

const hardSafeResult = (result: RecipeResult): boolean =>
  detectViolations(result).length === 0 &&
  !result.warnings.some((warning) => warning.severity === 'critical');

export function assessProteinFormulation(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): ProteinFormulationAssessment {
  const qualification = assessProteinQualification(input, result);
  const hardSafe = hardSafeResult(result);
  if (!qualification.applicable) {
    return {
      applicable: false,
      actualPercent: null,
      qualification,
      structure: assessProteinStructure(input, result, qualification),
      hardSafe,
      score: null,
    };
  }
  const structure = assessProteinStructure(input, result, qualification);
  // A candidate that does not earn the claim is not a Protein product; it is
  // reported honestly rather than scored as a good one. Hard invalidity is
  // still the Engine's own call, not this module's.
  const score = !hardSafe
    ? Math.min(9, Math.max(1, Math.round((result.scores?.technical ?? 10) / 10)))
    : qualification.qualified
      ? (structure.score ?? 10)
      : Math.min(5, structure.score ?? 5);
  return {
    applicable: true,
    actualPercent: qualification.actualPercent,
    qualification,
    structure,
    hardSafe,
    score,
  };
}

/**
 * Linear protein band used by technical candidate generators so a relaxation
 * does not propose vectors that cannot earn the claim. The lower edge is the
 * claim requirement of the CURRENT composition; the upper edge is the top of
 * the controlled-evidence window. Final acceptance remains
 * `assessProteinFormulation`.
 */
export function proteinQualificationPercentBand(
  input: RecipeInput,
): { minPercent: number; maxPercent: number } | null {
  if (input.category !== 'protein_gelato') return null;
  const qualification = assessProteinQualification(input);
  const required = qualification.requiredPercent;
  if (required === null || !Number.isFinite(required)) return null;
  return {
    minPercent: Math.max(0, required),
    maxPercent: Math.max(
      required + PROTEIN_LADDER_SPAN_PP,
      PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent,
    ),
  };
}

/**
 * A single monotone rank for the pipeline's "Protein frontier" preservation
 * checks. HIGHER is strictly better. Earning the HIGH PROTEIN claim always
 * outranks not earning it, and within the claim the rank is the structural
 * quality — so no candidate can trade the claim away for quality, and none can
 * be preferred merely for carrying a bigger protein number.
 *
 * Returns null outside the Protein profile, where these checks do not apply.
 */
export function proteinFrontierRank(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): number | null {
  const assessment = assessProteinFormulation(input, result);
  if (!assessment.applicable) return null;
  const structure = assessment.structure.score ?? 0;
  return assessment.qualification.qualified ? 100 + structure : structure;
}

/* ══ Product-layer search ═════════════════════════════════════════════════ */

const constrained = (set: ConstraintSet, lineId: string): boolean => {
  const constraint = set.byLineId[lineId];
  return constraint !== undefined && constraint.mode !== 'ai';
};

const excluded = (
  input: RecipeInput,
  lineId: string,
  excludedCanonicalIds: ReadonlySet<string>,
): boolean => {
  const item = input.items.find((candidate) => candidate.id === lineId);
  return item ? excludedCanonicalIds.has(canonicalIngredientId(item.ingredient)) : true;
};

const adjustable = (
  input: RecipeInput,
  set: ConstraintSet,
  excludedCanonicalIds: ReadonlySet<string>,
) =>
  input.items.filter(
    (item) =>
      item.actual_grams === null &&
      item.lock_type !== 'main' &&
      item.lock_type !== 'grams' &&
      !constrained(set, item.id) &&
      !excluded(input, item.id, excludedCanonicalIds),
  );

const preferenceRank = (input: RecipeInput, lineId: string): number => {
  const item = input.items.find((candidate) => candidate.id === lineId);
  if (!item) return 99;
  const protein = item.ingredient.composition.protein_percent;
  const role = resolveFunctionalRole(item.ingredient);
  // Food-first: selected high-protein foods (Skyr etc.) precede concentrates.
  if (role !== 'protein_source' && protein >= 10) return 0;
  if (role === 'protein_source') return 1;
  return 2;
};

interface SolvedCandidate {
  input: RecipeInput;
  result: RecipeResult;
  actualPercent: number;
  residualPp: number;
  movement: number;
  sourceLineId: string;
  balancingLineId: string;
}

/**
 * Exact two-line and coordinated search for a SPECIFIC protein percentage.
 *
 * This is the v1 solver body, unchanged in mechanism: it only exchanges grams
 * between already-selected, unconstrained, non-Main lines, solves the protein
 * equation exactly and asks the unchanged Base Engine to validate every
 * candidate. What changed is that the target is now an internal search
 * parameter chosen by `fitProteinFormulation`, never a user input.
 */
function solveForProteinPercent(
  input: RecipeInput,
  set: ConstraintSet,
  excludedIngredientIds: readonly string[],
  targetPercent: number,
): SolvedCandidate | null {
  const excludedCanonicalIds = new Set(
    excludedIngredientIds.map(canonicalIngredientIdFromSourceId),
  );
  const candidates = adjustable(input, set, excludedCanonicalIds);
  if (candidates.length < 2) return null;

  const baseResult = calculateRecipe(input);
  const targetBatch = baseResult.total_batch_g;
  const desiredProteinGrams = (targetPercent * targetBatch) / 100;
  const currentProteinGrams = baseResult.totals.protein_g;
  const proteinGapGrams = desiredProteinGrams - currentProteinGrams;

  let best: SolvedCandidate | null = null;
  const selectedBest = (): SolvedCandidate | null => best;

  const consider = (
    next: RecipeInput,
    sourceLineId: string,
    balancingLineId: string,
    movement: number,
  ): void => {
    const result = calculateRecipe(next);
    if (!hardSafeResult(result)) return;
    const actualPercent = result.percentages.protein_percent;
    const residualPp = Math.abs(actualPercent - targetPercent);
    const candidate: SolvedCandidate = {
      input: next,
      result,
      actualPercent,
      residualPp,
      movement,
      sourceLineId,
      balancingLineId,
    };
    if (
      best === null ||
      candidate.residualPp < best.residualPp - 1e-9 ||
      (Math.abs(candidate.residualPp - best.residualPp) <= 1e-9 &&
        candidate.movement < best.movement - 1e-9)
    ) {
      best = candidate;
    }
  };

  const sources = candidates
    .filter((item) => item.ingredient.composition.protein_percent > 0)
    .sort((left, right) => {
      const rank = preferenceRank(input, left.id) - preferenceRank(input, right.id);
      if (rank !== 0) return rank;
      const density =
        right.ingredient.composition.protein_percent - left.ingredient.composition.protein_percent;
      return density !== 0 ? density : left.id.localeCompare(right.id);
    });

  exactPairSearch: for (const source of sources) {
    const sourceProtein = source.ingredient.composition.protein_percent;
    const balancers = candidates
      .filter(
        (item) =>
          item.id !== source.id &&
          item.ingredient.composition.protein_percent < sourceProtein - 1e-9,
      )
      .sort((left, right) => {
        const density =
          left.ingredient.composition.protein_percent -
          right.ingredient.composition.protein_percent;
        return density !== 0 ? density : left.id.localeCompare(right.id);
      });

    for (const balancer of balancers) {
      const balancerProtein = balancer.ingredient.composition.protein_percent;
      const densityDifference = sourceProtein - balancerProtein;
      let sourceDelta = (proteinGapGrams * 100) / densityDifference;
      const minDelta = -source.planned_grams;
      const maxDelta = balancer.planned_grams;
      sourceDelta = Math.min(maxDelta, Math.max(minDelta, sourceDelta));
      if (Math.abs(sourceDelta) <= 1e-9) continue;

      const next: RecipeInput = {
        ...input,
        items: input.items.map((item) =>
          item.id === source.id
            ? { ...item, planned_grams: item.planned_grams + sourceDelta }
            : item.id === balancer.id
              ? { ...item, planned_grams: item.planned_grams - sourceDelta }
              : item,
        ),
      };

      consider(next, source.id, balancer.id, Math.abs(sourceDelta));
      if ((selectedBest()?.residualPp ?? Infinity) <= 1e-9) break exactPairSearch;

      // A protein-exact two-line exchange can cross a native water/solids or
      // POD/NPAC edge. One additional mass-neutral exchange between lines of
      // identical protein density keeps the protein equation exact while
      // coordinating the physical envelope.
      const neutralLines = candidates.filter((item) => item.id !== source.id);
      for (const donor of neutralLines) {
        const donorAfter = next.items.find((item) => item.id === donor.id);
        if (!donorAfter || donorAfter.planned_grams <= 1e-9) continue;
        for (const recipient of neutralLines) {
          if (recipient.id === donor.id) continue;
          if (
            Math.abs(
              donor.ingredient.composition.protein_percent -
                recipient.ingredient.composition.protein_percent,
            ) > 1e-9
          )
            continue;
          const maxTransfer = donorAfter.planned_grams;
          const transferValues = Array.from(
            { length: Math.floor(maxTransfer) },
            (_, index) => index + 1,
          );
          if (maxTransfer % 1 > 1e-9) transferValues.push(maxTransfer);
          for (const transfer of transferValues) {
            const coordinated: RecipeInput = {
              ...next,
              items: next.items.map((item) =>
                item.id === donor.id
                  ? { ...item, planned_grams: item.planned_grams - transfer }
                  : item.id === recipient.id
                    ? { ...item, planned_grams: item.planned_grams + transfer }
                    : item,
              ),
            };
            consider(coordinated, source.id, balancer.id, Math.abs(sourceDelta) + transfer * 2);
          }
        }
      }
    }
  }

  // Protein Gelato often needs more than a two-line exchange: protein, fat,
  // POD/NPAC and water/solids must move together.
  const sourceLines = candidates
    .filter(
      (item) =>
        resolveFunctionalRole(item.ingredient) === 'protein_source' &&
        item.ingredient.composition.protein_percent > 0,
    )
    .sort((left, right) => {
      const leftSelected = left.id.startsWith('formulation-') ? 1 : 0;
      const rightSelected = right.id.startsWith('formulation-') ? 1 : 0;
      if (leftSelected !== rightSelected) return leftSelected - rightSelected;
      const rank = preferenceRank(input, left.id) - preferenceRank(input, right.id);
      if (rank !== 0) return rank;
      const density =
        right.ingredient.composition.protein_percent - left.ingredient.composition.protein_percent;
      return density !== 0 ? density : left.id.localeCompare(right.id);
    });
  const waterLine = candidates.find((item) => resolveFunctionalRole(item.ingredient) === 'water');
  const sucroseLine = candidates.find(
    (item) => resolveFunctionalRole(item.ingredient) === 'sweetener_sucrose',
  );
  const freezingLine = candidates.find(
    (item) => resolveFunctionalRole(item.ingredient) === 'sugar_freezing_control',
  );
  const adjustableFatLine = candidates.find((item) => {
    const role = resolveFunctionalRole(item.ingredient);
    return role === 'dairy_fat' || role === 'plant_fat';
  });
  const fixedOrAdjustableFatLine =
    adjustableFatLine ??
    input.items.find((item) => {
      const role = resolveFunctionalRole(item.ingredient);
      return role === 'dairy_fat' || role === 'plant_fat';
    });
  const zeroedLiquidLines = candidates.filter((item) => {
    const role = resolveFunctionalRole(item.ingredient);
    return (
      item.id.startsWith('formulation-') && (role === 'primary_liquid' || role === 'plant_liquid')
    );
  });

  if (
    (selectedBest()?.residualPp ?? Infinity) > 1e-9 &&
    sourceLines.length > 0 &&
    waterLine &&
    sucroseLine &&
    freezingLine &&
    fixedOrAdjustableFatLine
  ) {
    const sharedVariableIds = new Set([
      waterLine.id,
      sucroseLine.id,
      freezingLine.id,
      fixedOrAdjustableFatLine.id,
      ...zeroedLiquidLines.map((item) => item.id),
    ]);
    const scale = targetBatch / 1000;
    const prioritizeAround = (values: number[], center: number): number[] =>
      values.sort((left, right) => {
        const distance = Math.abs(left - center) - Math.abs(right - center);
        return distance !== 0 ? distance : left - right;
      });
    const fatValues = adjustableFatLine
      ? prioritizeAround(
          Array.from({ length: 19 }, (_, index) => index * 10 * scale),
          fixedOrAdjustableFatLine.planned_grams,
        )
      : [fixedOrAdjustableFatLine.planned_grams];
    const currentTotalSugarPerKg = (sucroseLine.planned_grams + freezingLine.planned_grams) / scale;
    const totalSugarValues = prioritizeAround(
      Array.from({ length: 61 }, (_, index) => 80 + index * 2),
      currentTotalSugarPerKg,
    );
    const currentSucrosePerKg = sucroseLine.planned_grams / scale;

    coordinatedSearch: for (const source of sourceLines) {
      const variableIds = new Set([...sharedVariableIds, source.id]);
      const staticItems = input.items.filter((item) => !variableIds.has(item.id));
      const staticMass = staticItems.reduce((sum, item) => sum + item.planned_grams, 0);
      const staticProtein = staticItems.reduce(
        (sum, item) =>
          sum + (item.planned_grams * item.ingredient.composition.protein_percent) / 100,
        0,
      );
      const sourceProteinDensity = source.ingredient.composition.protein_percent / 100;
      for (const fatGrams of fatValues) {
        const fatProtein =
          (fatGrams * fixedOrAdjustableFatLine.ingredient.composition.protein_percent) / 100;
        const sourceGrams =
          (desiredProteinGrams - staticProtein - fatProtein) / sourceProteinDensity;
        if (!Number.isFinite(sourceGrams) || sourceGrams < 0) continue;

        for (const totalSugarPerKg of totalSugarValues) {
          const totalSugar = totalSugarPerKg * scale;
          const sucroseValues = prioritizeAround(
            Array.from({ length: Math.floor(totalSugarPerKg / 2) + 1 }, (_, index) => index * 2),
            currentSucrosePerKg,
          );
          for (const sucrosePerKg of sucroseValues) {
            const sucroseGrams = sucrosePerKg * scale;
            const freezingGrams = totalSugar - sucroseGrams;
            const waterGrams =
              targetBatch - staticMass - fatGrams - sourceGrams - sucroseGrams - freezingGrams;
            if (waterGrams < -1e-9) continue;

            const coordinated: RecipeInput = {
              ...input,
              items: input.items.map((item) => {
                let plannedGrams = item.planned_grams;
                if (zeroedLiquidLines.some((line) => line.id === item.id)) plannedGrams = 0;
                if (item.id === source.id) plannedGrams = sourceGrams;
                if (item.id === fixedOrAdjustableFatLine.id) plannedGrams = fatGrams;
                if (item.id === waterLine.id) plannedGrams = Math.max(0, waterGrams);
                if (item.id === sucroseLine.id) plannedGrams = sucroseGrams;
                if (item.id === freezingLine.id) plannedGrams = freezingGrams;
                return plannedGrams === item.planned_grams
                  ? item
                  : { ...item, planned_grams: plannedGrams };
              }),
            };
            const movement = coordinated.items.reduce((sum, item) => {
              const prior = input.items.find((candidate) => candidate.id === item.id);
              return sum + Math.abs(item.planned_grams - (prior?.planned_grams ?? 0));
            }, 0);
            consider(coordinated, source.id, waterLine.id, movement);
            if ((selectedBest()?.residualPp ?? Infinity) <= 1e-9) break coordinatedSearch;
          }
        }
      }
    }
  }

  return selectedBest();
}

/* ══ The v2 objective ═════════════════════════════════════════════════════ */

/** Protein levels probed above the claim requirement, in pp. */
const PROTEIN_LADDER_SPAN_PP = 3;
/** Ladder resolution, pp. */
const PROTEIN_LADDER_STEP_PP = 0.5;
/**
 * The lowest rung must CLEAR the qualification requirement, not sit on it.
 *
 * Two effects conspire at the boundary. The exact solver returns the closest
 * hard-safe candidate rather than the requested percentage exactly — its
 * residual is bounded by whole-gram granularity, roughly 0.06-0.08 pp for a
 * 60-80 % protein source in a 1 kg batch. And the requirement itself RISES as
 * protein rises, because protein adds energy to its own denominator. A rung
 * placed exactly at the requirement can therefore settle a hundredth of a point
 * low and lose the claim: a measured case landed at 8.489 % protein against a
 * requirement of 8.4896 %, i.e. an energy share of 19.9988 %.
 *
 * Half a ladder step is comfortably above the solver residual and still far
 * inside the controlled-evidence window.
 */
const PROTEIN_QUALIFICATION_MARGIN_PP = PROTEIN_LADDER_STEP_PP / 2;

export type ProteinFitReason =
  | 'not_protein_profile'
  | 'already_best'
  | 'improved'
  | 'best_achievable'
  | 'actual_batch'
  | 'no_adjustable_pair'
  | 'native_safety_blocked';

export interface ProteinFormulationFit {
  input: RecipeInput;
  assessment: ProteinFormulationAssessment;
  changed: boolean;
  reason: ProteinFitReason;
  sourceLineId: string | null;
  balancingLineId: string | null;
  /** Every protein level the ladder actually evaluated, for diagnostics. */
  probedPercents: readonly number[];
}

/**
 * Rank two candidates by the v2 objective. Lower is better.
 *
 * 1. earning the HIGH PROTEIN claim beats not earning it (the one hard rule);
 * 2. then higher structural quality;
 * 3. then LESS protein — the explicit anti-"more is better" tie-break;
 * 4. then less movement from the user's draft.
 */
function betterThan(
  candidate: { assessment: ProteinFormulationAssessment; movement: number },
  incumbent: { assessment: ProteinFormulationAssessment; movement: number } | null,
): boolean {
  if (incumbent === null) return true;
  const a = candidate.assessment;
  const b = incumbent.assessment;
  if (a.qualification.qualified !== b.qualification.qualified) {
    return a.qualification.qualified;
  }
  const aScore = a.structure.score ?? 0;
  const bScore = b.structure.score ?? 0;
  if (Math.abs(aScore - bScore) > 1e-9) return aScore > bScore;
  const aProtein = a.actualPercent ?? Infinity;
  const bProtein = b.actualPercent ?? Infinity;
  if (Math.abs(aProtein - bProtein) > 1e-9) return aProtein < bProtein;
  return candidate.movement < incumbent.movement - 1e-9;
}

/**
 * Find the best legal Protein formulation reachable from `input`.
 *
 * The ladder starts at the claim requirement of the current composition and
 * climbs in 0.5 pp steps. It is bounded, deterministic and evaluated entirely
 * through the unchanged Base Engine. Raising protein raises the recipe's energy
 * and therefore its own requirement slightly, so each rung is re-checked
 * against the qualification of the RESULT rather than of the request.
 */
export function fitProteinFormulation(
  input: RecipeInput,
  set: ConstraintSet = { byLineId: {} },
  excludedIngredientIds: readonly string[] = [],
): ProteinFormulationFit {
  const beforeResult = calculateRecipe(input);
  const before = assessProteinFormulation(input, beforeResult);
  const unchanged = (reason: ProteinFitReason): ProteinFormulationFit => ({
    input,
    assessment: before,
    changed: false,
    reason,
    sourceLineId: null,
    balancingLineId: null,
    probedPercents: [],
  });

  if (!before.applicable) return unchanged('not_protein_profile');
  if (input.items.some((item) => item.actual_grams !== null)) return unchanged('actual_batch');
  // NOTE: a candidate that is not yet hard-safe is NOT refused here.
  //
  // v1 returned `native_safety_blocked` for any out-of-band start, which left
  // the worst case unreachable: a candidate that is simultaneously out of band
  // AND short of the claim had nothing that could repair it, so the pipeline
  // surfaced an unqualified diagnostic. `solveForProteinPercent` already
  // rejects every non-hard-safe candidate inside `consider`, so searching from
  // a broken start can only ever RETURN a hard-safe recipe or nothing at all —
  // it cannot introduce an unsafe one.
  const startedHardSafe = before.hardSafe;

  const required = before.qualification.requiredPercent;
  if (required === null || !Number.isFinite(required)) return unchanged('best_achievable');

  // Ladder: from the claim requirement upward. Snapped to the step grid so the
  // same recipe always probes the same levels, then lifted by one further step
  // whenever the snapped rung would sit inside the boundary margin.
  const snapped =
    Math.ceil(Math.max(0, required) / PROTEIN_LADDER_STEP_PP) * PROTEIN_LADDER_STEP_PP;
  const start =
    snapped - required < PROTEIN_QUALIFICATION_MARGIN_PP
      ? snapped + PROTEIN_LADDER_STEP_PP
      : snapped;
  const probedPercents: number[] = [];
  for (
    let percent = start;
    percent <= start + PROTEIN_LADDER_SPAN_PP + 1e-9;
    percent += PROTEIN_LADDER_STEP_PP
  ) {
    probedPercents.push(Number(percent.toFixed(4)));
  }

  let best: {
    input: RecipeInput;
    assessment: ProteinFormulationAssessment;
    movement: number;
    sourceLineId: string;
    balancingLineId: string;
  } | null = null;

  for (const percent of probedPercents) {
    const solved = solveForProteinPercent(input, set, excludedIngredientIds, percent);
    if (solved === null) continue;
    const assessment = assessProteinFormulation(solved.input, solved.result);
    if (!assessment.hardSafe) continue;
    const candidate = {
      input: solved.input,
      assessment,
      movement: solved.movement,
      sourceLineId: solved.sourceLineId,
      balancingLineId: solved.balancingLineId,
    };
    if (betterThan(candidate, best)) best = candidate;
  }

  if (best === null) {
    const candidates = adjustable(
      input,
      set,
      new Set(excludedIngredientIds.map(canonicalIngredientIdFromSourceId)),
    );
    return unchanged(candidates.length < 2 ? 'no_adjustable_pair' : 'best_achievable');
  }

  // The draft the user already has is a legitimate candidate ONLY when it is
  // itself hard-safe: never move grams to reach an equal-or-worse formulation,
  // but never keep an out-of-band draft over a hard-safe alternative either.
  if (startedHardSafe && !betterThan(best, { assessment: before, movement: 0 })) {
    return unchanged('already_best');
  }

  return {
    input: best.input,
    assessment: best.assessment,
    changed: true,
    reason: 'improved',
    sourceLineId: best.sourceLineId,
    balancingLineId: best.balancingLineId,
    probedPercents,
  };
}

/* ══ Public score seam ════════════════════════════════════════════════════ */

/**
 * Canonical public score seam for a concrete RecipeInput. Non-Protein behaviour
 * is byte-for-byte the existing technical-fit adapter.
 *
 * For Protein the score is the QUALITY of the formulation — never its protein
 * number. A recipe with more protein can, and routinely does, score lower.
 */
export function recipeFitForInput(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): TechnicalFitPresentation {
  const base = recipeTechnicalFit(result);
  const direction = assessRecipeDirection(input, result);
  const protein = assessProteinFormulation(input, result);
  if (base.score === null) return base;
  if (!protein.applicable && direction.score === null) return base;

  const score = Math.min(
    base.score,
    direction.score ?? 10,
    protein.applicable && protein.score !== null ? protein.score : 10,
  ) as TenPointScore;
  const label = MATCH_SCORE_LABELS[score];
  const directionAria = direction.active
    ? ` Kierunek receptury: ${direction.reachedAxisCount} z ${direction.supportedAxisCount} obsługiwanych osi w celu.`
    : '';
  const proteinAria = protein.applicable
    ? ` Białko ${protein.actualPercent?.toFixed(1)}% masy, ${protein.qualification.energySharePercent?.toFixed(0)}% energii.`
    : '';
  return {
    ...base,
    score,
    label,
    display: `${score}/10`,
    ariaText: `Dopasowanie receptury: ${score} na 10 — ${label}.${directionAria}${proteinAria}`,
    validatedNative: base.validatedNative && (!protein.applicable || protein.qualification.qualified),
  };
}
