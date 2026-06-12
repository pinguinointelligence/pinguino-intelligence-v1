import { describe, expect, it } from 'vitest';
import { APPENDIX_A_EXPECTED_TOTALS, APPENDIX_A_ITEMS } from './__fixtures__/golden/composition';
import {
  computeComponentGrams,
  computeComponentTotals,
  computeComposition,
  computePercentages,
  computeSugarBreakdown,
  computeTotalBatchGrams,
  resolveEffectiveItems,
} from './composition';
import * as engine from './index';
import type { EngineIngredient, IngredientComponentProfile, RecipeItem } from './types';

/* ── test helpers ────────────────────────────────────────────────────────── */

const ZERO_PROFILE: IngredientComponentProfile = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const makeIngredient = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
): EngineIngredient => ({
  id,
  name: id,
  category: 'other',
  composition: { ...ZERO_PROFILE, ...composition },
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  cost_per_kg: 0,
  confidence_score: 85,
  source_type: 'manual',
  is_verified: false,
});

const makeItem = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  planned_grams: number,
  actual_grams: number | null = null,
): RecipeItem => ({
  id,
  ingredient: makeIngredient(`ing-${id}`, composition),
  planned_grams,
  actual_grams,
  lock_type: 'unlocked',
});

/* ── effective grams (spec §6, §15) ──────────────────────────────────────── */

describe('resolveEffectiveItems', () => {
  it('uses planned grams when actual grams are null', () => {
    const [resolved] = resolveEffectiveItems([makeItem('a', {}, 250)]);
    expect(resolved!.effective_grams).toBe(250);
    expect(resolved!.is_actual).toBe(false);
    expect(resolved!.difference).toBe(0);
  });

  it('actual grams override planned grams when present', () => {
    const [resolved] = resolveEffectiveItems([makeItem('a', {}, 34.7, 50)]);
    expect(resolved!.effective_grams).toBe(50);
    expect(resolved!.is_actual).toBe(true);
  });

  it('calculates the difference as actual − planned (spec §15 example: +15.3 g)', () => {
    const [resolved] = resolveEffectiveItems([makeItem('a', {}, 34.7, 50)]);
    expect(resolved!.difference).toBeCloseTo(15.3, 9);
  });

  it('an actual of 0 g counts as actual (overrides planned)', () => {
    const [resolved] = resolveEffectiveItems([makeItem('a', {}, 40, 0)]);
    expect(resolved!.effective_grams).toBe(0);
    expect(resolved!.is_actual).toBe(true);
    expect(resolved!.difference).toBe(-40);
  });
});

/* ── batch mass (spec §6) ────────────────────────────────────────────────── */

describe('computeTotalBatchGrams', () => {
  it('equals the sum of effective grams (mixed planned/actual)', () => {
    const items = resolveEffectiveItems([
      makeItem('a', {}, 600),
      makeItem('b', {}, 150, 180), // actual wins
      makeItem('c', {}, 250),
    ]);
    expect(computeTotalBatchGrams(items)).toBe(600 + 180 + 250);
  });
});

/* ── component totals (spec §6) ──────────────────────────────────────────── */

describe('computeComponentTotals', () => {
  it('applies component_g = grams × percent / 100', () => {
    expect(computeComponentGrams(500, 87.5)).toBeCloseTo(437.5, 12);
  });

  it('sums component totals from per-100 g composition across ingredients', () => {
    const items = resolveEffectiveItems([
      makeItem('milk', { water_percent: 87.5, fat_percent: 3.5, lactose_percent: 4.8 }, 500),
      makeItem('cream', { water_percent: 58.9, fat_percent: 35 }, 100),
    ]);
    const totals = computeComponentTotals(items);
    expect(totals.water_g).toBeCloseTo(500 * 0.875 + 100 * 0.589, 9);
    expect(totals.fat_g).toBeCloseTo(500 * 0.035 + 100 * 0.35, 9);
    expect(totals.lactose_g).toBeCloseTo(500 * 0.048, 9);
  });

  it('reproduces the hand-verified Appendix A arithmetic (composition only)', () => {
    const result = computeComposition(APPENDIX_A_ITEMS);
    const e = APPENDIX_A_EXPECTED_TOTALS;
    expect(result.total_batch_g).toBeCloseTo(e.total_batch_g, 9);
    expect(result.totals.water_g).toBeCloseTo(e.water_g, 9);
    expect(result.totals.solids_g).toBeCloseTo(e.solids_g, 9);
    expect(result.totals.fat_g).toBeCloseTo(e.fat_g, 9);
    expect(result.totals.protein_g).toBeCloseTo(e.protein_g, 9);
    expect(result.totals.lactose_g).toBeCloseTo(e.lactose_g, 9);
    expect(result.totals.sucrose_g).toBeCloseTo(e.sucrose_g, 9);
    expect(result.totals.dextrose_g).toBeCloseTo(e.dextrose_g, 9);
    expect(result.totals.fiber_g).toBeCloseTo(e.fiber_g, 9);
    expect(result.totals.salt_g).toBeCloseTo(e.salt_g, 9);
    expect(result.totals.alcohol_g).toBe(0);
    // mass check: water + solids = full batch (no alcohol in this mix)
    expect(result.totals.water_g + result.totals.solids_g).toBeCloseTo(1000, 9);
  });
});

