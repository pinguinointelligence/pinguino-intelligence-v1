import { describe, expect, it } from 'vitest';
import { ALLOWED_ENGINE_FUNCTIONS } from './__fixtures__/allowedEngineFunctions';
import { resolveEffectiveItems } from './composition';
import { MODES } from './config/modes';
import { NEUTRAL_FLAVOR_SCORE, STABILITY_HEADROOM } from './config/scoring';
import * as engine from './index';
import { computeCostScore, computeFlavorScore, computeScores, computeTechnicalScore } from './scoring';
import type {
  EngineIngredient,
  Indicator,
  IndicatorStatus,
  LockType,
  RecipeCosts,
  RecipeItem,
  TargetMetric,
  TargetRange,
} from './types';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const ALL_METRICS: TargetMetric[] = [
  'pod',
  'npac',
  'ice_fraction',
  'lactose',
  'lactose_sandiness_risk',
  'fat',
  'aerating_protein',
  'protein_in_solids',
  'total_solids',
  'water',
  'alcohol',
];

const indicator = (
  key: TargetMetric,
  status: IndicatorStatus,
  value: number | null = null,
  band?: TargetRange,
): Indicator => ({ key, status, value, band: band ?? null });

const allWithStatus = (status: IndicatorStatus): Indicator[] =>
  ALL_METRICS.map((key) => indicator(key, status));

