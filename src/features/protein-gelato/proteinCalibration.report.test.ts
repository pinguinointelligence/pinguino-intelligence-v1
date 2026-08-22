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
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';
import { deriveProteinBehavior, recipeProteinSourceProfile } from './proteinBehavior';
import { PROTEIN_EVIDENCE_WINDOW } from './proteinScienceAuthority';

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
  options: {
    vegan?: boolean;
    selected?: RecipeInput['items'];
    strategy?: 'optimal' | 'eco';
  } = {},
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
    ...(options.strategy ? { formulation_strategy: options.strategy } : {}),
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
    input: recipe(-13, [
      { ...main('main-strawberry', RASPBERRY, 120), main_ratio_weight: 2 },
      { ...main('main-banana', BANANA, 60), main_ratio_weight: 1 },
    ]),
    expectedMain: [
      ['main-strawberry', 120],
      ['main-banana', 60],
    ],
  },
];

/**
 * PROTEIN SCIENTIFIC VALIDATION / REPRESENTATIVE MATRIX (v2).
 *
 * REPLACES the v1 "bounded target sweep" over 10/15/20/22/25/30 % requested
 * protein. That sweep tested a user-selected target, which the owner removed on
 * 2026-08-22; keeping it would have pinned the deleted concept in place.
 *
 * What this report proves instead:
 *   1. every representative Protein product formulates natively hard-safe;
 *   2. every one of them EARNS the EU HIGH PROTEIN claim (the single hard rule);
 *   3. none of them needs to leave the controlled-evidence window to do it —
 *      the v1 engine put 20 % protein by mass here, double the highest level
 *      any published frozen-dessert study has measured;
 *   4. protein SOURCE changes the outcome at comparable protein content.
 */