/* ── percentages (spec §6) ───────────────────────────────────────────────── */

describe('computePercentages', () => {
  it('calculates percentages against total batch grams', () => {
    const items = resolveEffectiveItems([
      makeItem('milk', { water_percent: 87.5, fat_percent: 3.5 }, 800),
      makeItem('sugar', { solids_percent: 100, sucrose_percent: 100, sugar_percent: 100 }, 200),
    ]);
    const total = computeTotalBatchGrams(items);
    const pct = computePercentages(computeComponentTotals(items), total);
    expect(pct.water_percent).toBeCloseTo((800 * 0.875) / 1000 * 100, 9);
    expect(pct.fat_percent).toBeCloseTo(2.8, 9);
    expect(pct.sucrose_percent).toBeCloseTo(20, 9);
  });

  it('Appendix A percentages match the hand-verified values', () => {
    const { percentages } = computeComposition(APPENDIX_A_ITEMS);
    expect(percentages.water_percent).toBeCloseTo(66.7045, 6);
    expect(percentages.solids_percent).toBeCloseTo(33.2955, 6);
    expect(percentages.fat_percent).toBeCloseTo(6.923, 6);
    expect(percentages.lactose_percent).toBeCloseTo(5.439, 6);
  });
});

/* ── sugar logic (spec §4) ───────────────────────────────────────────────── */

describe('computeSugarBreakdown', () => {
  it('keeps sugar types separate — never one generic number', () => {
    const items = resolveEffectiveItems([
      makeItem('sucrose', { sugar_percent: 100, sucrose_percent: 100 }, 100),
      makeItem('dextrose', { sugar_percent: 92, dextrose_percent: 92 }, 50),
      makeItem('fruit', { sugar_percent: 10, fructose_percent: 6, glucose_percent: 4 }, 200),
    ]);
    const sugar = computeSugarBreakdown(items);
    expect(sugar.sucrose_g).toBeCloseTo(100, 9);
    expect(sugar.dextrose_g).toBeCloseTo(46, 9);
    expect(sugar.fructose_g).toBeCloseTo(12, 9);
    expect(sugar.glucose_g).toBeCloseTo(8, 9);
    expect(sugar.other_sugar_g).toBeCloseTo(0, 9);
  });

  it('counts lactose separately as its own sugar type', () => {
    const items = resolveEffectiveItems([
      makeItem('milk', { sugar_percent: 4.8, lactose_percent: 4.8 }, 1000),
    ]);
    const sugar = computeSugarBreakdown(items);
    expect(sugar.lactose_g).toBeCloseTo(48, 9);
    expect(sugar.sucrose_g).toBe(0);
    expect(sugar.other_sugar_g).toBeCloseTo(0, 9);
  });

  it('captures untyped remainder as other sugars, clamped per ingredient', () => {
    const items = resolveEffectiveItems([
      // honey-like label: 80 % sugars, only 70 % typed → 10 % other
      makeItem('honey', { sugar_percent: 80, fructose_percent: 40, glucose_percent: 30 }, 100),
      // noisy label: typed split exceeds declared total → clamps to 0, never negative
      makeItem('noisy', { sugar_percent: 5, sucrose_percent: 6 }, 100),
    ]);
    const sugar = computeSugarBreakdown(items);
    expect(sugar.other_sugar_g).toBeCloseTo(10, 9);
  });

  it('tracks polyols from polyol_percent, outside sugar_percent', () => {
    const items = resolveEffectiveItems([
      makeItem('erythritol', { polyol_percent: 100, solids_percent: 100 }, 50),
    ]);
    const sugar = computeSugarBreakdown(items);
    expect(sugar.polyol_g).toBeCloseTo(50, 9);
    expect(sugar.other_sugar_g).toBe(0);
  });
});

