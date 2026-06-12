import { describe, expect, it } from 'vitest';
import { APPENDIX_A_ITEMS } from './__fixtures__/golden/composition';
import { computeComposition, resolveEffectiveItems } from './composition';
import {
  NPAC_COEFFICIENTS,
  NPAC_NORMALIZATION,
  PAC_COEFFICIENTS,
  SYRUP_DE_ANCHORS,
} from './config/coefficients';
import * as engine from './index';
import {
  computeRecipeNpac,
  computeRecipePac,
  ingredientNpacContribution,
  ingredientPacContribution,
  interpolateSyrupDeAnchors,
} from './pac';
import type {
  EffectiveRecipeItem,
  EngineIngredient,
  IngredientComponentProfile,
  RecipeItem,
} from './types';

/* ── test helpers (same factory pattern as pod.test.ts) ──────────────────── */

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

interface StoredValues {
  pac_value?: number | null;
  npac_value?: number | null;
  de_value?: number | null;
}

const makeIngredient = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  stored: StoredValues = {},
): EngineIngredient => ({
  id,
  name: id,
  category: 'other',
  composition: { ...ZERO_PROFILE, ...composition },
  pod_value: null,
  pac_value: stored.pac_value ?? null,
  npac_value: stored.npac_value ?? null,
  de_value: stored.de_value ?? null,
  cost_per_kg: 0,
  confidence_score: 85,
  source_type: 'manual',
  is_verified: false,
});

const makeItem = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  planned_grams: number,
  stored: StoredValues = {},
): RecipeItem => ({
  id,
  ingredient: makeIngredient(`ing-${id}`, composition, stored),
  planned_grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const one = (item: RecipeItem): EffectiveRecipeItem => resolveEffectiveItems([item])[0]!;

/* ── sugar freezing spectrum (spec §8) ───────────────────────────────────── */

describe('sugar freezing spectrum (spec §8)', () => {
  const sucrose = one(makeItem('sucrose', { sugar_percent: 100, sucrose_percent: 100 }, 100));

  it('sucrose contributes freezing power at the 1.00 reference', () => {
    expect(ingredientPacContribution(sucrose)).toBeCloseTo(100, 9);
  });

  it('dextrose and glucose contribute stronger freezing power than sucrose', () => {
    const dextrose = one(makeItem('d', { sugar_percent: 100, dextrose_percent: 100 }, 100));
    const glucose = one(makeItem('g', { sugar_percent: 100, glucose_percent: 100 }, 100));
    expect(ingredientPacContribution(dextrose)).toBeCloseTo(190, 9);
    expect(ingredientPacContribution(glucose)).toBeCloseTo(190, 9);
    expect(ingredientPacContribution(dextrose)).toBeGreaterThan(ingredientPacContribution(sucrose));
  });

  it('fructose contributes stronger freezing power than sucrose', () => {
    const fructose = one(makeItem('f', { sugar_percent: 100, fructose_percent: 100 }, 100));
    expect(ingredientPacContribution(fructose)).toBeCloseTo(190, 9);
    expect(ingredientPacContribution(fructose)).toBeGreaterThan(ingredientPacContribution(sucrose));
  });

  it('lactose behaves according to the configured coefficient', () => {
    const lactose = one(makeItem('l', { sugar_percent: 100, lactose_percent: 100 }, 100));
    expect(ingredientPacContribution(lactose)).toBeCloseTo(100 * PAC_COEFFICIENTS.lactose, 9);
  });
});

/* ── alcohol logic (spec §5/§8) ──────────────────────────────────────────── */

describe('alcohol freezing logic', () => {
  it('alcohol contributes strong freezing depression — above any sugar gram-for-gram', () => {
    const alcohol10 = one(makeItem('a', { water_percent: 90, alcohol_percent: 10 }, 100));
    const dextrose10 = one(makeItem('d', { sugar_percent: 10, dextrose_percent: 10 }, 100));
    expect(ingredientNpacContribution(alcohol10)).toBeCloseTo(10 * NPAC_COEFFICIENTS.alcohol, 9);
    expect(ingredientNpacContribution(alcohol10)).toBeGreaterThan(
      ingredientNpacContribution(dextrose10),
    );
  });

  it('Jim Beam 40 %: 100 g contains 40 g alcohol, computed from alcohol_percent', () => {
    const jimBeam = one(
      makeItem('jim-beam', { water_percent: 60, solids_percent: 0, alcohol_percent: 40 }, 100),
    );
    expect(ingredientNpacContribution(jimBeam)).toBeCloseTo(40 * 7.4, 9); // 296
  });

  it('Brandy 36 %: 100 g contains 36 g alcohol', () => {
    const brandy = one(makeItem('brandy', { water_percent: 64, alcohol_percent: 36 }, 100));
    expect(ingredientNpacContribution(brandy)).toBeCloseTo(36 * 7.4, 9); // 266.4
  });

  it('alcohol is not part of PAC (sugar spectrum) — only NPAC', () => {
    const jimBeam = one(makeItem('jb', { water_percent: 60, alcohol_percent: 40 }, 100));
    expect(ingredientPacContribution(jimBeam)).toBe(0);
    expect(ingredientNpacContribution(jimBeam)).toBeGreaterThan(0);
  });
});

/* ── salt logic (spec §8 — calibration-sensitive) ────────────────────────── */

describe('salt freezing logic', () => {
  it('salt is included with the configured (calibration-sensitive) coefficient', () => {
    const salted = one(makeItem('salted', { solids_percent: 1, salt_percent: 1 }, 100));
    expect(ingredientNpacContribution(salted)).toBeCloseTo(1 * NPAC_COEFFICIENTS.salt, 9); // 11.7
  });

  it('salt is not part of PAC (sugar spectrum)', () => {
    const salted = one(makeItem('salted', { solids_percent: 1, salt_percent: 1 }, 100));
    expect(ingredientPacContribution(salted)).toBe(0);
  });
});

/* ── stored-value-first rule (spec §8) ───────────────────────────────────── */

describe('stored values win over fallback', () => {
  it('stored pac_value wins over the sugar-breakdown fallback', () => {
    const stored = one(
      makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100, { pac_value: 50 }),
    );
    const fallback = one(makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100));
    expect(ingredientPacContribution(stored)).toBeCloseTo(50, 9); // 100 g × 50 / 100
    expect(ingredientPacContribution(stored)).not.toBeCloseTo(
      ingredientPacContribution(fallback),
      6,
    );
  });

  it('stored npac_value wins and alcohol/salt are NOT added again on top', () => {
    const spirit = one(
      makeItem('spirit', { water_percent: 59, alcohol_percent: 40, salt_percent: 1 }, 100, {
        npac_value: 250,
      }),
    );
    // exactly the stored net value: 100 g × 250 / 100 — not 250 + 296 + 11.7
    expect(ingredientNpacContribution(spirit)).toBeCloseTo(250, 9);
  });

  it('pac_value and npac_value apply independently', () => {
    const mixed = one(
      makeItem('mixed', { sugar_percent: 100, sucrose_percent: 100 }, 100, { pac_value: 50 }),
    );
    expect(ingredientPacContribution(mixed)).toBeCloseTo(50, 9); // stored path
    expect(ingredientNpacContribution(mixed)).toBeCloseTo(100, 9); // fallback path (npac null)
  });
});

