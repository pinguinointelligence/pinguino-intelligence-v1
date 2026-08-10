import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { APPENDIX_A_ITEMS } from '@/engine/__fixtures__/golden/composition';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import type { ConstraintSet } from '@/features/recipe-constraints';

const WHISKY: EngineIngredient = {
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

const LINE_ID = 'line-whisky-exact';
const inputAt = (grams: number): RecipeInput => ({
  items: [
    ...APPENDIX_A_ITEMS.map((item) => ({ ...item, ingredient: { ...item.ingredient } })),
    {
      id: LINE_ID,
      ingredient: WHISKY,
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'grams',
    },
  ],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
});

const setAt = (grams: number): ConstraintSet => ({
  byLineId: { [LINE_ID]: { mode: 'locked', grams } },
});

describe('real user workflow — exact Whisky request → rebalance → Preview/Apply', () => {
  it('searches the requested 20–100 g frontier and never calls a worse or unsafe result applicable', () => {
    const requested = [20, 21, 22, 25, 30, 35, 36, 37, 38, 39, 40, 60, 80, 100] as const;
    const rows = requested.map((grams) => {
      const input = inputAt(grams);
      const set = setAt(grams);
      const built = buildOptimizePreview(input, set, '2026-08-10T00:00:00.000Z');
      if (!built.ok) return { grams, applicable: false as const, code: built.code };
      const proposed = built.preview.proposedInput;
      const result = calculateRecipe(proposed);
      const whisky = proposed.items.find((item) => item.id === LINE_ID);
      const committed = commitPreview(
        input,
        set,
        built.preview,
        '2026-08-10T00:01:00.000Z',
        `whisky-${grams}`,
      );
      return {
        grams,
        applicable: committed.ok,
        code: committed.ok ? 'applied' : committed.code,
        finalWhisky: whisky?.planned_grams ?? null,
        pod: result.pod_points,
        npac: result.npac_points,
        ice: result.ice_fraction_percent,
        alcohol: result.percentages.alcohol_percent,
        violations: detectViolations(result).map((violation) => violation.reason),
      };
    });

    for (const row of rows) {
      if (row.applicable) {
        expect(row.finalWhisky).toBe(row.grams);
        expect(row.violations).toEqual([]);
      } else {
        expect(row.code).not.toBe('applied');
      }
    }
    const firstBlocked = rows.find((row) => !row.applicable);
    const laterApplicable = firstBlocked
      ? rows.some((row) => row.grams > firstBlocked.grams && row.applicable)
      : false;
    expect(laterApplicable).toBe(false);
    // Diagnostic evidence is intentionally emitted into the completion audit.
    console.info('WHISKY_REFORMULATION_FRONTIER', JSON.stringify(rows));
  }, 30_000);
});
