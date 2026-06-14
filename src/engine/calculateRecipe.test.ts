import { describe, expect, it } from 'vitest';
import { ALLOWED_ENGINE_FUNCTIONS } from './__fixtures__/allowedEngineFunctions';
import { APPENDIX_A_EXPECTED_TOTALS, APPENDIX_A_ITEMS } from './__fixtures__/golden/composition';
import { calculateRecipe } from './calculateRecipe';
import { computeComposition } from './composition';
import { CONFIG_VERSION, ENGINE_VERSION } from './config/version';
import { estimateIceFraction } from './iceFraction';
import * as engine from './index';
import { computeRecipeNpac, computeRecipePac } from './pac';
import { computeRecipePod } from './pod';
import type {
  EngineIngredient,
  IngredientComponentProfile,
  RecipeInput,
  RecipeItem,
} from './types';

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
  confidence_score = 85,
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
  confidence_score,
  source_type: 'manual',
  is_verified: false,
});

const makeItem = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  planned_grams: number,
  actual_grams: number | null = null,
  confidence_score = 85,
): RecipeItem => ({
  id,
  ingredient: makeIngredient(`ing-${id}`, composition, confidence_score),
  planned_grams,
  actual_grams,
  lock_type: 'unlocked',
});

/** Appendix A mix as a RecipeInput — arithmetic-only / calibration-pending fixture. */
const appendixInput = (overrides: Partial<RecipeInput> = {}): RecipeInput => ({
  items: [...APPENDIX_A_ITEMS],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  ...overrides,
});

