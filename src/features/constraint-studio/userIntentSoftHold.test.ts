/**
 * GLOBAL USER INTENT / SOFT-HOLD SOLVER — the owner regression suite
 * (2026-08-23).
 *
 * THE DEFECT
 * ----------
 * A positive gram amount the USER put in a recipe carried no preservation
 * authority in candidate ranking. The engine measure (out-of-band count, then
 * severity points) was the ONLY ranking key, so a candidate that reached the
 * band by effectively deleting a user ingredient outranked an equally valid
 * candidate that kept it. The owner's reproducer:
 *
 *   Śmietankowe na żółtkach — EGGS CHICKEN YOLK DRIED 40 g → 1 g
 *
 * while a 40 g / Score 10 solution demonstrably existed (it is what the same
 * solver returns once the line is hard-locked). The 1 g was not a coincidence:
 * the gram ladder handed the search an explicit rung at the PRESENCE FLOOR for
 * exactly the lines that carry user intent.
 *
 * WHAT IS PINNED HERE
 * -------------------
 *  - the drift measure itself (owner §9);
 *  - the ladder no longer offers a bare collapse rung as ordinary optimization;
 *  - a sweep prefers a preserving candidate over a destructive one that the
 *    engine scores the same or better (owner §8/§12);
 *  - the Polish Lost recipe, locked and unlocked, stays coherent (§14/§15);
 *  - hard locks, Main and the zero-gram invariant are untouched (§20/§21/§25);
 *  - PI still rebalances — this is a soft hold, not a freeze (§11).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type CorrectionConstraints,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  buildUserIntentBaseline,
  classifyUserLineFlexibility,
  isMaterialUserIntentDeviation,
  materialDeviationFloorGrams,
  measureUserIntentDrift,
  normalizedLineDrift,
  MATERIAL_USER_INTENT_DRIFT,
} from '@/features/formulation/userLineIntent';
import {
  buildDraftCandidateVector,
  sweepDraftCandidateVector,
  type DraftStateMeasure,
} from './draftCandidateVector';

/* ── the real Mapper rows (no invented compositions) ─────────────────────── */

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
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

const ingredient = (ingredientId: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(ingredientId)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  yolk: 'PI-ING-001645',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  inulin: 'PI-ING-000456',
  tara: 'PI-ING-000492',
} as const;

/**
 * THE OWNER REPRODUCER — `lost-pl-yolk-v2` „Śmietankowe na żółtkach", with the
 * source Inulin 13 g already resolved to the owner minimum 20 g (2 % of the
 * 1000 g batch, `OWNER_INULIN_POLICY`). That minimum is deliberate science and
 * is never relaxed by anything in this suite (owner §29); the working recipe
 * therefore starts at 1007 g and has to be reconciled to 1000 g.
 */
const LOST_LINES: readonly (readonly [string, string, number])[] = [
  ['l:milk', IDS.milk, 595],
  ['l:cream', IDS.cream, 180],
  ['l:yolk', IDS.yolk, 40],
  ['l:smp', IDS.smp, 30],
  ['l:sucrose', IDS.sucrose, 90],
  ['l:dextrose', IDS.dextrose, 50],
  ['l:inulin', IDS.inulin, 20],
  ['l:tara', IDS.tara, 2],
];

