import { describe, expect, it } from 'vitest';
import { GOLDEN_RECIPES } from './__fixtures__/goldenRecipes';
import {
  runCalibrationComparison,
  type CalibrationComparison,
} from './__fixtures__/externalCalibrationFixtures';
import { EXTERNAL_REFERENCE_FIXTURES } from './__fixtures__/externalReference';
import type { ActiveRecipeFixture } from './__fixtures__/schema';
import { calculateRecipe } from './calculateRecipe';
import { computeComposition } from './composition';
import { computeRecipeNpac } from './pac';
import { computeRecipePod } from './pod';
import { detectViolations, proposeCorrections } from './corrections/solver';
import { NEUTRAL_FLAVOR_SCORE } from './config/scoring';
import type { RecipeResult } from './types';

/* ── stable rounded serializer for regression snapshots ──────────────────── */

const r = (value: number | null, dp: number): number | null =>
  value === null ? null : Number(value.toFixed(dp));

const serialize = (result: RecipeResult) => ({
  engine_version: result.engine_version,
  config_version: result.config_version,
  total_batch_g: r(result.total_batch_g, 4),
  pod: r(result.pod_points, 4),
  pac: r(result.pac_points, 4),
  npac: r(result.npac_points, 4),
  ice_fraction: r(result.ice_fraction_percent, 4),
  percentages: Object.fromEntries(
    Object.entries(result.percentages).map(([key, value]) => [key, r(value, 4)]),
  ),
  indicators: result.indicators.map((indicator) => ({
    key: indicator.key,
    status: indicator.status,
    band_status: indicator.band_status ?? null,
    category_fallback: indicator.category_fallback ?? false,
    temperature_fallback: indicator.temperature_fallback ?? false,
  })),
  warnings: result.warnings.map((warning) => warning.code),
  scores: result.scores
    ? {
        technical: r(result.scores.technical, 2),
        flavor: r(result.scores.flavor, 2),
        cost: r(result.scores.cost, 2),
        overall: r(result.scores.overall, 2),
      }
    : null,
  nutrition: result.nutrition_per_100g
    ? Object.fromEntries(
        Object.entries(result.nutrition_per_100g).map(([key, value]) => [
          key,
          typeof value === 'number' ? r(value, 2) : value,
        ]),
      )
    : null,
  cost_complete: result.costs?.complete ?? null,
});

const expectAllNumbersFinite = (value: unknown, path = '$'): void => {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => expectAllNumbersFinite(entry, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      expectAllNumbersFinite(entry, `${path}.${key}`);
    }
  }
};

const deepCollectNumbers = (value: unknown, found: string[] = [], path = '$'): string[] => {
  if (typeof value === 'number') found.push(path);
  else if (Array.isArray(value)) value.forEach((v, i) => deepCollectNumbers(v, found, `${path}[${i}]`));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) deepCollectNumbers(v, found, `${path}.${key}`);
  }
  return found;
};

/* ── snapshot regression net (pinned to current CONFIG_VERSION) ──────────── */

describe('golden recipes — snapshot regression', () => {
  for (const recipe of GOLDEN_RECIPES) {
    it(`${recipe.id}: result snapshot is stable`, () => {
      expect(serialize(calculateRecipe(recipe.input))).toMatchSnapshot();
    });
  }
});

/* ── behavioral expectations (verified current-config outcomes) ──────────── */

describe('golden recipes — behavioral expectations', () => {
  for (const recipe of GOLDEN_RECIPES) {
    it(`${recipe.id}: ${recipe.description}`, () => {
      const result = calculateRecipe(recipe.input);

      if (recipe.expected.violation_reasons !== null) {
        expect(detectViolations(result).map((violation) => violation.reason)).toEqual(
          recipe.expected.violation_reasons,
        );
      }

      if (recipe.expected.statuses) {
        const byKey = Object.fromEntries(result.indicators.map((i) => [i.key, i.status]));
        for (const [metric, status] of Object.entries(recipe.expected.statuses)) {
          expect(byKey[metric], metric).toBe(status);
        }
      }

      expect(result.warnings.map((warning) => warning.code)).toEqual(
        recipe.expected.warning_codes,
      );

      for (const indicator of result.indicators) {
        expect(indicator.category_fallback ?? false, indicator.key).toBe(
          recipe.expected.category_fallback,
        );
      }

      if (recipe.expected.flavor_above_neutral) {
        expect(result.scores!.flavor).toBeGreaterThan(NEUTRAL_FLAVOR_SCORE);
      }

      expectAllNumbersFinite(result);
    });
  }

  it('banana sugar split flows through the typed math', () => {
    const banana = GOLDEN_RECIPES.find((recipe) => recipe.id === 'banana-classic')!;
    const result = calculateRecipe(banana.input);
    // 250 g banana: sucrose 2.4 % → 6 g, glucose 5 % → 12.5 g, fructose 4.8 % → 12 g
    expect(result.sugar.glucose_g).toBeCloseTo(12.5, 9);
    expect(result.sugar.fructose_g).toBeCloseTo(12, 9);
    expect(result.sugar.sucrose_g).toBeCloseTo(105 + 6, 9);
  });

  it('over-sugared rescue reflects the actual poured amounts', () => {
    const rescue = GOLDEN_RECIPES.find((recipe) => recipe.id === 'over-sugared-rescue')!;
    const result = calculateRecipe(rescue.input);
    expect(result.total_batch_g).toBe(1240); // actuals, not the 1120 plan
    const sucroseLine = result.items.find((line) => line.id === 'sucrose')!;
    expect(sucroseLine.is_actual).toBe(true);
    expect(sucroseLine.difference).toBeCloseTo(120, 9);
  });

  it('every golden recipe is deterministic', () => {
    for (const recipe of GOLDEN_RECIPES) {
      expect(calculateRecipe(recipe.input)).toEqual(calculateRecipe(recipe.input));
    }
  });
});

