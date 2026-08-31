/**
 * PC-03 — a Sorbet draft that is slightly off its target batch must still be
 * allowed to reach the exact-projection fast path.
 *
 * The recorded PC-03 acceptance cells were harness artefacts: the matrix filled
 * the target batch and then appended rotation ingredients without budgeting
 * them, producing 1030/1050 g against 1000 g, some also bypassing the Sorbet
 * stabilizer clamp. Neither the citrus fibre nor NEAREST coverage was the cause.
 *
 * The real customer-reachable shape comes from the canonical HOME journey: the
 * Crown auto-seeds the fruit Main at 1 g without re-budgeting the starter, so a
 * brand-new Sorbet sits at 1001 g against a 1000 g batch. That closed the
 * fast-path eligibility gate, which required the INCOMING draft to already be
 * on batch — even though `projectSorbetDirectionCandidate` solves FOR
 * `target_batch_grams` and needs no such precondition. The draft fell through to
 * the general search and could terminate `unsafe_proposal` while a safe
 * candidate existed.
 *
 * These tests assert ELIGIBILITY, never publishability: the fix lets the
 * projection be attempted, and the canonical downstream authorities still decide
 * the candidate.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints/constraintTypes';
import { detectViolations } from '@/engine/corrections/solver';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { projectSorbetExactDirectionCandidate } from '@/features/recipe-direction/sorbetDirectionProjection';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildOptimizePreview } from './applyPipeline';

const AT = '2026-08-31T09:00:00.000Z';
const TARGET = 1000;

/** The canonical Sorbet support scaffold — the product's own starter, never a
 *  hand-written vector. At −11 °C it is 400 g and names a 600 g missing Main. */
const starter = buildCanonicalNewRecipeStarter({
  visibleProductType: 'sorbet',
  servingModeId: 'temp_minus_11',
  formulationStrategy: 'optimal',
  targetBatchGrams: TARGET,
});
const starterSum = starter.items.reduce((total, item) => total + item.planned_grams, 0);
const RASPBERRY = findDemoIngredient('raspberry')!;

const support = (scale = 1) =>
  starter.items.map((item, index) => ({
    ...item,
    id: `pc03-support-${index}`,
    ingredient: structuredClone(item.ingredient),
    planned_grams: item.planned_grams * scale,
  }));

const main = (grams: number) => ({
  id: 'pc03-main-raspberry',
  ingredient: structuredClone(RASPBERRY),
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'main' as const,
  main_ratio_weight: grams,
  user_intent_anchor_grams: grams,
});

const make = (
  items: ReadonlyArray<ReturnType<typeof main>> | RecipeInput['items'],
  sweetness: RecipeDirectionTarget,
  hardness: RecipeDirectionTarget,
  extra: Partial<RecipeInput> = {},
): RecipeInput => ({
  mode: 'classic',
  category: 'sorbet',
  target_temperature_c: -11,
  target_batch_grams: TARGET,
  machine_capacity_grams: null,
  items: items as RecipeInput['items'],
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 },
  },
  ...extra,
});

/**
 * The served shape, reproduced exactly as staging builds it: the ordinary
 * support lines are scaled to fill the batch while the owner stabilizer system
 * is held at its whole-gram value (that is the PC-02 projection at work), and
 * the Crown then seeds the fruit Main at 1 g ON TOP — 1001 g against 1000 g.
 * Scaling the stabilizer with everything else would instead manufacture an
 * illegal 10 g system and test something entirely different.
 */
const crownDebtDraft = (sweetness: RecipeDirectionTarget, hardness: RecipeDirectionTarget) => {
  const held = starter.items.filter(
    (item) => resolveFunctionalRole(item.ingredient) === 'stabilizer',
  );
  const heldGrams = held.reduce((total, item) => total + item.planned_grams, 0);
  const ordinaryGrams = starterSum - heldGrams;
  const scale = (TARGET - heldGrams) / ordinaryGrams;
  const items = starter.items.map((item, index) => ({
    ...item,
    id: `pc03-support-${index}`,
    ingredient: structuredClone(item.ingredient),
    planned_grams:
      resolveFunctionalRole(item.ingredient) === 'stabilizer'
        ? item.planned_grams
        : item.planned_grams * scale,
  }));
  return make([...items, main(1)] as RecipeInput['items'], sweetness, hardness);
};