/* ── alcohol logic (spec §5) ─────────────────────────────────────────────── */

describe('alcohol rule', () => {
  // Jim Beam 40 %: 100 g contains 40 g alcohol (spec §5 worked example)
  const jimBeam = makeItem(
    'jim-beam',
    { water_percent: 60, solids_percent: 0, alcohol_percent: 40 },
    100,
  );

  it('counts alcohol separately from its own field', () => {
    const { totals } = computeComposition([jimBeam]);
    expect(totals.alcohol_g).toBeCloseTo(40, 9);
  });

  it('never counts alcohol as water or solids', () => {
    const { totals, percentages } = computeComposition([jimBeam]);
    expect(totals.water_g).toBeCloseTo(60, 9); // only the declared water
    expect(totals.solids_g).toBe(0);
    // water + solids + alcohol partition the full mass
    expect(percentages.water_percent).toBeCloseTo(60, 9);
    expect(percentages.solids_percent).toBe(0);
    expect(percentages.alcohol_percent).toBeCloseTo(40, 9);
  });

  it('brandy 36 %: 100 g contains 36 g alcohol (spec §5)', () => {
    const brandy = makeItem(
      'brandy',
      { water_percent: 64, alcohol_percent: 36 },
      100,
    );
    const { totals } = computeComposition([brandy]);
    expect(totals.alcohol_g).toBeCloseTo(36, 9);
  });
});

/* ── safety (spec §6 precision/safety rules) ─────────────────────────────── */

describe('safety', () => {
  it('handles an empty recipe safely — zero totals, zero percentages, no NaN', () => {
    const result = computeComposition([]);
    expect(result.total_batch_g).toBe(0);
    expect(result.items).toEqual([]);
    for (const value of Object.values(result.totals)) expect(value).toBe(0);
    for (const value of Object.values(result.percentages)) {
      expect(value).toBe(0);
      expect(Number.isNaN(value)).toBe(false);
    }
    for (const value of Object.values(result.sugar)) expect(value).toBe(0);
  });

  it('does not mutate input objects', () => {
    const items = [makeItem('a', { water_percent: 80 }, 100, 120), makeItem('b', {}, 50)];
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    computeComposition(items);
    expect(items).toEqual(snapshot);
    expect(items[0]!.actual_grams).toBe(120);
    expect('effective_grams' in items[0]!).toBe(false);
  });

  it('is deterministic — same input gives same output', () => {
    const items = [
      makeItem('a', { water_percent: 87.5, fat_percent: 3.5, lactose_percent: 4.8 }, 670),
      makeItem('b', { solids_percent: 100, sucrose_percent: 100, sugar_percent: 100 }, 130, 150),
    ];
    expect(computeComposition(items)).toEqual(computeComposition(items));
  });
});

/* ── scope guard (Step 4C: composition only) ─────────────────────────────── */

describe('scope guard', () => {
  it('creates no POD/PAC/NPAC/ice/status/scoring/correction functions', () => {
    const COMPOSITION_FUNCTIONS = new Set([
      'computeComponentGrams',
      'computeComponentTotals',
      'computeComposition',
      'computePercentages',
      'computeSugarBreakdown',
      'computeTotalBatchGrams',
      'resolveEffectiveItems',
    ]);
    const extraFunctions = Object.entries(engine)
      .filter(([name, value]) => typeof value === 'function' && !COMPOSITION_FUNCTIONS.has(name))
      .map(([name]) => name);
    // beyond the composition stage, the engine must export nothing executable —
    // in particular nothing POD/PAC/NPAC/ice/status/scoring/correction shaped
    expect(extraFunctions).toEqual([]);
  });
});
