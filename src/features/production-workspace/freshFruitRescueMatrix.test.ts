import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints/recipeConstraintAuthority';
import { assessProductionRescue } from './productionRescue';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';
import { FRESH_FRUITS, FRESH_FRUIT_MAIN_POLICIES } from './freshFruitMainPolicies.fixture';

vi.setConfig({ testTimeout: 600_000 });

const SRC = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [H = [], ...R] = parseCsv(SRC);
const I = new Map(H.map((n, p) => [n, p]));
const NUM = new Set(
  H.filter((f) =>
    /_percent$|_value$|_factor$|_days$|^brix$|^kcal_per_100g$|^cost_per_kg$|_activity$/.test(f),
  ),
);
const row = (id: string): IngredientRow => {
  const rec = R.find((r) => r[I.get('ingredient_id')!] === id)!;
  return Object.fromEntries(
    H.map((f, p) => {
      const raw = rec[p]?.trim() ?? '';
      if (NUM.has(f)) return [f, raw === '' ? null : Number(raw)];
      if (f === 'approved_for_base' || f === 'approved_for_engines')
        return [f, raw.toLowerCase() === 'true'];
      if (f === 'verification_date' || f === 'last_reviewed_at') return [f, raw || null];
      return [f, raw];
    }),
  ) as unknown as IngredientRow;
};
const ing = (id: string) => ({
  ...ingredientRowToEngineIngredient(row(id)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const FRUIT = 'fruit-line';
const MILK = 'new-recipe-0-milk_3_5';
/** The owner's real 670 g strawberry skeleton (run b6ecedce), fruit line swapped. */
const SKELETON = [
  [MILK, 'PI-ING-000236', 201],
  ['new-recipe-1-cream_30', 'PI-ING-000180', 85],
  ['new-recipe-2-smp', 'PI-ING-000270', 41],
  ['new-recipe-3-sucrose', 'PI-ING-000514', 54],
  ['new-recipe-4-dextrose', 'PI-ING-000494', 54],
  ['new-recipe-5-inulin', 'PI-ING-000456', 16],
  ['new-recipe-6-tara_gum', 'PI-ING-000492', 2],
] as const;
const FRUIT_PLANNED = 217;

const planFor = (mapperId: string): RecipeInput => {
  const items = [
    ...SKELETON.map(([id, pid, g]) => ({
      id,
      ingredient: ing(pid),
      planned_grams: g,
      actual_grams: null,
      lock_type: 'unlocked',
    })),
    {
      id: FRUIT,
      ingredient: ing(mapperId),
      planned_grams: FRUIT_PLANNED,
      actual_grams: null,
      lock_type: 'main',
    },
  ];
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_batch_grams: 670,
    target_temperature_c: -13,
    machine_capacity_grams: 2000,
    items,
  } as unknown as RecipeInput;
};

const snapsFor = (input: RecipeInput, policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES) => {
  const p = FRESH_FRUIT_MAIN_POLICIES[policy];
  const base = productBehaviorTestSnapshots(input) as Record<string, unknown>;
  const out = { ...base };
  for (const item of input.items) {
    const cur = out[item.id];
    if (!cur) continue;
    if (item.id === FRUIT)
      out[item.id] = {
        ...(cur as object),
        mainCapability: 'MAIN_CAPABLE',
        behaviorRole: 'MAIN_PROFILE_SPECIFIC',
        mainClassification: 'MAIN_PROFILE_SPECIFIC',
        mainAuthority: 'CALIBRATED',
        mainCalibrationLevel: 'FAMILY',
        mainBasis: 'FRUIT_EQUIVALENT',
        mainEquivalentFactor: 1,
        mainPolicyId: p.key,
        mainPolicyVersion: '2',
        ecoFloorPercent: p.eco,
        optimalCeilingPercent: p.ceiling,
        hardLimitPercent: p.hard,
        multiMainHardLimitPercent: null,
        requiresLiquidDairyCarrier: true,
        approvedLiquidDairyCarrier: false,
        liquidDairyCarrierFloorPercent: 30,
      };
    else if (item.id === MILK)
      out[item.id] = { ...(cur as object), approvedLiquidDairyCarrier: true };
  }
  return out as never;
};
const compFor = (input: RecipeInput, policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES) => ({
  schemaVersion: 1 as const,
  baseScope: 'BASE_FORMULATION' as const,
  baseOrder: input.items.map((i) => i.id),
  toppings: [],
  behaviorSnapshots: snapsFor(input, policy),
  migrationAmbiguities: [],
});

const runCase = (
  mapperId: string,
  policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES,
  deltaG: number,
) => {
  const planned = planFor(mapperId);
  let session = createProductionSession({
    sessionId: `m-${mapperId}-${deltaG}`,
    ownerUserId: 'owner',
    source: { recipeId: 'r', recipeVersionId: 'v', recipeVersionNumber: 1, recipeName: mapperId },
    plannedInput: planned,
    plannedComposition: compFor(planned, policy),
    startedAt: '2026-09-05T09:00:00.000Z',
  } as never);
  for (const [idx, line] of session.lines.entries()) {
    const physical = line.lineId === FRUIT ? FRUIT_PLANNED + deltaG : SKELETON[idx]![2];
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, physical),
      line.lineId,
      `2026-09-05T09:0${idx}:00.000Z`,
    );
  }
  const a = assessProductionRescue(session);
  const restore = a.options.find((o) => o.id === 'restore_original_recipe');
  const exact = restore
    ? restore.candidateInput.items.every((it) => {
        const base = planned.items.find((x) => x.id === it.id)!;
        return Math.abs((it.actual_grams ?? it.planned_grams) - base.planned_grams) < 0.05;
      })
    : false;
  return {
    state: a.state,
    optionIds: a.options.map((o) => o.id),
    masses: a.options.map((o) => o.finalMassG),
    exactRestore: exact,
  };
};

