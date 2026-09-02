/**
 * „Dopasowanie techniczne" adapter tests (ACCEPTANCE ADDENDUM 2, owner
 * decision 2026-07-24 — supersedes the §15.1 no-sub-dimensions headline rule:
 * TECHNICAL fit is THE public headline integer; flavor/cost are separate
 * labeled dimensions, never blended in, still no fake precision).
 *
 * Contract pinned here:
 *  - ALL native approved technological bands in range ⇒ EXACTLY 10/10;
 *  - violations degrade honestly from the engine's own `scores.technical`
 *    dimension, structurally capped at 9;
 *  - provisional/fallback profiles carry „Ocena częściowa / prowizoryczna"
 *    and can NEVER show a validated native 10/10;
 *  - flavor/cost sub-scores NEVER change the technical integer;
 *  - honest no-data path; integer-only presentation; adapter purity.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  COST_DIMENSION_NAME,
  FLAVOR_DIMENSION_NAME,
  TECHNICAL_FIT_DISPLAY_NAME,
  TECHNICAL_FIT_PROVISIONAL_LABEL,
  TECHNICAL_FIT_TOOLTIPS,
  commercialDimensions,
  recipeTechnicalFit,
} from './technicalFit';
import { MATCH_SCORE_NO_DATA_LABEL } from './recipeMatchScore';

/** A REAL native-band result with all bands in range: the G17-shaped −12 recipe. */
function nativeInRangeResult(): RecipeResult {
  const items = [
    ['milk_3_5', 600],
    ['cream_30', 135],
    ['smp', 43],
    ['sucrose', 86],
    ['dextrose', 80],
    ['inulin', 54.1],
    ['tara_gum', 1.9],
  ] as const;
  const input: RecipeInput = {
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    items: items.map(([id, grams], index) => ({
      id: `l-${index}`,
      ingredient: findDemoIngredient(id)!,
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    })),
  };
  return calculateRecipe(input);
}

