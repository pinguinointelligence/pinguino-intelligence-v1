import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import { assessProteinTarget, recipeFitForInput } from './proteinTarget';

const EMPTY = { byLineId: {} } as const;
const main = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'main' as const,
});
const selected = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});
const recipe = (
  temperature: -11 | -12 | -13,
  mains: RecipeInput['items'],
  options: { target?: number; vegan?: boolean; selected?: RecipeInput['items'] } = {},
): RecipeInput => ({
  items: [...mains, ...(options.selected ?? [])],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: temperature,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    target_protein_percent: options.target ?? 20,
    ...(options.vegan ? { dietary: ['vegan'] } : {}),
  },
});

const mapperGrid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperHeader = mapperGrid[0]!;
const mapperNumericColumns = new Set([
  'data_confidence_percent',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'saturated_fat_percent',
  'milk_fat_percent',
  'non_fat_milk_solids_percent',
  'protein_percent',
  'aerating_protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'ash_percent',
  'acidity_percent',
  'brix',
  'dry_matter_percent',
  'pod_value',
  'pac_value',
  'de_value',
  'sweetness_factor',
  'freezing_factor',
  'stabilizer_activity',
  'recommended_dosage_percent_min',
  'recommended_dosage_percent_max',
  'kcal_per_100g',
  'cost_per_kg',
  'shelf_life_days',
]);
const mapperIngredient = (id: string): EngineIngredient => {
  const cells = mapperGrid
    .slice(1)
    .find((row) => row[mapperHeader.indexOf('ingredient_id')] === id);
  if (!cells) throw new Error(`Missing Mapper fixture ${id}`);
  const record = Object.fromEntries(
    mapperHeader.map((column, index) => {
      const value = cells[index] ?? '';
      if (mapperNumericColumns.has(column)) return [column, value === '' ? null : Number(value)];
      if (
        column === 'approved_for_base' ||
        column === 'approved_for_engines' ||
        column === 'is_active'
      ) {
        return [column, value.toLowerCase() === 'true'];
      }
      return [column, value];
    }),
  ) as unknown as IngredientRow;
  return ingredientRowToEngineIngredient(record);
};

const COFFEE = mapperIngredient('PI-ING-000166');
const VANILLA = mapperIngredient('PI-ING-000246');
const RASPBERRY = findDemoIngredient('raspberry')!;
const BANANA = findDemoIngredient('banana')!;
const COCOA = findDemoIngredient('cocoa_2224')!;
const PISTACHIO = findDemoIngredient('pistachio_paste')!;

const fixtures: readonly {
  name: string;
  input: RecipeInput;
  expectedMain: readonly [string, number][];
  expectedSource?: string;
}[] = [
  { name: 'Neutral −11', input: recipe(-11, []), expectedMain: [] },
  { name: 'Neutral −12', input: recipe(-12, []), expectedMain: [] },
  { name: 'Neutral −13', input: recipe(-13, []), expectedMain: [] },
  {
    name: 'Strawberry −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)]),
    expectedMain: [['main-strawberry', 100]],
  },
  {
    name: 'Banana −13',
    input: recipe(-13, [main('main-banana', BANANA, 100)]),
    expectedMain: [['main-banana', 100]],
  },
  {
    name: 'Vanilla −13',
    input: recipe(-13, [main('main-vanilla', VANILLA, 5)]),
    expectedMain: [['main-vanilla', 5]],
  },
  {
    name: 'Coffee −13',
    input: recipe(-13, [main('main-coffee', COFFEE, 15)]),
    expectedMain: [['main-coffee', 15]],
  },
  {
    name: 'Chocolate −13',
    input: recipe(-13, [main('main-cocoa', COCOA, 60)]),
    expectedMain: [['main-cocoa', 60]],
  },
  {
    name: 'Pistachio −13',
    input: recipe(-13, [main('main-pistachio', PISTACHIO, 100)]),
    expectedMain: [['main-pistachio', 100]],
  },
  {
    name: 'Strawberry + Banana 1:1 −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 60), main('main-banana', BANANA, 60)]),
    expectedMain: [
      ['main-strawberry', 60],
      ['main-banana', 60],
    ],
  },
  {
    name: 'Plant Rice −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], { vegan: true }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-000452',
  },
  {
    name: 'Plant Pea −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      vegan: true,
      selected: [
        selected('user-pea', findVerifiedProteinFormulationCandidate('PI-ING-000451')!, 100),
      ],
    }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-000451',
  },
  {
    name: 'Selected Skyr −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      selected: [
        selected('user-skyr', findVerifiedProteinFormulationCandidate('PI-ING-001395')!, 180),
      ],
    }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-001395',
  },
  {
    name: 'Selected WPC60 −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      selected: [
        selected('user-wpc60', findVerifiedProteinFormulationCandidate('PI-ING-000294')!, 100),
      ],
    }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-000294',
  },
  {
    name: 'Selected MPC −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      selected: [
        selected('user-mpc', findVerifiedProteinFormulationCandidate('PI-ING-000237')!, 100),
      ],
    }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-000237',
  },
  {
    name: 'Selected WPC80 −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      selected: [
        selected('user-wpc80', findVerifiedProteinFormulationCandidate('PI-ING-000295')!, 100),
      ],
    }),
    expectedMain: [['main-strawberry', 100]],
    expectedSource: 'PI-ING-000295',
  },
  {
    name: 'Strawberry + Banana 2:1 −13',
    input: recipe(-13, [main('main-strawberry', RASPBERRY, 120), main('main-banana', BANANA, 60)]),
    expectedMain: [
      ['main-strawberry', 120],
      ['main-banana', 60],
    ],
  },
];

