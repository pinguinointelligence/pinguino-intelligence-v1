import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  plannedSum,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';
import { assessGelatoStabilizerSystem } from '@/features/recipe-constraints';

import { assessRecipeDirection } from './recipeDirectionAssessment';
import {
  buildRecipeDirectionPlan,
  recipeDirectionViolations,
} from './recipeDirectionTargets';

const EMPTY = { byLineId: {} } as const;
const TARGETS = [-2, -1, 0, 1, 2] as const;
const TEMPERATURES = [-11, -12, -13] as const;
const STRATEGIES = ['optimal', 'eco'] as const;

const line = (id: string, ingredientId: string) => ({
  id,
  ingredient: findDemoIngredient(ingredientId)!,
  planned_grams: 0,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const gelatoDraft = (temperature: (typeof TEMPERATURES)[number]): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: temperature,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    line('milk', 'milk_3_5'),
    line('cream', 'cream_30'),
    line('smp', 'smp'),
    line('sucrose', 'sucrose'),
    line('dextrose', 'dextrose'),
    line('inulin', 'inulin'),
    line('tara', 'tara_gum'),
  ],
});

const baseCache = new Map<number, RecipeInput>();
const canonicalBase = (temperature: (typeof TEMPERATURES)[number]): RecipeInput => {
  const cached = baseCache.get(temperature);
  if (cached) return structuredClone(cached);
  const built = buildOptimizePreview(gelatoDraft(temperature), EMPTY, `gelato-base-${temperature}`);
  expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
  if (!built.ok) throw new Error(`Missing canonical Gelato base for ${temperature}`);
  expect(built.preview.diagnosticOnly).not.toBe(true);
  expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);
  baseCache.set(temperature, built.preview.proposedInput);
  return structuredClone(built.preview.proposedInput);
};

const directed = (
  base: RecipeInput,
  strategy: (typeof STRATEGIES)[number],
  sweetness: RecipeDirectionTarget,
  hardness: RecipeDirectionTarget,
): RecipeInput => ({
  ...base,
  goals: {
    ...base.goals,
    formulation_strategy: strategy,
    direction_targets_active: true,
    direction_targets: {
      sweetness,
      // Historical field name; exact sign follows the visible Twardość control.
      softness: hardness,
      creaminess: 0,
      flavor: 0,
    },
  },
});

const severity = (input: RecipeInput): number =>
  recipeDirectionViolations(input).reduce(
    (sum, violation) => sum + violation.severity_points,
    0,
  );

