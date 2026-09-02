import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from './ingredientMapper';
import type { IngredientRow } from './ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  CANONICAL_TOOLBOX_COMPOSITIONS,
  CANONICAL_TOOLBOX_MAPPER_SHA256,
  canonicalToolboxComposition,
} from './canonicalToolboxCompositions';
import { listToolboxCanonicalIdentities } from '@/features/formulation/toolboxCanonical';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';

/**
 * CROSS-RUNTIME IDENTITY DETERMINISM.
 *
 * The served app materializes the canonical Mapper row for a line's article id
 * (`executableRecipeHandoff.resolveLine`). The offline starter used to hand back
 * the engine REFERENCE payload instead, and every bound identity diverged — most
 * severely on `pod_value`/`pac_value`, which the reference set leaves null while
 * the Mapper carries real stored values. Since `engine/pac.ts` prefers a STORED
 * pac_value the two paths were not even performing the same freezing
 * arithmetic: the same starter measured Score 10 offline and Score 6 served.
 *
 * These tests pin that the generated authority is exactly the Mapper's own data
 * and that the starter path now resolves through it.
 */

const NUM = new Set(['data_confidence_percent','water_percent','total_solids_percent','fat_percent','saturated_fat_percent','milk_fat_percent','non_fat_milk_solids_percent','protein_percent','aerating_protein_percent','carbohydrate_percent','total_sugars_percent','sucrose_percent','dextrose_percent','glucose_percent','fructose_percent','lactose_percent','polyol_percent','fiber_percent','salt_percent','alcohol_percent','ash_percent','acidity_percent','brix','dry_matter_percent','pod_value','pac_value','de_value','sweetness_factor','freezing_factor','stabilizer_activity','recommended_dosage_percent_min','recommended_dosage_percent_max','kcal_per_100g','cost_per_kg','shelf_life_days']);

const raw = readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'));
const grid = parseCsv(raw.toString('utf8'));
const header = grid[0]!;
const rowById = new Map<string, IngredientRow>();
for (const cells of grid.slice(1)) {
  if (cells.length < 5) continue;
  const rec = Object.fromEntries(
    header.map((col, i) => {
      const v = cells[i] ?? '';
      if (NUM.has(col)) return [col, v === '' ? null : Number(v)];
      if (col === 'approved_for_base' || col === 'approved_for_engines' || col === 'is_active') {
        return [col, v.toLowerCase() === 'true'];
      }
      return [col, v];
    }),
  ) as unknown as IngredientRow;
  if (rec.ingredient_id) rowById.set(rec.ingredient_id, rec);
}

describe('the generated authority IS the Mapper', () => {
  it('was generated from the current Mapper base', () => {
    expect(CANONICAL_TOOLBOX_MAPPER_SHA256).toBe(
      createHash('sha256').update(raw).digest('hex'),
    );
  });

  it('matches the canonical row for every bound identity, field for field', () => {
    expect(CANONICAL_TOOLBOX_COMPOSITIONS.length).toBeGreaterThan(0);
    for (const entry of CANONICAL_TOOLBOX_COMPOSITIONS) {
      const row = rowById.get(entry.mapperId);
      expect(row, `missing Mapper row ${entry.mapperId}`).toBeDefined();
      const mapped = ingredientRowToEngineIngredient(row!);
      expect(entry.composition).toEqual(mapped.composition);
      expect(entry.pod_value).toBe(mapped.pod_value);
      expect(entry.pac_value).toBe(mapped.pac_value);
      expect(entry.de_value).toBe(mapped.de_value);
      expect(entry.cost_per_kg).toBe(mapped.cost_per_kg);
      expect(entry.displayName).toBe(mapped.name);
    }
  });

  it('covers every toolbox↔Mapper identity in the registry', () => {
    for (const identity of listToolboxCanonicalIdentities()) {
      expect(
        canonicalToolboxComposition(identity.toolboxId),
        `no canonical composition for ${identity.toolboxId}`,
      ).not.toBeNull();
    }
  });
});

describe('§6 — the starter resolves the SAME authority the runtime materializes', () => {
  const PROFILES = ['gelato', 'sorbet', 'vegan', 'protein'] as const;
  const SERVINGS = ['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const;

  it.each(PROFILES.flatMap((p) => SERVINGS.map((s) => [p, s] as const)))(
    '%s @ %s carries canonical composition, POD/PAC and price on every bound line',
    (profile, serving) => {
      const starter = buildCanonicalNewRecipeStarter({
        visibleProductType: profile,
        servingModeId: serving,
        formulationStrategy: 'optimal',
        targetBatchGrams: 1000,
      });
      for (const item of starter.items) {
        const canonicalId = item.ingredient.canonical_ingredient_id;
        if (!canonicalId) continue;
        const row = rowById.get(canonicalId);
        if (!row) continue; // verified vegan/protein toolboxes carry their own payload
        const mapped = ingredientRowToEngineIngredient(row);
        // The exact fields that decide the technical result.
        expect(item.ingredient.composition.water_percent).toBeCloseTo(mapped.composition.water_percent, 9);
        expect(item.ingredient.composition.solids_percent).toBeCloseTo(mapped.composition.solids_percent, 9);
        expect(item.ingredient.composition.fat_percent).toBeCloseTo(mapped.composition.fat_percent, 9);
        expect(item.ingredient.composition.protein_percent).toBeCloseTo(mapped.composition.protein_percent, 9);
        expect(item.ingredient.composition.lactose_percent).toBeCloseTo(mapped.composition.lactose_percent, 9);
        expect(item.ingredient.composition.kcal_per_100g).toBeCloseTo(mapped.composition.kcal_per_100g, 9);
        // The freezing arithmetic itself: a stored pac_value takes precedence in
        // engine/pac.ts, so a null here silently switches the whole model.
        expect(item.ingredient.pac_value).toBe(mapped.pac_value);
        expect(item.ingredient.pod_value).toBe(mapped.pod_value);
        expect(item.ingredient.cost_per_kg).toBe(mapped.cost_per_kg);
      }
    },
  );

  it('reproduces the metrics measured on served staging for Protein', () => {
    // Captured from https://staging.pinguinoai.com on 2026-08-23 against the
    // deployed starter. Before the authority fix the offline numbers were
    // different (Score 10 vs a served Score 6), which is the defect this pins.
    const SERVED = [
      { serving: 'temp_minus_11' as const, pod: 14.33, npac: 39.0, protein: 9.525 },
      { serving: 'temp_minus_12' as const, pod: 15.1, npac: 44.8, protein: 8.312 },
      { serving: 'temp_minus_13' as const, pod: 14.69, npac: 51.0, protein: 9.773 },
    ];
    for (const expectation of SERVED) {
      const starter = buildCanonicalNewRecipeStarter({
        visibleProductType: 'protein',
        servingModeId: expectation.serving,
        formulationStrategy: 'optimal',
        targetBatchGrams: 1000,
      });
      const input: RecipeInput = {
        items: starter.items,
        mode: 'classic',
        category: starter.category,
        target_temperature_c: starter.targetTemperatureC,
        target_batch_grams: 1000,
        machine_capacity_grams: null,
        goals: { flavor_intensity: 'balanced', cost_priority: 'balanced', formulation_strategy: 'optimal' },
      };
      const result = calculateRecipe(input);
      expect(result.pod_points!).toBeCloseTo(expectation.pod, 2);
      expect(result.npac_points!).toBeCloseTo(expectation.npac, 2);
      expect(result.percentages.protein_percent).toBeCloseTo(expectation.protein, 3);
    }
  });
});