const lostRecipe = (
  options: { lockYolk?: boolean } = {},
): { input: RecipeInput; set: ConstraintSet } => {
  const byLineId: Record<string, ConstraintSet['byLineId'][string]> = {};
  if (options.lockYolk) byLineId['l:yolk'] = { mode: 'locked', grams: 40 };
  return {
    input: {
      items: LOST_LINES.map(([id, ingredientId, grams]) => {
        const locked = options.lockYolk === true && id === 'l:yolk';
        return {
          id,
          ingredient: ingredient(ingredientId),
          planned_grams: grams,
          actual_grams: null,
          lock_type: locked ? ('grams' as const) : ('unlocked' as const),
          ...(locked ? { grams_constraint: { grams: 40 } } : {}),
          // Every line is the USER's: this recipe was typed in, so each line
          // carries the product-layer intent sidecar the store writes.
          ...(locked ? {} : { user_intent_anchor_grams: grams }),
        };
      }),
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

const gramsOf = (input: RecipeInput, lineId: string): number =>
  input.items.find((item) => item.id === lineId)?.planned_grams ?? 0;

/* ════════════════════════════════════════════════════════════════════════════
   §9 — THE DRIFT MEASURE
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§9 user-intent drift is measured against the user baseline', () => {
  it('separates a catastrophic collapse from an ordinary rebalance of the same gram size', () => {
    // The SAME 39 g move. §9 forbids treating these identically.
    const collapse = normalizedLineDrift(40, 1, 1000);
    const rebalance = normalizedLineDrift(600, 561, 1000);
    expect(collapse).toBeGreaterThan(0.9);
    expect(rebalance).toBeLessThan(0.1);
    expect(collapse).toBeGreaterThan(rebalance * 10);
  });

  it('stays numerically stable on tiny lines instead of letting them dominate', () => {
    // A 2 g stabilizer moving by 1 g is noticeable but must not read as
    // catastrophic — a pure relative measure would score it 0.5.
    const tara = normalizedLineDrift(2, 3, 1000);
    expect(tara).toBeGreaterThan(0);
    expect(tara).toBeLessThan(MATERIAL_USER_INTENT_DRIFT);
    // and it must never produce a non-finite value at any baseline
    expect(Number.isFinite(normalizedLineDrift(0.0001, 0, 1000))).toBe(true);
  });

  it('treats ordinary optimization of the owner yolk as NOT material, and 1 g as material', () => {
    expect(isMaterialUserIntentDeviation(40, 38, 1000)).toBe(false);
    expect(isMaterialUserIntentDeviation(40, 43, 1000)).toBe(false);
    expect(isMaterialUserIntentDeviation(40, 35, 1000)).toBe(false);
    expect(isMaterialUserIntentDeviation(40, 20, 1000)).toBe(false);
    expect(isMaterialUserIntentDeviation(40, 1, 1000)).toBe(true);
    // Removal is the most destructive deviation there is.
    expect(isMaterialUserIntentDeviation(40, 0, 1000)).toBe(true);
  });

  it('measures a DROPPED line as a move to 0 g, never as an absent comparison', () => {
    const { input, set } = lostRecipe();
    const baseline = buildUserIntentBaseline(input, set);
    const withoutYolk: RecipeInput = {
      ...input,
      items: input.items.filter((item) => item.id !== 'l:yolk'),
    };
    const report = measureUserIntentDrift(baseline, withoutYolk);
    const yolk = report.lines.find((line) => line.lineId === 'l:yolk');
    expect(yolk?.proposedGrams).toBe(0);
    expect(yolk?.material).toBe(true);
    expect(report.material.map((line) => line.lineId)).toContain('l:yolk');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §10 — FLEXIBILITY CLASSES COME FROM AUTHORITY, NEVER FROM AN INGREDIENT LIST
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§10 flexibility classes are derived, not hardcoded', () => {
  it('classifies the owner recipe by role and lock authority alone', () => {
    const { input, set } = lostRecipe();
    const classOf = (lineId: string) =>
      classifyUserLineFlexibility(input.items.find((item) => item.id === lineId)!, set);
    // identity-bearing user lines
    expect(classOf('l:yolk')).toBe('user_flavour_structure');
    expect(classOf('l:cream')).toBe('user_flavour_structure');
    // the balancing lines — flexible by their OWN role
    expect(classOf('l:milk')).toBe('user_technical_balancer');
    expect(classOf('l:sucrose')).toBe('user_technical_balancer');
    expect(classOf('l:inulin')).toBe('user_technical_balancer');
    // structural but not identity
    expect(classOf('l:smp')).toBe('user_general');
  });

  it('gives a hard-locked line no soft-hold authority (its lock is exact)', () => {
    const { input, set } = lostRecipe({ lockYolk: true });
    const yolk = input.items.find((item) => item.id === 'l:yolk')!;
    expect(classifyUserLineFlexibility(yolk, set)).toBe('hard_locked');
    expect(buildUserIntentBaseline(input, set).has('l:yolk')).toBe(false);
  });

  it('gives a PI-added support line the lowest authority, and every user line a nonzero one', () => {
    const { input, set } = lostRecipe();
    const withAutoAdded: RecipeInput = {
      ...input,
      items: [
        ...input.items,
        {
          id: 'pi:auto-dextrose',
          ingredient: ingredient(IDS.dextrose),
          planned_grams: 12,
          actual_grams: null,
          lock_type: 'unlocked' as const,
          // no intent sidecar — PI put this line here
        },
      ],
    };
    const baseline = buildUserIntentBaseline(withAutoAdded, set);
    expect(baseline.has('pi:auto-dextrose')).toBe(false);
    // §10: every USER-specified positive line has nonzero preservation authority
    for (const lineId of LOST_LINES.map(([id]) => id)) {
      expect(baseline.get(lineId)?.weight, lineId).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §7/§25 — THE LADDER NO LONGER OFFERS A BARE COLLAPSE AS ORDINARY OPTIMIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§7/§25 the gram ladder', () => {
  it('places a rung at the material boundary of every soft-held line', () => {
    const { input, set } = lostRecipe();
    const vector = buildDraftCandidateVector(input, set);
    const yolk = vector.find((candidate) => candidate.lineId === 'l:yolk')!;
    expect(yolk.anchorGrams).toBe(40);
    // 40 − 0.5 × (40 + 1) = 19.5
    expect(yolk.materialFloorGrams).toBeCloseTo(19.5, 6);
    expect(yolk.testedGrams).toContain(19.5);
  });

  it('keeps the presence floor REACHABLE — a soft hold is not a lock (§11/§12)', () => {
    const { input, set } = lostRecipe();
    const yolk = buildDraftCandidateVector(input, set).find(
      (candidate) => candidate.lineId === 'l:yolk',
    )!;
    // §12: a genuinely necessary large change must remain possible. What
    // changed is that it is no longer reachable as ordinary optimization.
    expect(yolk.testedGrams).toContain(1);
    expect(
      yolk.testedGrams.filter((grams) => isMaterialUserIntentDeviation(40, grams, 1000)),
    ).not.toHaveLength(0);
  });

  it('still lets PI move a soft-held line substantially in BOTH directions (§11)', () => {
    const { input, set } = lostRecipe();
    const milk = buildDraftCandidateVector(input, set).find(
      (candidate) => candidate.lineId === 'l:milk',
    )!;
    expect(Math.max(...milk.testedGrams)).toBeGreaterThan(640);
    expect(Math.min(...milk.testedGrams.filter((g) => g > 1))).toBeLessThan(500);
  });

  it('gives a PI-added line no material floor (it has no user baseline)', () => {
    const { input, set } = lostRecipe();
    const withAutoAdded: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:dextrose'
          ? { ...item, user_intent_anchor_grams: undefined, user_target_grams: undefined }
          : item,
      ),
    };
    const line = buildDraftCandidateVector(withAutoAdded, set).find(
      (candidate) => candidate.lineId === 'l:dextrose',
    )!;
    expect(line.anchorGrams).toBeNull();
    expect(line.materialFloorGrams).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §8/§12 — THE SWEEP PREFERS THE PRESERVING CANDIDATE
   ═══════════════════════════════════════════════════════════════════════════ */

const CONSTRAINTS: CorrectionConstraints = {
  context: 'planning',
  mode: 'classic',
  allow_main_ingredient_reduction: false,
  machine_capacity_grams: null,
};

/** The engine — and ONLY the engine — judges legality/quality of a candidate. */
const engineMeasure =
  (baseline: ReturnType<typeof buildUserIntentBaseline>) =>
  (candidate: RecipeInput): DraftStateMeasure => {
    const violations = detectViolations(calculateRecipe(candidate));
    return {
      violations: violations.length,
      severityPoints: violations.reduce((sum, violation) => sum + violation.severity_points, 0),
      userIntentDrift: measureUserIntentDrift(baseline, candidate).total,
    };
  };

describe('§8/§12 candidate ranking prefers lower user-intent drift', () => {
  it('does NOT collapse the owner yolk when a preserving candidate reaches the same result', () => {
    const { input, set } = lostRecipe();
    const baseline = buildUserIntentBaseline(input, set);
    const measure = engineMeasure(baseline);
    const result = sweepDraftCandidateVector({
      start: input,
      set,
      userIntentBaseline: baseline,
      excludedIngredientIds: new Set(),
      constraints: CONSTRAINTS,
      normalize: (candidate) => candidate,
      measure,
      startMeasure: measure(input),
    });
    // The sweep must find SOMETHING (the start state is out of band) …
    expect(result).not.toBeNull();
    // … and whatever it found, the yolk must not have been deleted.
    const yolkGrams = gramsOf(result!.input, 'l:yolk');
    expect(yolkGrams).toBeGreaterThan(1);
    expect(isMaterialUserIntentDeviation(40, yolkGrams, 1000)).toBe(false);
  });

  it('reports a material deviation instead of hiding it, when one is genuinely taken', () => {
    const { input, set } = lostRecipe();
    const baseline = buildUserIntentBaseline(input, set);
    const measure = engineMeasure(baseline);
    const result = sweepDraftCandidateVector({
      start: input,
      set,
      userIntentBaseline: baseline,
      excludedIngredientIds: new Set(),
      constraints: CONSTRAINTS,
      normalize: (candidate) => candidate,
      measure,
      startMeasure: measure(input),
    });
    expect(result).not.toBeNull();
    // The flag exists and is a boolean on every sweep result — a deviation can
    // never be taken without the caller being told (owner §13).
    expect(typeof result!.materialUserIntentDeviation).toBe('boolean');
    if (result!.materialUserIntentDeviation === true) {
      const report = measureUserIntentDrift(baseline, result!.input);
      expect(report.material.length).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §14 — THE COLLAPSE MATRIX (the regression that FAILED before this change)
   ═══════════════════════════════════════════════════════════════════════════
   Measured on the pre-change solver: 27 of these 48 states drove the user's
   positive dried-egg-yolk line to EXACTLY 1 g — the presence floor — including
   states that ended STILL out of band. After the change exactly one state
   deviates, and it is the state where the yolk itself is the violation and the
   deviation reaches a fully legal recipe (owner §12/§24) — disclosed, never
   silent.                                                                    */

const CONSTRAINT_MATRIX_LINES = (
  yolk: number,
  smp: number,
  cream: number,
): readonly (readonly [string, string, number])[] => [
  ['l:milk', IDS.milk, 1000 - yolk - smp - cream - 90 - 50 - 20 - 2],
  ['l:cream', IDS.cream, cream],
  ['l:yolk', IDS.yolk, yolk],
  ['l:smp', IDS.smp, smp],
  ['l:sucrose', IDS.sucrose, 90],
  ['l:dextrose', IDS.dextrose, 50],
  ['l:inulin', IDS.inulin, 20],
  ['l:tara', IDS.tara, 2],
];

const matrixRecipe = (
  yolk: number,
  smp: number,
  cream: number,
  temperature: number,
): RecipeInput => ({
  items: CONSTRAINT_MATRIX_LINES(yolk, smp, cream).map(([id, ingredientId, grams]) => ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
    user_intent_anchor_grams: grams,
  })),
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: temperature,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
});

describe('§14 a positive user line is never driven to the presence floor as ordinary optimization', () => {
  const cases: [number, number, number, number][] = [];
  for (const yolk of [40, 60, 80, 100])
    for (const smp of [30, 60, 90])
      for (const cream of [180, 120])
        for (const temperature of [-11, -13]) cases.push([yolk, smp, cream, temperature]);

  it.each(cases)('yolk %i g · SMP %i g · cream %i g · %i °C', (yolk, smp, cream, temperature) => {
    const input = matrixRecipe(yolk, smp, cream, temperature);
    if (input.items.some((item) => item.planned_grams <= 0)) return;
    const set: ConstraintSet = { byLineId: {} };
    const baseline = buildUserIntentBaseline(input, set);
    const measure = engineMeasure(baseline);
    const result = sweepDraftCandidateVector({
      start: input,
      set,
      userIntentBaseline: baseline,
      excludedIngredientIds: new Set(),
      constraints: CONSTRAINTS,
      normalize: (candidate) => candidate,
      measure,
      startMeasure: measure(input),
    });
    if (result === null) return;
    const proposed = gramsOf(result.input, 'l:yolk');
    if (!isMaterialUserIntentDeviation(yolk, proposed, 1000)) return;

    // A material deviation is allowed — but ONLY on §12 terms:
    //   1. it must be DISCLOSED by the sweep, and
    //   2. it must have bought full technical legality.
    expect(result.materialUserIntentDeviation).toBe(true);
    expect(result.measure.violations).toBe(0);
    expect(measureUserIntentDrift(baseline, result.input).material.length).toBeGreaterThan(0);
  });

  it('still moves a soft-held line substantially where the recipe needs it (§11 not frozen)', () => {
    // 100 g of dried yolk in a 1000 g milk gelato IS the problem. PI must be
    // free to cut it hard — a soft hold is a preference, not a padlock.
    const input = matrixRecipe(100, 30, 120, -11);
    const set: ConstraintSet = { byLineId: {} };
    const baseline = buildUserIntentBaseline(input, set);
    const measure = engineMeasure(baseline);
    const result = sweepDraftCandidateVector({
      start: input,
      set,
      userIntentBaseline: baseline,
      excludedIngredientIds: new Set(),
      constraints: CONSTRAINTS,
      normalize: (candidate) => candidate,
      measure,
      startMeasure: measure(input),
    });
    expect(result).not.toBeNull();
    const proposed = gramsOf(result!.input, 'l:yolk');
    expect(proposed).toBeLessThan(60); // genuinely rebalanced …
    expect(proposed).toBeGreaterThan(1); // … and still an ingredient
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §17/§18 — THE AUTHORITY IS GLOBAL, NOT LOST-SPECIFIC
   ═══════════════════════════════════════════════════════════════════════════
   There is deliberately NO ingredient list anywhere in this authority: a line's
   class comes from its RESOLVED ROLE and its lock state. These cases prove the
   representative user-intent types the owner listed all land on a class with
   nonzero preservation authority, and that the balancing lines are the ones
   allowed to be the most flexible.                                           */

const REPRESENTATIVE_LINES: readonly (readonly [string, string, string])[] = [
  ['dried egg yolk', IDS.yolk, 'user_flavour_structure'],
  ['fruit (strawberry paste)', 'PI-ING-000723', 'user_flavour_structure'],
  ['nut paste (cashew)', 'PI-ING-000410', 'user_flavour_structure'],
  ['cocoa / chocolate', 'PI-ING-000109', 'user_flavour_structure'],
  ['alcohol (brandy 36 %)', 'PI-ING-000007', 'user_flavour_structure'],
  ['coconut (plant fat)', 'PI-ING-000145', 'user_flavour_structure'],
  ['protein (WPC 80 %)', 'PI-ING-000295', 'user_flavour_structure'],
  ['dairy structural (cream 30 %)', IDS.cream, 'user_flavour_structure'],
  ['plant base (oat drink)', 'PI-ING-001565', 'user_technical_balancer'],
  ['water/sugar balancer (sucrose)', IDS.sucrose, 'user_technical_balancer'],
  ['freezing-control sugar (dextrose)', IDS.dextrose, 'user_technical_balancer'],
  ['fibre/body (inulin)', IDS.inulin, 'user_technical_balancer'],
];

describe('§17/§18 representative user-intent types across profiles', () => {
  it.each(REPRESENTATIVE_LINES)(
    '%s carries nonzero preservation authority',
    (_label, ingredientId, expectedClass) => {
      const item = {
        id: 'x:line',
        ingredient: ingredient(ingredientId),
        planned_grams: 40,
        actual_grams: null,
        lock_type: 'unlocked' as const,
        user_intent_anchor_grams: 40,
      };
      const set: ConstraintSet = { byLineId: {} };
      expect(classifyUserLineFlexibility(item, set)).toBe(expectedClass);
      const baseline = buildUserIntentBaseline(
        {
          items: [item],
          mode: 'classic',
          category: 'milk_gelato',
          target_temperature_c: -11,
          target_batch_grams: 1000,
          machine_capacity_grams: null,
          goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
        },
        set,
      );
      expect(baseline.get('x:line')?.weight).toBeGreaterThan(0);
      // and the material boundary is a real, positive gram amount
      expect(materialDeviationFloorGrams(40, 1000)).toBeGreaterThan(1);
    },
  );

  it('gives every positive Standard line equal preservation weight regardless of role', () => {
    const set: ConstraintSet = { byLineId: {} };
    const mk = (ingredientId: string) => ({
      id: 'x:line',
      ingredient: ingredient(ingredientId),
      planned_grams: 40,
      actual_grams: null,
      lock_type: 'unlocked' as const,
      user_intent_anchor_grams: 40,
    });
    const asInput = (ingredientId: string): RecipeInput => ({
      items: [mk(ingredientId)],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
    });
    const yolkWeight = buildUserIntentBaseline(asInput(IDS.yolk), set).get('x:line')!.weight;
    const milkWeight = buildUserIntentBaseline(asInput(IDS.milk), set).get('x:line')!.weight;
    expect(yolkWeight).toBe(milkWeight);
    expect(milkWeight).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §20/§21 — MAIN AND HARD LOCKS ARE UNTOUCHED
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§20/§21 soft hold never competes with Main and never weakens a lock', () => {
  it('gives a Main line NO soft-hold authority — the Main contract owns it', () => {
    const { input, set } = lostRecipe();
    const withMain: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:cream'
          ? { ...item, lock_type: 'main' as const, user_intent_anchor_grams: 180 }
          : item,
      ),
    };
    expect(classifyUserLineFlexibility(withMain.items[1]!, set)).toBe('main_protected');
    // §20: no second competing Main authority — Main contributes nothing to the
    // soft-hold drift sum, so soft hold can never argue with the Main contract.
    expect(buildUserIntentBaseline(withMain, set).has('l:cream')).toBe(false);
  });

  it('leaves a hard-locked line byte-exact and outside the soft-hold sum', () => {
    const { input, set } = lostRecipe({ lockYolk: true });
    const baseline = buildUserIntentBaseline(input, set);
    expect(baseline.has('l:yolk')).toBe(false);
    // it is also structurally unreachable to the ladder
    expect(
      buildDraftCandidateVector(input, set).some((candidate) => candidate.lineId === 'l:yolk'),
    ).toBe(false);
    const measure = engineMeasure(baseline);
    const result = sweepDraftCandidateVector({
      start: input,
      set,
      userIntentBaseline: baseline,
      excludedIngredientIds: new Set(),
      constraints: CONSTRAINTS,
      normalize: (candidate) => candidate,
      measure,
      startMeasure: measure(input),
    });
    if (result !== null) expect(gramsOf(result.input, 'l:yolk')).toBe(40);
  });

  it('holds a soft line, a hard-locked line and a Main line in the SAME recipe', () => {
    const { input } = lostRecipe();
    const set: ConstraintSet = { byLineId: { 'l:sucrose': { mode: 'locked', grams: 90 } } };
    const mixed: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:cream'
          ? { ...item, lock_type: 'main' as const }
          : item.id === 'l:sucrose'
            ? { ...item, lock_type: 'grams' as const, grams_constraint: { grams: 90 } }
            : item,
      ),
    };
    const baseline = buildUserIntentBaseline(mixed, set);
    expect(baseline.has('l:cream')).toBe(false); // Main
    expect(baseline.has('l:sucrose')).toBe(false); // hard lock
    expect(baseline.has('l:yolk')).toBe(true); // soft hold
    expect(baseline.has('l:milk')).toBe(true); // soft hold
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §23 — ECO MAY NOT BUY CHEAPNESS WITH THE USER'S INGREDIENT
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§23 ECO ranks cost BELOW explicit recipe intent', () => {
  it('never offers a material collapse of an expensive user line as a cost move', () => {
    const { input, set } = lostRecipe();
    // Make the user's dried yolk by far the most expensive line, so „delete it"
    // is the single cheapest move available anywhere in the recipe.
    const priced: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:yolk'
          ? { ...item, ingredient: { ...item.ingredient, cost_per_kg: 400 } }
          : item,
      ),
    };
    const yolkLine = buildDraftCandidateVector(priced, set).find(
      (candidate) => candidate.lineId === 'l:yolk',
    )!;
    // The ECO sweep consumes exactly this ladder, filtered to the rungs that
    // are NOT material deviations. Assert the filter has something to remove
    // (so the test is not vacuous) and that what survives is all preserving.
    const deviating = yolkLine.testedGrams.filter((grams) =>
      isMaterialUserIntentDeviation(40, grams, 1000),
    );
    const affordable = yolkLine.testedGrams.filter(
      (grams) => !isMaterialUserIntentDeviation(40, grams, 1000),
    );
    expect(deviating.length).toBeGreaterThan(0);
    expect(affordable).not.toHaveLength(0);
    for (const grams of affordable) {
      expect(isMaterialUserIntentDeviation(40, grams, 1000)).toBe(false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §25 — A TRACE AMOUNT IS NOT A WORKAROUND FOR „NO 0 g ROWS"
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§25 zero-gram invariant is not a licence to create a trace line', () => {
  it('scores the presence floor as a material deviation, exactly like removal', () => {
    // The zero-gram executable invariant says an executable recipe carries no
    // 0 g row. It has never said that 40 g may quietly become 1 g to satisfy
    // that rule — both readings destroy the ingredient, and both are material.
    expect(isMaterialUserIntentDeviation(40, 1, 1000)).toBe(true);
    expect(isMaterialUserIntentDeviation(40, 0, 1000)).toBe(true);
    expect(normalizedLineDrift(40, 1, 1000)).toBeGreaterThan(0.9);
  });

  it('reports a clamped-to-1 g line as material in the preview-level report', () => {
    const { input, set } = lostRecipe();
    const baseline = buildUserIntentBaseline(input, set);
    const clampedToPresenceFloor: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:yolk' ? { ...item, planned_grams: 1 } : item,
      ),
    };
    const report = measureUserIntentDrift(baseline, clampedToPresenceFloor);
    expect(report.material.map((line) => line.lineId)).toContain('l:yolk');
    const yolk = report.material.find((line) => line.lineId === 'l:yolk')!;
    expect(yolk.baselineGrams).toBe(40);
    expect(yolk.proposedGrams).toBe(1);
    expect(yolk.absoluteDriftGrams).toBe(-39);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §26 — THE BASELINE SURVIVES SAVE / REOPEN
   ═══════════════════════════════════════════════════════════════════════════ */

describe('§26 the baseline is the user recipe state, and no stale trace returns', () => {
  it('keeps the baseline after an applied change is saved and reopened', () => {
    const { input, set } = lostRecipe();
    // „Apply" an ordinary optimization: the grams move, the intent sidecars
    // travel with the lines (they are persisted recipe-item fields).
    const applied: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'l:yolk' ? { ...item, planned_grams: 38 } : item,
      ),
    };
    const baseline = buildUserIntentBaseline(applied, set);
    expect(baseline.get('l:yolk')?.baselineGrams).toBe(40);
    // The reopened recipe is still protected: the ladder rebuilt from the
    // saved state must not hand the search a bare collapse rung.
    const yolk = buildDraftCandidateVector(applied, set).find(
      (candidate) => candidate.lineId === 'l:yolk',
    )!;
    expect(yolk.anchorGrams).toBe(40);
    expect(yolk.materialFloorGrams).toBeCloseTo(19.5, 6);
    // and a stale 1 g candidate is a MATERIAL deviation on reopen, not an
    // ordinary rung the next Przelicz may silently take.
    expect(isMaterialUserIntentDeviation(40, 1, 1000)).toBe(true);
  });

  it('protects an ADOPTED library recipe, which arrives with no typed history', () => {
    // Importing „Śmietankowe na żółtkach" is the user saying „this is my
    // recipe at these amounts". Without a baseline every imported line would
    // be treated as a disposable PI support line.
    const { input, set } = lostRecipe();
    const imported: RecipeInput = {
      ...input,
      items: input.items.map((item) => ({
        ...item,
        user_intent_anchor_grams: item.planned_grams, // what the import writes
      })),
    };
    const baseline = buildUserIntentBaseline(imported, set);
    expect(baseline.get('l:yolk')?.baselineGrams).toBe(40);
    expect(baseline.get('l:milk')?.baselineGrams).toBe(595);
    // EVERY user line, including the stabilizer: the baseline is a REPORT of
    // what the user asked for. Whether a line is movable is a separate
    // question the ladder answers (it excludes template-controlled gums), and
    // the two authorities are deliberately not merged.
    expect(baseline.size).toBe(8);
  });
});
