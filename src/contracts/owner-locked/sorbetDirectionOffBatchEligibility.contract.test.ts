/**
 * OWNER-LOCKED — PC-03. Sorbet exact-projection eligibility does not require
 * the incoming draft to already sit on the target batch.
 *
 * Purely additive; it weakens no gate and no authority.
 *
 * The recorded PC-03 acceptance cells were harness artefacts — the matrix
 * appended rotation ingredients without budgeting them (1030/1050 g against
 * 1000 g) and the Sorbet extra bypassed the stabilizer clamp. Neither the
 * citrus fibre nor NEAREST coverage was causal: the exact projection already
 * returns a candidate with zero Engine violations for those fixtures.
 *
 * The real defect was one eligibility condition. `projectSorbetDirectionCandidate`
 * solves FOR `target_batch_grams` — the batch is the first row of its 3×3
 * system — so an off-batch draft is exactly the one it repairs. Requiring the
 * INPUT to be on batch excluded the canonical HOME journey, where the Crown
 * auto-seeds the fruit Main at 1 g without re-budgeting the starter, and sent
 * those drafts down the general search: ~50–92 s instead of milliseconds, and
 * at ±30 g a published proposal that carried an Engine violation.
 *
 * This contract locks the SHAPE of the repair: eligibility is widened, nothing
 * downstream is. The projection must still be refused where it always was, and
 * `enforceTargetBatchInvariant` remains the final batch authority.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { detectViolations } from '@/engine/corrections/solver';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { projectSorbetExactDirectionCandidate } from '@/features/recipe-direction/sorbetDirectionProjection';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';

const AT = '2026-08-31T09:00:00.000Z';
/** Real solver runs; the vitest default of 5000 ms is far too short. */
const SOLVER_TIMEOUT_MS = 600_000;
const TARGET = 1000;

const starter = buildCanonicalNewRecipeStarter({
  visibleProductType: 'sorbet',
  servingModeId: 'temp_minus_11',
  formulationStrategy: 'optimal',
  targetBatchGrams: TARGET,
});
const starterSum = starter.items.reduce((total, item) => total + item.planned_grams, 0);
const RASPBERRY = findDemoIngredient('raspberry')!;

/** A complete, legal Sorbet, nudged only in its batch sum. */
const draft = (delta: number): RecipeInput => ({
  mode: 'classic',
  category: 'sorbet',
  target_temperature_c: -11,
  target_batch_grams: TARGET,
  machine_capacity_grams: null,
  items: [
    ...starter.items.map((item, index) => ({
      ...item,
      id: `gel24-${index}`,
      ingredient: structuredClone(item.ingredient),
      planned_grams: index === 0 ? item.planned_grams + delta : item.planned_grams,
    })),
    {
      id: 'gel24-main',
      ingredient: structuredClone(RASPBERRY),
      planned_grams: TARGET - starterSum,
      actual_grams: null,
      lock_type: 'main' as const,
      main_ratio_weight: TARGET - starterSum,
      user_intent_anchor_grams: TARGET - starterSum,
    },
  ] as RecipeInput['items'],
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness: -2, softness: -1, creaminess: 0, flavor: 0 },
  },
});

const plannedSum = (input: RecipeInput) =>
  input.items.reduce((total, item) => total + item.planned_grams, 0);

const preview = (input: RecipeInput) =>
  buildOptimizePreview(input, { byLineId: {} }, AT, {
    productBehaviorSnapshots: productBehaviorTestSnapshots(input, []),
    technicalOnlyMainLineIds: [],
    requirePracticalPreview: true,
  } as never);

