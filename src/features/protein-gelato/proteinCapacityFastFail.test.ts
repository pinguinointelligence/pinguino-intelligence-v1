/**
 * Protein capacity fast-fail (owner 2026-09-11).
 *
 * Served staging: a Protein draft of 1000–1006 g on the account's 670 g Ninja
 * CREAMi Deluxe carries the Engine's critical `machine_capacity_exceeded`.
 * Every `fitProteinFormulation` candidate keeps the total mass and the machine,
 * so none of them can be hard-safe. The ladder used to enumerate its whole grid
 * (about 610 k Engine evaluations per call, 18.3 M per Preview) before returning
 * the no-hard-safe-candidate verdict, and the 20 s watchdog stopped it first.
 * The pre-check returns that same verdict without the grid.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput, type RecipeItem } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { assessProteinFormulation, fitProteinFormulation } from './proteinAuthority';

// Counts Engine evaluations without retaining their arguments or results.
const engine = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine')>();
  return {
    ...actual,
    calculateRecipe: (...args: Parameters<typeof actual.calculateRecipe>) => {
      engine.calls += 1;
      return actual.calculateRecipe(...args);
    },
  };
});

// Mapper rows parsed exactly as proteinMultiMainSearch.test.ts does.
const MAPPER = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER);
const INDEX = new Map(HEADER.map((name, i) => [name, i]));
const NUMERIC = new Set(
  HEADER.filter((h) =>
    /_percent$|_value$|^brix$|^kcal_per_100g$|^cost_per_kg$|^shelf_life_days$|^data_confidence_percent$|_factor$|_activity$/.test(
      h,
    ),
  ),
);
const mapperRow = (id: string): IngredientRow => {
  const rec = RECORDS.find((r) => r[INDEX.get('ingredient_id')!] === id);
  if (!rec) throw new Error(`missing mapper row ${id}`);
  return Object.fromEntries(
    HEADER.map((field, i) => {
      const raw = rec[i]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (['approved_for_base', 'approved_for_engines', 'is_active'].includes(field)) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  extra: Partial<RecipeItem> = {},
): RecipeItem => ({
  id,
  ingredient: ingredientRowToEngineIngredient(mapperRow(ingredientId)),
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
  ...extra,
});

/** The served Protein −13 °C starter at 1000 g (staging aaece589 Worker payload). */
const starter = (): RecipeItem[] => [
  line('new-recipe-0-milk_3_5', 'PI-ING-000236', 440.2919161676647),
  line('new-recipe-1-cream_30', 'PI-ING-000180', 195.5194610778443),
  line('new-recipe-2-PI-ING-000264', 'PI-ING-000264', 99.99850299401197),
  line('new-recipe-3-water', 'PI-ING-001409', 82.08832335329342),
  line('new-recipe-4-sucrose', 'PI-ING-000514', 49.25299401197605),
  line('new-recipe-5-dextrose', 'PI-ING-000494', 129.8488023952096),
  line('new-recipe-6-tara_gum', 'PI-ING-000492', 3),
];
const seededBanana = () =>
  line('line-banana', 'PI-ING-000345', 1, {
    lock_type: 'main',
    main_ratio_weight: 1,
    amount_provenance: 'AUTO_CROWN_SEED',
  });
const manualBanana = () =>
  line('line-banana', 'PI-ING-000345', 1, {
    lock_type: 'main',
    main_ratio_weight: 1,
    user_intent_anchor_grams: 1,
    user_target_grams: 1,
  });
const strawberries = () =>
  line('line-strawberries', 'PI-ING-001553', 5, {
    user_intent_anchor_grams: 5,
    user_target_grams: 5,
  });

const NINJA_CREAMI_DELUXE_G = 670;

const recipe = (items: RecipeItem[], capacityGrams: number | null): RecipeInput => ({
  items,
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: capacityGrams,
  machine_capacity_source: capacityGrams === null ? null : 'machine',
  goals: {
    formulation_strategy: 'optimal',
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    direction_targets_active: true,
    excluded_ingredient_ids: [],
    unavailable_main_ingredient_ids: [],
  },
});

const capacityWarning = (input: RecipeInput) =>
  calculateRecipe(input).warnings.find((warning) => warning.code === 'machine_capacity_exceeded');

