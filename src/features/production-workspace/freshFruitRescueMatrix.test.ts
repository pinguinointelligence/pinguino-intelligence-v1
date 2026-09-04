import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints/recipeConstraintAuthority';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { FRESH_FRUITS, FRESH_FRUIT_MAIN_POLICIES } from './freshFruitMainPolicies.fixture';
import { assessProductionRescue } from './productionRescue';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';

vi.setConfig({ testTimeout: 900_000 });

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

const FRUIT = 'fruit-main';
const BATCH = 1000;
const CAPACITY = 3000;

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
    else if (/milk 3\.5/i.test(item.ingredient.name ?? ''))
      out[item.id] = { ...(cur as object), approvedLiquidDairyCarrier: true };
  }
  return out as never;
};

/** Canonical starter + this fruit as Main at the midpoint of its published range,
 *  balanced by the app's own optimizer. No invented chemistry. */
const baselineFor = (mapperId: string, policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES) => {
  const p = FRESH_FRUIT_MAIN_POLICIES[policy];
  const sharePercent = (p.eco + p.ceiling) / 2;
  const fruitGrams = Math.round((BATCH * sharePercent) / 100);
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'gelato',
    servingModeId: 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: BATCH,
  });
  const supportTotal = BATCH - fruitGrams;
  const starterTotal = starter.items.reduce((s, i) => s + i.planned_grams, 0);
  const scale = supportTotal / starterTotal;
  const raw = {
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    machine_capacity_grams: CAPACITY,
    target_batch_grams: BATCH,
    items: [
      ...starter.items.map((i) => ({
        ...i,
        planned_grams: Math.round(i.planned_grams * scale * 10) / 10,
        actual_grams: null,
      })),
      {
        id: FRUIT,
        ingredient: ing(mapperId),
        planned_grams: fruitGrams,
        actual_grams: null,
        lock_type: 'main',
      },
    ],
  } as unknown as RecipeInput;
  const built = buildOptimizePreview(raw, { byLineId: {} }, '2026-09-05T09:00:00.000Z', {
    productBehaviorSnapshots: snapsFor(raw, policy),
    technicalOnlyMainLineIds: [],
  });
  if (!built.ok)
    return { ok: false as const, stage: 'optimizer', detail: JSON.stringify(built).slice(0, 160) };
  const proposed = built.preview.proposedInput as RecipeInput;
  const total = proposed.items.reduce((s, i) => s + i.planned_grams, 0);
  const plan = {
    ...proposed,
    target_batch_grams: total,
    machine_capacity_grams: CAPACITY,
  } as RecipeInput;
  const auth = evaluateRecipeConstraintAuthority({
    recipe: plan,
    snapshots: snapsFor(plan, policy),
    module: 'BATCH_RESCUE',
  });
  if (!auth.valid)
    return {
      ok: false as const,
      stage: 'authority',
      detail: auth.issues.map((i) => `${i.source}:${i.code}`).join(','),
    };
  return {
    ok: true as const,
    plan,
    fruitGrams: plan.items.find((i) => i.id === FRUIT)!.planned_grams,
    total,
  };
};

const runDeviation = (
  plan: RecipeInput,
  policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES,
  deltas: Record<string, number>,
) => {
  let session = createProductionSession({
    sessionId: 'm',
    ownerUserId: 'owner',
    source: { recipeId: 'r', recipeVersionId: 'v', recipeVersionNumber: 1, recipeName: 'm' },
    plannedInput: plan,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: plan.items.map((i) => i.id),
      toppings: [],
      behaviorSnapshots: snapsFor(plan, policy),
      migrationAmbiguities: [],
    },
    startedAt: '2026-09-05T09:00:00.000Z',
  } as never);
  for (const [idx, line] of session.lines.entries()) {
    const planned = plan.items.find((i) => i.id === line.lineId)!.planned_grams;
    const physical = Math.round((planned + (deltas[line.lineId] ?? 0)) * 10) / 10;
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, physical),
      line.lineId,
      `2026-09-05T09:0${idx % 10}:00.000Z`,
    );
  }
  const a = assessProductionRescue(session);
  const restore = a.options.find((o) => o.id === 'restore_original_recipe');
  const exact = restore
    ? restore.candidateInput.items.every((it) => {
        const base = plan.items.find((x) => x.id === it.id)!;
        return Math.abs((it.actual_grams ?? it.planned_grams) - base.planned_grams) < 0.05;
      })
    : false;
  const firstIssue = a.state === 'impossible' ? (a.reason ?? 'no reason') : null;
  return {
    state: a.state,
    optionIds: a.options.map((o) => o.id),
    masses: a.options.map((o) => Number(o.finalMassG.toFixed(1))),
    exactRestore: exact,
    restoreMass: restore ? Number(restore.finalMassG.toFixed(1)) : null,
    firstIssue,
  };
};

