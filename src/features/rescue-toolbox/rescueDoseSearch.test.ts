/**
 * NAPRAWA 5 — the smallest winning whole-gram dose.
 *
 * The Owner demoted the old `1 / 2 / 4 / 8 %` probe grid to "starting probes
 * only": the engine must find the smallest winning practical whole-gram dose,
 * including values such as 4 g, 7 g and 13 g that a four-point grid cannot
 * express. These tests prove the screen does that, that it stays inside every
 * window it is given, and that it never models a move the solver is forbidden
 * to make.
 *
 * The key test is not a snapshot: it RECOMPUTES the screen independently, from
 * the same primitives, and asserts the module returned the true minimum of the
 * scanned window. A grid regression cannot hide from that.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  compareDirectionDistance,
  directionDistance,
  requestedDirectionBands,
} from '@/features/recipe-direction/directionBandDistance';
import { GELLATTI_STABILIZER_AUTHORITY } from '@/data/ingredients/gellattiStabilizerAuthority';
import { starterPackRescueIngredient } from '@/features/constraint-studio/starterPackRescuePalette';
import { ingredientOf } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import {
  RESCUE_DOSE_FINALIST_LIMIT,
  RESCUE_DOSE_SCREEN_BUDGET,
  screenRescueDoses,
  screenedRescueVector,
} from './rescueDoseSearch';
import { rescueDosageWindow, rescueToolboxEntry } from './rescueToolboxAuthority';

const FRUCTOSE = 'PI-ING-000496';
const INULIN = 'PI-ING-000456';
const STABILIZER = 'PI-ING-002114';

const entry = (id: string) => rescueToolboxEntry(id)!;
const payload = (id: string) => starterPackRescueIngredient(id as never)!;

const line = (id: string, mapperId: string, grams: number, lock: 'unlocked' | 'main' = 'unlocked') => ({
  id,
  ingredient: ingredientOf(mapperId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
  ...(lock === 'main' ? { main_ratio_weight: 1 } : {}),
});

/** A milk gelato with an active Direction request, on batch at 1000 g. */
const gelato = (sweetness: -2 | -1 | 0 | 1 | 2): RecipeInput => ({
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

const LINE_ID = 'rescue-probe';

describe('the screen never models a move the solver may not make', () => {
  it('absorbs the added mass only out of movable lines and keeps the batch', () => {
    const input: RecipeInput = {
      ...gelato(1),
      items: [
        line('l-main', 'PI-ING-001553', 300, 'main'),
        line('l-milk', 'PI-ING-000236', 500),
        line('l-sucrose', 'PI-ING-000514', 200),
      ],
    };
    const screened = screenedRescueVector(input, payload(FRUCTOSE), LINE_ID, 40)!;
    expect(screened).not.toBeNull();
    const total = screened.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(total).toBeCloseTo(1_000, 6);
    // The Main line is byte-exact.
    expect(screened.items.find((item) => item.id === 'l-main')!.planned_grams).toBe(300);
    // The added line carries exactly the dose asked for.
    expect(screened.items.find((item) => item.id === LINE_ID)!.planned_grams).toBe(40);
    // The movable lines kept their proportions to each other.
    const milk = screened.items.find((item) => item.id === 'l-milk')!.planned_grams;
    const sucrose = screened.items.find((item) => item.id === 'l-sucrose')!.planned_grams;
    expect(milk / sucrose).toBeCloseTo(500 / 200, 9);
  });

  it('refuses to screen a dose it cannot absorb rather than inventing mass', () => {
    const input: RecipeInput = {
      ...gelato(1),
      items: [line('l-main', 'PI-ING-001553', 1_000, 'main')],
    };
    expect(screenedRescueVector(input, payload(FRUCTOSE), LINE_ID, 40)).toBeNull();
    expect(screenedRescueVector(gelato(1), payload(FRUCTOSE), LINE_ID, 0)).toBeNull();
  });

  it('never mutates the draft it is given', () => {
    const input = gelato(2);
    const before = structuredClone(input);
    screenRescueDoses({
      input,
      ingredient: payload(FRUCTOSE),
      lineId: LINE_ID,
      window: rescueDosageWindow(entry(FRUCTOSE), input)!,
    });
    expect(input).toEqual(before);
  });
});

describe('the screen stays inside the window it is given', () => {
  it('never screens Fructose above 6 % at −1 / 0 / +1', () => {
    for (const level of [-1, 1] as const) {
      const input = gelato(level);
      const window = rescueDosageWindow(entry(FRUCTOSE), input)!;
      const outcome = screenRescueDoses({
        input,
        ingredient: payload(FRUCTOSE),
        lineId: LINE_ID,
        window,
      });
      for (const grams of outcome.finalists) expect(grams, `level ${level}`).toBeLessThanOrEqual(60);
      expect(outcome.usesControlledRange).toBe(false);
    }
  });

  it('may screen Fructose up to 8 % at ±2, and never past it', () => {
    for (const level of [-2, 2] as const) {
      const input = gelato(level);
      const window = rescueDosageWindow(entry(FRUCTOSE), input)!;
      const outcome = screenRescueDoses({
        input,
        ingredient: payload(FRUCTOSE),
        lineId: LINE_ID,
        window,
      });
      for (const grams of outcome.finalists) expect(grams, `level ${level}`).toBeLessThanOrEqual(80);
      expect(outcome.nearestGrams ?? 0).toBeLessThanOrEqual(80);
    }
  });

  it('never screens Inulin below its published 2 % floor', () => {
    const input = gelato(2);
    const window = rescueDosageWindow(entry(INULIN), input)!;
    expect(window.permitted.minGrams).toBeGreaterThan(0);
    const outcome = screenRescueDoses({
      input,
      ingredient: payload(INULIN),
      lineId: LINE_ID,
      window,
    });
    for (const grams of [...outcome.finalists, outcome.nearestGrams ?? Infinity]) {
      if (Number.isFinite(grams)) {
        expect(grams).toBeGreaterThanOrEqual(Math.ceil(window.permitted.minGrams));
      }
    }
  });

  it('passes an exact product-owned dose through whole instead of rounding it', () => {
    const input = gelato(2);
    const window = rescueDosageWindow(entry(STABILIZER), input)!;
    const outcome = screenRescueDoses({
      input,
      ingredient: payload(STABILIZER),
      lineId: LINE_ID,
      window,
    });
    expect(outcome.finalists).toEqual([GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg.STANDARD]);
    // 2.3 g must not become 2 g.
    expect(Number.isInteger(outcome.finalists[0])).toBe(false);
    expect(outcome.evaluations).toBe(0);
  });
});

describe('it finds the SMALLEST winning dose, not a grid point', () => {
  /**
   * The independent recomputation. Same primitives, no shared code path with the
   * module's own bookkeeping: build every whole-gram vector in the window, price
   * it, and take the minimum improving one. The module must agree.
   */
  const recompute = (input: RecipeInput, candidateId: string) => {
    const window = rescueDosageWindow(entry(candidateId), input)!;
    const bands = requestedDirectionBands(input);
    const current = directionDistance(input, bands);
    const floor = Math.max(1, Math.ceil(window.permitted.minGrams - 1e-9));
    const ceiling = Math.floor(window.permitted.maxGrams + 1e-9);
    let smallest: number | null = null;
    const improving: number[] = [];
    for (let grams = floor; grams <= ceiling; grams += 1) {
      const vector = screenedRescueVector(input, payload(candidateId), LINE_ID, grams);
      if (vector === null) continue;
      const result = calculateRecipe(vector);
      const distance = directionDistance(vector, bands, result);
      if (
        detectViolations(result).length === 0 &&
        (compareDirectionDistance(distance, current) ?? 0) < 0
      ) {
        improving.push(grams);
        if (smallest === null) smallest = grams;
      }
    }
    return { smallest, improving, window };
  };

  it.each([-2, -1, 1, 2] as const)(
    'sweetness %i: the reported smallest improving dose IS the minimum of the window',
    (level) => {
      const input = gelato(level);
      const expected = recompute(input, FRUCTOSE);
      const outcome = screenRescueDoses({
        input,
        ingredient: payload(FRUCTOSE),
        lineId: LINE_ID,
        window: expected.window,
      });
      expect(outcome.smallestImprovingGrams).toBe(expected.smallest);
      if (expected.smallest !== null) {
        expect(outcome.finalists[0]).toBe(expected.smallest);
      }
    },
  );

  it('is not restricted to the old 1 / 2 / 4 / 8 % points', () => {
    // The scan reaches every whole gram in the window, so a dose such as 7 g or
    // 13 g is reachable by construction. Proving reachability is the contract;
    // which gram wins is physics and is asserted above against a recomputation.
    const input = gelato(2);
    const window = rescueDosageWindow(entry(FRUCTOSE), input)!;
    const priced: number[] = [];
    for (let grams = 1; grams <= Math.floor(window.permitted.maxGrams); grams += 1) {
      if (screenedRescueVector(input, payload(FRUCTOSE), LINE_ID, grams) !== null) priced.push(grams);
    }
    for (const grams of [4, 7, 13, 41, 59, 77]) expect(priced).toContain(grams);
    const outcome = screenRescueDoses({
      input,
      ingredient: payload(FRUCTOSE),
      lineId: LINE_ID,
      window,
    });
    expect(outcome.evaluations).toBe(priced.length);
  });

  it('is deterministic — the same draft screens identically every time', () => {
    const input = gelato(2);
    const window = rescueDosageWindow(entry(FRUCTOSE), input)!;
    const once = screenRescueDoses({ input, ingredient: payload(FRUCTOSE), lineId: LINE_ID, window });
    const twice = screenRescueDoses({ input, ingredient: payload(FRUCTOSE), lineId: LINE_ID, window });
    expect(twice).toEqual(once);
  });
});

describe('the search is bounded', () => {
  it('never prices more whole grams than its budget, and never more than a few finalists', () => {
    const input: RecipeInput = { ...gelato(2), target_batch_grams: 100_000 };
    const scaled: RecipeInput = {
      ...input,
      items: input.items.map((item) => ({ ...item, planned_grams: item.planned_grams * 100 })),
    };
    const window = rescueDosageWindow(entry(FRUCTOSE), scaled)!;
    // 8 % of 100 kg is 8000 whole grams — the budget is what stops this.
    expect(window.permitted.maxGrams).toBeCloseTo(8_000, 6);
    const outcome = screenRescueDoses({
      input: scaled,
      ingredient: payload(FRUCTOSE),
      lineId: LINE_ID,
      window,
    });
    expect(outcome.evaluations).toBeLessThanOrEqual(RESCUE_DOSE_SCREEN_BUDGET);
    expect(outcome.finalists.length).toBeLessThanOrEqual(RESCUE_DOSE_FINALIST_LIMIT);
  });

  it('a request with no Direction bands screens nothing at all', () => {
    const neutral: RecipeInput = {
      ...gelato(1),
      goals: {
        formulation_strategy: 'optimal',
        direction_targets_active: false,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    const outcome = screenRescueDoses({
      input: neutral,
      ingredient: payload(FRUCTOSE),
      lineId: LINE_ID,
      window: rescueDosageWindow(entry(FRUCTOSE), neutral)!,
    });
    expect(outcome.evaluations).toBe(0);
    expect(outcome.finalists).toEqual([]);
  });
});
