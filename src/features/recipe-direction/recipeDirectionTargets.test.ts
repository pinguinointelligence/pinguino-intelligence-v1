import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type ProductCategory,
  type RecipeDirectionTarget,
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
  SORBET_HARDNESS_TARGET_CENTERS,
  SORBET_SWEETNESS_TARGET_CENTERS,
} from './recipeDirectionTargets';

const NO_CONSTRAINTS = { byLineId: {} };
const targets = (sweetness: RecipeDirectionTarget, softness: RecipeDirectionTarget) => ({
  sweetness,
  softness,
  creaminess: 0 as const,
  flavor: 0 as const,
});

const withDirection = (
  input: RecipeInput,
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
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

// RC-1 (owner authority 2026-08-23): Vegan joins the operational Direction
// profiles. Its sweetness uses `targetFifth` over its OWN approved POD band
// [13,25] — the same five-region derivation Gelato already uses — so it belongs
// in the five-zone group, not the legacy three-zone one.
const SWEETNESS_CELLS = CELLS.filter(
  ([category, temperature]) =>
    category === 'milk_gelato' ||
    category === 'vegan_gelato' ||
    // Protein sweetness qualified 2026-08-23: the complete -2..+2 x -2..+2 x 3
    // temperatures x 2 strategies matrix (150 states) is natively hard-safe,
    // claim-qualified and applied, and POD is composition-derived from each
    // ingredient's own stored pod_value against the Protein profile's OWN
    // approved band. See proteinDirectionAuthority.test.ts.
    category === 'protein_gelato' ||
    (category === 'sorbet' && [-11, -12, -13].includes(temperature)) ||
    (category === 'chocolate_gelato' && (temperature === -11 || temperature === -12)),
);
/** Profiles that subdivide their approved POD band into FIVE ordered zones. */
const GELATO_SWEETNESS_CELLS = SWEETNESS_CELLS.filter(
  ([category]) =>
    category === 'milk_gelato' || category === 'vegan_gelato' || category === 'protein_gelato',
);
const LEGACY_SWEETNESS_CELLS = SWEETNESS_CELLS.filter(
  ([category]) => category === 'chocolate_gelato',
);
// Vegan softness uses its OWN approved NPAC cleanCenter per temperature
// ([40,47] / [48,54] / [53.5,60.0]); no dairy fallback is borrowed.
const SOFTNESS_CELLS = CELLS.filter(
  ([category, temperature]) =>
    category === 'milk_gelato' ||
    category === 'vegan_gelato' ||
    (category === 'sorbet' && [-11, -12, -13].includes(temperature)),
);
const NON_EXACT_SOFTNESS_CELLS = CELLS.filter(
  (cell) =>
    !SOFTNESS_CELLS.some(
      ([category, temperature]) => category === cell[0] && temperature === cell[1],
    ),
);
const BLOCKED_SWEETNESS_CELLS = CELLS.filter(
  (cell) =>
    !SWEETNESS_CELLS.some(
      ([category, temperature]) => category === cell[0] && temperature === cell[1],
    ),
);

describe('canonical recipe Direction target contract', () => {
  it.each(GELATO_SWEETNESS_CELLS)(
    '%s @ %d exposes five ordered POD zones inside the approved band',
    (category, temperature, approved) => {
      const zones = ([-2, -1, 0, 1, 2] as const).map((target) => {
        const input = withDirection(
          { ...starterMilkBase(), category, target_temperature_c: temperature },
          target,
          0,
        );
        const band = buildRecipeDirectionPlan(input).bands.pod!;
        expect(band.min).toBeGreaterThanOrEqual(approved[0]);
        expect(band.max).toBeLessThanOrEqual(approved[1]);
        expect(band.min).toBeLessThan(band.max);
        return band;
      });
      for (let index = 1; index < zones.length; index += 1) {
        expect(zones[index - 1]!.max).toBeCloseTo(zones[index]!.min, 9);
      }
    },
  );

  it.each(LEGACY_SWEETNESS_CELLS)(
    '%s @ %d retains its accepted three-zone POD mapping outside Gelato scope',
    (category, temperature, approved) => {
      const bandFor = (target: -2 | -1 | 0 | 1 | 2) =>
        buildRecipeDirectionPlan(
          withDirection(
            { ...starterMilkBase(), category, target_temperature_c: temperature },
            target,
            0,
          ),
        ).bands.pod!;
      expect(bandFor(-2)).toEqual(bandFor(-1));
      expect(bandFor(2)).toEqual(bandFor(1));
      for (const target of [-1, 0, 1] as const) {
        const band = bandFor(target);
        expect(band.min).toBeGreaterThanOrEqual(approved[0]);
        expect(band.max).toBeLessThanOrEqual(approved[1]);
      }
    },
  );

  it.each([
    [-11, [39.5, 38.5, 37.5, 36.5, 35.5]],
    [-12, [48.3, 46.9, 45.5, 44.1, 42.7]],
    [-13, [54.3, 52.9, 51.5, 50.1, 48.7]],
  ] as const)(
    'sorbet @ %d retains the owner exact POD and NPAC target-center authority',
    (temperature, hardnessCenters) => {
      for (const [index, target] of ([-2, -1, 0, 1, 2] as const).entries()) {
        const plan = buildRecipeDirectionPlan(
          withDirection(
            { ...starterMilkBase(), category: 'sorbet', target_temperature_c: temperature },
            target,
            target,
          ),
        );
        expect(SORBET_SWEETNESS_TARGET_CENTERS[target]).toBe(16 + index * 2);
        expect(SORBET_HARDNESS_TARGET_CENTERS[temperature][target]).toBe(hardnessCenters[index]);
        expect(plan.axes.find((axis) => axis.axis === 'sweetness')).toMatchObject({
          status: 'working',
          targetCenter: 16 + index * 2,
        });
        expect(plan.bands.pod).toEqual({ min: 16 + index * 2, max: 16 + index * 2 });
        expect(plan.axes.find((axis) => axis.axis === 'softness')).toMatchObject({
          status: 'working',
          targetCenter: hardnessCenters[index],
        });
        expect(plan.bands.npac).toEqual({
          min: hardnessCenters[index],
          max: hardnessCenters[index],
        });
      }
    },
  );

  it.each(SOFTNESS_CELLS)(
    '%s @ %d maps visible Hardness -2 (soft) through +2 (firm) monotonically',
    (category, temperature) => {
      const zones = ([-2, -1, 0, 1, 2] as const).map(
        (target) =>
          buildRecipeDirectionPlan(
            withDirection(
              { ...starterMilkBase(), category, target_temperature_c: temperature },
              0,
              target,
            ),
          ).bands.npac!,
      );
      for (let index = 1; index < zones.length; index += 1) {
        expect(zones[index]!.max).toBeLessThanOrEqual(zones[index - 1]!.min);
      }
    },
  );

  it.each(BLOCKED_SWEETNESS_CELLS)(
    '%s @ %d blocks sweetness until the complete runtime route is verified',
    (category, temperature) => {
      const plan = buildRecipeDirectionPlan(
        withDirection({ ...starterMilkBase(), category, target_temperature_c: temperature }, 1, 0),
      );
      expect(plan.axes.find((axis) => axis.axis === 'sweetness')?.status).toBe('blocked_runtime');
      expect(plan.bands.pod).toBeUndefined();
    },
  );

  it.each(NON_EXACT_SOFTNESS_CELLS)(
    '%s @ %d blocks softness without using the fallback milk calibration',
    (category, temperature) => {
      const plan = buildRecipeDirectionPlan(
        withDirection({ ...starterMilkBase(), category, target_temperature_c: temperature }, 0, 1),
      );
      expect(plan.axes.find((axis) => axis.axis === 'softness')?.status).toBe('blocked_science');
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

  it('a supported +2 request goes through the normal Preview and remains native-safe', () => {
    const input = withDirection(starterMilkBase(), 2, 2);
    const before = recipeDirectionViolations(input);
    expect(before.length).toBeGreaterThan(0);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, '2026-08-10T00:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const proposed = built.preview.proposedInput;
    const after = recipeDirectionViolations(proposed);
    expect(after.length).toBeLessThanOrEqual(before.length);
    expect(detectViolations(calculateRecipe(proposed))).toHaveLength(0);
    const plan = buildRecipeDirectionPlan(proposed);
    expect(
      detectViolations(resultWithRecipeDirectionTargets(calculateRecipe(proposed), plan)).length,
    ).toBeLessThanOrEqual(before.length);
    if (after.length === before.length) {
      expect(built.preview.directionAssessment).toMatchObject({ reached: false, score: 9 });
    }
    expect(proposed.items.map((item) => item.planned_grams)).not.toEqual(
      input.items.map((item) => item.planned_grams),
    );
  });

  it('requires explicit session-bound consent for a native-safe best-achievable target result', () => {
    // Owner P1-A (2026-08-23): Sweetness −1 alone is no longer a
    // best-achievable case — the paired mass-neutral exchange reaches every
    // single-axis Sweetness band on this starter (all five verified at 10/10).
    // The CONSENT CONTRACT is unchanged and still pinned here, now on a target
    // that is genuinely out of reach: the combined extreme −2 / −2, where the
    // Sweetness and Hardness bands cannot both be satisfied at once.
    const input = withDirection(starterMilkBase(), -2, -2);
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
    const input = withDirection(starterMilkBase(), 2, 2);
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
