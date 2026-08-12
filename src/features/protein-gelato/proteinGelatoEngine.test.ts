import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import {
  buildOptimizePreview,
  commitPreview,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { assessProteinTarget, recipeFitForInput } from './proteinTarget';

const EMPTY = { byLineId: {} } as const;

const proteinDraft = (temperatureC: -11 | -12 | -13, targetPercent: number): RecipeInput => ({
  items: [
    {
      id: 'main-raspberry',
      ingredient: findDemoIngredient('raspberry')!,
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'main',
    },
  ],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    target_protein_percent: targetPercent,
  },
});

describe('Protein Gelato target orchestration', () => {
  for (const temperatureC of [-11, -12, -13] as const) {
    for (const targetPercent of [19, 20, 21] as const) {
      it(`builds native-safe Preview at ${temperatureC}°C for ${targetPercent}%`, () => {
        const input = proteinDraft(temperatureC, targetPercent);
        const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
        expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
        if (!built.ok) return;

        const proposed = built.preview.proposedInput;
        const result = calculateRecipe(proposed);
        const assessment = assessProteinTarget(proposed, result);
        expect(detectViolations(result)).toEqual([]);
        expect(assessment).toMatchObject({
          applicable: true,
          targetPercent,
          reached: true,
          hardSafe: true,
          score: 10,
        });
        // Preview is the executable whole-gram vector.  The exact solver
        // candidate remains in provenance, while the rerun target assessment
        // must stay inside its approved 0.1 percentage-point tolerance.
        expect(assessment.actualPercent).not.toBeNull();
        if (assessment.actualPercent === null) return;
        expect(Math.abs(assessment.actualPercent - targetPercent)).toBeLessThanOrEqual(0.1);
        expect(proposed.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
        const mainGrams = proposed.items.find(
          (item) => item.id === 'main-raspberry',
        )?.planned_grams;
        expect(mainGrams).toBeGreaterThanOrEqual(100);
        expect(built.preview.mainObjective?.technicalScore).toBe(10);
        expect(proposed.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(
          1000,
          6,
        );
        expect(
          proposed.items.filter(
            (item) => canonicalIngredientId(item.ingredient) === 'PI-ING-000264',
          ),
        ).toHaveLength(1);
        expect(recipeFitForInput(proposed, result).score).toBe(10);

        const committed = commitPreview(
          input,
          EMPTY,
          built.preview,
          '2026-08-09T10:01:00.000Z',
          'protein-apply',
        );
        expect(committed.ok, JSON.stringify(committed)).toBe(true);
      });
    }
  }

  for (const temperatureC of [-11, -12, -13] as const) {
    it(`builds a dairy-free plant Protein Preview at ${temperatureC}°C for 20%`, () => {
      const input = proteinDraft(temperatureC, 20);
      input.goals = { ...input.goals, dietary: ['vegan'] };
      const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
      expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
      if (!built.ok) return;
      const result = calculateRecipe(built.preview.proposedInput);
      expect(detectViolations(result)).toEqual([]);
      expect(assessProteinTarget(built.preview.proposedInput, result)).toMatchObject({
        targetPercent: 20,
        reached: true,
        hardSafe: true,
        score: 10,
      });
      expect(
        built.preview.proposedInput.items.some(
          (item) => canonicalIngredientId(item.ingredient) === 'PI-ING-000452',
        ),
      ).toBe(true);
      expect(
        built.preview.proposedInput.items.some(
          (item) => item.planned_grams > 0 && item.ingredient.flags?.is_animal_origin === true,
        ),
      ).toBe(false);
      expect(
        built.preview.proposedInput.items.find((item) => item.id === 'main-raspberry')
          ?.planned_grams,
      ).toBeGreaterThanOrEqual(100);
      expect(built.preview.mainObjective?.technicalScore).toBe(10);
    });
  }

  it('solves a lower 15% request through the real formulation path', () => {
    const input = proteinDraft(-12, 15);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const result = calculateRecipe(built.preview.proposedInput);
    expect(detectViolations(result)).toEqual([]);
    expect(assessProteinTarget(built.preview.proposedInput, result)).toMatchObject({
      targetPercent: 15,
      reached: true,
      score: 10,
    });
  });

  it('keeps a higher 25% request honest when native validity sets the frontier', () => {
    const input = proteinDraft(-13, 25);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const result = calculateRecipe(built.preview.proposedInput);
    const target = assessProteinTarget(built.preview.proposedInput, result);
    expect(detectViolations(result)).toEqual([]);
    expect(target.targetPercent).toBe(25);
    expect(target.actualPercent).toBeLessThan(25);
    expect(target.reached).toBe(false);
    expect(recipeFitForInput(built.preview.proposedInput, result).score).toBeLessThan(10);
    const committed = commitPreview(
      input,
      EMPTY,
      built.preview,
      '2026-08-09T10:01:00.000Z',
      'protein-high-target',
    );
    expect(committed.ok).toBe(false);
  }, 40_000);

  it.each([-11, -12, -13] as const)(
    'never lowers best-achievable actual protein when the high target rises from 25 to 30 at %s°C',
    (temperatureC) => {
      const outcomes = [25, 30].map((targetPercent) => {
        const input = proteinDraft(temperatureC, targetPercent);
        const built = buildOptimizePreview(input, EMPTY, '2026-08-12T00:00:00.000Z');
        expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
        if (!built.ok) return { targetPercent, actualPercent: null };
        const result = calculateRecipe(built.preview.proposedInput);
        expect(detectViolations(result)).toEqual([]);
        return {
          targetPercent,
          actualPercent: assessProteinTarget(built.preview.proposedInput, result).actualPercent,
        };
      });
      expect(outcomes[1]!.actualPercent ?? -Infinity).toBeGreaterThanOrEqual(
        (outcomes[0]!.actualPercent ?? Infinity) - 0.05,
      );
    },
    60_000,
  );

  it.each([-11, -12, -13] as const)(
    'keeps the Strawberry 20→21→22 frontier monotonic at %s°C',
    (temperatureC) => {
      const rows = [20, 21, 22].map((targetPercent) => {
        const input = proteinDraft(temperatureC, targetPercent);
        const built = buildOptimizePreview(input, EMPTY, '2026-08-10T00:00:00.000Z');
        if (!built.ok)
          return { targetPercent, actualPercent: null, applicable: false, code: built.code };
        const assessment = assessProteinTarget(
          built.preview.proposedInput,
          calculateRecipe(built.preview.proposedInput),
        );
        const committed = commitPreview(
          input,
          EMPTY,
          built.preview,
          '2026-08-10T00:01:00.000Z',
          `protein-${temperatureC}-${targetPercent}`,
        );
        return {
          targetPercent,
          actualPercent: assessment.actualPercent,
          applicable: committed.ok,
          code: committed.ok ? 'applied' : committed.code,
        };
      });
      const achieved21 = rows.find((row) => row.targetPercent === 21);
      const requested22 = rows.find((row) => row.targetPercent === 22);
      if (achieved21?.applicable && achieved21.actualPercent !== null) {
        expect(requested22?.actualPercent ?? -Infinity).toBeGreaterThanOrEqual(
          achieved21.actualPercent - 0.05,
        );
      }
      if (!requested22?.applicable) expect(requested22?.code).not.toBe('applied');
    },
    30_000,
  );

  it('retains selected Skyr and uses its natural protein before added concentrate', () => {
    const highProtein = proteinDraft(-12, 20);
    highProtein.items.push({
      id: 'user-skyr',
      ingredient: findVerifiedProteinFormulationCandidate('PI-ING-001395')!,
      planned_grams: 180,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    const ordinaryMilk = proteinDraft(-12, 20);
    ordinaryMilk.items.push({
      id: 'user-milk',
      ingredient: findDemoIngredient('milk_3_5')!,
      planned_grams: 180,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    expect(calculateRecipe(highProtein).totals.protein_g).toBeGreaterThan(
      calculateRecipe(ordinaryMilk).totals.protein_g,
    );

    const highBuilt = buildOptimizePreview(highProtein, EMPTY, '2026-08-09T10:00:00.000Z');
    const lowBuilt = buildOptimizePreview(ordinaryMilk, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(highBuilt.ok, highBuilt.ok ? '' : JSON.stringify(highBuilt)).toBe(true);
    expect(lowBuilt.ok, lowBuilt.ok ? '' : JSON.stringify(lowBuilt)).toBe(true);
    if (!highBuilt.ok || !lowBuilt.ok) return;

    const retainedSkyr = highBuilt.preview.proposedInput.items.find(
      (item) => item.id === 'user-skyr',
    );
    expect(retainedSkyr?.planned_grams).toBeGreaterThan(0);
    const wpc = (input: RecipeInput) =>
      input.items.find((item) => canonicalIngredientId(item.ingredient) === 'PI-ING-000264')
        ?.planned_grams ?? 0;
    expect(wpc(highBuilt.preview.proposedInput)).toBeLessThan(wpc(lowBuilt.preview.proposedInput));
    expect(
      assessProteinTarget(
        highBuilt.preview.proposedInput,
        calculateRecipe(highBuilt.preview.proposedInput),
      ).reached,
    ).toBe(true);
  });

  it('fingerprints target-only changes and never treats a stale target preview as current', () => {
    const twenty = proteinDraft(-12, 20);
    const twentyOne = {
      ...twenty,
      goals: { ...twenty.goals, target_protein_percent: 21 },
    };
    expect(workingStateFingerprint(twenty, EMPTY)).not.toBe(
      workingStateFingerprint(twentyOne, EMPTY),
    );
  });

  it('maximizes the Main group without changing either identity or the 2:1 ratio', () => {
    const input = proteinDraft(-12, 20);
    input.items = [
      { ...input.items[0]!, id: 'main-raspberry', planned_grams: 120 },
      {
        id: 'main-banana',
        ingredient: findDemoIngredient('banana')!,
        planned_grams: 60,
        actual_grams: null,
        lock_type: 'main',
      },
    ];
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const raspberry = built.preview.proposedInput.items.find(
      (item) => item.id === 'main-raspberry',
    );
    const banana = built.preview.proposedInput.items.find((item) => item.id === 'main-banana');
    expect(raspberry?.planned_grams).toBeGreaterThanOrEqual(120);
    expect(banana?.planned_grams).toBeGreaterThanOrEqual(60);
    expect((raspberry?.planned_grams ?? 0) / (banana?.planned_grams ?? 1)).toBe(2);
    expect(built.preview.mainObjective?.technicalScore).toBe(10);
  });

  it('refuses to formulate when Protein Main is unavailable', () => {
    const input = proteinDraft(-12, 20);
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z', {
      unavailableMainIngredientIds: ['raspberry'],
    });
    expect(built).toMatchObject({
      ok: false,
      code: 'main_ingredient_unavailable',
    });
    expect(input.items[0]?.planned_grams).toBe(100);
  });

  it('returns an honest hard conflict when Main alone exceeds the batch', () => {
    const input = proteinDraft(-12, 20);
    input.items = [
      {
        ...input.items[0]!,
        planned_grams: 1200,
      },
    ];
    const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
    expect(built).toMatchObject({
      ok: false,
      code: 'main_ratio_conflict',
    });
    expect(input.items[0]?.planned_grams).toBe(1200);
  });
});
