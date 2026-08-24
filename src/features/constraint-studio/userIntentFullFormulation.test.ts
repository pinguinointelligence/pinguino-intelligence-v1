/**
 * FULL_FORMULATION USER-INTENT REGRESSION (owner FINAL FULL_FORMULATION GAP,
 * 2026-08-23).
 *
 * THE DEFECT
 * ----------
 * The first soft-hold round governed the current-draft gram ladder and the ECO
 * cost sweep. The served owner reproducer never reaches either: a Mapper-sourced
 * gelato routes to `full_formulation` on `milk_base_v1`, and the served Preview
 * still proposed
 *
 *     EGGS CHICKEN YOLK DRIED   40 g → 1 g
 *
 * The 1 g was not chosen by any search. `projectManualIngredientTarget`
 * rebuilds the WHOLE gram vector from `mainTechnicalLinearUpperBound`, and that
 * relaxation floored every soft-held user line at the literal PRESENCE floor:
 *
 *     } else if (preservesVisibleStandard) {
 *       addLower(row, 1, `standard_presence_min:${item.id}`);
 *
 * Since the LP objective pushes every non-objective line to its lower bound,
 * the yolk landed on 1 g by construction — while the projection was targeting a
 * different line entirely (the last line carrying `user_target_grams`).
 *
 * THE FIX
 * -------
 * That bound is now the MATERIAL-DEVIATION floor from the shared authority,
 * opted into by the call that BUILDS A RECIPE (`respectUserIntentFloors`) and
 * deliberately NOT by calls that only compute a technical bound.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  isMaterialUserIntentDeviation,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildOptimizePreview } from './applyPipeline';
import { routeFormulationMode } from '@/features/formulation/formulate';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';

const MAPPER = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);
const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      )
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};
const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
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
  yolk: 'PI-ING-001645',
  inulin: 'PI-ING-000456',
} as const;

/** The EXACT served working state, in the exact served line order. */
const LOST: readonly (readonly [string, string, number])[] = [
  ['l:milk', IDS.milk, 595],
  ['l:cream', IDS.cream, 180],
  ['l:smp', IDS.smp, 30],
  ['l:sucrose', IDS.sucrose, 90],
  ['l:dextrose', IDS.dextrose, 50],
  ['l:tara', IDS.tara, 2],
  ['l:yolk', IDS.yolk, 40],
  ['l:inulin', IDS.inulin, 20],
];

const lostRecipe = (lockYolk: boolean): { input: RecipeInput; set: ConstraintSet } => ({
  input: {
    items: LOST.map(([id, ingredientId, grams]) => {
      const locked = lockYolk && id === 'l:yolk';
      return {
        id,
        ingredient: ingredient(ingredientId),
        planned_grams: grams,
        actual_grams: null,
        lock_type: locked ? ('grams' as const) : ('unlocked' as const),
        ...(locked ? { grams_constraint: { grams: 40 } } : {}),
        // served: every line was typed in or added through the picker
        user_intent_anchor_grams: grams,
        user_target_grams: grams,
      };
    }),
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: 'optimal',
    } as RecipeInput['goals'],
  },
  set: { byLineId: lockYolk ? { 'l:yolk': { mode: 'locked', grams: 40 } } : {} },
});

const gramsOf = (input: RecipeInput, lineId: string): number =>
  input.items.find((item) => item.id === lineId)?.planned_grams ?? 0;
const sum = (input: RecipeInput): number =>
  input.items.reduce((total, item) => total + item.planned_grams, 0);