/**
 * FRESH-FRUIT RESCUE MATRIX — every canonical fresh fruit, real valid baseline.
 *
 * THE OWNER'S UNDERWEIGHT INVARIANT: if the saved plan P was valid, the vessel is
 * BELOW P, and the shortfall can be restored by additions alone, Rescue must
 * offer exactly that restoration and must never answer „Nie mamy bezpiecznej
 * korekty dla tej partii".
 *
 * BASELINES ARE NOT HAND-WRITTEN. An earlier version of this file reused one
 * strawberry-tuned skeleton for all 55 fruits, which produced a terminal-valid
 * plan for only 5 of them — the other 50 failed `engine:native_band_violation`
 * on the PLAN, so Rescue was never actually asked the question. Here each fruit
 * gets its own baseline from the canonical authorities: the approved new-recipe
 * starter, the fruit placed as Main at the midpoint of ITS OWN published range,
 * and the app's own optimizer (`buildOptimizePreview`) balancing the support
 * lines. Each baseline is then required to pass the SAME terminal Production
 * authority Rescue uses before any weighing error is introduced.
 *
 * Policies come from `product_behavior_policy_versions` (see
 * `freshFruitMainPolicies.fixture.ts`), so banana (10/20/30) and kiwi (10/15/20)
 * are posed at their own shares rather than forced to a strawberry share.
 *
 * Machine capacity is deliberately ample (3 kg) so an overweight repair is
 * judged by the search and the hard authorities, not by a capacity wall. The
 * owner's real 670 g / 670 g capacity case is pinned separately in
 * `freshFruitOwnerStrawberry.test.ts`.
 */
describe('fresh fruit rescue matrix — all canonical fresh fruits', () => {
  const BASELINES = FRESH_FRUITS.map((fruit) => ({
    fruit,
    baseline: baselineFor(fruit.id, fruit.policy),
  }));

  it('produces a terminal-valid baseline for every canonical fresh fruit', () => {
    const failed = BASELINES.filter((b) => !b.baseline.ok).map(
      (b) => `${b.fruit.name}: ${(b.baseline as { stage?: string }).stage}`,
    );
    // A fruit with no obtainable valid plan is an Engine/Product coverage defect,
    // never a silent skip — it must surface here rather than shrink the matrix.
    expect(failed, `fruits without a valid baseline: ${failed.join(' | ')}`).toEqual([]);
    expect(BASELINES.length).toBe(55);
  });

  const valid = () =>
    BASELINES.filter((b) => b.baseline.ok) as {
      fruit: (typeof FRESH_FRUITS)[number];
      baseline: { ok: true; plan: RecipeInput; fruitGrams: number; total: number };
    }[];

  for (const delta of [-5, -10] as const) {
    it(`restores the exact saved plan for every fruit at ${delta} g`, () => {
      const rows = valid();
      expect(rows.length).toBe(55);
      for (const { fruit, baseline } of rows) {
        const outcome = runDeviation(baseline.plan, fruit.policy, { [FRUIT]: delta });
        // Non-vacuous: prove there is something to inspect before inspecting it.
        expect(outcome.state, `${fruit.name} ${delta}g`).toBe('options');
        expect(outcome.optionIds.length, `${fruit.name} ${delta}g options`).toBeGreaterThan(0);
        expect(outcome.optionIds, `${fruit.name} ${delta}g`).toContain('restore_original_recipe');
        expect(outcome.exactRestore, `${fruit.name} ${delta}g exact vector`).toBe(true);
        expect(outcome.restoreMass, `${fruit.name} ${delta}g mass`).toBeCloseTo(baseline.total, 1);
      }
    });
  }

  it('restores every missing line when more than the fruit is short', () => {
    const rows = valid();
    for (const { fruit, baseline } of rows) {
      const milk = baseline.plan.items.find((i) => /milk 3\.5/i.test(i.ingredient.name ?? ''));
      if (!milk) continue;
      const outcome = runDeviation(baseline.plan, fruit.policy, { [FRUIT]: -10, [milk.id]: -5 });
      expect(outcome.state, `${fruit.name} multi-line`).toBe('options');
      expect(outcome.optionIds.length).toBeGreaterThan(0);
      expect(outcome.optionIds, `${fruit.name} multi-line`).toContain('restore_original_recipe');
      expect(outcome.exactRestore, `${fruit.name} multi-line exact vector`).toBe(true);
    }
  });

  for (const delta of [5, 10] as const) {
    it(`repairs or refuses with a stated reason for every fruit at +${delta} g`, () => {
      const rows = valid();
      for (const { fruit, baseline } of rows) {
        const outcome = runDeviation(baseline.plan, fruit.policy, { [FRUIT]: delta });
        if (outcome.state === 'impossible') {
          // Legitimate only when a hard authority says so, and it must say WHY.
          expect(
            outcome.firstIssue,
            `${fruit.name} +${delta}g impossible without reason`,
          ).toBeTruthy();
          continue;
        }
        expect(outcome.optionIds.length, `${fruit.name} +${delta}g`).toBeGreaterThan(0);
        // Add-only: over-added fruit can only be repaired by a LARGER batch.
        expect(Math.max(...outcome.masses), `${fruit.name} +${delta}g mass`).toBeGreaterThan(
          baseline.total,
        );
      }
    });
  }
});
