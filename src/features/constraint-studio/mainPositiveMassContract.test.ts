/**
 * MAIN / CROWN POSITIVE-MASS CONTRACT (owner P0, 2026-08-29).
 *
 * ANY POSITIVE MAIN MASS IS ACTIVE MAIN. `lock_type: 'main'` with
 * `planned_grams > 0` must participate fully in recipe validity, scoring,
 * solver input, Main constraints, Crown preservation, Recalculate, Direction,
 * Preview and Apply. There is no 2 g threshold and no 1 g dead zone; only
 * exactly 0 g stays outside the contract (existing zero-mass authority).
 *
 * Regression under proof: on a technically clean, on-batch draft the Main
 * frontier's result was accepted only when its proof status was exactly
 * `maximized`. A user-held / uncalibrated Main (§4: no invented percentage
 * ceiling) can only ever produce `best_achievable`, so its verified Main
 * increase was discarded and Recalculate answered „już dobra" (score 10). The
 * same draft one gram off the batch target routed through batch reconciliation
 * and correctly proposed the full Main amount — the owner's observed
 * „Main 1 g inert / 2 g active" behaviour.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { captureMainIngredientIntent } from '@/features/formulation/mainIngredientContract';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildOptimizePreview } from './applyPipeline';

// The Main frontier runs the real Engine across many candidate formulations.
vi.setConfig({ testTimeout: 60_000 });

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
      if (field === 'approved_for_base' || field === 'approved_for_engines' || field === 'is_active')
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at') return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  // Strategy/cost ranking is not under test.
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
  inulin: 'PI-ING-000455',
  strawberry: 'PI-ING-001553',
  banana: 'PI-ING-000345',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
  mainRatioWeight?: number,
): RecipeInput['items'][number] =>
  ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lockType,
    ...(mainRatioWeight === undefined ? {} : { main_ratio_weight: mainRatioWeight }),
  }) as RecipeInput['items'][number];

/**
 * The owner's served case: a technically clean gelato that sums EXACTLY to the
 * 1000 g target while the Main carries a tiny mass. Only the Main gram value
 * changes across the matrix — every other line is byte-identical, so any
 * behavioural difference is attributable to the Main mass alone.
 */
const strawberryFixture = (mainGrams: number): RecipeInput =>
  ({
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: [
      line('milk', IDS.milk, 669),
      line('cream', IDS.cream, 130),
      line('smp', IDS.smp, 30),
      line('sucrose', IDS.sucrose, 130),
      line('dextrose', IDS.dextrose, 30),
      line('tara', IDS.tara, 5),
      line('inulin', IDS.inulin, 5),
      line('main', IDS.strawberry, mainGrams, 'main'),
    ],
  }) as RecipeInput;

/**
 * The served authority shape for a flavour carrier PINGÜINO recognises but has
 * no approved Main envelope for: `MAIN_CAPABLE_UNCALIBRATED` — the user holds
 * the Main, no percentage floor/ceiling is invented (§4/§26).
 */
const userHeldMainSnapshots = (
  input: RecipeInput,
  mainLineIds: readonly string[] = ['main'],
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  for (const lineId of mainLineIds) {
    if (!snapshots[lineId]) continue;
    snapshots[lineId] = {
      ...snapshots[lineId]!,
      mainClassification: 'MAIN_ALLOWED',
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
      behaviorRole: 'MAIN_ALLOWED',
      familyId: 'fruit-berry',
      mainPolicyId: null,
      mainPolicyVersion: null,
      ecoFloorPercent: null,
      optimalCeilingPercent: null,
      hardLimitPercent: null,
      mainEquivalentFactor: null,
      mainBasis: null,
    } as ProductBehaviorSnapshot;
  }
  return snapshots;
};

interface MainOutcome {
  ok: boolean;
  code: string | null;
  proofStatus: string | null;
  startingMainGrams: number | null;
  proposedMainGrams: number[];
  mainLineIds: string[];
  intentCount: number;
}

const runPreview = (
  input: RecipeInput,
  byLineId: Record<string, { mode: 'locked'; grams: number }> = {},
  mainLineIds: readonly string[] = ['main'],
): MainOutcome => {
  const result = buildOptimizePreview(input, { byLineId }, '2026-08-29T09:00:00.000Z', {
    productBehaviorSnapshots: userHeldMainSnapshots(input, mainLineIds),
    technicalOnlyMainLineIds: [],
  });
  const intentCount = captureMainIngredientIntent(input).length;
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      proofStatus: null,
      startingMainGrams: null,
      proposedMainGrams: [],
      mainLineIds: [],
      intentCount,
    };
  }
  const mains = result.preview.proposedInput.items.filter((item) => item.lock_type === 'main');
  return {
    ok: true,
    code: null,
    proofStatus: result.preview.mainObjective?.status ?? null,
    startingMainGrams: result.preview.mainObjective?.startingMainGrams ?? null,
    proposedMainGrams: mains.map((item) => item.planned_grams),
    mainLineIds: mains.map((item) => item.id),
    intentCount,
  };
};

