/**
 * P1-A — NEUTRAL DIRECTION AUTHORITY + EXACT→NEAREST CONTRACT (owner, 2026-08-23).
 *
 * The served defect: on a real Fior di Latte the delivered sweetness was
 * NON-MONOTONIC — Sweetness 0 produced POD 17.00 (the very top of the approved
 * [12, 17] band) while "+1 sweeter" produced 15.97, so asking for a sweeter
 * gelato returned a LESS sweet recipe than asking for nothing.
 *
 * Root cause: neutral opted OUT of its own contract. `direction_targets_active`
 * was derived as "some axis !== 0", so at 0/0 no POD band was applied at all and
 * the optimizer only had to satisfy the global band — parking POD at its edge.
 *
 * NOTE ON SCOPE: no owner target value changes here. `targetFifth` and every
 * regulator band are untouched; only the ACTIVATION of the neutral intent is
 * fixed. A trial that re-anchored the bands on `pod.lockedReference` was
 * measured and rejected — it broke the owner 2:1 Multi-Main fixture — see
 * reports/DIRECTION_SWEETNESS_AUTHORITY_BLOCKER_2026-08-23.md.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import { OWNER_MAPPER_INGREDIENTS as MAPPER } from '@/features/formulation/__fixtures__/ownerSameInputFixture';

import { assessRecipeDirection } from './recipeDirectionAssessment';
import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

const EMPTY = { byLineId: {} } as const;
const TARGETS = [-2, -1, 0, 1, 2] as const;

/** The exact real published Fior di Latte from the overnight served QA. */
const fiorDiLatte = (sweetness: RecipeDirectionTarget, active = true): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: (
    [
      ['milk', MAPPER.milk_3_5, 620],
      ['cream', MAPPER.cream_30, 150],
      ['smp', MAPPER.smp, 48],
      ['sucrose', MAPPER.sucrose, 145],
      ['dextrose', MAPPER.dextrose, 33],
      ['tara', MAPPER.tara_gum, 4],
    ] as const
  ).map(([id, ingredient, grams]) => ({
    id,
    ingredient,
    planned_grams: grams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: 'optimal',
    direction_targets_active: active,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const podOf = (input: RecipeInput): number =>
  calculateRecipe(input).indicators.find((indicator) => indicator.key === 'pod')?.value ?? NaN;

const sweetnessBand = (input: RecipeInput) =>
  buildRecipeDirectionPlan(input).axes.find((axis) => axis.axis === 'sweetness')?.targetBand ?? null;

interface SweepRow {
  target: RecipeDirectionTarget;
  band: { min: number; max: number };
  delivered: number;
  status: 'ACHIEVED' | 'NEAREST';
  previewOk: boolean;
}

const sweep = (): SweepRow[] =>
  TARGETS.map((target) => {
    const input = fiorDiLatte(target);
    const band = sweetnessBand(input)!;
    const built = buildOptimizePreview(input, EMPTY, `sweep-${target}`);
    if (!built.ok) {
      return { target, band, delivered: NaN, status: 'NEAREST' as const, previewOk: false };
    }
    const candidate = built.preview.proposedInput;
    const assessment = assessRecipeDirection(candidate, calculateRecipe(candidate));
    return {
      target,
      band,
      delivered: podOf(candidate),
      status: assessment.reached ? ('ACHIEVED' as const) : ('NEAREST' as const),
      previewOk: true,
    };
  });

describe('P1-A — neutral Direction is a real target, not "Direction off"', () => {
  it('applies a POD target band at Sweetness 0', () => {
    const band = sweetnessBand(fiorDiLatte(0));
    expect(band).not.toBeNull();
    // The owner's approved neutral fifth of the [12, 17] band — unchanged.
    expect(band!.min).toBeCloseTo(14, 6);
    expect(band!.max).toBeCloseTo(15, 6);
  });

  it('keeps the owner target ordering strictly monotonic across −2…+2', () => {
    const bands = TARGETS.map((target) => sweetnessBand(fiorDiLatte(target))!);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.min).toBeGreaterThan(bands[index - 1]!.min);
      expect(bands[index]!.max).toBeGreaterThan(bands[index - 1]!.max);
    }
  });

  it('THE REGRESSION: "+1 sweeter" no longer delivers LESS than neutral', () => {
    const rows = sweep();
    const neutral = rows.find((row) => row.target === 0)!;
    const plusOne = rows.find((row) => row.target === 1)!;
    const plusTwo = rows.find((row) => row.target === 2)!;

    expect(neutral.previewOk && plusOne.previewOk && plusTwo.previewOk).toBe(true);
    // Served defect was neutral 17.00 vs +1 15.97.
    expect(plusOne.delivered).toBeGreaterThan(neutral.delivered);
    expect(plusTwo.delivered).toBeGreaterThan(plusOne.delivered);
    // And neutral must no longer sit at the very top of the approved band.
    expect(neutral.delivered).toBeLessThan(17);
  });

  it('never reports ACHIEVED when the delivered POD is outside the target band', () => {
    for (const row of sweep()) {
      if (!row.previewOk) continue;
      const inside = row.delivered >= row.band.min - 1e-9 && row.delivered <= row.band.max + 1e-9;
      expect(row.status === 'ACHIEVED').toBe(inside);
    }
  });

  it('always produces a Preview for every level — never a deleted proposal', () => {
    for (const row of sweep()) expect(row.previewOk).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const first = sweep().map((row) => `${row.target}:${row.delivered.toFixed(6)}:${row.status}`);
    const second = sweep().map((row) => `${row.target}:${row.delivered.toFixed(6)}:${row.status}`);
    expect(first).toEqual(second);
  });

  it('leaves legacy direct-Engine inputs (no direction contract) untouched', () => {
    const legacy = fiorDiLatte(0, false);
    expect(sweetnessBand(legacy)).not.toBeNull(); // the plan still describes the axis…
    // …but the band is not injected into the engine result when inactive.
    expect(buildRecipeDirectionPlan(legacy).bands.pod).toBeUndefined();
  });
});

/* ─────────────────── 2:1 Multi-Main + range + Direction ─────────────────── */

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('banana')!,
  id: 'strawberries',
  name: 'STRAWBERRIES · Fresh Fruit',
  canonical_ingredient_id: 'PI-ING-001553',
};
const BANANA: EngineIngredient = {
  ...findDemoIngredient('banana')!,
  id: 'banana',
  name: 'BANANA · Fresh Fruit',
  canonical_ingredient_id: 'PI-ING-000345',
  category: 'fruit',
};

