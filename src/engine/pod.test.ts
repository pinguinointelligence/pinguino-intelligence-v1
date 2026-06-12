import { describe, expect, it } from 'vitest';
import { APPENDIX_A_ITEMS } from './__fixtures__/golden/composition';
import { computeComposition, resolveEffectiveItems } from './composition';
import * as engine from './index';
import { computeRecipePod, ingredientPodContribution } from './pod';
import type {
  EffectiveRecipeItem,
  EngineIngredient,
  IngredientComponentProfile,
  RecipeItem,
} from './types';

/* ── test helpers (same factory pattern as composition.test.ts) ──────────── */

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
  pod_value: number | null = null,
): EngineIngredient => ({
  id,
  name: id,
  category: 'other',
  composition: { ...ZERO_PROFILE, ...composition },
  pod_value,
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
  pod_value: number | null = null,
): RecipeItem => ({
  id,
  ingredient: makeIngredient(`ing-${id}`, composition, pod_value),
  planned_grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const effective = (...items: RecipeItem[]): EffectiveRecipeItem[] =>
  resolveEffectiveItems(items);

const WATER_FILLER = (grams: number): RecipeItem =>
  makeItem(`water-${grams}`, { water_percent: 100 }, grams);

/* ── sugar-type coefficients (spec §7) ───────────────────────────────────── */

describe('sugar-type coefficients (spec §7)', () => {
  it('sucrose contributes POD with coefficient 1.00 — 130 g in 1000 g = 13.0 points', () => {
    const items = effective(
      makeItem('sucrose', { sugar_percent: 100, sucrose_percent: 100 }, 130),
      WATER_FILLER(870),
    );
    expect(computeRecipePod(items, 1000)).toBeCloseTo(13, 12);
  });

  it('dextrose and glucose contribute less sweetness than sucrose', () => {
    const [sucrose] = effective(makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100));
    const [dextrose] = effective(makeItem('d', { sugar_percent: 100, dextrose_percent: 100 }, 100));
    const [glucose] = effective(makeItem('g', { sugar_percent: 100, glucose_percent: 100 }, 100));
    expect(ingredientPodContribution(sucrose!)).toBeCloseTo(100, 9);
    expect(ingredientPodContribution(dextrose!)).toBeCloseTo(74, 9);
    expect(ingredientPodContribution(glucose!)).toBeCloseTo(74, 9);
    expect(ingredientPodContribution(dextrose!)).toBeLessThan(ingredientPodContribution(sucrose!));
    expect(ingredientPodContribution(glucose!)).toBeLessThan(ingredientPodContribution(sucrose!));
  });

  it('fructose contributes more sweetness than sucrose', () => {
    const [sucrose] = effective(makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100));
    const [fructose] = effective(makeItem('f', { sugar_percent: 100, fructose_percent: 100 }, 100));
    expect(ingredientPodContribution(fructose!)).toBeCloseTo(173, 9);
    expect(ingredientPodContribution(fructose!)).toBeGreaterThan(
      ingredientPodContribution(sucrose!),
    );
  });

  it('lactose contributes much less sweetness than sucrose', () => {
    const [sucrose] = effective(makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100));
    const [lactose] = effective(makeItem('l', { sugar_percent: 100, lactose_percent: 100 }, 100));
    expect(ingredientPodContribution(lactose!)).toBeCloseTo(16, 9);
    expect(ingredientPodContribution(lactose!)).toBeLessThan(
      0.25 * ingredientPodContribution(sucrose!),
    );
  });

  it('sugar types remain separate — each typed field contributes its own term', () => {
    // fruit-like: 6 % fructose + 4 % glucose on 200 g
    const [fruit] = effective(
      makeItem('fruit', { sugar_percent: 10, fructose_percent: 6, glucose_percent: 4 }, 200),
    );
    // 200×0.06×1.73 + 200×0.04×0.74 = 20.76 + 5.92
    expect(ingredientPodContribution(fruit!)).toBeCloseTo(26.68, 9);
  });
});

/* ── total sugar is never the source (spec §4/§7) ────────────────────────── */

describe('total sugar alone is not used', () => {
  it('uses only the typed split even when sugar_percent is larger', () => {
    const [item] = effective(
      makeItem('half-typed', { sugar_percent: 100, sucrose_percent: 50 }, 100),
    );
    expect(ingredientPodContribution(item!)).toBeCloseTo(50, 9); // not 100
  });

  it('total-sugar-only ingredient (no split, no stored value) contributes 0', () => {
    const [item] = effective(makeItem('label-only', { sugar_percent: 80 }, 100));
    expect(ingredientPodContribution(item!)).toBe(0);
  });
});