/* ── syrup DE handling (spec §8) ─────────────────────────────────────────── */

describe('syrup DE handling', () => {
  it('a 39 DE anchor exists in config (dry glucose syrup fixture anchor)', () => {
    expect(SYRUP_DE_ANCHORS.some((a) => a.de === 39)).toBe(true);
  });

  it('exact anchor hits return the anchor values', () => {
    expect(interpolateSyrupDeAnchors(39)).toEqual({ pod: 0.23, pac: 0.62 });
  });

  it('interpolation between anchors is linear and deterministic', () => {
    // between 39 (0.62) and 60 (0.85): DE 50 → 0.62 + 11/21 × 0.23
    const expected = 0.62 + ((50 - 39) / (60 - 39)) * (0.85 - 0.62);
    expect(interpolateSyrupDeAnchors(50).pac).toBeCloseTo(expected, 12);
    expect(interpolateSyrupDeAnchors(50)).toEqual(interpolateSyrupDeAnchors(50));
  });

  it('clamps below the first and above the last anchor', () => {
    expect(interpolateSyrupDeAnchors(5).pac).toBeCloseTo(0.45, 12);
    expect(interpolateSyrupDeAnchors(150).pac).toBeCloseTo(1.9, 12);
  });

  it('DE path applies the coefficient to solids grams and replaces the typed sugar part', () => {
    // dry syrup: 95 % solids, DE 39 — typed dextrose deliberately present to prove
    // it is NOT double-counted
    const syrup = one(
      makeItem(
        'dry-syrup-39de',
        { water_percent: 5, solids_percent: 95, sugar_percent: 20, dextrose_percent: 20 },
        100,
        { de_value: 39 },
      ),
    );
    expect(ingredientPacContribution(syrup)).toBeCloseTo(95 * 0.62, 9); // 58.9 — no +20×1.9
    expect(ingredientNpacContribution(syrup)).toBeCloseTo(95 * 0.62, 9); // no alcohol/salt present
  });

  it('stored pac_value wins even over the DE path', () => {
    const syrup = one(
      makeItem('syrup', { solids_percent: 95 }, 100, { de_value: 39, pac_value: 70 }),
    );
    expect(ingredientPacContribution(syrup)).toBeCloseTo(70, 9);
  });
});