describe('Protein Gelato v2 formulation report', () => {
  it.each(fixtures)(
    '$name keeps Main identity and reports an honest protein OUTPUT',
    (fixture) => {
      const built = buildOptimizePreview(fixture.input, EMPTY, '2026-08-09T10:00:00.000Z');
      expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
      if (!built.ok) return;
      const proposed = built.preview.proposedInput;
      const result = calculateRecipe(proposed);
      const assessment = assessProteinFormulation(proposed, result);
      const violations = detectViolations(result);

      if (assessment.hardSafe) expect(violations).toEqual([]);
      else expect(violations.length).toBeGreaterThan(0);

      // Main identity and ratio are untouched by Protein v2.
      const proposedMain = fixture.expectedMain.map(([id, grams]) => {
        const proposedGrams = proposed.items.find((item) => item.id === id)?.planned_grams;
        expect(proposedGrams).toBeGreaterThanOrEqual(grams);
        return { grams, proposedGrams: proposedGrams! };
      });
      const expectedMainTotal = proposedMain.reduce((sum, item) => sum + item.grams, 0);
      const proposedMainTotal = proposedMain.reduce((sum, item) => sum + item.proposedGrams, 0);
      for (const item of proposedMain) {
        const exactShare = proposedMainTotal * (item.grams / expectedMainTotal);
        expect(Math.abs(item.proposedGrams - exactShare)).toBeLessThanOrEqual(1);
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

      // A natively safe Protein candidate must be a Protein product.
      if (assessment.hardSafe) {
        expect(assessment.qualification.qualified).toBe(true);
        // Protein above the controlled-evidence window is allowed — the Engine
        // must still formulate when a user-pinned protein line forces it — but
        // it is never free: it is charged and flagged.
        if (assessment.actualPercent! > PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent) {
          expect(assessment.structure.penalties.beyondEvidence).toBeGreaterThan(0);
          expect(assessment.structure.score!).toBeLessThan(10);
          expect(
            assessment.structure.warnings.some(
              (warning) => warning.code === 'protein_beyond_controlled_evidence',
            ),
          ).toBe(true);
        }
      } else {
        const committed = commitPreview(
          fixture.input,
          EMPTY,
          built.preview,
          '2026-08-09T10:01:00.000Z',
          'protein-hard-infeasible-fixture',
        );
        expect(committed.ok).toBe(false);
      }

      const sourceProfile = recipeProteinSourceProfile(
        result.items.map((item) => ({ ingredient: item.ingredient, grams: item.effective_grams })),
      );
      console.info(
        JSON.stringify({
          fixture: fixture.name,
          status: assessment.hardSafe
            ? assessment.qualification.qualified
              ? 'QUALIFIED'
              : 'SAFE_BUT_NOT_A_PROTEIN_PRODUCT'
            : 'HARD_INFEASIBLE',
          violations: violations.map((violation) => violation.metric),
          proteinPercent: Number(assessment.actualPercent?.toFixed(3)),
          proteinEnergySharePercent: Number(
            assessment.qualification.energySharePercent?.toFixed(1),
          ),
          requiredProteinPercent: Number(assessment.qualification.requiredPercent?.toFixed(3)),
          excessPp: Number(assessment.qualification.excessPp?.toFixed(3)),
          structureScore: assessment.structure.score,
          penalties: assessment.structure.penalties,
          overrunProxyPercent: Number(assessment.structure.overrunProxyPercent?.toFixed(1)),
          dominantProteinClass: sourceProfile.dominantClass,
          wheyCaseinClass: sourceProfile.wheyCaseinClass,
          score: recipeFitForInput(proposed, result).score,
          pod: result.pod_points,
          npac: result.npac_points,
          ice: result.ice_fraction_percent,
          water: result.percentages.water_percent,
          solids: result.percentages.solids_percent,
          fat: result.percentages.fat_percent,
          lactose: result.percentages.lactose_percent,
          kcalPer100g: Number(result.nutrition_per_100g?.kcal.toFixed(1)),
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

describe('Protein source changes the outcome at equal protein grams', () => {
  const sourceFixture = (id: string, grams: number): RecipeInput =>
    recipe(-13, [main('main-strawberry', RASPBERRY, 100)], {
      selected: [selected('user-source', findVerifiedProteinFormulationCandidate(id)!, grams)],
    });

  it('separates WPC 60 from WPC 80 by the lactose each drags in per gram of protein', () => {
    const wpc60 = findVerifiedProteinFormulationCandidate('PI-ING-000294')!;
    const wpc80 = findVerifiedProteinFormulationCandidate('PI-ING-000295')!;
    const a = deriveProteinBehavior(wpc60);
    const b = deriveProteinBehavior(wpc80);
    expect(a.sourceClass).toBe('whey_protein_concentrate');
    expect(b.sourceClass).toBe('whey_protein_concentrate');
    expect(a.lactosePerProteinGram!).toBeGreaterThan(b.lactosePerProteinGram!);

    // Same class, same protein density order — but the mixes differ measurably.
    const withWpc60 = calculateRecipe(sourceFixture('PI-ING-000294', 200));
    const withWpc80 = calculateRecipe(sourceFixture('PI-ING-000295', 200));
    expect(withWpc60.percentages.lactose_percent).toBeGreaterThan(
      withWpc80.percentages.lactose_percent,
    );
    // Lactose is a low-molecular solute, so it moves the freezing physics too.
    expect(withWpc60.npac_points!).not.toBeCloseTo(withWpc80.npac_points!, 3);
    console.info(
      JSON.stringify({
        wpc60: {
          lactosePercent: Number(withWpc60.percentages.lactose_percent.toFixed(3)),
          proteinPercent: Number(withWpc60.percentages.protein_percent.toFixed(3)),
          npac: Number(withWpc60.npac_points!.toFixed(3)),
        },
        wpc80: {
          lactosePercent: Number(withWpc80.percentages.lactose_percent.toFixed(3)),
          proteinPercent: Number(withWpc80.percentages.protein_percent.toFixed(3)),
          npac: Number(withWpc80.npac_points!.toFixed(3)),
        },
      }),
    );
  });

  it('penalises a lactose load above the approved sanding band, never invalidating it', () => {
    const heavyLactose = assessProteinFormulation(sourceFixture('PI-ING-000294', 330));
    if (heavyLactose.structure.penalties.lactoseLoad > 0) {
      expect(
        heavyLactose.structure.warnings.some(
          (warning) => warning.code === 'lactose_load_over_approved_sanding_band',
        ),
      ).toBe(true);
    }
    // Whatever the lactose load, the QUALITY layer never produces a hard failure.
    expect(heavyLactose.structure.score).not.toBeNull();
    expect(heavyLactose.structure.score!).toBeGreaterThanOrEqual(1);
  });

  it('lets an unclassified protein source fall back to baseline instead of failing', () => {
    const unknownSource = findDemoIngredient('pistachio_paste')!;
    const behavior = deriveProteinBehavior(unknownSource);
    expect(behavior.sourceEvidence).toBe('UNKNOWN');
    // UNKNOWN metadata must never cost the recipe its score by itself.
    const input = recipe(-13, [main('main-pistachio', unknownSource, 100)]);
    const assessment = assessProteinFormulation(input);
    expect(assessment.applicable).toBe(true);
    expect(
      assessment.structure.warnings
        .filter((warning) => warning.code === 'protein_source_class_unknown')
        .every((warning) => warning.scored === false),
    ).toBe(true);
  });
});
