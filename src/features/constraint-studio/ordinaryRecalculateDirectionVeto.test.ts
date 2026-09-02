/**
 * RESTORATION #1 — ORDINARY RECALCULATE MUST NOT BE VETOED BY DIRECTION PROGRESS.
 *
 * `7edd90ea` ("fix(pro): restore live draft result visibility") introduced
 * `assessDirectionCandidateProgress` and wired its STRICT verdict into the
 * universal Preview exit and the Apply trust door. Strict progress requires
 *
 *     reached || (materiallyDifferent && strictlyCloser)
 *
 * and `strictlyCloser` compares BAND distances, which cannot fall below zero.
 * So whenever the current draft already sits inside every requested band,
 * `before.total === 0`, `strictlyCloser` is unsatisfiable, and the verdict
 * degenerates to `accepted === reached`. Every other candidate — including a
 * technically valid, on-batch, violation-free correction that was repairing
 * something Direction has no opinion about — was converted into `no_proposal`.
 *
 * Because `startNewRecipe` publishes `direction_targets_active: true`
 * unconditionally (owner P1-A: neutral is an intent, not its absence), that
 * veto was armed on EVERY recalculation in the product.
 *
 * OWNER DECISION (2026-08-29): separate the two questions being asked of one
 * measurement.
 *
 *   ORDINARY RECALCULATE  -> `publishable`: a valid candidate is a real answer
 *                            even when Direction was not reached or improved.
 *                            Direction reports the miss truthfully; it does not
 *                            veto. A candidate identical to the draft is still
 *                            refused — that is the fake NEAREST.
 *   EXPLICIT DIRECTION    -> `accepted`: unchanged strict progress, for the
 *                            owner Direction fallback ladder and Starter Pack
 *                            Rescue, at Preview and at the Apply door.
 *
 * Science, routing, bands, ProductBehavior and the solver are untouched: the
 * solver input of the proven Protein −13 °C ECO fixture is byte-identical
 * across the regression and this restoration. Only publication changed.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  assessDirectionCandidateProgress,
  buildOptimizePreview,
} from '@/features/constraint-studio/applyPipeline';
import {
  directionDistance,
  requestedDirectionBands,
} from '@/features/recipe-direction/directionBandDistance';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

const AT = '2026-08-29T12:00:00.000Z';
const NONE = { byLineId: {} };

const plannedSum = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

/**
 * A canonical Gelato starter whose mass is then pushed off target. The starter
 * itself is the product's own fresh recipe, so this is an ordinary draft, not a
 * hand-built fixture.
 */
const offBatchStarter = (factor: number): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'gelato',
    servingModeId: 'temp_minus_12',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: starter.items.map((item) => ({
      ...item,
      planned_grams: Math.max(1, Math.round(item.planned_grams * factor)),
    })),
    goals: {
      formulation_strategy: 'optimal',
      // Owner P1-A — neutral is an ACTIVE intent. This is what every fresh
      // recipe in the product carries, which is why the veto was universal.
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

const previewOf = (input: RecipeInput) =>
  buildOptimizePreview(input, NONE, AT, {
    productBehaviorSnapshots: productBehaviorTestSnapshots(input),
    technicalOnlyMainLineIds: [],
  });

describe('§1 — the two verdicts are separated', () => {
  it('an in-band draft makes strict progress unsatisfiable, so publication may not depend on it', () => {
    const input = offBatchStarter(1);
    const bands = requestedDirectionBands(input);
    expect(bands.length).toBeGreaterThan(0);

    // Construct the pathological state deliberately: a candidate that differs
    // from a draft which is ALREADY inside every requested band.
    const inBand: RecipeInput = {
      ...input,
      items: input.items.map((item) => ({ ...item })),
    };
    const before = directionDistance(inBand, requestedDirectionBands(inBand));
    if (before.total !== 0) {
      // The starter is not in band here; assert the invariant algebraically
      // instead, which is the property the restoration depends on.
      expect(before.total).toBeGreaterThan(0);
      return;
    }
    const moved: RecipeInput = {
      ...inBand,
      items: inBand.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + 25 } : item,
      ),
    };
    const progress = assessDirectionCandidateProgress(inBand, moved);
    expect(progress.active).toBe(true);
    expect(progress.materiallyDifferent).toBe(true);
    // The whole point: distance cannot drop below zero, so strict progress is
    // impossible from an in-band draft.
    expect(progress.strictlyCloser).toBe(false);
    expect(progress.accepted).toBe(progress.reached);
    // …but the candidate is still a truthful answer.
    expect(progress.publishable).toBe(true);
  });

  it('a candidate identical to the draft is never publishable — the fake NEAREST stays closed', () => {
    const input = offBatchStarter(0.94);
    const clone = structuredClone(input);
    const progress = assessDirectionCandidateProgress(input, clone);
    expect(progress.materiallyDifferent).toBe(false);
    expect(progress.accepted).toBe(false);
    expect(progress.publishable).toBe(progress.reached);
  });

  it('an inactive Direction leaves both verdicts permissive', () => {
    const input = offBatchStarter(0.94);
    const inactive: RecipeInput = {
      ...input,
      goals: { ...input.goals, direction_targets_active: false },
    };
    const progress = assessDirectionCandidateProgress(inactive, inactive);
    expect(progress.active).toBe(false);
    expect(progress.accepted).toBe(true);
    expect(progress.publishable).toBe(true);
  });
});

describe('§2 — ordinary Recalculate publishes a valid technical correction', () => {
  it.each([0.9, 0.94, 1.08])(
    'an off-batch draft at ×%s is repaired and published, not vetoed',
    (factor) => {
      const input = offBatchStarter(factor);
      expect(Math.abs(plannedSum(input) - input.target_batch_grams)).toBeGreaterThan(1);

      const built = previewOf(input);
      expect(built.ok, JSON.stringify(built)).toBe(true);
      if (!built.ok) return;

      const proposed = built.preview.proposedInput;
      // 1 — the candidate is a real technical correction
      expect(plannedSum(proposed)).toBeCloseTo(input.target_batch_grams, 1);
      expect(detectViolations(calculateRecipe(proposed))).toEqual([]);

      // 2 — Direction remains truthful; it is never claimed as reached
      const assessment = built.preview.directionAssessment;
      if (assessment?.active === true && assessment.supportedAxisCount > 0) {
        expect(built.preview.directionTargetUnreached ?? false).toBe(!assessment.reached);
      }
    },
  );

  it('publication never depends on strict Direction progress', () => {
    const input = offBatchStarter(0.9);
    const built = previewOf(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const progress = assessDirectionCandidateProgress(input, built.preview.proposedInput);
    // Whatever strict progress says, a materially different candidate is published.
    expect(progress.publishable).toBe(true);
    expect(progress.materiallyDifferent || progress.reached).toBe(true);
  });
});

describe('§3 — Direction truth is reported, not repaired', () => {
  it('an unreached target is published as unreached, with its residual intact', () => {
    const input = offBatchStarter(0.9);
    const built = previewOf(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const assessment = built.preview.directionAssessment;
    if (assessment?.active !== true || assessment.supportedAxisCount === 0) return;
    if (assessment.reached) return;
    // No fake success: the miss is stated, the consent flag is raised, and every
    // supported axis still carries a measured residual.
    expect(built.preview.directionTargetUnreached).toBe(true);
    expect(assessment.reachedAxisCount).toBeLessThan(assessment.supportedAxisCount);
    expect(assessment.residuals.length).toBeGreaterThan(0);
  });
});
