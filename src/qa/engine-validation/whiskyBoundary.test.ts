import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type EngineIngredient, type RecipeInput } from '@/engine';
import { APPENDIX_A_ITEMS } from '@/engine/__fixtures__/golden/composition';
import { recipeTechnicalFit } from '@/features/recipe-score/technicalFit';

/**
 * Mandatory integration boundary proof using the approved Mapper 2088 row
 * PI-ING-000038 (WHISKY 40% · Spirit). This fixture records the row's exact
 * verified values; it does not introduce or tune any Engine formula/band.
 */
const MAPPER_WHISKY_40: EngineIngredient = {
  id: 'PI-ING-000038',
  canonical_ingredient_id: 'PI-ING-000038',
  identity_provenance: 'mapper',
  name: 'WHISKY 40% · Spirit',
  category: 'alcohol',
  composition: {
    water_percent: 68.4,
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
    alcohol_percent: 31.6,
    kcal_per_100g: 250,
  },
  pod_value: 0,
  pac_value: 233.84,
  de_value: null,
  cost_per_kg: 12,
  cost_currency: 'EUR',
  confidence_score: 98,
  source_type: 'verified_db',
  is_verified: true,
};

const withWhisky = (whiskyGrams: number): RecipeInput => ({
  items: [
    ...APPENDIX_A_ITEMS.map((item) =>
      item.ingredient.id === 'whole-milk-35'
        ? { ...item, planned_grams: item.planned_grams - whiskyGrams }
        : { ...item },
    ),
    {
      id: 'line-whisky-main',
      ingredient: MAPPER_WHISKY_40,
      planned_grams: whiskyGrams,
      actual_grams: null,
      lock_type: 'main' as const,
    },
  ],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
});

describe('Mapper 2088 whisky / alcohol freezing boundary', () => {
  it('records the progressive boundary and never reports a normal 10/10 beyond it', () => {
    const grams = [0, 20, 40, 60, 70, 79, 80, 100, 150] as const;
    const rows = grams.map((whiskyGrams) => {
      const result = calculateRecipe(withWhisky(whiskyGrams));
      const violations = detectViolations(result);
      return {
        whiskyGrams,
        alcoholPercent: result.percentages.alcohol_percent,
        pac: result.pac_points,
        npac: result.npac_points,
        ice: result.ice_fraction_percent,
        warning: result.warnings.some((warning) => warning.code === 'alcohol_above_safe_range'),
        violationReasons: violations.map((violation) => violation.reason),
        technicalFit: recipeTechnicalFit(result).score,
      };
    });

    // This assertion intentionally exposes the full deterministic evidence on
    // failure while the exact boundary values below remain the regression lock.
    expect(rows).toBeDefined();

    const firstUnsafe = rows.find((row) => row.violationReasons.length > 0);
    const firstAlcoholWarning = rows.find((row) => row.warning);

    expect(firstUnsafe?.whiskyGrams).toBe(20);
    expect(firstAlcoholWarning?.whiskyGrams).toBe(80);
    expect(rows.find((row) => row.whiskyGrams === 79)?.alcoholPercent).toBeCloseTo(2.4964, 9);
    expect(rows.find((row) => row.whiskyGrams === 80)?.alcoholPercent).toBeCloseTo(2.528, 9);

    for (const row of rows.filter((candidate) => candidate.violationReasons.length > 0)) {
      expect(row.technicalFit).not.toBe(10);
    }
    for (const row of rows.filter((candidate) => candidate.whiskyGrams >= 80)) {
      expect(row.warning).toBe(true);
      expect(row.violationReasons).toContain('alcohol_high');
    }
  });

  it('preserves the positive Main identity at every tested extreme', () => {
    for (const whiskyGrams of [20, 79, 80, 150]) {
      const input = withWhisky(whiskyGrams);
      const before = structuredClone(input);
      calculateRecipe(input);
      expect(input).toEqual(before);
      expect(input.items.find((item) => item.id === 'line-whisky-main')).toMatchObject({
        planned_grams: whiskyGrams,
        lock_type: 'main',
        ingredient: { canonical_ingredient_id: 'PI-ING-000038' },
      });
    }
  });
});
