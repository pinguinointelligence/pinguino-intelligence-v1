import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { projectSorbetExactDirectionCandidate } from './sorbetDirectionProjection';
import {
  buildRecipeDirectionPlan,
  SORBET_HARDNESS_TARGET_CENTERS,
  SORBET_SWEETNESS_TARGET_CENTERS,
} from './recipeDirectionTargets';

const LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];
const STRATEGIES = ['eco', 'optimal'] as const;
const NONE = { byLineId: {} } as const;
const START_GRAMS = {
  water: 143,
  sucrose: 78,
  dextrose: 125,
  inulin: 50,
  tara_gum: 4,
} as const;

const ownerSorbet = (
  strategy: (typeof STRATEGIES)[number],
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: 'temp_minus_13',
    formulationStrategy: strategy,
    targetBatchGrams: 1_000,
  });
  const items = starter.items.map((item) => {
    const key = (Object.keys(START_GRAMS) as Array<keyof typeof START_GRAMS>).find((candidate) =>
      item.id.endsWith(candidate),
    );
    if (!key) throw new Error(`Unexpected Sorbet scaffold line ${item.id}`);
    return {
      ...item,
      ingredient: sorbetMapperIngredient(
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      ),
      planned_grams: START_GRAMS[key],
    };
  });
  const strawberry: RecipeItem = {
    id: 'line-strawberry',
    ingredient: sorbetMapperIngredient(SORBET_MAIN_IDS.strawberry),
    planned_grams: 600,
    actual_grams: null,
    lock_type: 'main',
    main_ratio_weight: 600,
    user_intent_anchor_grams: 600,
  };
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: -13,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [...items, strawberry],
    goals: {
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
    },
  };
};

const grams = (input: RecipeInput): number[] => input.items.map((item) => item.planned_grams);
const gramsFor = (input: RecipeInput, suffix: string): number | undefined =>
  input.items.find((item) => item.id.endsWith(suffix))?.planned_grams;