/* ── demo-redaction safety across every archetype ────────────────────────── */

describe('golden recipes — demo redaction safety', () => {
  const INGREDIENT_NAME_LEAKS = [
    'sucrose',
    'dextrose',
    'milk',
    'cream',
    'inulin',
    'smp',
    'skimmed',
    'tara',
    'pistachio',
    'raspberry',
    'banana',
    'cocoa',
    'beam',
  ];

  for (const recipe of GOLDEN_RECIPES) {
    it(`${recipe.id}: redacted corrections carry no numbers and no ingredient names`, () => {
      const result = calculateRecipe(recipe.input);
      if (detectViolations(result).length === 0) return; // nothing to correct

      const redacted = proposeCorrections({
        input: recipe.input,
        context: 'planning',
        redact: true,
      });
      if (!redacted.redacted) throw new Error('expected a redacted result');

      expect(deepCollectNumbers(redacted.proposals)).toEqual([]);
      const json = JSON.stringify(redacted.proposals).toLowerCase();
      for (const name of INGREDIENT_NAME_LEAKS) {
        expect(json, `leak: ${name}`).not.toContain(name);
      }
    });
  }
});

/* ── external calibration: all pending + runner plumbing proof ───────────── */

describe('external calibration protocol', () => {
  it('all 11 external reference fixtures remain pending — no values invented', () => {
    expect(EXTERNAL_REFERENCE_FIXTURES).toHaveLength(11);
    for (const fixture of EXTERNAL_REFERENCE_FIXTURES) {
      expect(fixture.status, fixture.name).toBe('pending');
    }
  });

  it('the calibration runner answers the §8 questions (SYNTHETIC plumbing proof — NOT external reference data)', () => {
    // synthetic fixture: expected values are taken from the engine itself, so
    // this proves the runner plumbing only — it calibrates nothing.
    const lines: ActiveRecipeFixture['input'] = [
      {
        ingredient_name: 'synthetic-milk',
        grams: 870,
        composition: {
          water_percent: 87.5,
          solids_percent: 12.5,
          fat_percent: 3.5,
          protein_percent: 3.3,
          carbohydrate_percent: 4.8,
          sugar_percent: 4.8,
          sucrose_percent: 0,
          glucose_percent: 0,
          dextrose_percent: 0,
          fructose_percent: 0,
          lactose_percent: 4.8,
          polyol_percent: 0,
          fiber_percent: 0,
          salt_percent: 0.1,
          alcohol_percent: 0,
          kcal_per_100g: 64,
        },
      },
      {
        ingredient_name: 'synthetic-sucrose',
        grams: 130,
        composition: {
          water_percent: 0,
          solids_percent: 100,
          fat_percent: 0,
          protein_percent: 0,
          carbohydrate_percent: 100,
          sugar_percent: 100,
          sucrose_percent: 100,
          glucose_percent: 0,
          dextrose_percent: 0,
          fructose_percent: 0,
          lactose_percent: 0,
          polyol_percent: 0,
          fiber_percent: 0,
          salt_percent: 0,
          alcohol_percent: 0,
          kcal_per_100g: 400,
        },
      },
    ];

    const items = lines.map((fixtureLine, index) => ({
      id: `s-${index}`,
      ingredient: {
        id: `s-${index}`,
        name: fixtureLine.ingredient_name,
        category: 'other' as const,
        composition: fixtureLine.composition,
        pod_value: null,
        pac_value: null,
        npac_value: null,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 100,
        source_type: 'verified_db' as const,
        is_verified: true,
      },
      planned_grams: fixtureLine.grams,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    }));
    const { items: effective, total_batch_g, totals } = computeComposition(items);
    const enginePod = computeRecipePod(effective, total_batch_g);
    // name both bases explicitly — the config default is now per_water_mass
    const engineNpacTotal = computeRecipeNpac(effective, total_batch_g, {
      normalization: 'per_total_mass',
    });
    const engineNpacWater = computeRecipeNpac(effective, total_batch_g, {
      normalization: 'per_water_mass',
      water_g: totals.water_g,
    });

    const fixtureFor = (expectedNpac: number): ActiveRecipeFixture => ({
      kind: 'recipe',
      name: 'SYNTHETIC-plumbing-proof',
      status: 'active',
      input: lines,
      expected: { pod: enginePod, npac: expectedNpac },
      tolerance: 0.5,
    });

    const totalAligned: CalibrationComparison = runCalibrationComparison(
      fixtureFor(engineNpacTotal),
    );
    expect(totalAligned.pod.within_tolerance).toBe(true);
    expect(totalAligned.npac_per_total_mass.within_tolerance).toBe(true);
    expect(totalAligned.closer_npac_basis).toBe('per_total_mass');

    const waterAligned = runCalibrationComparison(fixtureFor(engineNpacWater));
    expect(waterAligned.closer_npac_basis).toBe('per_water_mass');
    expect(waterAligned.npac_per_water_mass.within_tolerance).toBe(true);
  });
});
