/**
 * OWNER GOLDEN REGRESSION — run b6ecedce-7cc4-464a-82a7-23f7625358b4.
 *
 * Read from served staging: target 670 g, machine capacity 670 g, −13 °C, plan
 * MILK 201 / CREAM 85 / SKIMMED MILK 41 / SUCROSE 54 / DEXTROSE 54 / INULIN 16 /
 * TARA 2 / STRAWBERRIES 217. The operator weighed 206 g of strawberries.
 *
 * The only repair needed is +11 g, which reconstructs the saved plan exactly.
 * Rescue answered „Nie mamy bezpiecznej korekty dla tej partii" because
 * `restoreOriginalProfile` bailed out whenever nothing exceeded its plan
 * (scaleFactor <= 1 — the underweight case) and because the restore strategy
 * demanded a mass strictly ABOVE the original target while the machine was
 * capped at that same target.
 *
 * This case is pinned separately from the parameterized matrix because it is the
 * only one carrying the real capacity == target boundary, which is what made
 * "grow the batch" unavailable and left the exact restore as the sole answer.
 */
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
import { FRESH_FRUIT_MAIN_POLICIES } from './freshFruitMainPolicies.fixture';

vi.setConfig({ testTimeout: 120_000 });

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

const STRAW = 'line-mtnhk4yj-0';
const MILK = 'new-recipe-0-milk_3_5';
/** Exactly the durable `production_run_planned_items` rows of run b6ecedce. */
const OWNER_PLAN = [
  [MILK, 'PI-ING-000236', 201],
  ['new-recipe-1-cream_30', 'PI-ING-000180', 85],
  ['new-recipe-2-smp', 'PI-ING-000270', 41],
  ['new-recipe-3-sucrose', 'PI-ING-000514', 54],
  ['new-recipe-4-dextrose', 'PI-ING-000494', 54],
  ['new-recipe-5-inulin', 'PI-ING-000456', 16],
  ['new-recipe-6-tara_gum', 'PI-ING-000492', 2],
  [STRAW, 'PI-ING-001553', 217],
] as const;
const OWNER_TARGET_G = 670;
const OWNER_CAPACITY_G = 670;
const STRAWBERRY_PHYSICAL_G = 206;

const plan = (): RecipeInput =>
  ({
    mode: 'classic',
    category: 'milk_gelato',
    target_batch_grams: OWNER_TARGET_G,
    target_temperature_c: -13,
    machine_capacity_grams: OWNER_CAPACITY_G,
    items: OWNER_PLAN.map(([id, pid, g]) => ({
      id,
      ingredient: ing(pid),
      planned_grams: g,
      actual_grams: null,
      lock_type: id === STRAW ? 'main' : 'unlocked',
    })),
  }) as unknown as RecipeInput;

/** Published main-berry-fresh-dairy v2, as persisted on the run's own snapshot. */
const snaps = (input: RecipeInput) => {
  const berry = FRESH_FRUIT_MAIN_POLICIES.berry;
  const base = productBehaviorTestSnapshots(input) as Record<string, unknown>;
  const out = { ...base };
  for (const item of input.items) {
    const cur = out[item.id];
    if (!cur) continue;
    if (item.id === STRAW)
      out[item.id] = {
        ...(cur as object),
        mainCapability: 'MAIN_CAPABLE',
        behaviorRole: 'MAIN_PROFILE_SPECIFIC',
        mainClassification: 'MAIN_PROFILE_SPECIFIC',
        mainAuthority: 'CALIBRATED',
        mainCalibrationLevel: 'FAMILY',
        mainBasis: 'FRUIT_EQUIVALENT',
        mainEquivalentFactor: 1,
        mainPolicyId: berry.key,
        mainPolicyVersion: '2',
        ecoFloorPercent: berry.eco,
        optimalCeilingPercent: berry.ceiling,
        hardLimitPercent: berry.hard,
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

const vessel = () => {
  const planned = plan();
  let session = createProductionSession({
    sessionId: 'owner-strawberry',
    ownerUserId: 'owner',
    source: {
      recipeId: 'r',
      recipeVersionId: 'v',
      recipeVersionNumber: 1,
      recipeName: 'Owner strawberry',
    },
    plannedInput: planned,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: planned.items.map((i) => i.id),
      toppings: [],
      behaviorSnapshots: snaps(planned),
      migrationAmbiguities: [],
    },
    startedAt: '2026-09-04T21:48:49.000Z',
  } as never);
  for (const [idx, line] of session.lines.entries()) {
    const physical = line.lineId === STRAW ? STRAWBERRY_PHYSICAL_G : OWNER_PLAN[idx]![2];
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, physical),
      line.lineId,
      `2026-09-04T21:4${idx}:00.000Z`,
    );
  }
  return { planned, session };
};

describe('owner strawberry underweight (run b6ecedce)', () => {
  it('the saved 670 g plan is terminal-VALID — so a restore to it must exist', () => {
    const planned = plan();
    const authority = evaluateRecipeConstraintAuthority({
      recipe: planned,
      snapshots: snaps(planned),
      module: 'BATCH_RESCUE',
    });
    expect(authority.issues.map((i) => `${i.source}:${i.code}`)).toEqual([]);
    expect(authority.valid).toBe(true);
  });

  it('offers the exact +11 g restore back to the saved plan', () => {
    const { planned, session } = vessel();
    expect(session.lines.reduce((s, l) => s + l.physicalAddedGrams, 0)).toBe(659);

    const assessment = assessProductionRescue(session);
    expect(assessment.state).toBe('options');
    expect(assessment.options.length).toBeGreaterThan(0);

    const restore = assessment.options.find((o) => o.id === 'restore_original_recipe');
    expect(restore, 'restore_original_recipe was not offered').toBeDefined();
    expect(restore!.finalMassG).toBeCloseTo(OWNER_TARGET_G, 6);

    // Final vector identical to the original saved plan — nothing else moved.
    for (const item of restore!.candidateInput.items) {
      const base = planned.items.find((x) => x.id === item.id)!;
      expect(item.actual_grams ?? item.planned_grams, `${item.id}`).toBeCloseTo(
        base.planned_grams,
        6,
      );
    }
    // One canonical line per ingredient: the top-up is not a duplicate row.
    expect(new Set(restore!.candidateInput.items.map((i) => i.id)).size).toBe(OWNER_PLAN.length);

    // The single instruction is the missing strawberry delta.
    const additions = restore!.instructions.filter((i) => i.grams > 0.05);
    expect(additions).toHaveLength(1);
    expect(additions[0]).toMatchObject({ lineId: STRAW, grams: 11, finalTargetGrams: 217 });
  });
});