describe('Main / Crown positive-mass contract — 0 / 1 / 2 g', () => {
  it('0 g Main stays outside the contract (existing zero-mass authority)', () => {
    const input = strawberryFixture(0);
    // A zero-mass Main is not captured as Main intent — unchanged behaviour.
    expect(captureMainIngredientIntent(input)).toHaveLength(0);
  });

  it.each([1, 2, 3, 40, 120])(
    '%i g Main is ACTIVE: captured as Main intent and moved by the frontier',
    (grams) => {
      const input = strawberryFixture(grams);
      const outcome = runPreview(input);

      expect(outcome.intentCount).toBe(1);
      expect(outcome.ok, `Main ${grams} g produced ${outcome.code}`).toBe(true);
      // The false „recipe already good" answer is exactly what this forbids.
      expect(outcome.code).toBeNull();
      expect(outcome.proofStatus).not.toBeNull();
      expect(outcome.startingMainGrams).toBe(grams);
      expect(outcome.mainLineIds).toEqual(['main']);
      // A meaningful Main correction, not a token one.
      expect(outcome.proposedMainGrams).toHaveLength(1);
      expect(outcome.proposedMainGrams[0]!).toBeGreaterThan(grams);
    },
  );

  it('changing ONLY 1 g → 2 g does not change whether the ingredient is Main', () => {
    const oneGram = runPreview(strawberryFixture(1));
    const twoGrams = runPreview(strawberryFixture(2));

    expect(oneGram.intentCount).toBe(twoGrams.intentCount);
    expect(oneGram.ok).toBe(twoGrams.ok);
    expect(oneGram.code).toBe(twoGrams.code);
    expect(oneGram.proofStatus).toBe(twoGrams.proofStatus);
    expect(oneGram.mainLineIds).toEqual(twoGrams.mainLineIds);
    // Only the numerical starting mass differs.
    expect(oneGram.startingMainGrams).toBe(1);
    expect(twoGrams.startingMainGrams).toBe(2);
    // The frontier itself does not depend on where the search started.
    expect(oneGram.proposedMainGrams).toEqual(twoGrams.proposedMainGrams);
  });

  it('the 1 g draft is on-batch and technically clean — it is not "already good"', () => {
    const input = strawberryFixture(1);
    const sum = input.items.reduce((total, item) => total + item.planned_grams, 0);
    expect(sum).toBe(input.target_batch_grams);
    // The Engine genuinely reports no violations here. That is precisely why
    // the old `maximized`-only gate answered „już dobra" and the Main was
    // never consulted: a clean recipe with a 1 g Main is still wrong.
    expect(detectViolations(calculateRecipe(input))).toEqual([]);
    expect(runPreview(input).ok).toBe(true);
  });
});

describe('Main / Crown positive-mass contract — Multi-Main', () => {
  const multiMainFixture = (aGrams: number, bGrams: number): RecipeInput =>
    ({
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: { formulation_strategy: 'optimal' },
      items: [
        line('milk', IDS.milk, 670 - bGrams),
        line('cream', IDS.cream, 130),
        line('smp', IDS.smp, 30),
        line('sucrose', IDS.sucrose, 130),
        line('dextrose', IDS.dextrose, 30),
        line('tara', IDS.tara, 5),
        line('inulin', IDS.inulin, 5),
        line('main-a', IDS.strawberry, aGrams, 'main', aGrams),
        line('main-b', IDS.banana, bGrams, 'main', bGrams),
      ],
    }) as RecipeInput;

  it.each([
    [1, 250],
    [2, 250],
    [1, 2],
    [2, 3],
  ])('keeps BOTH Mains when A = %i g and B = %i g', (aGrams, bGrams) => {
    const input = multiMainFixture(aGrams, bGrams);
    const intent = captureMainIngredientIntent(input);
    expect(intent.map((main) => main.lineId)).toEqual(['main-a', 'main-b']);

    const outcome = runPreview(input, {}, ['main-a', 'main-b']);
    if (outcome.ok) {
      // No Main may be silently excluded, zeroed or collapsed.
      expect(outcome.mainLineIds).toEqual(['main-a', 'main-b']);
      expect(outcome.proposedMainGrams.every((grams) => grams > 0)).toBe(true);
      expect(outcome.startingMainGrams).toBe(aGrams + bGrams);
    } else {
      // A refusal is acceptable only as an honest Multi-Main authority answer,
      // never as a silent „already good" that ignored the tiny Main.
      expect(outcome.code).not.toBe('already_clean');
    }
  });

  it('a 1 g Main is not silently excluded next to a 250 g Main', () => {
    const oneGram = runPreview(multiMainFixture(1, 250), {}, ['main-a', 'main-b']);
    const twoGrams = runPreview(multiMainFixture(2, 250), {}, ['main-a', 'main-b']);
    expect(oneGram.ok).toBe(twoGrams.ok);
    expect(oneGram.code).toBe(twoGrams.code);
    expect(oneGram.mainLineIds).toEqual(twoGrams.mainLineIds);
  });
});