describe('Gelato exact five-step Direction source of truth', () => {
  it('preserves all five values in the canonical fingerprint and ordered approved bands', () => {
    const base = canonicalBase(-12);
    const fingerprints = TARGETS.map((target) =>
      directionTargetFingerprint(directed(base, 'optimal', target, 0)),
    );
    expect(new Set(fingerprints)).toHaveLength(5);

    const sweetnessCenters = TARGETS.map((target) => {
      const band = buildRecipeDirectionPlan(directed(base, 'optimal', target, 0)).bands.pod!;
      return (band.min + band.max) / 2;
    });
    const hardnessCenters = TARGETS.map((target) => {
      const band = buildRecipeDirectionPlan(directed(base, 'optimal', 0, target)).bands.npac!;
      return (band.min + band.max) / 2;
    });
    for (let index = 1; index < TARGETS.length; index += 1) {
      expect(sweetnessCenters[index]).toBeGreaterThan(sweetnessCenters[index - 1]!);
      expect(hardnessCenters[index]).toBeLessThan(hardnessCenters[index - 1]!);
    }
  });

  it('runs 3 temperatures × 2 strategies × 5 sweetness × 5 hardness = 150', () => {
    let cells = 0;
    for (const temperature of TEMPERATURES) {
      const base = canonicalBase(temperature);
      for (const strategy of STRATEGIES) {
        for (const sweetness of TARGETS) {
          for (const hardness of TARGETS) {
            cells += 1;
            const input = directed(base, strategy, sweetness, hardness);
            const nativeBefore = detectViolations(calculateRecipe(input));
            const directionBefore = recipeDirectionViolations(input);
            const severityBefore = severity(input);
            const fitBefore = recipeFitForInput(input);
            expect(nativeBefore, `${temperature}/${strategy}/${sweetness}/${hardness}`).toEqual([]);

            const built = buildOptimizePreview(
              input,
              EMPTY,
              `matrix-${temperature}-${strategy}-${sweetness}-${hardness}`,
            );

            if (!built.ok) {
              if (built.code === 'already_clean') {
                expect(directionBefore).toEqual([]);
                expect(assessRecipeDirection(input, calculateRecipe(input)).reached).toBe(true);
                expect(fitBefore.score).toBe(10);
                continue;
              }
              expect(built.code).toBe('no_proposal');
              if (built.code !== 'no_proposal') continue;
              expect(built.directionTargetUnreached).toBe(true);
              expect(directionBefore.length).toBeGreaterThan(0);
              expect(built.solverInvocations ?? 0).toBeGreaterThan(0);
              expect(built.iteration?.draftVectorSearches ?? 0).toBeGreaterThan(0);
              continue;
            }

            const proposed = built.preview.proposedInput;
            const nativeAfter = detectViolations(calculateRecipe(proposed));
            const directionAfter = recipeDirectionViolations(proposed);
            const severityAfter = severity(proposed);
            const fitAfter = recipeFitForInput(proposed);
            expect(built.preview.diagnosticOnly).not.toBe(true);
            expect(nativeAfter).toEqual([]);
            expect(plannedSum(proposed)).toBeCloseTo(proposed.target_batch_grams, 6);
            expect(proposed.goals?.direction_targets).toEqual(
              input.goals?.direction_targets,
            );
            expect(
              directionAfter.length,
              JSON.stringify({
                temperature,
                strategy,
                sweetness,
                hardness,
                severityBefore,
                directionBefore: directionBefore.length,
                directionAfter: directionAfter.length,
                fitBefore: fitBefore.score,
                fitAfter: fitAfter.score,
                formulation: built.preview.formulation,
                mainObjective: built.preview.mainObjective,
              }),
            ).toBeLessThanOrEqual(directionBefore.length);
            if (directionBefore.length > 0) {
              if (directionAfter.length === directionBefore.length) {
                expect(severityAfter).toBeLessThan(severityBefore - 1e-9);
              }
              expect(
                fitAfter.score ?? 0,
                JSON.stringify({
                  temperature,
                  strategy,
                  sweetness,
                  hardness,
                  before: fitBefore.score,
                  after: fitAfter.score,
                  severityBefore,
                  severityAfter,
                  iteration: built.preview.iteration,
                }),
              ).toBeGreaterThanOrEqual(fitBefore.score ?? 0);
            }

            const assessment = assessRecipeDirection(proposed, calculateRecipe(proposed));
            const withoutConsent = commitPreview(
              input,
              EMPTY,
              built.preview,
              'matrix-apply',
              `matrix-${cells}`,
            );
            if (assessment.reached) {
              expect(withoutConsent.ok).toBe(true);
            } else {
              expect(withoutConsent).toMatchObject({
                ok: false,
                code: 'direction_consent_required',
              });
              const consent = {
                baseFingerprint: built.preview.baseFingerprint,
                targetFingerprint: directionTargetFingerprint(input),
                candidateFingerprint: workingStateFingerprint(
                  proposed,
                  built.preview.nextConstraints,
                ),
              };
              const committed = commitPreview(
                input,
                EMPTY,
                built.preview,
                'matrix-consented-apply',
                `matrix-consented-${cells}`,
                [],
                undefined,
                null,
                null,
                consent,
              );
              expect(committed.ok).toBe(true);
            }
          }
        }
      }
    }
    expect(cells).toBe(150);
  }, 120_000);

  it('recomputes Score from exact current grams and restores it on target round-trip', () => {
    const base = canonicalBase(-12);
    const neutralRequest = directed(base, 'optimal', 0, 0);
    const neutralBuilt = buildOptimizePreview(neutralRequest, EMPTY, 'neutral-score-seed');
    expect(neutralBuilt.ok).toBe(true);
    if (!neutralBuilt.ok) return;
    const neutral = directed(neutralBuilt.preview.proposedInput, 'optimal', 0, 0);
    const neutralScore = recipeFitForInput(neutral).score;
    expect(neutralScore).toBe(10);

    const extreme = directed(neutral, 'optimal', -2, 2);
    const extremeScore = recipeFitForInput(extreme).score;
    expect(extremeScore).toBeLessThan(neutralScore!);
    expect(recipeFitForInput(directed(neutral, 'optimal', 0, 0)).score).toBe(neutralScore);

    const recalculated = buildOptimizePreview(extreme, EMPTY, 'score-drop-must-search');
    expect(
      recalculated.ok ||
        (recalculated.code === 'no_proposal' && recalculated.directionTargetUnreached === true),
    ).toBe(true);
    expect(recalculated).not.toMatchObject({ ok: false, code: 'already_clean' });
  });

  it('respects key locks and reports a fully locked extreme as nearest-achievable', () => {
    const base = canonicalBase(-12);
    const input = directed(base, 'optimal', 2, -2);
    const constraints = {
      byLineId: Object.fromEntries(
        input.items.map((item) => [item.id, { mode: 'locked' as const, grams: item.planned_grams }]),
      ),
    };
    const result = buildOptimizePreview(input, constraints, 'fully-locked-direction');
    expect(result).toMatchObject({
      ok: false,
      code: 'no_proposal',
      directionTargetUnreached: true,
    });
    if (!result.ok && result.code === 'no_proposal') {
      expect(result.solverInvocations ?? 0).toBeGreaterThan(0);
      expect(result.violatedMetrics).toEqual(expect.arrayContaining(['pod', 'npac']));
    }

    const partialConstraints = {
      byLineId: Object.fromEntries(
        input.items
          .filter((item) => !['sucrose', 'dextrose'].includes(item.id))
          .map((item) => [item.id, { mode: 'locked' as const, grams: item.planned_grams }]),
      ),
    };
    const partial = buildOptimizePreview(input, partialConstraints, 'two-free-direction');
    if (!partial.ok) {
      expect(partial).toMatchObject({
        code: 'no_proposal',
        directionTargetUnreached: true,
      });
      return;
    }
    for (const [lineId, constraint] of Object.entries(partialConstraints.byLineId)) {
      expect(
        partial.preview.proposedInput.items.find((item) => item.id === lineId)?.planned_grams,
      ).toBe(constraint.grams);
    }
    expect(detectViolations(calculateRecipe(partial.preview.proposedInput))).toEqual([]);
  });

  it.each([1_000, 1_500, 10_000, 1_237])(
    'keeps exact Direction and whole-gram stabilizer authority at %i g batch',
    (batch) => {
      const draft: RecipeInput = { ...gelatoDraft(-12), target_batch_grams: batch };
      const seeded = buildOptimizePreview(draft, EMPTY, `batch-seed-${batch}`);
      expect(seeded.ok, JSON.stringify(seeded)).toBe(true);
      if (!seeded.ok) return;
      const base = seeded.preview.proposedInput;
      expect(plannedSum(base)).toBeCloseTo(batch, 6);
      expect(assessGelatoStabilizerSystem(base).issues).toEqual([]);

      const input = directed(base, 'optimal', -2, 2);
      const result = buildOptimizePreview(input, EMPTY, `batch-direction-${batch}`);
      if (!result.ok) {
        expect(result).toMatchObject({
          code: 'no_proposal',
          directionTargetUnreached: true,
        });
        return;
      }
      expect(plannedSum(result.preview.proposedInput)).toBeCloseTo(batch, 6);
      expect(result.preview.proposedInput.goals?.direction_targets).toEqual(
        input.goals?.direction_targets,
      );
      expect(assessGelatoStabilizerSystem(result.preview.proposedInput).issues).toEqual([]);
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
    },
  );
});