/** An ordinary complete Sorbet: canonical support + a real fruit Main. */
const completeDraft = (
  sweetness: RecipeDirectionTarget,
  hardness: RecipeDirectionTarget,
  delta = 0,
) =>
  make(
    [
      ...support().map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + delta } : item,
      ),
      main(TARGET - starterSum),
    ] as RecipeInput['items'],
    sweetness,
    hardness,
  );

const plannedSum = (input: RecipeInput) =>
  input.items.reduce((total, item) => total + item.planned_grams, 0);

const preview = (input: RecipeInput, set: ConstraintSet = { byLineId: {} }) =>
  buildOptimizePreview(input, set, AT, {
    productBehaviorSnapshots: productBehaviorTestSnapshots(input, []),
    technicalOnlyMainLineIds: [],
    requirePracticalPreview: true,
  } as never);

/** Would the canonical authorities accept the projection's own candidate? */
const safeImprovingCandidateExists = (input: RecipeInput): boolean => {
  const candidate = projectSorbetExactDirectionCandidate(input);
  if (candidate === null) return false;
  const result = calculateRecipe(candidate);
  return (
    detectViolations(result).length === 0 &&
    !result.warnings.some((warning) => warning.severity === 'critical') &&
    recipeDirectionViolations(candidate).length < recipeDirectionViolations(input).length
  );
};