describe('OWNER-LOCKED — an off-batch Sorbet still reaches the exact projection', () => {
  it('1. an off-batch draft is solved by the exact projection, not the general search', () => {
    const result = preview(draft(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.directionCandidateSource).toBe('sorbet_exact_projection');
  }, SOLVER_TIMEOUT_MS);

  it('2. what it publishes is on batch and violation-free', () => {
    for (const delta of [0.1, 1, 30, -1, -30]) {
      const result = preview(draft(delta));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const proposed = result.preview.proposedInput;
      expect(Math.abs(plannedSum(proposed) - TARGET)).toBeLessThanOrEqual(0.1);
      expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
    }
  }, SOLVER_TIMEOUT_MS);

  it('3. the crowned Main is never erased to reconcile the batch', () => {
    const result = preview(draft(30));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const crowned = result.preview.proposedInput.items.filter((item) => item.lock_type === 'main');
    expect(crowned).toHaveLength(1);
    expect(crowned[0]!.planned_grams).toBeGreaterThan(0);
  }, SOLVER_TIMEOUT_MS);

  it('4. the on-batch route is unchanged', () => {
    const result = preview(draft(0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
  }, SOLVER_TIMEOUT_MS);

  it('5. every OTHER eligibility condition still holds', () => {
    const offBatch = draft(1);
    // Not a Sorbet.
    expect(projectSorbetExactDirectionCandidate({ ...offBatch, category: 'milk_gelato' })).toBeNull();
    // No active exact Direction objective.
    expect(
      projectSorbetExactDirectionCandidate({
        ...offBatch,
        goals: { ...offBatch.goals, direction_targets_active: false },
      }),
    ).toBeNull();
    // A physically weighed line.
    expect(
      projectSorbetExactDirectionCandidate({
        ...offBatch,
        items: offBatch.items.map((item, index) =>
          index === 0 ? { ...item, actual_grams: item.planned_grams } : item,
        ),
      }),
    ).toBeNull();
  }, SOLVER_TIMEOUT_MS);

  it('6. a MULTI-Main off-batch draft is left to the certified Main frontier', () => {
    /* The relaxation is deliberately narrow. A multi-Main draft that is off
       batch is off batch because its Main GROUP is short, and the frontier —
       not a projection that holds the Main — must answer it. The served
       two-Crown 150/150 Sorbet regression depends on this. */
    const base = draft(0);
    const mainIndex = base.items.findIndex((item) => item.lock_type === 'main');
    const half = base.items[mainIndex]!.planned_grams / 4;
    const multi: RecipeInput = {
      ...base,
      items: [
        ...base.items.filter((item) => item.lock_type !== 'main'),
        { ...base.items[mainIndex]!, id: 'gel24-main-a', planned_grams: half,
          main_ratio_weight: half, user_intent_anchor_grams: half },
        { ...base.items[mainIndex]!, id: 'gel24-main-b', ingredient: structuredClone(RASPBERRY),
          planned_grams: half, main_ratio_weight: half, user_intent_anchor_grams: half },
      ] as RecipeInput['items'],
    };
    expect(Math.abs(plannedSum(multi) - TARGET)).toBeGreaterThan(0.1);
    expect(multi.items.filter((item) => item.lock_type === 'main')).toHaveLength(2);
    const result = preview(multi);
    if (result.ok) {
      // Whatever answers it, the projection must not have frozen the short Main
      // group: either another route produced it, or the group actually grew.
      const mains = result.preview.proposedInput.items.filter((i) => i.lock_type === 'main');
      const grew = mains.reduce((sum, i) => sum + i.planned_grams, 0) > half * 2 + 1e-6;
      expect(result.preview.directionCandidateSource !== 'sorbet_exact_projection' || grew).toBe(
        true,
      );
    }
  }, SOLVER_TIMEOUT_MS);

  it('6b. an off-batch draft with NO Main is left to its missing-role refusal', () => {
    /* GEL-P0-014: an incomplete scaffold must stop on the missing role rather
       than read as a batch/solver failure. Off-batch entry therefore requires
       EXACTLY one Main — not "at most one". */
    const base = draft(1);
    const scaffold: RecipeInput = {
      ...base,
      items: base.items.filter((item) => item.lock_type !== 'main') as RecipeInput['items'],
    };
    expect(scaffold.items.some((item) => item.lock_type === 'main')).toBe(false);
    expect(Math.abs(plannedSum(scaffold) - TARGET)).toBeGreaterThan(0.1);
    const result = preview(scaffold);
    if (result.ok) {
      expect(result.preview.directionCandidateSource).not.toBe('sorbet_exact_projection');
    }
  }, SOLVER_TIMEOUT_MS);

  it('7. the final batch authority is untouched', () => {
    const source = readFileSync('src/features/constraint-studio/applyPipeline.ts', 'utf8');
    expect(source).toContain('function enforceTargetBatchInvariant');
    expect(source).toContain('plannedSum(result.preview.proposedInput) - target');
  }, SOLVER_TIMEOUT_MS);
});
