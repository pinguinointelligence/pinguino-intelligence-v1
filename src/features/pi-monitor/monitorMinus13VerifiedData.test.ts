/**
 * Track G / P0 — proof that VERIFIED mapper_basement dairy data resolves the −13
 * lactose-sandiness residual.
 *
 * The −13 approved base (G18) reproduces ice, NPAC and POD correctly through the
 * real engine, but under the DEMO reference ingredient catalog
 * (`src/data/demoIngredients.ts`, "literature values, NOT database truth") its
 * `lactose_sandiness_risk` reads ≈ 9.37 against the band max 9. The documented G18
 * value is 8.78 (in band). The demo catalog's SMP moisture (3.5 %) is
 * unrealistically dry; the VERIFIED mapper_basement record (PI-ING-000270) is
 * 10.32 % water, which lowers lactose-in-water concentration.
 *
 * This test rebuilds G18 with the EXACT verified compositions (queried read-only
 * from staging `tunabqqrwabacxjcxxkz`, `approved_for_engines`, confidence 98) and
 * proves that the engine + Monitor pass — no value is invented. It uses only the
 * public `@/engine` surface, changes NO production data, and stands as the pinned
 * evidence that the −13 residual is a demo-catalog data-source gap, resolved by the
 * live-Mapper ingredient wiring, NOT by any scientific change.
 *
 * Verified sources: MILK 3.5 % = PI-ING-000236 · CREAM 30 % = PI-ING-000180 ·
 * SKIMMED MILK POWDER = PI-ING-000270 · SUCROSE = PI-ING-000514 ·
 * DEXTROSE = PI-ING-000494 · INULIN = PI-ING-000456 · TARA GUM = PI-ING-000492.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe, detectViolations,
  type EngineIngredient, type IngredientComponentProfile, type RecipeInput, type RecipeItem, type RecipeGoals,
} from '@/engine';
import {
  recalculateWithPi, realPiRecalculationRunner, piBaseIntentFromRecipe, NEUTRAL_AXIS_INTENTS,
} from '@/features/pi-monitor';

const ZERO: IngredientComponentProfile = {
  water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0,
  sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0, fructose_percent: 0,
  lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
};
const verified = (id: string, c: Partial<IngredientComponentProfile>, cat: EngineIngredient['category']): EngineIngredient => ({
  id, name: id, category: cat, composition: { ...ZERO, ...c },
  pod_value: null, pac_value: null, npac_value: null, de_value: null,
  cost_per_kg: 1, confidence_score: 98, source_type: 'verified_db', is_verified: true,
});

/** VERIFIED mapper_basement compositions (staging, approved_for_engines). */
const V: Record<string, EngineIngredient> = {
  milk_3_5: verified('milk_3_5', { water_percent: 88.7, solids_percent: 11.3, fat_percent: 3.5, protein_percent: 3, carbohydrate_percent: 4.7, sugar_percent: 4.7, lactose_percent: 4.7, salt_percent: 0.1 }, 'dairy'),
  cream_30: verified('cream_30', { water_percent: 64.42, solids_percent: 35.58, fat_percent: 30, protein_percent: 2.3, carbohydrate_percent: 3.2, sugar_percent: 3.2, lactose_percent: 3.2, salt_percent: 0.08 }, 'dairy'),
  smp: verified('smp', { water_percent: 10.32, solids_percent: 89.68, fat_percent: 0.8, protein_percent: 35.7, carbohydrate_percent: 51, sugar_percent: 51, lactose_percent: 51, salt_percent: 1.2 }, 'dairy'),
  sucrose: verified('sucrose', { water_percent: 0, solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100 }, 'sugar'),
  dextrose: verified('dextrose', { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92 }, 'sugar'),
  inulin: verified('inulin', { water_percent: 3, solids_percent: 97, carbohydrate_percent: 97, sugar_percent: 8, fiber_percent: 89 }, 'stabilizer'),
  tara_gum: verified('tara_gum', { water_percent: 9.5, solids_percent: 90.5, fat_percent: 0.5, protein_percent: 2, carbohydrate_percent: 88, fiber_percent: 88 }, 'stabilizer'),
};

/** Approved G18 clean-reference formula (−13 °C), verbatim grams. */
const G18: ReadonlyArray<readonly [string, number]> = [
  ['milk_3_5', 600], ['cream_30', 125], ['smp', 45], ['sucrose', 72], ['dextrose', 112], ['inulin', 44.1], ['tara_gum', 1.9],
];
const GOALS: RecipeGoals = { sweetness: 'normal', cost_priority: 'balanced', flavor_intensity: 'balanced' };
const RESOLVED = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

const g18VerifiedRecipe = (): RecipeInput => ({
  items: G18.map(([id, g]): RecipeItem => ({ id: `g18:${id}`, ingredient: V[id]!, planned_grams: g, actual_grams: null, lock_type: 'unlocked' })),
  mode: 'classic', category: 'milk_gelato', target_temperature_c: -13, target_batch_grams: 1000, machine_capacity_grams: null, goals: GOALS,
});

describe('−13 with VERIFIED mapper dairy data resolves the lactose-sandiness residual', () => {
  it('G18 lactose_sandiness_risk lands at the documented ~8.78 (in band [5,9]) — not the demo 9.37', () => {
    const result = calculateRecipe(g18VerifiedRecipe());
    const sandiness = result.indicators.find((i) => i.key === 'lactose_sandiness_risk')?.value ?? null;
    expect(sandiness).not.toBeNull();
    expect(sandiness!).toBeCloseTo(8.78, 1);
    expect(sandiness!).toBeLessThanOrEqual(9);
  });

  it('G18 is fully in band on ice / NPAC / POD and has ZERO violations', () => {
    const result = calculateRecipe(g18VerifiedRecipe());
    expect(result.ice_fraction_percent!).toBeGreaterThanOrEqual(46);
    expect(result.ice_fraction_percent!).toBeLessThanOrEqual(52);
    expect(result.npac_points!).toBeGreaterThanOrEqual(48);
    expect(result.npac_points!).toBeLessThanOrEqual(55);
    expect(result.pod_points!).toBeGreaterThanOrEqual(12);
    expect(result.pod_points!).toBeLessThanOrEqual(20);
    expect(detectViolations(result).map((v) => v.reason)).toEqual([]);
  });

  it('the Monitor recalculates cleanly at −13 with the verified base (owner combination)', () => {
    const recipe = g18VerifiedRecipe();
    const view = recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(recipe),
      recipeDraft: recipe,
      axisIntents: { ...NEUTRAL_AXIS_INTENTS, miekkosc_twardosc: 'decrease', kremowosc_tluszcz: 'decrease' },
      resolution: RESOLVED, persona: 'pro', tuningApproved: true, runner: realPiRecalculationRunner,
    });
    expect(view.ran).toBe(true);
    expect(view.outcome).toBe('juz_w_zakresie');
    expect(view.failureReason).toBeNull();
  });
});
