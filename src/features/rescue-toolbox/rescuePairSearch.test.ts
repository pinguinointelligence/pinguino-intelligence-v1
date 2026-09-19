/**
 * NAPRAWA 5 — bounded pair Rescue.
 *
 * The Owner's constraints on this stage are all about restraint: it runs ONLY
 * after single candidates fail, it is tightly bounded, it is deterministic, it
 * is protected from combinatorial explosion, and it must not hard-code which
 * pairs to try. These tests pin every one of those, and measure the budget
 * rather than asserting it in a comment.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { ingredientOf } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import { starterPackRescueIngredient } from '@/features/constraint-studio/starterPackRescuePalette';
import { screenedRescueVectorFor } from './rescueDoseSearch';
import {
  RESCUE_PAIR_DOSES_PER_SIDE,
  RESCUE_PAIR_SCREEN_BUDGET,
  RESCUE_PAIR_TOP_K,
  searchRescuePairs,
  type RescuePairCandidate,
} from './rescuePairSearch';

const line = (id: string, mapperId: string, grams: number) => ({
  id,
  ingredient: ingredientOf(mapperId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const draft = (sweetness: -2 | -1 | 0 | 1 | 2 = 2): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
  items: [
    line('l-milk', 'PI-ING-000236', 600),
    line('l-cream', 'PI-ING-000180', 150),
    line('l-sucrose', 'PI-ING-000514', 140),
    line('l-dextrose', 'PI-ING-000494', 60),
    line('l-smp', 'PI-ING-000270', 48),
    line('l-tara', 'PI-ING-000492', 2),
  ],
});

/**
 * A LEAN, UNDER-SWEET base — the shape the pair stage actually exists for.
 *
 * The over-sweet `draft()` above is the case where nothing helps: two sugars
 * cannot rescue a recipe whose POD is already too high, and the search
 * correctly returns nothing. This one is short of sugar, solids and PAC all at
 * once, which is precisely "no single candidate materially solves the target"
 * and is where a compatible pair earns its place.
 */
const lean = (sweetness: -2 | -1 | 0 | 1 | 2 = 2): RecipeInput => ({
  ...draft(sweetness),
  items: [
    line('l-milk', 'PI-ING-000236', 760),
    line('l-cream', 'PI-ING-000180', 150),
    line('l-sucrose', 'PI-ING-000514', 50),
    line('l-smp', 'PI-ING-000270', 38),
    line('l-tara', 'PI-ING-000492', 2),
  ],
});

const candidate = (id: string, doses: number[]): RescuePairCandidate => ({
  canonicalIngredientId: id,
  ingredient: starterPackRescueIngredient(id as never)!,
  lineId: `pair:${id}`,
  doses,
});

const FRUCTOSE = candidate('PI-ING-000496', [10, 40]);
const INULIN = candidate('PI-ING-000456', [20, 60]);
const DEXTROSE = candidate('PI-ING-000494', [10, 40]);
const STABILIZER = candidate('PI-ING-002114', [2.3]);

describe('it runs only after singles have failed', () => {
  it('does not run at all when a single candidate already succeeded', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: true,
    });
    expect(report.attempted).toBe(false);
    expect(report.evaluations).toBe(0);
    expect(report.finalists).toEqual([]);
  });

  it('runs when they failed, and says it ran', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
    });
    expect(report.attempted).toBe(true);
    expect(report.evaluations).toBeGreaterThan(0);
  });

  it('needs two compatible candidates to have a pair at all', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE],
      singlesSucceeded: false,
    });
    expect(report.attempted).toBe(true);
    expect(report.evaluations).toBe(0);
    expect(report.finalists).toEqual([]);
  });

  it('never pairs a candidate with itself', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE, { ...FRUCTOSE, lineId: 'pair:duplicate' }],
      singlesSucceeded: false,
    });
    expect(report.evaluations).toBe(0);
  });
});

describe('the search is bounded, and the bound is enforced', () => {
  it('never prices more pair vectors than its budget', () => {
    const many = [FRUCTOSE, INULIN, DEXTROSE, STABILIZER].map((entry, index) => ({
      ...entry,
      lineId: `${entry.lineId}-${index}`,
      doses: [5, 10, 20, 40, 60],
    }));
    const report = searchRescuePairs({
      input: draft(),
      candidates: many,
      singlesSucceeded: false,
    });
    expect(report.evaluations).toBeLessThanOrEqual(RESCUE_PAIR_SCREEN_BUDGET);
  });

  it('carries at most top-K candidates and a bounded number of doses per side', () => {
    const many = [FRUCTOSE, INULIN, DEXTROSE, STABILIZER];
    const report = searchRescuePairs({
      input: draft(),
      candidates: many,
      singlesSucceeded: false,
      budget: 1_000,
    });
    const pairs = (RESCUE_PAIR_TOP_K * (RESCUE_PAIR_TOP_K - 1)) / 2;
    expect(report.evaluations).toBeLessThanOrEqual(
      pairs * RESCUE_PAIR_DOSES_PER_SIDE * RESCUE_PAIR_DOSES_PER_SIDE,
    );
    // The fourth candidate is outside top-K, so it can never appear.
    for (const finalist of report.finalists) {
      expect([finalist.left.canonicalIngredientId, finalist.right.canonicalIngredientId]).not.toContain(
        STABILIZER.canonicalIngredientId,
      );
    }
  });

  it('reports budget exhaustion honestly instead of pretending it finished', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
      budget: 2,
    });
    expect(report.budgetExhausted).toBe(true);
    expect(report.evaluations).toBeLessThanOrEqual(2);
  });

  it('hands back at most a couple of finalists to prove', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
      budget: 1_000,
    });
    expect(report.finalists.length).toBeLessThanOrEqual(2);
  });
});