const mainLine = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  ratioWeight: number,
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'main' as const,
  main_ratio_weight: ratioWeight,
});

const structuralLines = (grams: number): RecipeInput['items'] => {
  const shares = [500, 100, 30, 100, 50, 15, 5] as const;
  const definitions = [
    ['line-milk', 'milk_3_5'],
    ['line-cream', 'cream_30'],
    ['line-smp', 'smp'],
    ['line-sucrose', 'sucrose'],
    ['line-dextrose', 'dextrose'],
    ['line-inulin', 'inulin'],
    ['line-tara', 'tara_gum'],
  ] as const;
  const allocations = shares.map((share) => Math.floor((grams * share) / 800));
  allocations[0] = allocations[0]! + grams - allocations.reduce((sum, value) => sum + value, 0);
  return definitions.map(([id, ingredientId], index) => ({
    id,
    ingredient: findDemoIngredient(ingredientId)!,
    planned_grams: allocations[index]!,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  }));
};

/** The owner 2:1 Multi-Main runtime fixture, with a range lock on the larger Main. */
const multiMain = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    mainLine('line-banana', BANANA, 200, 2),
    mainLine('line-strawberry', STRAWBERRIES, 100, 1),
    ...structuralLines(700),
  ],
  goals: {
    direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
    direction_targets_active: true,
  },
});

const BANANA_RANGE = {
  byLineId: { 'line-banana': { mode: 'range' as const, minGrams: 160, maxGrams: 300 } },
} as const;

describe('P1-A — 2:1 Multi-Main + range + Direction always yields a Preview', () => {
  const combinations: Array<[RecipeDirectionTarget, RecipeDirectionTarget]> = [
    [2, -2],
    [2, 2],
    [-2, 2],
    [-2, -2],
    [0, 0],
    [1, -1],
  ];

  it.each(combinations)(
    'sweetness %s / softness %s keeps the Preview, the 2:1 ratio and the range',
    (sweetness, softness) => {
      const input = multiMain(sweetness, softness);
      const built = buildOptimizePreview(input, BANANA_RANGE, `mm-${sweetness}-${softness}`);

      // §3: Direction is a PREFERENCE. It may never delete the Preview.
      expect(built.ok, built.ok ? '' : JSON.stringify(built).slice(0, 300)).toBe(true);
      if (!built.ok) return;

      const after = built.preview.proposedInput;
      const banana = after.items.find((item) => item.id === 'line-banana')!;
      const strawberry = after.items.find((item) => item.id === 'line-strawberry')!;

      // Both Mains survive, positive, and the 2:1 ratio is intact.
      expect(banana.lock_type).toBe('main');
      expect(strawberry.lock_type).toBe('main');
      expect(banana.planned_grams).toBeGreaterThan(0);
      expect(strawberry.planned_grams).toBeGreaterThan(0);
      const mainTotal = banana.planned_grams + strawberry.planned_grams;
      expect(Math.abs(banana.planned_grams - (mainTotal * 2) / 3)).toBeLessThanOrEqual(1);
      expect(Math.abs(strawberry.planned_grams - mainTotal / 3)).toBeLessThanOrEqual(1);

      // The user's range lock is respected.
      expect(banana.planned_grams).toBeGreaterThanOrEqual(160);
      expect(banana.planned_grams).toBeLessThanOrEqual(300);

      // Batch is exact and executable.
      expect(Math.round(after.items.reduce((sum, item) => sum + item.planned_grams, 0))).toBe(1000);
      for (const item of after.items) expect(Number.isInteger(item.planned_grams)).toBe(true);

      // Truthful status: ACHIEVED only when the delivered metrics really are in band.
      const assessment = assessRecipeDirection(after, calculateRecipe(after));
      if (assessment.reached) {
        for (const residual of assessment.residuals) expect(residual.side).toBe('inside');
      }

      // An applicable (non-diagnostic) preview must be commit-able, and a
      // nearest-achievable one must be commit-able WITH explicit consent.
      if (!built.preview.diagnosticOnly) {
        const committed = commitPreview(
          input,
          BANANA_RANGE,
          built.preview,
          'now',
          `mm-apply-${sweetness}-${softness}`,
          [],
          undefined,
          null,
          null,
          assessment.reached === false
            ? {
                baseFingerprint: built.preview.baseFingerprint,
                targetFingerprint: 'target',
                candidateFingerprint: 'candidate',
              }
            : null,
        );
        // Either it commits, or it refuses for an explicit, named reason —
        // never silently.
        if (!committed.ok) expect(typeof committed.code).toBe('string');
      }
    },
  );

  it('keeps a genuinely engine-clean multi-Main candidate free of band violations', () => {
    const built = buildOptimizePreview(multiMain(2, -2), BANANA_RANGE, 'mm-clean');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    if (!built.preview.diagnosticOnly) {
      expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);
    }
  });
});
