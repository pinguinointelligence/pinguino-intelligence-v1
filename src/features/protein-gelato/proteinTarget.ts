import { calculateRecipe, detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import {
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
} from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { recipeTechnicalFit, type TechnicalFitPresentation } from '@/features/recipe-score';
import { MATCH_SCORE_LABELS, type TenPointScore } from '@/features/recipe-score/recipeMatchScore';

import { PROTEIN_GELATO_TARGET } from '@/spine';

/**
 * Product-layer Protein Gelato target.
 *
 * This module never changes Base Engine science. Actual protein comes from the
 * Engine composition result, therefore EVERY ingredient contributes according
 * to its verified Mapper protein value. The optimizer only exchanges grams
 * between two already-selected, unconstrained non-Main lines and verifies the
 * complete candidate against the native Engine bands.
 */
export interface ProteinTargetAssessment {
  applicable: boolean;
  targetPercent: number | null;
  actualPercent: number | null;
  tolerancePercent: number;
  residualPp: number | null;
  absoluteResidualPp: number | null;
  reached: boolean;
  hardSafe: boolean;
  score: number | null;
}

export type ProteinTargetFitReason =
  | 'not_protein_profile'
  | 'target_reached'
  | 'improved'
  | 'best_achievable'
  | 'actual_batch'
  | 'no_adjustable_pair'
  | 'native_safety_blocked';

export interface ProteinTargetFit {
  input: RecipeInput;
  assessment: ProteinTargetAssessment;
  changed: boolean;
  reason: ProteinTargetFitReason;
  sourceLineId: string | null;
  balancingLineId: string | null;
}

const finiteTarget = (input: RecipeInput): number => {
  const raw = input.goals?.target_protein_percent ?? PROTEIN_GELATO_TARGET.defaultPercent;
  const finite = Number.isFinite(raw) ? raw : PROTEIN_GELATO_TARGET.defaultPercent;
  return (
    Math.round(Math.max(0, finite) / PROTEIN_GELATO_TARGET.inputStepPercent) *
    PROTEIN_GELATO_TARGET.inputStepPercent
  );
};

const hardSafeResult = (result: RecipeResult): boolean =>
  detectViolations(result).length === 0 &&
  !result.warnings.some((warning) => warning.severity === 'critical');

export function assessProteinTarget(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): ProteinTargetAssessment {
  if (input.category !== 'protein_gelato') {
    return {
      applicable: false,
      targetPercent: null,
      actualPercent: null,
      tolerancePercent: PROTEIN_GELATO_TARGET.tolerancePercent,
      residualPp: null,
      absoluteResidualPp: null,
      reached: false,
      hardSafe: hardSafeResult(result),
      score: null,
    };
  }

  const targetPercent = finiteTarget(input);
  const actualPercent = result.percentages.protein_percent;
  const residualPp = actualPercent - targetPercent;
  const absoluteResidualPp = Math.abs(residualPp);
  const reached = absoluteResidualPp <= PROTEIN_GELATO_TARGET.tolerancePercent + 1e-9;
  const hardSafe = hardSafeResult(result);

  // Presentation contract only: 10/10 is reserved for native-safe target reach.
  // Outside tolerance, each full 0.5 pp of residual removes one point and the
  // score is structurally capped at 9. No Engine score or formula is modified.
  const score = hardSafe
    ? reached
      ? 10
      : Math.max(
          1,
          9 -
            Math.floor(
              Math.max(0, absoluteResidualPp - PROTEIN_GELATO_TARGET.tolerancePercent) / 0.5,
            ),
        )
    : Math.min(9, Math.max(1, Math.round((result.scores?.technical ?? 10) / 10)));

  return {
    applicable: true,
    targetPercent,
    actualPercent,
    tolerancePercent: PROTEIN_GELATO_TARGET.tolerancePercent,
    residualPp,
    absoluteResidualPp,
    reached,
    hardSafe,
    score,
  };
}

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

export function fitProteinTarget(
  input: RecipeInput,
  set: ConstraintSet = { byLineId: {} },
  excludedIngredientIds: readonly string[] = [],
): ProteinTargetFit {
  const before = assessProteinTarget(input);
  const unchanged = (reason: ProteinTargetFitReason): ProteinTargetFit => ({
    input,
    assessment: before,
    changed: false,
    reason,
    sourceLineId: null,
    balancingLineId: null,
  });

  if (!before.applicable) return unchanged('not_protein_profile');
  if (input.items.some((item) => item.actual_grams !== null)) return unchanged('actual_batch');
  if (before.reached) return unchanged('target_reached');
  if (!before.hardSafe) return unchanged('native_safety_blocked');

  const excludedCanonicalIds = new Set(
    excludedIngredientIds.map(canonicalIngredientIdFromSourceId),
  );
  const candidates = adjustable(input, set, excludedCanonicalIds);
  const sources = candidates
    .filter((item) => item.ingredient.composition.protein_percent > 0)
    .sort((left, right) => {
      const rank = preferenceRank(input, left.id) - preferenceRank(input, right.id);
      if (rank !== 0) return rank;
      const density =
        right.ingredient.composition.protein_percent - left.ingredient.composition.protein_percent;
      return density !== 0 ? density : left.id.localeCompare(right.id);
    });

  type Candidate = {
    input: RecipeInput;
    assessment: ProteinTargetAssessment;
    sourceLineId: string;
    balancingLineId: string;
    movement: number;
  };
  let best: Candidate | null = null;
  const selectedBest = (): Candidate | null => best;
  const desiredProteinGrams =
    ((before.targetPercent ?? PROTEIN_GELATO_TARGET.defaultPercent) *
      calculateRecipe(input).total_batch_g) /
    100;
  const currentProteinGrams = calculateRecipe(input).totals.protein_g;
  const proteinGapGrams = desiredProteinGrams - currentProteinGrams;

  const consider = (
    next: RecipeInput,
    sourceLineId: string,
    balancingLineId: string,
    movement: number,
  ): void => {
    const result = calculateRecipe(next);
    if (!hardSafeResult(result)) return;
    const assessment = assessProteinTarget(next, result);
    if (
      assessment.absoluteResidualPp === null ||
      before.absoluteResidualPp === null ||
      assessment.absoluteResidualPp >= before.absoluteResidualPp - 1e-9
    )
      return;
    const candidate: Candidate = {
      input: next,
      assessment,
      sourceLineId,
      balancingLineId,
      movement,
    };
    if (
      best === null ||
      (candidate.assessment.absoluteResidualPp ?? Infinity) <
        (best.assessment.absoluteResidualPp ?? Infinity) - 1e-9 ||
      (Math.abs(
        (candidate.assessment.absoluteResidualPp ?? Infinity) -
          (best.assessment.absoluteResidualPp ?? Infinity),
      ) <= 1e-9 &&
        candidate.movement < best.movement - 1e-9)
    )
      best = candidate;
  };

  for (const source of sources) {
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

      // A protein-exact two-line exchange can cross a native water/solids or
      // POD/NPAC edge. Search one additional mass-neutral exchange between
      // already-selected lines with identical protein density. This keeps the
      // protein equation exact while coordinating the physical envelope.
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
  // POD/NPAC and water/solids must move together. The search below stays in the
  // product orchestration layer, uses only already-selected adjustable lines,
  // solves the protein equation exactly and asks the unchanged Base Engine to
  // validate every candidate. Main, fixed constraints and exclusions never
  // enter the variable set.
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
    selectedBest()?.assessment.reached !== true &&
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
    const targetBatch = calculateRecipe(input).total_batch_g;
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
            if (selectedBest()?.assessment.reached === true) break coordinatedSearch;
          }
        }
      }
    }
  }

  const finalBest = selectedBest();
  if (finalBest === null)
    return unchanged(candidates.length < 2 ? 'no_adjustable_pair' : 'best_achievable');
  return {
    input: finalBest.input,
    assessment: finalBest.assessment,
    changed: true,
    reason: 'improved',
    sourceLineId: finalBest.sourceLineId,
    balancingLineId: finalBest.balancingLineId,
  };
}
/**
 * Canonical public score seam for a concrete RecipeInput. Non-Protein behavior
 * remains byte-for-byte the existing technical-fit adapter. Protein tightens
 * the 10/10 contract: native safety AND the persisted protein target are met.
 */
export function recipeFitForInput(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): TechnicalFitPresentation {
  const base = recipeTechnicalFit(result);
  const target = assessProteinTarget(input, result);
  if (!target.applicable || base.score === null || target.score === null) return base;

  const score = target.score as TenPointScore;
  const label = MATCH_SCORE_LABELS[score];
  return {
    ...base,
    score,
    label,
    display: `${score}/10`,
    ariaText:
      `Dopasowanie receptury Protein: ${score} na 10 — ${label}. ` +
      `Cel białka ${target.targetPercent?.toFixed(1)}%, wynik ${target.actualPercent?.toFixed(1)}%.`,
    validatedNative: base.validatedNative && target.reached,
  };
}