describe('Sorbet whole-gram Direction proof', () => {
  it('proves the canonical Strawberries 5×5 × ECO/OPTIMAL matrix and reports every transition', () => {
    const rows: unknown[] = [];
    const counts = { ACHIEVED: 0, PROVEN_NEAREST: 0, SEARCH_FAILED: 0 };
    const outputByCell = new Map<string, string>();

    for (const strategy of STRATEGIES) {
      for (const sweetness of LEVELS) {
        for (const softness of LEVELS) {
          const input = ownerSorbet(strategy, sweetness, softness);
          const key = `${strategy}/${sweetness}/${softness}`;
          expect(grams(input), `${key}: canonical start`).toEqual([143, 78, 125, 50, 4, 600]);
          expect(plannedSum(input), `${key}: start batch`).toBe(1_000);

          const plan = buildRecipeDirectionPlan(input);
          expect(plan.axes.find((axis) => axis.axis === 'sweetness')?.targetCenter, key).toBe(
            SORBET_SWEETNESS_TARGET_CENTERS[sweetness],
          );
          expect(plan.axes.find((axis) => axis.axis === 'softness')?.targetCenter, key).toBe(
            SORBET_HARDNESS_TARGET_CENTERS[-13][softness],
          );
          const continuous = projectSorbetExactDirectionCandidate(input);
          const built = buildOptimizePreview(input, NONE, `sorbet-whole-gram-${key}`, {
            productBehaviorSnapshots: sorbetAuthoritySnapshots(input),
            requirePracticalPreview: true,
          });
          expect(built.ok, `${key}: ${built.ok ? '' : JSON.stringify(built)}`).toBe(true);
          if (!built.ok) continue;

          const preview = built.preview;
          expect(preview.practicalization?.status, key).toBe('ready');
          if (preview.practicalization?.status !== 'ready') continue;
          const audit = preview.practicalization.audit;
          const proof = audit.sorbetDirectionResolution;
          expect(proof, key).toBeDefined();
          if (!proof) continue;
          counts[proof.status] += 1;
          expect(proof.completeCandidateSpace, key).toBe(true);
          expect(proof.evaluatedCandidates, key).toBe(59_340);
          expect(proof.legalCandidates, key).toBeGreaterThan(0);
          expect(proof.status, key).not.toBe('SEARCH_FAILED');

          const polished = preview.proposedInput;
          const result = calculateRecipe(polished);
          const direction = preview.directionAssessment!;
          expect(gramsFor(polished, 'line-strawberry'), `${key}: Main`).toBe(600);
          expect(gramsFor(polished, 'inulin'), `${key}: Inulin`).toBe(50);
          expect(gramsFor(polished, 'tara_gum'), `${key}: stabilizer`).toBe(4);
          expect(
            polished.items.every((item) => Number.isInteger(item.planned_grams)),
            key,
          ).toBe(true);
          expect(plannedSum(polished), `${key}: polished batch`).toBe(1_000);
          expect(detectViolations(result), `${key}: native`).toEqual([]);
          expect(
            result.warnings.filter((warning) => warning.severity === 'critical'),
            key,
          ).toEqual([]);
          expect(assessSorbetStabilizerSystem(polished).issues, key).toEqual([]);
          expect(direction.reached, key).toBe(proof.status === 'ACHIEVED');
          expect(direction.score, key).toBe(proof.status === 'ACHIEVED' ? 10 : 9);
          if (proof.status === 'ACHIEVED') {
            for (const residual of direction.residuals) {
              expect(residual.acceptance, `${key}/${residual.axis}`).not.toBe('missed');
              expect(residual.absoluteDistance ?? Infinity).toBeLessThanOrEqual(
                (residual.practicalTolerance ?? 0) + 1e-9,
              );
            }
          }

          const podTarget = SORBET_SWEETNESS_TARGET_CENTERS[sweetness];
          const npacTarget = SORBET_HARDNESS_TARGET_CENTERS[-13][softness];
          rows.push({
            strategy,
            sweetness,
            softness,
            requested: { pod: podTarget, npac: npacTarget },
            continuousProjection: continuous ? grams(continuous) : null,
            practicalWholeGram: grams(proof.initialExecutableInput),
            polishedWholeGram: grams(polished),
            actual: { pod: result.pod_points, npac: result.npac_points },
            residuals: direction.residuals.map((residual) => ({
              axis: residual.axis,
              absolute: residual.absoluteDistance,
              practicalTolerance: residual.practicalTolerance,
            })),
            nativeAndHardGates: 'PASS',
            publicDirectionScore: direction.score,
            status: proof.status,
            search: {
              evaluated: proof.evaluatedCandidates,
              legal: proof.legalCandidates,
              measure: proof.measure,
            },
          });

          const modeInvariant = JSON.stringify({
            continuous: continuous ? grams(continuous) : null,
            initial: grams(proof.initialExecutableInput),
            polished: grams(polished),
            pod: result.pod_points,
            npac: result.npac_points,
            score: direction.score,
            status: proof.status,
          });
          const cell = `${sweetness}/${softness}`;
          if (strategy === 'eco') outputByCell.set(cell, modeInvariant);
          else expect(modeInvariant, `${cell}: ECO/OPTIMAL behavior`).toBe(outputByCell.get(cell));
        }
      }
    }

    expect(rows).toHaveLength(50);
    expect(counts).toEqual({ ACHIEVED: 28, PROVEN_NEAREST: 22, SEARCH_FAILED: 0 });
    console.info('SORBET_WHOLE_GRAM_MATRIX', JSON.stringify({ counts, rows }));
  }, 180_000);

  it('fixes the owner 0/−1 vector and derives both achieved axes from one-gram resolution', () => {
    const input = ownerSorbet('optimal', 0, -1);
    const continuous = projectSorbetExactDirectionCandidate(input);
    expect(continuous).not.toBeNull();
    expect(grams(continuous!).map((value) => Number(value.toFixed(9)))).toEqual([
      149.616406922, 52.516675801, 143.866917277, 50, 4, 600,
    ]);
    const rounded = practicalizeRecipeCandidate(continuous!, NONE);
    expect(rounded.ok).toBe(true);
    if (!rounded.ok) return;
    expect(grams(rounded.audit.executableInput)).toEqual([150, 52, 144, 50, 4, 600]);

    const built = buildOptimizePreview(input, NONE, 'owner-0-minus-1', {
      productBehaviorSnapshots: sorbetAuthoritySnapshots(input),
      requirePracticalPreview: true,
    });
    expect(built.ok).toBe(true);
    if (!built.ok || built.preview.practicalization?.status !== 'ready') return;
    const proof = built.preview.practicalization.audit.sorbetDirectionResolution!;
    expect(proof.status).toBe('ACHIEVED');
    expect(grams(built.preview.proposedInput)).toEqual([150, 51, 145, 50, 4, 600]);
    const result = calculateRecipe(built.preview.proposedInput);
    expect(result.pod_points).toBeCloseTo(19.9286, 10);
    expect(result.npac_points).toBeCloseTo(52.93054998, 8);
    expect(proof.measure?.missedAxes).toBe(2);
    expect(proof.measure?.totalResidual).toBeCloseTo(0.10194998, 8);
    expect(built.preview.directionAssessment).toMatchObject({
      reached: true,
      reachedAxisCount: 2,
      score: 10,
    });
  });

  it('leaves Gelato, Vegan and Protein practicalization byte-identical when the Sorbet flag is present', () => {
    const base = starterMilkBase();
    for (const category of ['milk_gelato', 'vegan_gelato', 'protein_gelato'] as const) {
      const input = { ...base, category };
      const before = practicalizeRecipeCandidate(input, NONE);
      const after = practicalizeRecipeCandidate(input, NONE, new Set(), input.target_batch_grams, {
        sorbetDirectionPolish: true,
      });
      expect(JSON.stringify(after), category).toBe(JSON.stringify(before));
    }
  });
});