describe('Protein Gelato calibration report', () => {
  it.each(fixtures)(
    '$name keeps identity and reports an honest 20% outcome',
    (fixture) => {
      const built = buildOptimizePreview(fixture.input, EMPTY, '2026-08-09T10:00:00.000Z');
      expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
      if (!built.ok) return;
      const proposed = built.preview.proposedInput;
      const result = calculateRecipe(proposed);
      const target = assessProteinTarget(proposed, result);
      const violations = detectViolations(result);
      const exact10 = target.hardSafe && target.reached;
      if (target.hardSafe) expect(violations).toEqual([]);
      else expect(violations.length).toBeGreaterThan(0);
      const mainScales = fixture.expectedMain.map(([id, grams]) => {
        const proposedGrams = proposed.items.find((item) => item.id === id)?.planned_grams;
        expect(proposedGrams).toBeGreaterThanOrEqual(grams);
        return proposedGrams! / grams;
      });
      for (const scale of mainScales.slice(1)) expect(scale).toBeCloseTo(mainScales[0]!, 7);
      if (fixture.expectedMain.length > 0) {
        expect(built.preview.mainObjective).toMatchObject({
          startingMainGrams: fixture.expectedMain.reduce((sum, [, grams]) => sum + grams, 0),
          technicalScore: expect.any(Number),
        });
      } else {
        expect(built.preview.mainObjective).toBeUndefined();
      }
      if (fixture.expectedSource) {
        expect(
          proposed.items.some(
            (item) =>
              canonicalIngredientId(item.ingredient) === fixture.expectedSource &&
              item.planned_grams > 0,
          ),
        ).toBe(true);
      }
      if (!target.hardSafe) {
        const committed = commitPreview(
          fixture.input,
          EMPTY,
          built.preview,
          '2026-08-09T10:01:00.000Z',
          'protein-hard-infeasible-fixture',
        );
        expect(committed.ok).toBe(false);
      }
      console.info(
        JSON.stringify({
          fixture: fixture.name,
          status: exact10 ? 'EXACT_10' : target.hardSafe ? 'SAFE_TARGET_MISS' : 'HARD_INFEASIBLE',
          violations: violations.map((violation) => violation.metric),
          targetProtein: target.targetPercent,
          actualProtein: Number(target.actualPercent?.toFixed(4)),
          residual: Number(target.residualPp?.toFixed(4)),
          score: recipeFitForInput(proposed, result).score,
          pod: result.pod_points,
          pac: result.pac_points,
          npac: result.npac_points,
          ice: result.ice_fraction_percent,
          water: result.percentages.water_percent,
          solids: result.percentages.solids_percent,
          fat: result.percentages.fat_percent,
          lactose: result.percentages.lactose_percent,
          fiber: result.percentages.fiber_percent,
          grams: proposed.items.map((item) => [
            item.ingredient.name,
            Number(item.planned_grams.toFixed(3)),
          ]),
        }),
      );
    },
    60_000,
  );
});

const BROAD_TARGETS = [10, 15, 20, 22, 25, 30] as const;

describe('Protein Gelato bounded target sweep', () => {
  for (const temperature of [-11, -12, -13] as const) {
    it.each(BROAD_TARGETS)(
      `Strawberry ${temperature}°C reports target %s percent`,
      (targetPercent) => {
        const input = recipe(temperature, [main('main-strawberry', RASPBERRY, 100)], {
          target: targetPercent,
        });
        const built = buildOptimizePreview(input, EMPTY, '2026-08-09T10:00:00.000Z');
        expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
        if (!built.ok) return;

        const proposed = built.preview.proposedInput;
        const result = calculateRecipe(proposed);
        const target = assessProteinTarget(proposed, result);
        const score = recipeFitForInput(proposed, result).score;
        const violations = detectViolations(result);
        const exact10 = target.hardSafe && target.reached;
        if (target.hardSafe) expect(violations).toEqual([]);
        else expect(violations.length).toBeGreaterThan(0);
        expect(target.targetPercent).toBe(targetPercent);
        expect(typeof score).toBe('number');
        if (exact10) expect(score).toBe(10);
        else expect(score).toBeLessThan(10);
        expect(proposed.items.find((item) => item.id === 'main-strawberry')?.planned_grams)
          .toBeGreaterThanOrEqual(100);
        expect(proposed.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(
          1000,
          6,
        );
        if (!target.hardSafe) {
          const committed = commitPreview(
            input,
            EMPTY,
            built.preview,
            '2026-08-09T10:01:00.000Z',
            'protein-hard-infeasible',
          );
          expect(committed.ok).toBe(false);
        }

        console.info(
          JSON.stringify({
            fixture: `Strawberry ${temperature}°C`,
            status: exact10 ? 'EXACT_10' : target.hardSafe ? 'SAFE_TARGET_MISS' : 'HARD_INFEASIBLE',
            violations: violations.map((violation) => violation.metric),
            targetProtein: target.targetPercent,
            actualProtein: Number(target.actualPercent?.toFixed(4)),
            residual: Number(target.residualPp?.toFixed(4)),
            score,
            pod: result.pod_points,
            pac: result.pac_points,
            npac: result.npac_points,
            ice: result.ice_fraction_percent,
            water: result.percentages.water_percent,
            solids: result.percentages.solids_percent,
            fat: result.percentages.fat_percent,
            lactose: result.percentages.lactose_percent,
            fiber: result.percentages.fiber_percent,
            stabilizer: proposed.items
              .filter((item) => item.ingredient.category === 'stabilizer')
              .reduce((sum, item) => sum + item.planned_grams, 0),
            grams: proposed.items.map((item) => [
              item.ingredient.name,
              Number(item.planned_grams.toFixed(3)),
            ]),
          }),
        );
      },
      60_000,
    );
  }
});
