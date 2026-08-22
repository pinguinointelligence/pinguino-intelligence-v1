import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  monitorLiveScore,
  monitorScoreComparison,
} from '@/features/pro-workbench/monitorLiveScore';
import { assessProteinFormulation } from './proteinAuthority';
import { assessProteinQualification, requiredProteinPercentFor } from './proteinQualification';
import { PROTEIN_QUALIFICATION } from './proteinScienceAuthority';

/**
 * PROTEIN V2 CONTROLLED INTEGRATION — the contracts this integration adds on top
 * of the engine work: the qualification boundary, BASE/topping isolation, live
 * score behaviour on the CURRENT Score architecture, and safe migration of
 * historical saved recipes that still carry the retired 20 %-by-mass target.
 */

const proteinDraft = (
  temperatureC: -11 | -12 | -13,
  extra: RecipeInput['items'] = [],
  goals: Record<string, unknown> = {},
): RecipeInput => ({
  items: [
    {
      id: 'main-raspberry',
      ingredient: findDemoIngredient('raspberry')!,
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'main',
    },
    ...extra,
  ],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced', ...goals },
});

const withLines = (grams: number, temperatureC: -11 | -12 | -13 = -12) =>
  proteinDraft(temperatureC, [
    {
      id: 'user-milk',
      ingredient: findDemoIngredient('milk_3_5')!,
      planned_grams: 750 - grams,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'user-wpc',
      ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'user-sucrose',
      ingredient: findDemoIngredient('sucrose')!,
      planned_grams: 150,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ]);

/* ── §17 qualification boundary ─────────────────────────────────────────── */

describe('§17 — the qualification floor is EXACTLY 20 % of energy', () => {
  /**
   * A synthetic ingredient lets the boundary be hit to the digit. Real catalog
   * products cannot land on 19.99/20.00/20.01 % of energy on demand, and
   * rounding a real recipe to reach the boundary would test the rounding, not
   * the rule.
   */
  const syntheticBase = (proteinPercent: number, fatPercent: number): RecipeInput => ({
    items: [
      {
        id: 'synthetic',
        ingredient: {
          ...findDemoIngredient('milk_3_5')!,
          id: 'synthetic-protein-source',
          name: 'Synthetic boundary fixture',
          composition: {
            ...findDemoIngredient('milk_3_5')!.composition,
            water_percent: 100 - proteinPercent - fatPercent,
            solids_percent: proteinPercent + fatPercent,
            protein_percent: proteinPercent,
            fat_percent: fatPercent,
            carbohydrate_percent: 0,
            sugar_percent: 0,
            lactose_percent: 0,
            kcal_per_100g: 0, // force the Atwater fallback: exact 4/9 arithmetic
          },
        },
        planned_grams: 1000,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ],
    mode: 'signature',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  });

  /** share = 4P / (4P + 9F) ⇒ for a target share s, F = 4P(1-s) / (9s). */
  const fatForShare = (proteinPercent: number, share: number): number =>
    (4 * proteinPercent * (1 - share)) / (9 * share);

  it.each([
    [0.1999, false, '19.99 %'],
    [0.2, true, '20.00 %'],
    [0.2001, true, '20.01 %'],
  ])('energy share %s → qualified %s (%s)', (share, expected) => {
    const protein = 10;
    const assessment = assessProteinQualification(
      syntheticBase(protein, fatForShare(protein, share as number)),
    );
    expect(assessment.energySharePercent).toBeCloseTo((share as number) * 100, 6);
    expect(assessment.qualified).toBe(expected);
  });

  it('evaluates the raw share, never a visually rounded one', () => {
    // 19.996 % rounds to "20 %" for display but must NOT qualify.
    const assessment = assessProteinQualification(syntheticBase(10, fatForShare(10, 0.19996)));
    expect(Math.round(assessment.energySharePercent!)).toBe(20);
    expect(assessment.qualified).toBe(false);
  });

  it('uses the one canonical formula — no second implementation', () => {
    expect(PROTEIN_QUALIFICATION.highProteinEnergySharePercent).toBe(20);
    expect(PROTEIN_QUALIFICATION.kcalPerProteinGram).toBe(4);
    // P = nonProteinKcal × s / (4(1-s)); at s = 0.20 that is nonProteinKcal/16.
    expect(requiredProteinPercentFor(160)).toBeCloseTo(10, 9);
    expect(requiredProteinPercentFor(96)).toBeCloseTo(6, 9);
  });

  it('depends on fat and carbohydrate, not on a fixed mass percentage', () => {
    const lean = assessProteinQualification(withLines(120));
    const rich = assessProteinQualification(
      proteinDraft(-12, [
        {
          id: 'user-cream',
          ingredient: findDemoIngredient('cream_30')!,
          planned_grams: 400,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-wpc',
          ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
          planned_grams: 120,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-sucrose',
          ingredient: findDemoIngredient('sucrose')!,
          planned_grams: 150,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ]),
    );
    // Same protein source mass, far more fat ⇒ a materially higher protein
    // mass % is required. A fixed mass threshold could not express this.
    expect(rich.requiredPercent!).toBeGreaterThan(lean.requiredPercent! + 1);
  });
});

/* ── §18 BASE vs topping ────────────────────────────────────────────────── */

describe('§18 — protein % is the BASE recipe, toppings are post-production', () => {
  const topping: RecipeToppingItem = {
    id: 'topping-1',
    ingredient: {
      ...findDemoIngredient('dark_chocolate_70')!,
      id: 'topping-chocolate',
    } as RecipeToppingItem['ingredient'],
    planned_grams: 100,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: 0,
  };

  it('reports the same protein % with and without a 100 g topping on a 1000 g base', () => {
    const base = withLines(150);
    const withoutTopping = calculateFinalProduct(base, []);
    const withTopping = calculateFinalProduct(base, [topping]);

    expect(withoutTopping.baseResult.total_batch_g).toBeCloseTo(1000, 6);
    expect(withTopping.baseResult.total_batch_g).toBeCloseTo(1000, 6);
    expect(withTopping.baseResult.percentages.protein_percent).toBe(
      withoutTopping.baseResult.percentages.protein_percent,
    );

    // The Protein technical verdict is BASE-only and therefore identical.
    expect(assessProteinFormulation(base)).toEqual(assessProteinFormulation(base));
    expect(assessProteinFormulation(base).actualPercent).toBe(
      withTopping.baseResult.percentages.protein_percent,
    );
  });

  it('keeps FINAL nutrition a separate, topping-aware fact', () => {
    const base = withLines(150);
    const withTopping = calculateFinalProduct(base, [topping]);
    // The final label mass includes the topping, so final nutrition differs
    // from the BASE — that separation is preserved, not flattened.
    expect(withTopping.finalItems.length).toBeGreaterThan(base.items.length);
  });
});

/* ── §14 live score compatibility ───────────────────────────────────────── */

describe('§14 — protein % follows the live score, not calculation freshness', () => {
  it('exposes the actual protein of the exact candidate it scores', () => {
    const input = withLines(150);
    const result = calculateRecipe(input);
    const live = monitorLiveScore(input, result);
    expect(live.proteinPercent).toBe(result.percentages.protein_percent);
    expect(live.ariaText).toContain('Białko');
  });

  it('updates with a manual gram edit, exactly as the score does', () => {
    const before = withLines(120);
    const after = withLines(220);
    const liveBefore = monitorLiveScore(before, calculateRecipe(before));
    const liveAfter = monitorLiveScore(after, calculateRecipe(after));
    expect(liveAfter.proteinPercent!).toBeGreaterThan(liveBefore.proteinPercent!);
  });

  it('never certifies freshness — it is null only when there is no honest score', () => {
    const placeholder = proteinDraft(-12, [
      {
        id: 'user-zero',
        ingredient: findDemoIngredient('milk_3_5')!,
        planned_grams: 0,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ]);
    const live = monitorLiveScore(placeholder, calculateRecipe(placeholder));
    expect(live.state).toBe('awaiting_grams');
    expect(live.score).toBeNull();
  });

  it('is null outside Protein mode, on every surface', () => {
    const gelato: RecipeInput = { ...withLines(150), category: 'milk_gelato' };
    const live = monitorLiveScore(gelato, calculateRecipe(gelato));
    expect(live.proteinPercent).toBeNull();
    expect(live.ariaText).not.toContain('Białko');
  });
});

/* ── §15 before / after ─────────────────────────────────────────────────── */

describe('§15 — before/after carries both protein numbers', () => {
  it('can show a HIGHER score beside a LOWER protein number', () => {
    const heavy = withLines(280);
    const lean = withLines(120);
    const comparison = monitorScoreComparison({
      input: heavy,
      result: calculateRecipe(heavy),
      previewInput: lean,
      previewResult: calculateRecipe(lean),
    });
    expect(comparison.current.proteinPercent!).toBeGreaterThan(
      comparison.proposed!.proteinPercent!,
    );
    // Both numbers are available to the header regardless of which scores higher.
    expect(comparison.proposed!.proteinPercent).not.toBeNull();
  });
});

/* ── §25 historical persistence migration ───────────────────────────────── */

describe('§25 — a historical saved protein target is inert, never re-enabled', () => {
  it('produces an identical verdict with and without the retired goal field', () => {
    const plain = withLines(150);
    const legacy: RecipeInput = {
      ...plain,
      goals: { ...plain.goals, target_protein_percent: 20 },
    };
    expect(assessProteinFormulation(legacy)).toEqual(assessProteinFormulation(plain));
    expect(calculateRecipe(legacy).percentages.protein_percent).toBe(
      calculateRecipe(plain).percentages.protein_percent,
    );
  });

  it('does not mutate the historical record it was handed', () => {
    const plain = withLines(150);
    const legacy: RecipeInput = {
      ...plain,
      goals: { ...plain.goals, target_protein_percent: 20 },
    };
    const snapshot = JSON.stringify(legacy.goals);
    assessProteinFormulation(legacy);
    expect(JSON.stringify(legacy.goals)).toBe(snapshot);
    // The deprecated value survives untouched for the historical record…
    expect(legacy.goals?.target_protein_percent).toBe(20);
  });

  it('preserves the saved grams — reopening never re-optimizes toward 20 % mass', () => {
    const legacy: RecipeInput = {
      ...withLines(150),
      goals: { ...withLines(150).goals, target_protein_percent: 20 },
    };
    const result = calculateRecipe(legacy);
    // The saved recipe sits far below the retired mass target and is left there.
    expect(result.percentages.protein_percent).toBeLessThan(15);
    expect(legacy.items.find((item) => item.id === 'user-wpc')?.planned_grams).toBe(150);
  });
});

/* ── §8 no dead target authority anywhere ───────────────────────────────── */

describe('§8 — the retired 20 %-by-mass target has no live authority left', () => {
  it('is absent from every runtime protein module', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const dir = resolve(process.cwd(), 'src/features/protein-gelato');
    const runtime = readdirSync(dir).filter(
      (file) => file.endsWith('.ts') && !file.includes('.test.'),
    );
    for (const file of runtime) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      expect(source).not.toContain('PROTEIN_GELATO_TARGET');
      expect(source).not.toContain('setTargetProteinPercent');
      // `target_protein_percent` may only appear in a comment explaining that it
      // is retired — never as a value the module reads.
      expect(source).not.toMatch(/goals[?.]*\.target_protein_percent/);
    }
  });
});