/* ── recipe totals + normalization basis (spec §8) ───────────────────────── */

describe('recipe PAC/NPAC and normalization basis', () => {
  it('Appendix A arithmetic — PAC (sugars only) under per-total-mass', () => {
    const { items, total_batch_g } = computeComposition(APPENDIX_A_ITEMS);
    // (130×1.0 + 27.6×1.9 + 54.39×1.0) / 1000 × 100 = 23.683
    expect(computeRecipePac(items, total_batch_g)).toBeCloseTo(23.683, 6);
  });

  it('per_total_mass is the default normalization (config canonical)', () => {
    expect(NPAC_NORMALIZATION).toBe('per_total_mass');
    const { items, total_batch_g } = computeComposition(APPENDIX_A_ITEMS);
    // (130×1.0 + 27.6×1.9 + 54.39×1.0 + 1.15×11.7) / 1000 × 100 = 25.0285
    expect(computeRecipeNpac(items, total_batch_g)).toBeCloseTo(25.0285, 6);
  });

  it('per_water_mass exists only as an explicitly-requested candidate mode', () => {
    const { items, total_batch_g, totals } = computeComposition(APPENDIX_A_ITEMS);
    const canonical = computeRecipeNpac(items, total_batch_g);
    const candidate = computeRecipeNpac(items, total_batch_g, {
      normalization: 'per_water_mass',
      water_g: totals.water_g,
    });
    // arithmetic record only — no conclusion on which basis is correct (spec §8)
    expect(candidate).toBeCloseTo(canonical * (total_batch_g / totals.water_g), 9);
    expect(candidate).toBeGreaterThan(canonical);
    expect(candidate).toBeCloseTo(37.52, 2);
  });
});

/* ── safety (spec §8 G/H) ────────────────────────────────────────────────── */

describe('safety', () => {
  it('empty recipe returns 0', () => {
    expect(computeRecipePac([], 0)).toBe(0);
    expect(computeRecipeNpac([], 0)).toBe(0);
  });

  it('zero batch never produces NaN or Infinity', () => {
    const items = resolveEffectiveItems([
      makeItem('z', { sugar_percent: 100, sucrose_percent: 100 }, 0),
    ]);
    for (const value of [computeRecipePac(items, 0), computeRecipeNpac(items, 0)]) {
      expect(value).toBe(0);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('per_water_mass with missing or zero water grams is safe', () => {
    const items = resolveEffectiveItems([
      makeItem('s', { sugar_percent: 100, sucrose_percent: 100 }, 100),
    ]);
    expect(computeRecipeNpac(items, 100, { normalization: 'per_water_mass' })).toBe(0);
    expect(
      computeRecipeNpac(items, 100, { normalization: 'per_water_mass', water_g: 0 }),
    ).toBe(0);
  });

  it('does not mutate input objects', () => {
    const items = resolveEffectiveItems([
      makeItem('a', { sugar_percent: 100, sucrose_percent: 100 }, 130, { pac_value: 100 }),
      makeItem('b', { water_percent: 60, alcohol_percent: 40 }, 100),
    ]);
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    computeRecipePac(items, 230);
    computeRecipeNpac(items, 230);
    expect(items).toEqual(snapshot);
  });

  it('is deterministic — same input gives same output', () => {
    const { items, total_batch_g, totals } = computeComposition(APPENDIX_A_ITEMS);
    expect(computeRecipePac(items, total_batch_g)).toBe(computeRecipePac(items, total_batch_g));
    expect(computeRecipeNpac(items, total_batch_g)).toBe(computeRecipeNpac(items, total_batch_g));
    expect(
      computeRecipeNpac(items, total_batch_g, {
        normalization: 'per_water_mass',
        water_g: totals.water_g,
      }),
    ).toBe(
      computeRecipeNpac(items, total_batch_g, {
        normalization: 'per_water_mass',
        water_g: totals.water_g,
      }),
    );
  });
});

/* ── scope guard (Step 4E: composition + POD + PAC/NPAC only) ────────────── */

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
