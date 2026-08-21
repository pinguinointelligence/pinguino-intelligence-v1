import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type ProductCategory, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import {
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  plannedSum,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { recipeTechnicalFit } from '@/features/recipe-score';
import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

const EMPTY = { byLineId: {} } as const;
const line = (
  id: string,
  ingredientId: string,
  grams = 0,
  lockType: 'unlocked' | 'main' = 'unlocked',
) => ({
  id,
  ingredient: findDemoIngredient(ingredientId)!,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
});

const draft = (category: ProductCategory, temperature: -11 | -12 | -13): RecipeInput => {
  const common = {
    mode: 'classic' as const,
    category,
    target_temperature_c: temperature,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
  };
  if (category === 'sorbet') {
    return {
      ...common,
      items: [
        line('fruit', 'raspberry'),
        line('sucrose', 'sucrose'),
        line('dextrose', 'dextrose'),
        line('inulin', 'inulin'),
        line('tara', 'tara_gum'),
      ],
    };
  }
  if (category === 'vegan_gelato') {
    return {
      ...common,
      items: [
        {
          id: 'oat',
          ingredient: findVerifiedVeganFormulationCandidate('PI-ING-001565')!,
          planned_grams: 0,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'coconut',
          ingredient: findVerifiedVeganFormulationCandidate('PI-ING-000163')!,
          planned_grams: 0,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        line('sucrose', 'sucrose'),
        line('dextrose', 'dextrose'),
        line('inulin', 'inulin'),
        line('tara', 'tara_gum'),
      ],
    };
  }
  if (category === 'protein_gelato') {
    return {
      ...common,
      mode: 'signature',
      goals: { target_protein_percent: 20 },
      items: [line('fruit', 'raspberry', 100, 'main')],
    };
  }
  if (category === 'chocolate_gelato') {
    return {
      ...common,
      items: [
        line('milk', 'milk_3_5'),
        line('cream', 'cream_30'),
        line('smp', 'smp'),
        line('sucrose', 'sucrose'),
        line('dextrose', 'dextrose'),
        line('chocolate', 'dark_chocolate_70', 0, 'main'),
        line('cocoa', 'cocoa_2224'),
        line('tara', 'tara_gum'),
      ],
    };
  }
  return {
    ...common,
    items: [
      line('milk', 'milk_3_5'),
      line('cream', 'cream_30'),
      line('smp', 'smp'),
      line('sucrose', 'sucrose'),
      line('dextrose', 'dextrose'),
      line('inulin', 'inulin'),
      line('tara', 'tara_gum'),
    ],
  };
};

const baseCache = new Map<string, RecipeInput>();
const cleanBase = (category: ProductCategory, temperature: -11 | -12 | -13): RecipeInput => {
  const key = `${category}:${temperature}`;
  const cached = baseCache.get(key);
  if (cached) return structuredClone(cached);
  const direct = buildOptimizePreview(draft(category, temperature), EMPTY, 'matrix-seed');
  if (direct.ok) {
    baseCache.set(key, direct.preview.proposedInput);
    return structuredClone(direct.preview.proposedInput);
  }
  // Chocolate owns an approved −11 formulation seed. Its −12/−13 Direction
  // behavior is exercised from that already-existing recipe, not by pretending
  // a new-formulation template exists for those temperatures.
  if (category === 'chocolate_gelato' && temperature !== -11) {
    const minus11 = cleanBase(category, -11);
    const moved = { ...minus11, target_temperature_c: temperature };
    const corrected = buildOptimizePreview(moved, EMPTY, 'matrix-temp');
    const base = corrected.ok ? corrected.preview.proposedInput : moved;
    baseCache.set(key, base);
    return structuredClone(base);
  }
  throw new Error(`No approved base for ${key}: ${direct.code}`);
};

const CELLS = (
  ['milk_gelato', 'sorbet', 'vegan_gelato', 'chocolate_gelato', 'protein_gelato'] as const
).flatMap((category) =>
  ([-11, -12, -13] as const).map((temperature) => [category, temperature] as const),
);

describe('Direction operational acceptance matrix', () => {
  it.each(CELLS)(
    '%s @ %d applies every operational target and labels unsupported axes before solving',
    (category, temperature) => {
      for (const axis of ['sweetness', 'softness'] as const) {
        const applicable: Array<{ requested: -1 | 0 | 1; value: number }> = [];
        for (const requested of [-1, 0, 1] as const) {
          const planningInput: RecipeInput = {
            ...draft(category, temperature),
            goals: {
              ...draft(category, temperature).goals,
              direction_targets: {
                sweetness: axis === 'sweetness' ? requested : 0,
                softness: axis === 'softness' ? requested : 0,
                creaminess: 0,
                flavor: 0,
              },
              direction_targets_active: true,
            },
          };
          const plan = buildRecipeDirectionPlan(planningInput);
          const axisPlan = plan.axes.find((candidate) => candidate.axis === axis)!;
          if (axisPlan.status !== 'working') {
            expect(axisPlan.targetBand).toBeNull();
            expect(axis === 'sweetness' ? plan.bands.pod : plan.bands.npac).toBeUndefined();
            console.info(
              'DIRECTION_MATRIX',
              JSON.stringify({
                category,
                temperature,
                axis,
                requested,
                status: axisPlan.status,
                reason: axisPlan.reason,
                preview: 'BLOCKED_NOT_OPERATIONAL',
              }),
            );
            continue;
          }
          const base = cleanBase(category, temperature);
          const before = calculateRecipe(base);
          const input: RecipeInput = {
            ...base,
            goals: planningInput.goals,
          };
          expect(axisPlan.targetBand).not.toBeNull();
          expect(axis === 'sweetness' ? plan.bands.pod : plan.bands.npac).toBeDefined();
          const built = buildOptimizePreview(
            input,
            EMPTY,
            `matrix-${category}-${temperature}-${axis}-${requested}`,
          );
          const alreadyReached = !built.ok && built.code === 'already_clean';
          const nearestExactDirectionFixedPoint =
            !built.ok &&
            built.code === 'no_proposal' &&
            (category === 'milk_gelato' || category === 'sorbet') &&
            built.directionTargetUnreached === true;
          expect(
            built.ok || alreadyReached || nearestExactDirectionFixedPoint,
            built.ok ? '' : JSON.stringify({ category, temperature, axis, requested, built }),
          ).toBe(true);
          if (nearestExactDirectionFixedPoint && !built.ok && built.code === 'no_proposal') {
            expect(detectViolations(before)).toEqual([]);
            expect(built.solverInvocations ?? 0).toBeGreaterThan(0);
            console.info(
              'DIRECTION_MATRIX',
              JSON.stringify({
                category,
                temperature,
                axis,
                requested,
                hardGates: 'PASS',
                targetFit: 'NEAREST_ACHIEVABLE',
                preview: 'PROVEN_FIXED_POINT',
              }),
            );
            continue;
          }
          if (!built.ok && !alreadyReached) continue;

          const output = built.ok ? built.preview.proposedInput : input;
          const after = calculateRecipe(output);
          const nativeResidual = detectViolations(after);
          expect(plannedSum(output)).toBeCloseTo(output.target_batch_grams, 6);
          if (built.ok) {
            if (built.preview.diagnosticOnly) {
              console.info('DIRECTION_DIAGNOSTIC_ONLY', JSON.stringify({
                category, temperature, axis, requested,
                explanation: built.preview.explanation,
                kind: built.preview.kind,
                diagnosticReason: built.preview.diagnosticReason,
                iteration: built.preview.iteration,
                mainObjective: built.preview.mainObjective,
                hardResidualMetrics: built.preview.hardResidualMetrics,
                practicalization: built.preview.practicalization,
              }));
            }
            expect(built.preview.diagnosticOnly).toBe(false);
            expect(nativeResidual).toEqual([]);
            expect(recipeTechnicalFit(after).score).toBe(10);
            const assessment = built.preview.directionAssessment!;
            const withoutConsent = commitPreview(
              input,
              EMPTY,
              built.preview,
              'matrix-apply',
              `matrix-${category}-${temperature}-${axis}-${requested}`,
            );
            if (assessment.reached) {
              expect(
                withoutConsent.ok,
                JSON.stringify({
                  category,
                  temperature,
                  axis,
                  requested,
                  mainObjective: built.preview.mainObjective,
                  withoutConsent,
                }),
              ).toBe(true);
            } else {
              expect(withoutConsent).toMatchObject({
                ok: false,
                code: 'direction_consent_required',
              });
              const consent = {
                baseFingerprint: built.preview.baseFingerprint,
                targetFingerprint: directionTargetFingerprint(input),
                candidateFingerprint: workingStateFingerprint(
                  built.preview.proposedInput,
                  built.preview.nextConstraints,
                ),
              };
              expect(
                commitPreview(
                  input,
                  EMPTY,
                  built.preview,
                  'matrix-accepted',
                  `accepted-${category}-${temperature}-${axis}-${requested}`,
                  [],
                  undefined,
                  null,
                  null,
                  consent,
                ).ok,
              ).toBe(true);
            }
            // A consented best-achievable candidate may legitimately stop short
            // of the requested band. Monotonicity is therefore a property of
            // exact target hits, not of unrelated constrained compromises.
            if (assessment.reached) {
              applicable.push({
                requested,
                value:
                  axis === 'sweetness'
                    ? (after.pod_points ?? Number.NaN)
                    : (after.npac_points ?? Number.NaN),
              });
            }
          }

          console.info(
            'DIRECTION_MATRIX',
            JSON.stringify({
              category,
              temperature,
              axis,
              requested,
              podBefore: before.pod_points,
              podTarget: plan.bands.pod,
              podAfter: after.pod_points,
              npacBefore: before.npac_points,
              npacTarget: plan.bands.npac,
              npacAfter: after.npac_points,
              gramsChanged: output.items.some(
                (item, index) =>
                  !Object.is(item.planned_grams, base.items[index]?.planned_grams),
              ),
              mainGrams: output.items
                .filter((item) => item.lock_type === 'main')
                .map((item) => [item.id, item.planned_grams]),
              hardGates: nativeResidual.length === 0 ? 'PASS' : 'DIAGNOSTIC_ONLY',
              targetFit: built.ok
                ? built.preview.directionAssessment?.reached
                  ? 'EXACT'
                  : 'BEST_ACHIEVABLE_CONSENT'
                : 'ALREADY_REACHED',
              technicalScore:
                nativeResidual.length === 0 ? recipeTechnicalFit(after).score : null,
              preview: built.ok
                ? 'APPLICABLE'
                : 'ALREADY_REACHED',
            }),
          );
        }
        for (let index = 1; index < applicable.length; index += 1) {
          if (axis === 'sweetness') {
            expect(applicable[index]!.value).toBeGreaterThanOrEqual(
              applicable[index - 1]!.value - 1e-6,
            );
          } else {
            expect(applicable[index]!.value).toBeLessThanOrEqual(
              applicable[index - 1]!.value + 1e-6,
            );
          }
        }
      }
    },
    60_000,
  );
});