describe('§1–§12 the served Polish Lost reproducer', () => {
  /**
   * ROUTE NOTE (2026-08-24, PAC/POD unit contract). This recipe used to report
   * `missing_hard_role` and route through `full_formulation` for one reason
   * only: canonical Sucrose resolved to `sugar_freezing_control`, because the
   * role classifier compared a stored per-100 g PAC POINT against the 1.3
   * COEFFICIENT separator. With the unit contract normalized the draft is
   * complete, so the LOCAL corrector owns it — which is the route the served
   * owner reproducer was always supposed to take. The Soft-Hold contract below
   * is unchanged and is now additionally proven on a draft that genuinely
   * still needs `full_formulation`.
   */
  it('routes UNLOCKED through the local corrector once Sucrose resolves correctly', () => {
    const { input, set } = lostRecipe(false);
    const decision = routeFormulationMode(input, set);
    expect(decision.mode).toBe('local_correction');
    expect(decision.reasons).not.toContain('missing_hard_role');
    expect(
      resolveFunctionalRole(input.items.find((item) => item.id === 'l:sucrose')!.ingredient),
    ).toBe('sweetener_sucrose');
  });

  it('still keeps the yolk on a draft that genuinely routes through full_formulation', () => {
    // Drop the sugar: the template HARD role really is missing, so the
    // formulation path — the path this file exists to cover — is the honest
    // route, and the soft hold must hold there too.
    const { input, set } = lostRecipe(false);
    const noSugar: RecipeInput = {
      ...input,
      items: input.items.filter((item) => item.id !== 'l:sucrose'),
    };
    expect(routeFormulationMode(noSugar, set).mode).toBe('full_formulation');
    const result = buildOptimizePreview(noSugar, set, '2026-08-23T22:00:00.000Z');
    expect(result.ok, result.ok ? '' : JSON.stringify(result).slice(0, 300)).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    const yolk = gramsOf(proposed, 'l:yolk');
    expect(yolk).toBeGreaterThan(1);
    expect(isMaterialUserIntentDeviation(40, yolk, 1000)).toBe(false);
    expect(sum(proposed)).toBeCloseTo(1000, 6);
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
  });

  it('does NOT collapse the dried egg yolk to a trace amount (the binding regression)', () => {
    const { input, set } = lostRecipe(false);
    const result = buildOptimizePreview(input, set, '2026-08-23T22:00:00.000Z');
    expect(result.ok, result.ok ? '' : JSON.stringify(result).slice(0, 300)).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    const yolk = gramsOf(proposed, 'l:yolk');

    // THE regression: served staging returned exactly 1 g here.
    expect(yolk).toBeGreaterThan(1);
    expect(isMaterialUserIntentDeviation(40, yolk, 1000)).toBe(false);

    // …and the rest of the owner contract holds with it.
    expect(sum(proposed)).toBeCloseTo(1000, 6);
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
    expect(gramsOf(proposed, 'l:inulin')).toBeGreaterThanOrEqual(20); // owner minimum
    expect(proposed.items.every((item) => item.planned_grams >= 1)).toBe(true); // no 0 g rows
    // canonical identity preserved — no fresh-yolk substitution
    expect(
      proposed.items.find((item) => item.id === 'l:yolk')?.ingredient.canonical_ingredient_id,
    ).toBe(IDS.yolk);
    expect(result.preview.userIntent?.material ?? []).toHaveLength(0);
  });

  it('holds the yolk exactly when hard-locked, and stays hard-valid', () => {
    const { input, set } = lostRecipe(true);
    const result = buildOptimizePreview(input, set, '2026-08-23T22:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    expect(gramsOf(proposed, 'l:yolk')).toBe(40);
    expect(sum(proposed)).toBeCloseTo(1000, 6);
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
  });

  it('UNLOCKED is not dramatically more destructive than LOCKED (owner §12 A/B)', () => {
    const unlocked = buildOptimizePreview(
      lostRecipe(false).input,
      lostRecipe(false).set,
      '2026-08-23T22:00:00.000Z',
    );
    const locked = buildOptimizePreview(
      lostRecipe(true).input,
      lostRecipe(true).set,
      '2026-08-23T22:00:00.000Z',
    );
    expect(unlocked.ok && locked.ok).toBe(true);
    if (!unlocked.ok || !locked.ok) return;
    // Both reach the same hard validity …
    expect(detectViolations(calculateRecipe(unlocked.preview.proposedInput))).toEqual([]);
    expect(detectViolations(calculateRecipe(locked.preview.proposedInput))).toEqual([]);
    // … so the unlocked run may not pay for it by destroying the user's line.
    const unlockedDrift = unlocked.preview.userIntent?.totalDrift ?? 0;
    const lockedDrift = locked.preview.userIntent?.totalDrift ?? 0;
    expect(unlockedDrift).toBeLessThan(lockedDrift + 1);
    expect(unlocked.preview.userIntent?.material ?? []).toHaveLength(0);
  });
});