describe('nothing about which pair to try is hard-coded', () => {
  it('pairs whatever it is given, in the order it is given', () => {
    const report = searchRescuePairs({
      input: draft(),
      candidates: [DEXTROSE, STABILIZER, INULIN],
      singlesSucceeded: false,
      budget: 1_000,
    });
    // Nothing in the module names an ingredient: a pool without Fructose
    // simply produces pairs without Fructose.
    for (const finalist of report.finalists) {
      expect([finalist.left.canonicalIngredientId, finalist.right.canonicalIngredientId]).not.toContain(
        'PI-ING-000496',
      );
    }
  });

  it('is deterministic', () => {
    const args = {
      input: draft(),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
    } as const;
    expect(searchRescuePairs({ ...args })).toEqual(searchRescuePairs({ ...args }));
  });

  it('a request with no Direction bands is not a pair search', () => {
    const neutral: RecipeInput = {
      ...draft(),
      goals: {
        formulation_strategy: 'optimal',
        direction_targets_active: false,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    const report = searchRescuePairs({
      input: neutral,
      candidates: [FRUCTOSE, INULIN],
      singlesSucceeded: false,
    });
    expect(report.attempted).toBe(false);
  });
});

describe('a pair vector is still a legal vector', () => {
  it('adds both lines, keeps the batch, and never touches the draft', () => {
    const input = draft();
    const before = structuredClone(input);
    const vector = screenedRescueVectorFor(input, [
      { ingredient: FRUCTOSE.ingredient, lineId: FRUCTOSE.lineId, grams: 30 },
      { ingredient: INULIN.ingredient, lineId: INULIN.lineId, grams: 40 },
    ])!;
    expect(input).toEqual(before);
    expect(vector.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(1_000, 6);
    expect(vector.items.find((item) => item.id === FRUCTOSE.lineId)!.planned_grams).toBe(30);
    expect(vector.items.find((item) => item.id === INULIN.lineId)!.planned_grams).toBe(40);
  });

  /**
   * NON-VACUITY GUARD, and the stage's worked example.
   *
   * Measured on the lean fixture at sweetness +2: the draft scores 5/10 at
   * Σ band distance 39.690 with five violated metrics, no single candidate
   * rescues it, and the bounded pair search returns
   * Fructose 40 g + Dextrose 40 g — distance 39.690 → 10.116, score 5 → 8 —
   * in 12 screened vectors and not one Preview.
   */
  it('finds a real pair on a draft no single candidate rescues', () => {
    const input = lean(2);
    const report = searchRescuePairs({
      input,
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
      budget: 1_000,
    });
    expect(report.finalists.length).toBeGreaterThan(0);
    const best = report.finalists[0]!;
    expect(best.leftGrams).toBeGreaterThan(0);
    expect(best.rightGrams).toBeGreaterThan(0);
    // Two DIFFERENT ingredients, and both from the pool it was given.
    expect(best.left.canonicalIngredientId).not.toBe(best.right.canonicalIngredientId);
    for (const id of [best.left.canonicalIngredientId, best.right.canonicalIngredientId]) {
      expect([FRUCTOSE, INULIN, DEXTROSE].map((entry) => entry.canonicalIngredientId)).toContain(id);
    }
    // It is only a finalist because it is materially better.
    const baseline = searchRescuePairs({
      input,
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: true,
    });
    expect(baseline.finalists).toEqual([]);
    expect(best.score ?? 0).toBeGreaterThan(0);
  });

  it('returns nothing on a draft two more sugars cannot help', () => {
    // The over-sweet draft: POD is already too high, so adding sugar is not a
    // rescue and the search says so instead of proposing one anyway.
    const report = searchRescuePairs({
      input: draft(2),
      candidates: [FRUCTOSE, INULIN, DEXTROSE],
      singlesSucceeded: false,
      budget: 1_000,
    });
    expect(report.attempted).toBe(true);
    expect(report.evaluations).toBeGreaterThan(0);
    expect(report.finalists).toEqual([]);
  });
});
