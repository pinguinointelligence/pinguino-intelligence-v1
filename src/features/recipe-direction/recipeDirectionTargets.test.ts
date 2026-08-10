import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type ProductCategory,
  type RecipeInput,
} from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import {
  buildRecipeDirectionPlan,
  recipeDirectionViolations,
  resultWithRecipeDirectionTargets,
} from './recipeDirectionTargets';

const NO_CONSTRAINTS = { byLineId: {} };
const targets = (sweetness: -1 | 0 | 1, softness: -1 | 0 | 1) => ({
  sweetness,
  softness,
  creaminess: 0 as const,
  flavor: 0 as const,
});

const withDirection = (
  input: RecipeInput,
  sweetness: -1 | 0 | 1,
  softness: -1 | 0 | 1,
): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets: targets(sweetness, softness),
    direction_targets_active: true,
  },
});

const CELLS: readonly [ProductCategory, number, [number, number]][] = [
  ['milk_gelato', -11, [12, 17]],
  ['milk_gelato', -12, [12, 17]],
  ['milk_gelato', -13, [12, 17]],
  ['sorbet', -11, [15, 25]],
  ['sorbet', -12, [15, 25]],
  ['sorbet', -13, [15, 25]],
  ['vegan_gelato', -11, [13, 25]],
  ['vegan_gelato', -12, [13, 25]],
  ['vegan_gelato', -13, [13, 25]],
  ['chocolate_gelato', -11, [12, 20]],
  ['chocolate_gelato', -12, [12, 20]],
  ['chocolate_gelato', -13, [12, 20]],
  ['protein_gelato', -11, [12, 17]],
  ['protein_gelato', -12, [12, 17]],
  ['protein_gelato', -13, [12, 17]],
];

const SWEETNESS_CELLS = CELLS.filter(
  ([category, temperature]) =>
    category === 'milk_gelato' ||
    (category === 'sorbet' && temperature === -11) ||
    (category === 'chocolate_gelato' && (temperature === -11 || temperature === -12)),
);
const SOFTNESS_CELLS = CELLS.filter(([category]) => category === 'milk_gelato');
const NON_MILK_CELLS = CELLS.filter(([category]) => category !== 'milk_gelato');
const BLOCKED_SWEETNESS_CELLS = CELLS.filter(
  (cell) => !SWEETNESS_CELLS.some(([category, temperature]) => category === cell[0] && temperature === cell[1]),
);