describe('PC-03 — an off-batch Sorbet draft still reaches the exact projection', () => {
  it('0. the reachable fixture is a complete, legal Sorbet that is off batch', () => {
    // The customer-reachable route: a complete Sorbet, then one ordinary edit
    // or added ingredient, which the store does NOT re-budget. Everything about
    // it is legal except the batch sum.
    const input = completeDraft(-2, -1, 1);
    expect(plannedSum(input)).toBeCloseTo(TARGET + 1, 6);
    expect(Math.abs(plannedSum(input) - TARGET)).toBeGreaterThan(0.1);
    expect(input.items.filter((item) => item.lock_type === 'main')).toHaveLength(1);
    expect(input.items.every((item) => item.actual_grams === null)).toBe(true);
    // A safe, Direction-improving candidate demonstrably exists for it.
    expect(safeImprovingCandidateExists(input)).toBe(true);
  });

  it('1. an off-batch draft publishes a violation-free proposal on the target batch', () => {
    const result = preview(completeDraft(-2, -1, 1));
    expect(result.ok ? 'OK' : (result as { code: string }).code).not.toBe('unsafe_proposal');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposed = result.preview.proposedInput;
    // The canonical batch invariant still decides: the proposal is ON batch.
    expect(Math.abs(plannedSum(proposed) - TARGET)).toBeLessThanOrEqual(0.1);
    // ...and the Engine, not the projection, clears it.
    const proposedResult = calculateRecipe(proposed);
    expect(detectViolations(proposedResult)).toEqual([]);
    expect(proposedResult.warnings.filter((warning) => warning.severity === 'critical')).toEqual([]);
  });

  it('1b. the proposal comes from the exact projection, not the general search', () => {
    /* The defect was eligibility: an off-batch draft never reached the
       closed-form projection and fell through to the general search. This pins
       the route itself, so the repair cannot silently regress into "the slow
       path happened to succeed". */
    const result = preview(completeDraft(-2, -1, 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.directionCandidateSource).toBe('sorbet_exact_projection');
    // Reconciling an off-batch draft onto its target IS a batch rescale, and
    // the provenance record says so.
    expect(result.preview.autoBalance).toEqual({ batchRescaled: true, solverRounds: 0 });
  });

  it('2. the crowned Main survives the reconciliation, positive', () => {
    const result = preview(completeDraft(-2, -1, 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const crowned = result.preview.proposedInput.items.filter((item) => item.lock_type === 'main');
    expect(crowned).toHaveLength(1);
    expect(crowned[0]!.planned_grams).toBeGreaterThan(0);
    // The batch is never reconciled by erasing the Main the customer chose.
    expect(crowned[0]!.ingredient.name).toBe(RASPBERRY.name);
  });

  it('2b. the served Crown-debt draft is refused for its OWN reason, not the batch', () => {
    /* The canonical HOME journey seeds the fruit Main at 1 g and scales the
       support lines to fill the batch, which pushes INULIN to ~124 g against
       the 20–80 g (2–8 %) Gellatti range. That draft is therefore
       independently unpublishable, and PC-03 deliberately does not paper over
       it: this test pins the fact so the inulin debt is not mistaken for the
       batch-eligibility defect. Recorded as separate follow-up. */
    const input = crownDebtDraft(-1, 0);
    expect(Math.abs(plannedSum(input) - TARGET)).toBeGreaterThan(0.1);
    const inulin = input.items.find((item) =>
      item.ingredient.name.toUpperCase().includes('INULIN'),
    );
    expect(inulin!.planned_grams).toBeGreaterThan(80);
    const result = preview(input);
    // Whatever the terminal is, nothing violating may be published.
    if (result.ok) {
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
    }
  });

  it.each([0.1, 1, 30, -1, -30])(
    '3. a %s g batch delta alone never forces the unsafe terminal',
    (delta) => {
      const input = completeDraft(-2, -1, delta);
      expect(Math.abs(plannedSum(input) - TARGET)).toBeGreaterThan(0.1);
      // Eligibility, not publishability: the terminal is only asserted when a
      // safe improving candidate genuinely exists for this draft.
      if (!safeImprovingCandidateExists(input)) return;
      const result = preview(input);
      expect(result.ok ? 'OK' : (result as { code: string }).code).not.toBe('unsafe_proposal');
      if (!result.ok) return;
      // The batch delta must not cost correctness either: before this fix the
      // general search published a proposal carrying an Engine violation at
      // ±30 g. Anything published must be clean and on batch.
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
      expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    },
  );

  it('4. the on-batch draft is unchanged', () => {
    const input = completeDraft(-2, -1);
    expect(plannedSum(input)).toBeCloseTo(TARGET, 6);
    const result = preview(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
  });

  it('5. a physically weighed line still keeps the projection closed', () => {
    // `actual_grams` remains an eligibility condition — untouched by this fix.
    const base = completeDraft(-2, -1, 1);
    const weighed: RecipeInput = {
      ...base,
      items: base.items.map((item, index) =>
        index === 0 ? { ...item, actual_grams: item.planned_grams } : item,
      ),
    };
    expect(projectSorbetExactDirectionCandidate(weighed)).toBeNull();
  });

  it('6. a genuinely unsafe off-batch draft is still refused or cleaned', () => {
    // Almost the whole batch as sucrose: no projection can make this safe.
    const unsafe = make(
      [
        ...support().map((item) =>
          item.ingredient.name.toUpperCase().includes('SUCROSE')
            ? { ...item, planned_grams: 900 }
            : { ...item, planned_grams: 1 },
        ),
        main(1),
      ] as RecipeInput['items'],
      -2,
      -1,
    );
    expect(Math.abs(plannedSum(unsafe) - TARGET)).toBeGreaterThan(0.1);
    const result = preview(unsafe);
    if (result.ok) {
      // Anything published must be genuinely clean and on batch.
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
      expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    } else {
      expect((result as { code: string }).code).not.toBe('OK');
    }
  });

  it('7. a canonical gram lock stays authoritative on an off-batch draft', () => {
    // A lock reaches the pipeline through the ConstraintSet — that is the
    // authority `verifyConstraintsPreserved` consults on every candidate.
    const base = completeDraft(-2, -1, 1);
    const sucrose = base.items.find((item) =>
      item.ingredient.name.toUpperCase().includes('SUCROSE'),
    )!;
    const set: ConstraintSet = {
      byLineId: { [sucrose.id]: { mode: 'locked', grams: sucrose.planned_grams } },
    };
    const result = preview(base, set);
    if (result.ok) {
      const proposed = result.preview.proposedInput.items.find((item) => item.id === sucrose.id);
      expect(proposed!.planned_grams).toBeCloseTo(sucrose.planned_grams, 6);
    }
  });

  it('8. the projection still refuses a non-Sorbet and an inactive Direction', () => {
    const offBatch = completeDraft(-2, -1, 1);
    expect(
      projectSorbetExactDirectionCandidate({ ...offBatch, category: 'milk_gelato' }),
    ).toBeNull();
    expect(
      projectSorbetExactDirectionCandidate({
        ...offBatch,
        goals: { ...offBatch.goals, direction_targets_active: false },
      }),
    ).toBeNull();
  });
});