/* ── stored-value-first rule (spec §7) ───────────────────────────────────── */

describe('stored pod_value wins over the calculated fallback', () => {
  it('uses the stored value when present, not the breakdown', () => {
    const withStored = effective(
      makeItem('honey', { sugar_percent: 80, fructose_percent: 40, glucose_percent: 30 }, 100, 120),
    );
    const withoutStored = effective(
      makeItem('honey', { sugar_percent: 80, fructose_percent: 40, glucose_percent: 30 }, 100),
    );
    const stored = ingredientPodContribution(withStored[0]!);
    const fallback = ingredientPodContribution(withoutStored[0]!);
    expect(stored).toBeCloseTo(120, 9); // 100 g × 120 / 100
    expect(stored).not.toBeCloseTo(fallback, 6);
  });

  it('converts the stored per-100 g value by ingredient grams (200 g at pod_value 50 → 100)', () => {
    const [item] = effective(makeItem('special', {}, 200, 50));
    expect(ingredientPodContribution(item!)).toBeCloseTo(100, 9);
  });
});

/* ── polyols (spec §7: ingredient-specific / stored-value path) ──────────── */

describe('polyol behavior', () => {
  it('unnamed polyol without stored value contributes 0 in the fallback', () => {
    const [item] = effective(
      makeItem('polyol', { polyol_percent: 100, solids_percent: 100 }, 100),
    );
    expect(ingredientPodContribution(item!)).toBe(0);
  });

  it('polyol ingredient with stored pod_value uses the stored path', () => {
    const [item] = effective(
      makeItem('erythritol', { polyol_percent: 100, solids_percent: 100 }, 100, 65),
    );
    expect(ingredientPodContribution(item!)).toBeCloseTo(65, 9);
  });
});

/* ── recipe POD (spec §7 formula) ────────────────────────────────────────── */

describe('computeRecipePod', () => {
  it('mixed sugars calculate the correct weighted POD (Appendix A arithmetic)', () => {
    const { items, total_batch_g } = computeComposition(APPENDIX_A_ITEMS);
    // (130×1.00 + 27.6×0.74 + 54.39×0.16) / 1000 × 100 = 15.91264
    expect(computeRecipePod(items, total_batch_g)).toBeCloseTo(15.91264, 6);
  });

  it('empty recipe returns POD 0', () => {
    expect(computeRecipePod([], 0)).toBe(0);
  });

  it('zero batch never produces NaN or Infinity', () => {
    const items = effective(makeItem('z', { sucrose_percent: 100, sugar_percent: 100 }, 0));
    const pod = computeRecipePod(items, 0);
    expect(pod).toBe(0);
    expect(Number.isFinite(pod)).toBe(true);
  });

  it('does not mutate input objects', () => {
    const items = effective(
      makeItem('a', { sugar_percent: 100, sucrose_percent: 100 }, 130, 100),
      makeItem('b', { sugar_percent: 4.8, lactose_percent: 4.8 }, 870),
    );
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    computeRecipePod(items, 1000);
    expect(items).toEqual(snapshot);
  });

  it('is deterministic — same input gives same output', () => {
    const { items, total_batch_g } = computeComposition(APPENDIX_A_ITEMS);
    expect(computeRecipePod(items, total_batch_g)).toBe(
      computeRecipePod(items, total_batch_g),
    );
  });
});

/* ── scope guard (Step 4D: composition + POD only) ───────────────────────── */

describe('scope guard', () => {
  const ALLOWED_FUNCTIONS = new Set([
    // composition (4C)
    'computeComponentGrams',
    'computeComponentTotals',
    'computeComposition',
    'computePercentages',
    'computeSugarBreakdown',
    'computeTotalBatchGrams',
    'resolveEffectiveItems',
    // POD (4D)
    'computeRecipePod',
    'ingredientPodContribution',
    // PAC/NPAC (4E)
    'computeRecipeNpac',
    'computeRecipePac',
    'ingredientNpacContribution',
    'ingredientPacContribution',
    'interpolateSyrupDeAnchors',
    // ice fraction (4F)
    'estimateIceFraction',
    // statuses (4G)
    'classifyIndicator',
    'classifyRecipeIndicators',
    'classifyValue',
    'computeLactoseSandinessRisk',
    'selectTargetBand',
  ]);

  it('creates no scoring/correction functions', () => {
    const extraFunctions = Object.entries(engine)
      .filter(([name, value]) => typeof value === 'function' && !ALLOWED_FUNCTIONS.has(name))
      .map(([name]) => name);
    expect(extraFunctions).toEqual([]);
  });
});