describe('recipeTechnicalFit — the 10/10 rule (all native bands in range)', () => {
  it('a native profile with 0 violations shows EXACTLY 10/10, validated', () => {
    const result = nativeInRangeResult();
    // Precondition: the fixture really is all-in-range on native bands.
    expect(result.indicators.some((i) => i.category_fallback === true)).toBe(false);
    const fit = recipeTechnicalFit(result);
    expect(fit.violationCount).toBe(0);
    expect(fit.score).toBe(10);
    expect(fit.display).toBe('10/10');
    expect(fit.validatedNative).toBe(true);
    expect(fit.provisional).toBe(false);
  });

  it('the flavor/cost blend can NEVER drag the technical headline below 10 (the T17 defect)', () => {
    const base = nativeInRangeResult();
    // Sub-scores forced to the floor — the OLD overall-based headline would sink.
    const result: RecipeResult = {
      ...base,
      scores: { ...base.scores!, flavor: 0, cost: 0, overall: 40 },
    };
    const fit = recipeTechnicalFit(result);
    expect(fit.score).toBe(10); // technical truth unchanged
    expect(fit.validatedNative).toBe(true);
  });

  it('violations degrade honestly and structurally cap below 10', () => {
    const base = nativeInRangeResult();
    // A REAL out-of-band recipe: pure milk (native profile, many violations).
    const outOfBand = calculateRecipe({
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      items: [
        {
          id: 'l-milk',
          ingredient: findDemoIngredient('milk_3_5')!,
          planned_grams: 1000,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    });
    const fit = recipeTechnicalFit(outOfBand);
    expect(fit.violationCount).toBeGreaterThan(0);
    expect(fit.score).not.toBeNull();
    expect(fit.score!).toBeLessThanOrEqual(9);
    expect(fit.validatedNative).toBe(false);
    // The degrade tracks the ENGINE's own technical dimension (no re-derivation).
    const expected = Math.min(9, Math.max(1, Math.round(outOfBand.scores!.technical / 10)));
    expect(fit.score).toBe(expected);
    expect(base.scores!.technical).toBeGreaterThan(outOfBand.scores!.technical);
  });
});

describe('recipeTechnicalFit — provisional profiles (Ocena częściowa / prowizoryczna)', () => {
  it('a category-fallback profile is provisional and can never show validated native 10/10', () => {
    // fruit_gelato is scored on milk_gelato fallback bands (calibration pending).
    const provisional = calculateRecipe({
      mode: 'classic',
      category: 'fruit_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      items: [
        {
          id: 'l-milk',
          ingredient: findDemoIngredient('milk_3_5')!,
          planned_grams: 610,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'l-suc',
          ingredient: findDemoIngredient('sucrose')!,
          planned_grams: 390,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    });
    expect(provisional.indicators.some((i) => i.category_fallback === true)).toBe(true);
    const fit = recipeTechnicalFit(provisional);
    expect(fit.provisional).toBe(true);
    expect(fit.validatedNative).toBe(false);
    expect(fit.score === null || fit.score <= 9).toBe(true);
    expect(fit.ariaText).toContain(TECHNICAL_FIT_PROVISIONAL_LABEL);
  });
});

describe('recipeTechnicalFit — honest no-data + presentation hygiene', () => {
  it('null result / null scores → the honest no-data row', () => {
    for (const input of [null, undefined, { ...nativeInRangeResult(), scores: null }]) {
      const fit = recipeTechnicalFit(input as RecipeResult | null | undefined);
      expect(fit.score).toBeNull();
      expect(fit.label).toBe(MATCH_SCORE_NO_DATA_LABEL);
      expect(fit.display).toBe('—');
      expect(fit.tooltipKey).toBe('recipe-score.technical.tooltip.no-data');
    }
  });

  it('integer-only, never a percent, and the tooltip states the exact 10/10 meaning', () => {
    const fit = recipeTechnicalFit(nativeInRangeResult());
    expect(fit.display).toMatch(/^(10|[1-9])\/10$/);
    expect(fit.ariaText).not.toContain('%');
    expect(TECHNICAL_FIT_TOOLTIPS[fit.tooltipKey]).toContain('wszystkie potwierdzone zakresy są w normie');
    expect(TECHNICAL_FIT_TOOLTIPS[fit.tooltipKey]).toContain('są oceniane osobno');
    expect(TECHNICAL_FIT_TOOLTIPS[fit.tooltipKey]).toContain('Nie jest to gwarancja laboratoryjna');
    expect(TECHNICAL_FIT_DISPLAY_NAME).toBe('Dopasowanie techniczne');
  });

  it('never mutates the engine output', () => {
    const result = nativeInRangeResult();
    const snapshot = JSON.stringify(result);
    recipeTechnicalFit(result);
    expect(JSON.stringify(result)).toBe(snapshot);
  });
});

describe('commercialDimensions — flavor/cost as separate labeled dimensions', () => {
  it('flavor and cost present as their own 1–10 integers with their own names', () => {
    const dims = commercialDimensions({ technical: 90, flavor: 72, cost: 55, overall: 80 });
    expect(dims.flavor.name).toBe(FLAVOR_DIMENSION_NAME);
    expect(dims.flavor.score).toBe(7);
    expect(dims.flavor.display).toBe('7/10');
    expect(dims.cost.name).toBe(COST_DIMENSION_NAME);
    expect(dims.cost.score).toBe(6);
    expect(dims.cost.display).toBe('6/10');
  });

  it('unknown cost stays an honest null — never a fake score', () => {
    const dims = commercialDimensions({ technical: 90, flavor: 72, cost: null, overall: 80 });
    expect(dims.cost.score).toBeNull();
    expect(dims.cost.display).toBe('—');
  });

  it('null scores → both dimensions honest no-data', () => {
    const dims = commercialDimensions(null);
    expect(dims.flavor.score).toBeNull();
    expect(dims.cost.score).toBeNull();
  });
});