const ZERO_PROFILE = {
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

const makeItem = (id: string, planned_grams: number, lock_type: LockType): RecipeItem => {
  const ingredient: EngineIngredient = {
    id: `ing-${id}`,
    name: id,
    category: 'other',
    composition: ZERO_PROFILE,
    pod_value: null,
    pac_value: null,
    npac_value: null,
    de_value: null,
    cost_per_kg: 0,
    confidence_score: 85,
    source_type: 'manual',
    is_verified: false,
  };
  return { id, ingredient, planned_grams, actual_grams: null, lock_type };
};

const itemsWithMain = (mainGrams: number, totalGrams: number) =>
  resolveEffectiveItems([
    makeItem('main', mainGrams, 'main'),
    makeItem('rest', totalGrams - mainGrams, 'unlocked'),
  ]);

const completeCosts = (costPerKg: number): RecipeCosts => ({
  total_cost: costPerKg,
  cost_per_kg: costPerKg,
  cost_per_serving_60g: (costPerKg * 60) / 1000,
  cost_per_serving_70g: (costPerKg * 70) / 1000,
  cost_per_serving_80g: (costPerKg * 80) / 1000,
  complete: true,
  missing_cost_ingredient_ids: [],
});

/* ── technical score ─────────────────────────────────────────────────────── */

describe('computeTechnicalScore', () => {
  it('reacts to indicator statuses — ideal recipe scores higher than risky recipe', () => {
    const ideal = computeTechnicalScore(allWithStatus('ideal'));
    const risky = computeTechnicalScore(allWithStatus('risky'));
    expect(ideal).toBe(100);
    expect(risky).toBe(55);
    expect(ideal).toBeGreaterThan(risky);
  });

  it('greater distance beyond the band lowers the score further', () => {
    const band: TargetRange = { min: 33, max: 42 }; // half-width 4.5
    const near = computeTechnicalScore([indicator('npac', 'too_soft', 45, band)]);
    const far = computeTechnicalScore([indicator('npac', 'too_soft', 50, band)]);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it('weights freezing stability more heavily than minor metrics', () => {
    // one bad NPAC (weight 3) hurts more than one bad fat (weight 1)
    const badNpac = computeTechnicalScore([
      indicator('npac', 'too_soft'),
      indicator('fat', 'ideal'),
    ]);
    const badFat = computeTechnicalScore([
      indicator('npac', 'ideal'),
      indicator('fat', 'needs_correction'),
    ]);
    expect(badFat).toBeGreaterThan(badNpac);
  });
});

/* ── flavor score ────────────────────────────────────────────────────────── */

describe('computeFlavorScore', () => {
  it('returns the neutral score when no main ingredient is marked', () => {
    const items = resolveEffectiveItems([makeItem('a', 1000, 'unlocked')]);
    expect(computeFlavorScore(items, 1000, 'classic')).toBe(NEUTRAL_FLAVOR_SCORE);
  });

  it('rewards the main ingredient most strongly in SIGNATURE, then PREMIUM', () => {
    const items = itemsWithMain(100, 1000); // 10 % main
    const eco = computeFlavorScore(items, 1000, 'eco'); // 60 + 10×1.5 = 75
    const classic = computeFlavorScore(items, 1000, 'classic'); // 80
    const premium = computeFlavorScore(items, 1000, 'premium'); // 85
    const signature = computeFlavorScore(items, 1000, 'signature'); // 90
    expect(eco).toBeCloseTo(75, 9);
    expect(classic).toBeCloseTo(80, 9);
    expect(premium).toBeCloseTo(85, 9);
    expect(signature).toBeCloseTo(90, 9);
    expect(signature).toBeGreaterThan(premium);
    expect(premium).toBeGreaterThan(classic);
  });

  it('is monotonic — a higher main ingredient never lowers the flavor score', () => {
    for (const mode of ['eco', 'classic', 'premium', 'signature'] as const) {
      let previous = -1;
      for (const mainGrams of [0, 50, 100, 150, 200, 300]) {
        const score = computeFlavorScore(itemsWithMain(mainGrams, 1000), 1000, mode);
        if (mainGrams > 0) expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
    }
  });

  it('applies the flavor-intensity goal multiplier', () => {
    const items = itemsWithMain(100, 1000);
    const maximum = computeFlavorScore(items, 1000, 'classic', { flavor_intensity: 'maximum' });
    expect(maximum).toBeCloseTo(60 + 10 * 2.0 * 1.1, 9); // 82
  });
});

/* ── cost score ──────────────────────────────────────────────────────────── */

describe('computeCostScore', () => {
  it('interpolates between the configured anchors', () => {
    expect(computeCostScore(2)).toBe(100);
    expect(computeCostScore(4)).toBeCloseTo(80, 9);
    expect(computeCostScore(5)).toBeCloseTo(67.5, 9); // midway 80→55
    expect(computeCostScore(12)).toBeCloseTo(20, 9); // clamped past last anchor
  });

  it('applies the user cost priority', () => {
    expect(computeCostScore(4, { cost_priority: 'low' })).toBeCloseTo(76, 9); // 100−1.2×20
    expect(computeCostScore(4, { cost_priority: 'premium' })).toBeCloseTo(86, 9); // 100−0.7×20
  });

  it('unknown cost stays null — never a fake score', () => {
    expect(computeCostScore(null)).toBeNull();
  });
});

/* ── overall score + mode weights ────────────────────────────────────────── */

describe('computeScores — mode-weighted overall', () => {
  const base = (mode: 'eco' | 'classic' | 'premium' | 'signature', main: number, cost: number) =>
    computeScores({
      indicators: allWithStatus('good'), // technical 85
      items: itemsWithMain(main, 1000),
      total_batch_g: 1000,
      mode,
      costs: completeCosts(cost),
    })!;

  it('ECO weights cost more strongly — cheap, weak-flavor recipe favors ECO', () => {
    // no main ingredient (neutral 70 flavor), very cheap (cost 100)
    const eco = computeScores({
      indicators: allWithStatus('good'),
      items: resolveEffectiveItems([makeItem('a', 1000, 'unlocked')]),
      total_batch_g: 1000,
      mode: 'eco',
      costs: completeCosts(2),
    })!;
    const premium = computeScores({
      indicators: allWithStatus('good'),
      items: resolveEffectiveItems([makeItem('a', 1000, 'unlocked')]),
      total_batch_g: 1000,
      mode: 'premium',
      costs: completeCosts(2),
    })!;
    expect(eco.overall).toBeGreaterThan(premium.overall);
  });

  it('PREMIUM weights flavor more strongly — flavorful, expensive recipe favors PREMIUM', () => {
    const eco = base('eco', 120, 8); // 12 % main, expensive
    const premium = base('premium', 120, 8);
    expect(premium.overall).toBeGreaterThan(eco.overall);
  });

  it('SIGNATURE protects flavor/main ingredient most strongly', () => {
    const premium = base('premium', 120, 4);
    const signature = base('signature', 120, 4);
    expect(signature.flavor).toBeGreaterThan(premium.flavor);
    expect(MODES.signature.score_weights.flavor).toBeGreaterThan(
      MODES.premium.score_weights.flavor,
    );
  });

  it('the stability gate stops unstable recipes hiding behind flavor or cost', () => {
    const scores = computeScores({
      indicators: allWithStatus('needs_correction'), // technical 30
      items: itemsWithMain(200, 1000), // signature flavor would clamp at 100
      total_batch_g: 1000,
      mode: 'signature',
      costs: completeCosts(2), // cost 100
    })!;
    expect(scores.technical).toBe(30);
    expect(scores.overall).toBeLessThanOrEqual(scores.technical + STABILITY_HEADROOM);
    expect(scores.overall).toBe(60); // capped, not the weighted 75.5
  });

  it('unknown cost renormalizes weights over technical + flavor', () => {
    const scores = computeScores({
      indicators: allWithStatus('good'),
      items: itemsWithMain(100, 1000),
      total_batch_g: 1000,
      mode: 'classic',
      costs: null,
    })!;
    expect(scores.cost).toBeNull();
    const w = MODES.classic.score_weights;
    const expected = (w.technical * 85 + w.flavor * 80) / (w.technical + w.flavor);
    expect(scores.overall).toBeCloseTo(Math.min(expected, 85 + STABILITY_HEADROOM), 9);
  });

  it('is deterministic and null for zero-mass batches', () => {
    const input = {
      indicators: allWithStatus('good'),
      items: itemsWithMain(100, 1000),
      total_batch_g: 1000,
      mode: 'classic' as const,
      costs: completeCosts(3),
    };
    expect(computeScores(input)).toEqual(computeScores(input));
    expect(computeScores({ ...input, total_batch_g: 0 })).toBeNull();
  });
});

/* ── scope guard (Step 4I: no solver/auto-fix yet) ───────────────────────── */

describe('scope guard', () => {
  it('creates no correction solver or auto-fix functions', () => {
    const functionNames = Object.entries(engine)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functionNames.sort()).toEqual([...ALLOWED_ENGINE_FUNCTIONS].sort());
  });
});
