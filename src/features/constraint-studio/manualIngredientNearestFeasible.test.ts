import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import {
  buildOptimizePreview,
  commitPreview,
  plannedSum,
  projectManualIngredientTarget,
} from './applyPipeline';

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC_FIELDS = new Set([
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

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC_FIELDS.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      ) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') {
        return [field, raw || null];
      }
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const ingredient = (ingredientId: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(ingredientId)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  banana: 'PI-ING-000345',
  strawberry: 'PI-ING-001553',
} as const;

const LINE = {
  milk: 'manual:milk',
  cream: 'manual:cream',
  smp: 'manual:smp',
  sucrose: 'manual:sucrose',
  dextrose: 'manual:dextrose',
  tara: 'manual:tara',
  flavour: 'manual:flavour',
} as const;

const BASE = [
  [LINE.milk, IDS.milk, 670],
  [LINE.cream, IDS.cream, 130],
  [LINE.smp, IDS.smp, 35],
  [LINE.sucrose, IDS.sucrose, 130],
  [LINE.dextrose, IDS.dextrose, 30],
  [LINE.tara, IDS.tara, 5],
] as const;

const fixture = ({
  flavourId = IDS.banana,
  requestedGrams,
  role = 'unlocked',
  milkLock = null,
  taraLock = null,
}: {
  flavourId?: string;
  requestedGrams: number;
  role?: RecipeInput['items'][number]['lock_type'];
  milkLock?: number | null;
  taraLock?: number | null;
}): { input: RecipeInput; set: ConstraintSet } => {
  const byLineId: Record<string, ConstraintSet['byLineId'][string]> = {};
  const baseItems = BASE.map(([lineId, ingredientId, defaultGrams]) => {
    const lockedGrams = lineId === LINE.milk ? milkLock : lineId === LINE.tara ? taraLock : null;
    if (lockedGrams !== null) {
      byLineId[lineId] = { mode: 'locked', grams: lockedGrams };
    }
    return {
      id: lineId,
      ingredient: ingredient(ingredientId),
      planned_grams: lockedGrams ?? defaultGrams,
      actual_grams: null,
      lock_type: lockedGrams === null ? ('unlocked' as const) : ('grams' as const),
      ...(lockedGrams === null ? {} : { grams_constraint: { grams: lockedGrams } }),
    };
  });
  return {
    input: {
      items: [
        ...baseItems,
        {
          id: LINE.flavour,
          ingredient: ingredient(flavourId),
          planned_grams: requestedGrams,
          actual_grams: null,
          lock_type: role,
          user_target_grams: requestedGrams,
          ...(role === 'unlocked'
            ? {
                ...(requestedGrams > 0 ? { user_intent_anchor_grams: requestedGrams } : {}),
              }
            : {}),
        },
      ],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
    },
    set: { byLineId },
  };
};

const previewOf = (input: RecipeInput, set: ConstraintSet) => {
  const result = buildOptimizePreview(input, set, '2026-08-19T21:45:00.000Z');
  expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(`Expected Preview, received ${result.code}`);
  return result.preview;
};

const flavourGrams = (input: RecipeInput): number =>
  input.items.find((item) => item.id === LINE.flavour)?.planned_grams ?? Number.NaN;