/** One fit and the Engine evaluations it spent. */
const measuredFit = (input: RecipeInput) => {
  engine.calls = 0;
  const fit = fitProteinFormulation(input);
  return { fit, engineCalls: engine.calls };
};

const withoutInput = <T extends { input: RecipeInput }>(fit: T) => ({ ...fit, input: null });

describe('Protein capacity fast-fail — fitProteinFormulation', () => {
  it.each([
    ['A · seeded 1 g Main + second fruit', () => [...starter(), seededBanana(), strawberries()]],
    ['B · manual 1 g Main + second fruit', () => [...starter(), manualBanana(), strawberries()]],
    ['C · seeded 1 g Main, no second fruit', () => [...starter(), seededBanana()]],
  ])('%s on a 670 g machine returns the no-candidate verdict without the grid', (_label, items) => {
    const input = recipe(items(), NINJA_CREAMI_DELUXE_G);
    expect(capacityWarning(input)).toMatchObject({ severity: 'critical' });

    const { fit, engineCalls } = measuredFit(input);

    expect(engineCalls).toBeLessThanOrEqual(2);
    expect(fit).toEqual({
      input,
      assessment: assessProteinFormulation(input),
      changed: false,
      reason: 'best_achievable',
      sourceLineId: null,
      balancingLineId: null,
      probedPercents: [],
    });
    expect(fit.input).toBe(input);
  });

  it('returns exactly what the exhaustive ladder returns for the same over-capacity recipe', () => {
    // Just inside the drift margin the pre-check stands aside, so the full
    // ladder runs on a recipe that is still over capacity. Both paths must
    // produce the same verdict.
    const items = [...starter(), seededBanana(), strawberries()];
    const total = calculateRecipe(recipe(items, null)).total_batch_g;
    const fastInput = recipe(items, NINJA_CREAMI_DELUXE_G);
    const exhaustiveInput = recipe(items, total - 5e-7);
    expect(capacityWarning(exhaustiveInput)).toMatchObject({ severity: 'critical' });

    const fast = measuredFit(fastInput);
    const exhaustive = measuredFit(exhaustiveInput);

    expect(exhaustive.engineCalls).toBeGreaterThan(100_000);
    expect(fast.engineCalls).toBeLessThanOrEqual(2);
    expect(withoutInput(fast.fit)).toEqual(withoutInput(exhaustive.fit));
    expect(exhaustive.fit.input).toBe(exhaustiveInput);
  }, 180_000);

  it.each([
    ['2000 g', 2000],
    ['no machine limit', null],
  ])('D · with capacity %s the ladder runs as before', (_label, capacityGrams) => {
    const input = recipe([...starter(), seededBanana(), strawberries()], capacityGrams);
    expect(capacityWarning(input)).toBeUndefined();

    const { fit, engineCalls } = measuredFit(input);

    expect(engineCalls).toBeGreaterThan(2);
    expect(withoutInput(fit)).toEqual(
      withoutInput(
        fitProteinFormulation(recipe([...starter(), seededBanana(), strawberries()], null)),
      ),
    );
  });

  it('E · a valid Protein formulation keeps its ladder verdict', () => {
    const roomy = recipe(starter(), 1200);
    const unlimited = recipe(starter(), null);
    expect(capacityWarning(roomy)).toBeUndefined();
    expect(assessProteinFormulation(unlimited).hardSafe).toBe(true);

    const { fit, engineCalls } = measuredFit(roomy);

    expect(engineCalls).toBeGreaterThan(2);
    expect(withoutInput(fit)).toEqual(withoutInput(fitProteinFormulation(unlimited)));
  });

  it('F · machine_capacity_exceeded stays critical and authoritative; nothing is resized', () => {
    const input = recipe([...starter(), seededBanana(), strawberries()], NINJA_CREAMI_DELUXE_G);
    const result = calculateRecipe(input);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'machine_capacity_exceeded', severity: 'critical' }),
    );
    expect(assessProteinFormulation(input, result).hardSafe).toBe(false);

    const fit = fitProteinFormulation(input);

    expect(fit.changed).toBe(false);
    expect(fit.assessment.hardSafe).toBe(false);
    expect(fit.input).toBe(input);
    expect(fit.input.machine_capacity_grams).toBe(NINJA_CREAMI_DELUXE_G);
    expect(calculateRecipe(fit.input).total_batch_g).toBe(result.total_batch_g);
  });
});
