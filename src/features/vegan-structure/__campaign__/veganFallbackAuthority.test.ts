/// <reference types="node" />
/**
 * PHASE 5 — UNKNOWN / PARTIAL / FALLBACK authority.
 *
 * A vegan=TRUE Mapper row that also carries animal composition evidence is a
 * CONFLICT, and must fail closed rather than be promoted to VERIFIED. Ten such
 * lactose-bearing rows exist in the current base; the Stella vanilla paste
 * (lactose 5 %) is the one the corpus originally reached for, which is exactly
 * how it was found.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '@/lib/csv';
import { assessMapperVeganEligibility } from '@/data/ingredients/veganEligibility';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { veganBehaviorForIngredient, veganEnhancementLevel } from '../veganBehaviorRuntime';
import { VEGAN_CONFLICT_VANILLA_ARTICLE } from './veganInternetCorpus';
import type { RecipeInput } from '@/engine';

const TRI = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (v: string, c: string): string | number | boolean | null => {
  if (v === '') return null;
  if (TRI.has(c)) return v.toLowerCase();
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};
const grid = parseCsv(
  readFileSync(join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const rows = grid
  .slice(1)
  .filter((c) => c.some((x) => x.trim() !== ''))
  .map(
    (cells) =>
      Object.fromEntries(
        header.map((h, i) => [h, cell(cells[i] ?? '', h)]),
      ) as unknown as IngredientRow,
  );
const rowOf = (id: string) => rows.find((r) => r.ingredient_id === id)!;

describe('UNKNOWN / PARTIAL / FALLBACK authority', () => {
  it('a vegan=TRUE row carrying lactose is a CONFLICT, never VERIFIED', () => {
    const row = rowOf(VEGAN_CONFLICT_VANILLA_ARTICLE);
    expect(row.vegan).toBe('true');
    expect(Number(row.lactose_percent)).toBeGreaterThan(0);
    const assessment = assessMapperVeganEligibility(row);
    expect(assessment.status).toBe('VEGAN_CONFLICT');
    expect(assessment.reasons).toContain('verified_vegan_vs_animal_evidence');
  });

  it('every lactose-bearing vegan=TRUE row in the base fails closed', () => {
    const conflicted = rows.filter((r) => r.vegan === 'true' && Number(r.lactose_percent) > 0);
    expect(conflicted.length).toBeGreaterThan(0);
    for (const row of conflicted) {
      expect(assessMapperVeganEligibility(row).status, row.ingredient_id).not.toBe(
        'VEGAN_VERIFIED',
      );
    }
  });

  it('the pipeline refuses a Vegan recipe containing a CONFLICT article', () => {
    const conflict = ingredientRowToEngineIngredient(rowOf(VEGAN_CONFLICT_VANILLA_ARTICLE));
    const oat = ingredientRowToEngineIngredient(rowOf('PI-ING-001565'));
    const sucrose = ingredientRowToEngineIngredient(rowOf('PI-ING-000514'));
    const tara = ingredientRowToEngineIngredient(rowOf('PI-ING-000492'));
    const input: RecipeInput = {
      mode: 'classic',
      category: 'vegan_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      items: [
        {
          id: 'l-oat',
          ingredient: oat,
          planned_grams: 700,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'l-sucrose',
          ingredient: sucrose,
          planned_grams: 190,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'l-conflict',
          ingredient: conflict,
          planned_grams: 107,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'l-tara',
          ingredient: tara,
          planned_grams: 3,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
      goals: { formulation_strategy: 'optimal' },
    };
    expect(veganRecipeEligibilityIssues(input.items).length).toBeGreaterThan(0);
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-23T00:00:00.000Z');
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe('vegan_ingredient_conflict');
  });

  it('safe incomplete structural metadata degrades to FALLBACK, never to a block', () => {
    // A verified article whose fat/protein class cannot be derived must still be
    // fully usable — PARTIAL/BASELINE enhancement is not a defect.
    const water = ingredientRowToEngineIngredient(rowOf('PI-ING-001409'));
    const behavior = veganBehaviorForIngredient(water);
    expect(['BASELINE_FALLBACK', 'PARTIAL_ENHANCEMENT', 'FULL_ENHANCEMENT']).toContain(
      veganEnhancementLevel(behavior),
    );
    expect(
      veganRecipeEligibilityIssues([{ id: 'w', ingredient: water, planned_grams: 100 }]),
    ).toEqual([]);
  });
});