describe('manual Standard grams → nearest feasible whole-gram contract', () => {
  it('A: preserves an exactly feasible 50 g Banana target without promoting it to Main', () => {
    const { input, set } = fixture({ requestedGrams: 50 });
    const preview = previewOf(input, set);
    expect(flavourGrams(preview.proposedInput)).toBe(50);
    expect(preview.proposedInput.items.find((item) => item.id === LINE.flavour)).toMatchObject({
      lock_type: 'unlocked',
      user_target_grams: 50,
    });
    expect(plannedSum(preview.proposedInput)).toBe(1000);
    expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
  });

  it('preserves 500 g when the real unconstrained Mapper fixture proves it feasible', () => {
    const { input, set } = fixture({ requestedGrams: 500 });
    const preview = previewOf(input, set);
    expect(flavourGrams(preview.proposedInput)).toBe(500);
    expect(preview.proposedInput.items.find((item) => item.id === LINE.flavour)?.lock_type).toBe(
      'unlocked',
    );
    expect(plannedSum(preview.proposedInput)).toBe(1000);
    expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
  });

  it('B/F: projects 500 g under a conflicting hard lock to the proven highest feasible whole gram and applies that exact batch', () => {
    const { input, set } = fixture({ requestedGrams: 500, milkLock: 670 });
    const preview = previewOf(input, set);
    const selected = flavourGrams(preview.proposedInput);
    expect(selected).toBeGreaterThan(2);
    expect(selected).toBeLessThan(500);
    expect(Number.isInteger(selected)).toBe(true);
    const projection = projectManualIngredientTarget(input, set);
    expect(projection.proof).toMatchObject({
      requestedGrams: 500,
      selectedGrams: selected,
      firstCloserRejectedGrams: selected + 1,
      provenNearest: true,
    });
    expect(detectViolations(calculateRecipe(projection.input))).toEqual([]);
    expect(classifyViolationBands(projection.input).hardMetrics).toEqual([]);
    expect(preview.violationsAfter).toBe(0);
    expect(preview.diagnosticOnly).toBe(false);
    expect(plannedSum(preview.proposedInput)).toBe(1000);

    const applied = commitPreview(input, set, preview, '2026-08-19T21:46:00.000Z', 'manual-apply');
    expect(applied.ok, applied.ok ? '' : JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(flavourGrams(applied.verified.input)).toBe(selected);
    expect(plannedSum(applied.verified.input)).toBe(1000);
    expect(applied.verified.record.violationsAfter).toBe(0);

    const repeated = buildOptimizePreview(applied.verified.input, set, 'repeat');
    if (repeated.ok) {
      expect(flavourGrams(repeated.preview.proposedInput)).toBe(selected);
    } else {
      expect(repeated.code).toBe('already_clean');
    }
  });

  it('C: leaves the existing Main technical-maximum authority unchanged', () => {
    const { input, set } = fixture({ requestedGrams: 500, role: 'main' });
    const preview = previewOf(input, set);
    expect(preview.proposedInput.items.find((item) => item.id === LINE.flavour)?.lock_type).toBe(
      'main',
    );
    expect(preview.mainObjective).toMatchObject({ status: 'maximized', provenMaximum: true });
    expect(preview.mainObjective?.executableMainGrams).toBe(flavourGrams(preview.proposedInput));
  });

  it('D: returns one byte-stable result for repeated identical requests', () => {
    const { input, set } = fixture({ requestedGrams: 500, milkLock: 670 });
    const signatures = Array.from({ length: 5 }, () => {
      const preview = previewOf(structuredClone(input), structuredClone(set));
      return JSON.stringify({
        grams: flavourGrams(preview.proposedInput),
        vector: preview.proposedInput.items.map((item) => item.planned_grams),
        violationsAfter: preview.violationsAfter,
      });
    });
    expect(new Set(signatures).size).toBe(1);
  });

  it('E: applies the same user-target contract to Strawberry without an id-specific rule', () => {
    const { input, set } = fixture({ flavourId: IDS.strawberry, requestedGrams: 50 });
    const preview = previewOf(input, set);
    expect(flavourGrams(preview.proposedInput)).toBe(50);
    expect(plannedSum(preview.proposedInput)).toBe(1000);
    expect(preview.violationsAfter).toBe(0);
  });

  it('G: returns the existing honest infeasibility when hard locks exceed the batch', () => {
    const { input, set } = fixture({ requestedGrams: 500, milkLock: 990, taraLock: 20 });
    const result = buildOptimizePreview(input, set, 'impossible');
    expect(result).toMatchObject({ ok: false, code: 'rescale_locked_sum' });
  });
});