describe('Main / Crown positive-mass contract — locks', () => {
  it('a grams-locked 1 g Main stays Main and its grams are never altered', () => {
    const input = strawberryFixture(1);
    const outcome = runPreview(input, { main: { mode: 'locked', grams: 1 } });

    expect(captureMainIngredientIntent(input)).toHaveLength(1);
    if (outcome.ok) {
      expect(outcome.mainLineIds).toEqual(['main']);
      // The lock is authority: the solver may not move it to "fix" the Main.
      expect(outcome.proposedMainGrams).toEqual([1]);
    } else {
      // An honest refusal is allowed; a silent „already good" is not, because
      // the Main is still 1 g and the answer must say why nothing moved.
      expect(['no_proposal', 'main_ratio_conflict', 'practicalization_blocked']).toContain(
        outcome.code,
      );
    }
  });

  it('a locked 1 g Main and a locked 2 g Main are answered the same way', () => {
    const oneGram = runPreview(strawberryFixture(1), { main: { mode: 'locked', grams: 1 } });
    const twoGrams = runPreview(strawberryFixture(2), { main: { mode: 'locked', grams: 2 } });
    expect(oneGram.ok).toBe(twoGrams.ok);
    expect(oneGram.code).toBe(twoGrams.code);
  });
});

describe('Main / Crown positive-mass contract — Direction', () => {
  const withDirection = (
    input: RecipeInput,
    sweetness: RecipeDirectionTarget,
    softness: RecipeDirectionTarget,
  ): RecipeInput => ({
    ...input,
    goals: {
      ...input.goals,
      direction_targets_active: true,
      direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
    },
  });

  const AXES: Array<[string, RecipeDirectionTarget, RecipeDirectionTarget]> = [
    ['sweetness', 2, 0],
    ['softness', 0, 2],
  ];
  it.each(AXES)('keeps a 1 g Main present through a %s change', (_axis, sweetness, softness) => {
    const input = withDirection(strawberryFixture(1), sweetness, softness);
    expect(captureMainIngredientIntent(input)).toHaveLength(1);

    const outcome = runPreview(input);
    if (outcome.ok) {
      expect(outcome.mainLineIds).toEqual(['main']);
      expect(outcome.proposedMainGrams.every((grams) => grams > 0)).toBe(true);
    } else {
      // Direction may honestly fail to reach a target; it may never make the
      // Main disappear by answering that the recipe is already good.
      expect(outcome.code).not.toBe('already_clean');
    }
  });

  it('Direction treats a 1 g Main and a 2 g Main identically', () => {
    const oneGram = runPreview(withDirection(strawberryFixture(1), 2, 0));
    const twoGrams = runPreview(withDirection(strawberryFixture(2), 2, 0));
    expect(oneGram.ok).toBe(twoGrams.ok);
    expect(oneGram.code).toBe(twoGrams.code);
    expect(oneGram.mainLineIds).toEqual(twoGrams.mainLineIds);
  });
});

describe('Main / Crown positive-mass contract — save / reopen', () => {
  it('a saved 1 g Main reopens as a 1 g Main and stays computationally active', () => {
    const priorRecipe = useRecipeStore.getState();
    try {
      const saved = strawberryFixture(1);
      useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'qa-main-1g', savedName: 'QA' });
      const reopened = buildRecipeInput(useRecipeStore.getState());

      const main = reopened.items.find((item) => item.id === 'main');
      expect(main).toBeDefined();
      // Still Main, still 1 g — no silent normalisation to 0 or 2 g.
      expect(main!.lock_type).toBe('main');
      expect(main!.planned_grams).toBe(1);
      expect(captureMainIngredientIntent(reopened)).toHaveLength(1);

      // …and still computationally active after the reopen.
      expect(runPreview(reopened).ok).toBe(true);
    } finally {
      useRecipeStore.setState(priorRecipe, true);
    }
  });
});