describe('canonical recipe Direction target contract', () => {
  it.each(SWEETNESS_CELLS)(
    '%s @ %d exposes operational lower/middle/upper POD zones inside the approved band',
    (category, temperature, approved) => {
      for (const target of [-1, 0, 1] as const) {
        const input = withDirection(
          { ...starterMilkBase(), category, target_temperature_c: temperature },
          target,
          0,
        );
        const band = buildRecipeDirectionPlan(input).bands.pod!;
        expect(band.min).toBeGreaterThanOrEqual(approved[0]);
        expect(band.max).toBeLessThanOrEqual(approved[1]);
        expect(band.min).toBeLessThan(band.max);
      }
    },
  );

  it.each(SOFTNESS_CELLS)(
    '%s @ %d exposes operational firm/clean/soft NPAC targets',
    (category, temperature) => {
      const zones = ([-1, 0, 1] as const).map(
        (target) =>
          buildRecipeDirectionPlan(
            withDirection(
              { ...starterMilkBase(), category, target_temperature_c: temperature },
              0,
              target,
            ),
          ).bands.npac!,
      );
      expect(zones[0]!.max).toBeLessThanOrEqual(zones[1]!.min);
      expect(zones[1]!.max).toBeLessThanOrEqual(zones[2]!.min);
    },
  );

  it.each(BLOCKED_SWEETNESS_CELLS)(
    '%s @ %d blocks sweetness until the complete runtime route is verified',
    (category, temperature) => {
      const plan = buildRecipeDirectionPlan(
        withDirection(
          { ...starterMilkBase(), category, target_temperature_c: temperature },
          1,
          0,
        ),
      );
      expect(plan.axes.find((axis) => axis.axis === 'sweetness')?.status).toBe(
        'blocked_runtime',
      );
      expect(plan.bands.pod).toBeUndefined();
    },
  );

  it.each(NON_MILK_CELLS)(
    '%s @ %d blocks softness without using the fallback milk calibration',
    (category, temperature) => {
      const plan = buildRecipeDirectionPlan(
        withDirection(
          { ...starterMilkBase(), category, target_temperature_c: temperature },
          0,
          1,
        ),
      );
      expect(plan.axes.find((axis) => axis.axis === 'softness')?.status).toBe(
        'blocked_science',
      );
      expect(plan.bands.npac).toBeUndefined();
    },
  );

  it('keeps creaminess and flavour blocked independently, without disabling working axes', () => {
    const plan = buildRecipeDirectionPlan(withDirection(starterMilkBase(), 0, 0));
    expect(plan.axes.find((axis) => axis.axis === 'sweetness')?.status).toBe('working');
    expect(plan.axes.find((axis) => axis.axis === 'softness')?.status).toBe('working');
    expect(plan.axes.find((axis) => axis.axis === 'creaminess')?.status).toBe('blocked_science');
    expect(plan.axes.find((axis) => axis.axis === 'flavor')?.status).toBe('blocked_data');
    expect(plan.bands).not.toHaveProperty('fat');
  });

  it('legacy inputs without direction goals keep native solver behavior', () => {
    const input = structuredClone(starterMilkBase());
    if (input.goals) delete input.goals.direction_targets;
    expect(buildRecipeDirectionPlan(input).bands).toEqual({});
    expect(recipeDirectionViolations(input)).toEqual(detectViolations(calculateRecipe(input)));
  });

  it('a supported +1 request goes through the normal Preview and remains native-safe', () => {
    const input = withDirection(starterMilkBase(), 1, 1);
    const before = recipeDirectionViolations(input);
    expect(before.length).toBeGreaterThan(0);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, '2026-08-10T00:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const proposed = built.preview.proposedInput;
    expect(recipeDirectionViolations(proposed).length).toBeLessThan(before.length);
    expect(detectViolations(calculateRecipe(proposed))).toHaveLength(0);
    const plan = buildRecipeDirectionPlan(proposed);
    expect(
      detectViolations(resultWithRecipeDirectionTargets(calculateRecipe(proposed), plan)).length,
    ).toBeLessThan(before.length);
    expect(proposed.items.map((item) => item.planned_grams)).not.toEqual(
      input.items.map((item) => item.planned_grams),
    );
  });

  it('requires explicit session-bound consent for a native-safe best-achievable target result', () => {
    const input = withDirection(starterMilkBase(), -1, 0);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, '2026-08-10T00:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const assessment = built.preview.directionAssessment!;
    expect(assessment.reached).toBe(false);
    expect(assessment.score).toBeLessThan(10);
    expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);

    const withoutConsent = commitPreview(
      input,
      NO_CONSTRAINTS,
      built.preview,
      '2026-08-10T00:01:00.000Z',
      'direction-without-consent',
    );
    expect(withoutConsent).toMatchObject({ ok: false, code: 'direction_consent_required' });

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
        NO_CONSTRAINTS,
        built.preview,
        '2026-08-10T00:01:00.000Z',
        'direction-with-consent',
        [],
        undefined,
        null,
        null,
        consent,
      ).ok,
    ).toBe(true);

    const changedTarget = withDirection(starterMilkBase(), 1, 0);
    expect(
      commitPreview(
        changedTarget,
        NO_CONSTRAINTS,
        built.preview,
        '2026-08-10T00:02:00.000Z',
        'direction-stale-consent',
        [],
        undefined,
        null,
        null,
        consent,
      ),
    ).toMatchObject({ ok: false, code: 'stale_preview' });
  });

  it('keeps exact, percent and range constraints through a supported Direction Preview and Apply', () => {
    const input = withDirection(starterMilkBase(), 1, 1);
    const constraints = {
      byLineId: {
        'milk-base:milk_3_5': { mode: 'locked' as const, grams: 670 },
        'milk-base:sucrose': { mode: 'percent' as const, percent: 13 },
        'milk-base:cream_30': { mode: 'range' as const, minGrams: 100, maxGrams: 160 },
      },
    };
    const built = buildOptimizePreview(input, constraints, '2026-08-10T01:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.diagnosticOnly).toBe(false);
    const proposed = built.preview.proposedInput;
    const grams = (id: string) => proposed.items.find((item) => item.id === id)!.planned_grams;
    expect(Object.is(grams('milk-base:milk_3_5'), 670)).toBe(true);
    expect(grams('milk-base:sucrose') / proposed.target_batch_grams).toBeCloseTo(0.13, 8);
    expect(grams('milk-base:cream_30')).toBeGreaterThanOrEqual(100);
    expect(grams('milk-base:cream_30')).toBeLessThanOrEqual(160);
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);

    const assessment = built.preview.directionAssessment!;
    const consent = assessment.reached
      ? null
      : {
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
        constraints,
        built.preview,
        '2026-08-10T01:01:00.000Z',
        'direction-all-lock-modes',
        [],
        undefined,
        null,
        null,
        consent,
      ).ok,
    ).toBe(true);
  });
});