/** Recursively asserts no NaN/Infinity anywhere in a result object. */
const expectAllNumbersFinite = (value: unknown, path = 'result'): void => {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} must be finite, got ${value}`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => expectAllNumbersFinite(entry, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      expectAllNumbersFinite(entry, `${path}.${key}`);
    }
  }
};

/* ── end-to-end pipeline (Appendix A arithmetic under current config) ────── */

describe('calculateRecipe — end-to-end (spec §12/§18)', () => {
  it('calculates a simple milk gelato recipe end-to-end', () => {
    const result = calculateRecipe(appendixInput());
    expect(result.total_batch_g).toBeCloseTo(1000, 9);
    expect(result.totals.water_g).toBeCloseTo(APPENDIX_A_EXPECTED_TOTALS.water_g, 9);
    expect(result.totals.solids_g).toBeCloseTo(APPENDIX_A_EXPECTED_TOTALS.solids_g, 9);
    expect(result.percentages.water_percent).toBeCloseTo(66.7045, 6);
    expect(result.pod_points).toBeCloseTo(15.91264, 6);
    expect(result.pac_points).toBeCloseTo(23.683, 6);
    // NPAC on the canonical per_water_mass basis (CONFIG 0.5.0)
    expect(result.npac_points).toBeCloseTo(37.5215, 4);
    // ice from the per_water NPAC; the −11 °C anchor itself is still calibration-pending
    expect(result.ice_fraction_percent).toBeCloseTo(49.73, 2);
    expect(result.indicators).toHaveLength(11);
  });

  it('includes nutrition per 100 g (kcal from the fixture ingredient values)', () => {
    const nutrition = calculateRecipe(appendixInput()).nutrition_per_100g!;
    // (670×0.64 + 130×3.37 + 35×3.6 + 130×4 + 30×3.68 + 5×2) / 1000 × 100
    expect(nutrition.kcal).toBeCloseTo(163.33, 2);
    expect(nutrition.fat_g).toBeCloseTo(6.923, 6);
    expect(nutrition.sugars_g).toBeCloseTo(21.199, 6);
    expect(nutrition.saturated_fat_g).toBeNull(); // fixture provides no saturated data
  });

  it('includes costs (fixture costs are explicitly 0 — free and complete)', () => {
    const costs = calculateRecipe(appendixInput()).costs!;
    expect(costs.complete).toBe(true);
    expect(costs.total_cost).toBe(0);
    expect(costs.cost_per_kg).toBe(0);
  });

  it('includes non-null scores for a valid recipe', () => {
    const scores = calculateRecipe(appendixInput()).scores!;
    expect(scores.technical).toBeGreaterThan(0);
    expect(scores.technical).toBeLessThanOrEqual(100);
    expect(scores.flavor).toBe(70); // no main-locked line in the fixture → neutral
    expect(scores.cost).toBe(100); // free recipe
    expect(scores.overall).toBeGreaterThan(0);
    expect(scores.overall).toBeLessThanOrEqual(scores.technical + 30); // stability gate
  });

  it('emits cost_incomplete when an ingredient cost is unknown', () => {
    const input = appendixInput();
    const unknownCost = makeItem('mystery', { water_percent: 100 }, 50);
    unknownCost.ingredient.cost_per_kg = null;
    input.items = [...input.items, unknownCost];
    const result = calculateRecipe(input);
    expect(result.costs!.complete).toBe(false);
    expect(result.warnings.map((w) => w.code)).toContain('cost_incomplete');
    expect(result.scores!.cost).toBeNull(); // unknown cost never becomes a score
  });

  it('returns the engine and config versions on every result', () => {
    const result = calculateRecipe(appendixInput());
    expect(result.engine_version).toBe(ENGINE_VERSION);
    expect(result.config_version).toBe(CONFIG_VERSION);
  });

  it('matches the individually-tested stage functions exactly (pure assembly)', () => {
    const input = appendixInput();
    const result = calculateRecipe(input);
    const { items, total_batch_g, totals } = computeComposition(input.items);
    expect(result.pod_points).toBe(computeRecipePod(items, total_batch_g));
    expect(result.pac_points).toBe(computeRecipePac(items, total_batch_g));
    // NPAC uses the canonical per_water basis — mirror the pipeline's water_g call
    expect(result.npac_points).toBe(
      computeRecipeNpac(items, total_batch_g, { water_g: totals.water_g }),
    );
    expect(result.ice_fraction_percent).toBe(
      estimateIceFraction({
        npac: result.npac_points,
        temperature_c: -11,
        category: 'milk_gelato',
      }),
    );
  });
});

/* ── effective grams / production state (spec §6, §15) ───────────────────── */

describe('actual grams override planned grams', () => {
  it('reflects actual amounts in totals and item state', () => {
    const input: RecipeInput = {
      items: [
        makeItem('sucrose', { solids_percent: 100, sugar_percent: 100, sucrose_percent: 100 }, 130, 150),
        makeItem('water', { water_percent: 100 }, 870),
      ],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
    };
    const result = calculateRecipe(input);
    expect(result.total_batch_g).toBe(1020); // 150 actual + 870 planned
    expect(result.totals.sucrose_g).toBeCloseTo(150, 9);
    const sucroseItem = result.items[0]!;
    expect(sucroseItem.effective_grams).toBe(150);
    expect(sucroseItem.is_actual).toBe(true);
    expect(sucroseItem.difference).toBeCloseTo(20, 9);
  });
});

/* ── separation guarantees (spec §4, §5) ─────────────────────────────────── */

describe('separation guarantees', () => {
  it('preserves the sugar breakdown by type', () => {
    const result = calculateRecipe(appendixInput());
    expect(result.sugar.sucrose_g).toBeCloseTo(130, 9);
    expect(result.sugar.dextrose_g).toBeCloseTo(27.6, 9);
    expect(result.sugar.lactose_g).toBeCloseTo(54.39, 9);
    expect(result.sugar.fructose_g).toBe(0);
  });

  it('preserves alcohol separately — never as water or solids', () => {
    const input: RecipeInput = {
      items: [
        makeItem('jim-beam', { water_percent: 60, alcohol_percent: 40 }, 100),
        makeItem('water', { water_percent: 100 }, 900),
      ],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
    };
    const result = calculateRecipe(input);
    expect(result.totals.alcohol_g).toBeCloseTo(40, 9);
    expect(result.percentages.alcohol_percent).toBeCloseTo(4, 9);
    expect(result.totals.water_g).toBeCloseTo(960, 9); // 60 + 900 — alcohol not included
    expect(result.totals.solids_g).toBe(0);
    // NPAC includes the alcohol term (40 g × 7.4), normalized per water mass (canonical)
    expect(result.npac_points).toBeCloseTo((40 * 7.4) / result.totals.water_g * 100, 6);
    expect(result.pac_points).toBe(0); // alcohol is not part of the PAC sugar spectrum
  });
});

/* ── classified indicators ───────────────────────────────────────────────── */

describe('classified indicators', () => {
  it('returns all 11 PI indicators with statuses and band provenance', () => {
    const result = calculateRecipe(appendixInput());
    const byKey = Object.fromEntries(result.indicators.map((i) => [i.key, i]));
    expect(byKey['pod']!.status).toBe('ideal'); // 15.91 in 12–17
    expect(byKey['npac']!.status).toBe('ideal'); // 37.52 in 33–42 (per_water, CONFIG 0.5.0)
    expect(byKey['lactose']!.status).toBe('ideal');
    expect(byKey['water']!.status).toBe('ideal');
    expect(byKey['pod']!.band_status).toBe('seeded');
    expect(byKey['pod']!.category_fallback).toBe(false);
  });
});

/* ── safety (spec §6 rules) ──────────────────────────────────────────────── */

describe('safety', () => {
  it('handles an empty recipe without crashing — null metrics, no NaN/Infinity', () => {
    const result = calculateRecipe({
      items: [],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 0,
      machine_capacity_grams: null,
    });
    expect(result.total_batch_g).toBe(0);
    expect(result.pod_points).toBeNull();
    expect(result.pac_points).toBeNull();
    expect(result.npac_points).toBeNull();
    expect(result.ice_fraction_percent).toBeNull();
    expect(result.indicators).toHaveLength(11);
    for (const indicator of result.indicators) {
      expect(indicator.status).toBe('needs_correction');
    }
    expect(result.nutrition_per_100g).toBeNull();
    expect(result.costs).toBeNull();
    expect(result.scores).toBeNull();
    expectAllNumbersFinite(result);
  });

  it('produces no NaN/Infinity for a normal recipe either', () => {
    expectAllNumbersFinite(calculateRecipe(appendixInput()));
  });

  it('does not mutate the input', () => {
    const input = appendixInput({ machine_capacity_grams: 2000 });
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    calculateRecipe(input);
    expect(input).toEqual(snapshot);
  });

  it('is deterministic — same input gives the same output', () => {
    const input = appendixInput();
    expect(calculateRecipe(input)).toEqual(calculateRecipe(input));
  });
});

/* ── warnings (deterministic, code-based) ────────────────────────────────── */

describe('warnings', () => {
  const codes = (input: RecipeInput) => calculateRecipe(input).warnings.map((w) => w.code);

  it('emits machine_capacity_exceeded (critical) when the batch exceeds capacity', () => {
    const result = calculateRecipe(appendixInput({ machine_capacity_grams: 500 }));
    const warning = result.warnings.find((w) => w.code === 'machine_capacity_exceeded');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('critical');
  });

  it('emits alcohol_above_safe_range above the band warn threshold', () => {
    const input: RecipeInput = {
      items: [
        makeItem('jim-beam', { water_percent: 60, alcohol_percent: 40 }, 100),
        makeItem('water', { water_percent: 100 }, 900),
      ],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
    }; // 4 % alcohol > 2.5 warn_above
    expect(codes(input)).toContain('alcohol_above_safe_range');
  });

  it('emits batch_mass_mismatch beyond the 0.1 g display precision', () => {
    expect(codes(appendixInput({ target_batch_grams: 1100 }))).toContain('batch_mass_mismatch');
    expect(codes(appendixInput())).not.toContain('batch_mass_mismatch'); // exact 1000
  });

  it('emits low_confidence_ingredient below the masterplan §16 boundary of 80', () => {
    const input = appendixInput();
    input.items = [
      ...input.items,
      makeItem('scanned-label', { water_percent: 100 }, 0, null, 72),
    ];
    const warning = calculateRecipe(input).warnings.find(
      (w) => w.code === 'low_confidence_ingredient',
    );
    expect(warning).toBeDefined();
    expect(warning!.context!['confidence_score']).toBe(72);
    expect(codes(appendixInput())).not.toContain('low_confidence_ingredient'); // all ≥ 85
  });
});

/* ── scope guard (Step 4H: no scoring/corrections yet) ───────────────────── */

describe('scope guard', () => {
  it('the engine exports exactly the allowed functions — no scoring/correction functions', () => {
    const functionNames = Object.entries(engine)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functionNames.sort()).toEqual([...ALLOWED_ENGINE_FUNCTIONS].sort());
  });
});