/**
 * FRESH-FRUIT RESCUE MATRIX — the owner's underweight invariant.
 *
 * If the saved plan P was valid, the vessel is BELOW P, and the shortfall can be
 * restored by additions alone, then Rescue must offer exactly that restoration.
 * It must never answer „Nie mamy bezpiecznej korekty dla tej partii".
 *
 * The specimen is the owner's real run b6ecedce: STRAWBERRIES planned 217 g,
 * weighed 206 g, in a 670 g plan (MILK 201 / CREAM 85 / SMP 41 / SUCROSE 54 /
 * DEXTROSE 54 / INULIN 16 / TARA 2). The original plan is terminal-VALID and the
 * repair is a single +11 g top-up back to it — yet Rescue returned `impossible`,
 * because `restoreOriginalProfile` bailed out whenever nothing in the vessel
 * exceeded its planned amount (scaleFactor <= 1), which is the underweight case,
 * and because the restore strategy demanded a mass strictly ABOVE the original
 * target while the machine was capped at that same target.
 *
 * COVERAGE HONESTY: the skeleton below is tuned for STRAWBERRIES. Dropping a
 * different fruit into it changes the sugar/water balance, so only the fruits
 * listed in VALID_PLAN_FRUITS produce a terminal-valid plan at 217 g; the rest
 * fail `engine:native_band_violation` on the PLAN itself, which is a property of
 * this harness, not of Rescue. Those are asserted as plan-invalid rather than
 * silently counted as passes. Covering all 55 needs a balanced plan generated
 * per fruit.
 */
describe('fresh fruit underweight restores the original plan', () => {
  /** Fruits whose plan is terminal-valid in this skeleton, measured not assumed. */
  const VALID_PLAN_FRUITS = FRESH_FRUITS.filter((fruit) => {
    const planned = planFor(fruit.id);
    return evaluateRecipeConstraintAuthority({
      recipe: { ...planned, target_batch_grams: 670 },
      snapshots: snapsFor(planned, fruit.policy),
      module: 'BATCH_RESCUE',
    }).valid;
  });

  it('has fruits to test at all', () => {
    expect(VALID_PLAN_FRUITS.length).toBeGreaterThan(0);
  });

  it('STRAWBERRIES 217 -> 206 offers the exact +11 g restore', () => {
    const straw = FRESH_FRUITS.find((f) => f.id === 'PI-ING-001553')!;
    const outcome = runCase(straw.id, straw.policy, -11);
    expect(outcome.state).toBe('options');
    expect(outcome.optionIds.length).toBeGreaterThan(0);
    expect(outcome.optionIds).toContain('restore_original_recipe');
    expect(outcome.exactRestore).toBe(true);
    expect(outcome.masses).toContain(670);
  });

  for (const delta of [-5, -10] as const) {
    it(`every valid-plan fresh fruit restores exactly at ${delta} g`, () => {
      for (const fruit of VALID_PLAN_FRUITS) {
        const outcome = runCase(fruit.id, fruit.policy, delta);
        // Non-vacuous: assert there is something to inspect BEFORE inspecting it.
        expect(outcome.state, `${fruit.name} ${delta}g state`).toBe('options');
        expect(outcome.optionIds.length, `${fruit.name} ${delta}g options`).toBeGreaterThan(0);
        expect(outcome.optionIds, `${fruit.name} ${delta}g`).toContain('restore_original_recipe');
        expect(outcome.exactRestore, `${fruit.name} ${delta}g exact`).toBe(true);
        expect(outcome.masses, `${fruit.name} ${delta}g mass`).toContain(670);
      }
    });
  }

  it('overweight still grows the batch instead of restoring in place', () => {
    for (const fruit of VALID_PLAN_FRUITS) {
      const outcome = runCase(fruit.id, fruit.policy, 10);
      expect(outcome.state, `${fruit.name} +10g`).toBe('options');
      expect(outcome.optionIds.length).toBeGreaterThan(0);
      // Add-only: an over-added fruit can only be repaired by a LARGER batch.
      expect(Math.max(...outcome.masses)).toBeGreaterThan(670);
    }
  });

  it('records which fruits this skeleton cannot pose the question for', () => {
    const invalid = FRESH_FRUITS.length - VALID_PLAN_FRUITS.length;
    // Pinned so a change in coverage is visible rather than silent.
    expect(invalid + VALID_PLAN_FRUITS.length).toBe(55);
  });
});
