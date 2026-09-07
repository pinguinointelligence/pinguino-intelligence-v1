/**
 * §19 pipeline pins (task hard rules):
 *  - EVERY apply passes verifyConstraintsPreserved — the blocked path is
 *    exercised with a forged proposal (locked grams moved) and the commit
 *    refuses with the Polish message; a stale preview is refused too;
 *  - locked grams are byte-stable (Object.is) through optimize apply AND
 *    batch rescale apply;
 *  - honest failure codes (already_clean / no_proposal / rescale_locked_sum);
 *  - §18.2 suggested fix produces a verified-clean outcome and updates the
 *    lock to the computed bound (an explicit user action, never silent).
 * Every solver interaction uses the REAL engine via the @/engine barrel.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { analyzeConstraintFeasibility, type ConstraintSet } from '@/features/recipe-constraints';
import {
  overSweetStarter,
  starterLine,
  starterMilkBase,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  ensureUniqueLineIds,
  workingStateFingerprint,
  type ConstraintPreview,
} from './applyPipeline';
import { effectiveInputCostPerKg } from './ecoDraftCostSweep';
import { constraintStudioCopy as copy } from './constraintStudioCopy';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { classifyViolationBands } from '@/features/formulation/violationBands';

const SUCROSE = starterLine('sucrose');
const DEXTROSE = starterLine('dextrose');
const MILK = starterLine('milk_3_5');
const TARA = starterLine('tara_gum');

const NO_CONSTRAINTS: ConstraintSet = { byLineId: {} };

const unlockedWholeGramBoundaryRecipe = (): RecipeInput => {
  const input = ownerSameInputRecipe();
  return {
    ...input,
    target_temperature_c: -11,
    target_batch_grams: 206,
    items: input.items.map((item) =>
      item.id === 'owner:smp' ? { ...item, planned_grams: 501 } : item,
    ),
  };
};

const lineGrams = (input: RecipeInput, lineId: string): number => {
  const line = input.items.find((item) => item.id === lineId);
  if (!line) throw new Error(`line ${lineId} missing`);
  return line.planned_grams;
};

/** The known ADD-fixable scenario (pinned by the feasibility tests): both
 * sugars locked, the real solver reaches a fix through additions. */
const addFixScenario = (): { input: RecipeInput; set: ConstraintSet } => ({
  input: withGrams(overSweetStarter(160), DEXTROSE, 40),
  set: {
    byLineId: {
      [SUCROSE]: { mode: 'locked', grams: 160 },
      [DEXTROSE]: { mode: 'locked', grams: 40 },
    },
  },
});

describe('buildOptimizePreview (§12.4 → §19.1)', () => {
  it('stages a solver proposal as a diff preview; locked lines stay untouched', () => {
    const { input, set } = addFixScenario();
    const result = buildOptimizePreview(input, set, '2026-07-17T12:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { preview } = result;
    expect(preview.kind).toBe('optimize');
    expect(preview.violationsBefore).toBeGreaterThan(0);

    const sucroseDiff = preview.lines.find((line) => line.lineId === SUCROSE);
    const dextroseDiff = preview.lines.find((line) => line.lineId === DEXTROSE);
    expect(sucroseDiff).toMatchObject({ kind: 'unchanged', locked: true });
    expect(dextroseDiff).toMatchObject({ kind: 'unchanged', locked: true });

    // the proposal genuinely changes something (adds or moves unlocked lines)
    expect(preview.lines.some((line) => line.kind !== 'unchanged')).toBe(true);
    // §20.4: the explanation carries the locked-unchanged truth
    expect(preview.explanation.some((entry) => entry.kind === 'locked_unchanged')).toBe(true);
    // and the ORIGINAL input was never mutated
    expect(lineGrams(input, SUCROSE)).toBe(160);
  });

  it('honestly reports already_clean on the balanced starter', () => {
    const result = buildOptimizePreview(starterMilkBase(), NO_CONSTRAINTS, 'now');
    expect(result).toMatchObject({ ok: false, code: 'already_clean' });
  });

  it('treats missing ECO prices as costing incompleteness, never as a technical refusal', () => {
    const input = structuredClone(starterMilkBase());
    input.goals = { ...input.goals, formulation_strategy: 'eco' };
    input.items[0] = {
      ...input.items[0]!,
      ingredient: { ...input.items[0]!.ingredient, cost_per_kg: null, cost_currency: null },
    };
    const result = buildOptimizePreview(input, NO_CONSTRAINTS, 'now');
    expect(result).toMatchObject({ ok: false, code: 'already_clean' });
  });

  it('keeps Preview and Apply technical success when a Base ingredient price is missing', () => {
    const input = structuredClone(starterMilkBase());
    input.goals = { ...input.goals, formulation_strategy: 'eco' };
    input.items[0] = {
      ...input.items[0]!,
      ingredient: { ...input.items[0]!.ingredient, cost_per_kg: null, cost_currency: null },
    };
    const built = buildBatchRescalePreview(input, NO_CONSTRAINTS, 1_200, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const applied = commitPreview(
      input,
      NO_CONSTRAINTS,
      built.preview,
      'now',
      'apply-with-partial-cost',
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const result = calculateRecipe(applied.verified.input);
    expect(detectViolations(result)).toEqual([]);
    expect(result.costs).toMatchObject({ complete: false, total_cost: null });
    expect(result.costs?.known_cost).toBeGreaterThan(0);
  });

  it('returns NO_CHANGE for a technically clean ECO recipe when no cheaper safe move exists', () => {
    const input = structuredClone(starterMilkBase());
    input.goals = { ...input.goals, formulation_strategy: 'eco' };
    input.items = input.items.map((item) => ({
      ...item,
      ingredient: {
        ...item.ingredient,
        cost_per_kg: 1,
        cost_currency: 'EUR',
      },
    }));

    expect(buildOptimizePreview(input, NO_CONSTRAINTS, 'now')).toMatchObject({
      ok: false,
      code: 'already_clean',
    });
  });

  it('keeps a clean ECO recipe when only the secondary cost objective prefers another point', () => {
    const input = structuredClone(starterMilkBase());
    input.goals = { ...input.goals, formulation_strategy: 'eco' };
    const beforeCost = effectiveInputCostPerKg(input);
    const result = buildOptimizePreview(input, NO_CONSTRAINTS, 'now');

    expect(beforeCost).not.toBeNull();
    expect(result).toMatchObject({ ok: false, code: 'already_clean' });
    expect(input.items.map((item) => item.planned_grams)).toEqual([670, 130, 35, 130, 30, 5]);
  });

  it('never turns a native-clean ECO draft with an unmet direction target into BLOCKED', () => {
    const input = structuredClone(starterMilkBase());
    input.goals = {
      ...input.goals,
      formulation_strategy: 'eco',
      direction_targets_active: true,
      direction_targets: { sweetness: 2, softness: 2, creaminess: 0, flavor: 0 },
    };
    const beforeDirection = recipeDirectionViolations(input);
    expect(detectViolations(calculateRecipe(input))).toHaveLength(0);
    expect(beforeDirection.length).toBeGreaterThan(0);

    const result = buildOptimizePreview(input, NO_CONSTRAINTS, 'now');
    if (!result.ok) {
      expect(result.code).toBe('already_clean');
      return;
    }
    const afterDirection = recipeDirectionViolations(result.preview.proposedInput);
    expect(result.preview.violationsAfter).toBe(0);
    expect(afterDirection.length).toBeLessThanOrEqual(beforeDirection.length);
    expect(
      afterDirection.reduce((sum, violation) => sum + violation.severity_points, 0),
    ).toBeLessThanOrEqual(
      beforeDirection.reduce((sum, violation) => sum + violation.severity_points, 0),
    );
  });

  it('never proposes ADDING a parallel line of a LOCKED ingredient (§17 intent)', () => {
    // Milk locked + over-sweet sucrose: the engine's top proposals add Milk
    // 3.5 % (dilution). Those violate the lock's intent and must be skipped —
    // the staged proposal may not add the locked ingredient anywhere.
    const input = overSweetStarter(220);
    const milkIngredientId =
      input.items.find((item) => item.id === MILK)?.ingredient.id ?? 'milk_3_5';
    const set: ConstraintSet = {
      byLineId: { [MILK]: { mode: 'locked', grams: lineGrams(input, MILK) } },
    };
    const result = buildOptimizePreview(input, set, 'now');
    if (!result.ok) {
      expect(result.code).toBe('no_proposal'); // honest refusal is acceptable
      return;
    }
    // the locked LINE is untouched…
    const milkDiff = result.preview.lines.find((line) => line.lineId === MILK);
    expect(milkDiff).toMatchObject({ kind: 'unchanged', locked: true });
    // …and NO added line carries the locked ingredient
    const addedMilk = result.preview.proposedInput.items.filter(
      (item) => item.id !== MILK && item.ingredient.id === milkIngredientId,
    );
    expect(addedMilk).toEqual([]);
  });

  it('uses the continued whole-gram recipe as the single final violation and Apply authority', () => {
    const input = unlockedWholeGramBoundaryRecipe();
    const result = buildOptimizePreview(input, NO_CONSTRAINTS, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.preview.practicalization?.status).toBe('ready');
    if (result.preview.practicalization?.status !== 'ready') return;
    const exactCandidate = result.preview.practicalization.audit.exactInput;

    // The owner whole-gram authority now keeps both the exact and presented
    // candidate inside the native boundaries.
    expect(classifyViolationBands(exactCandidate).hardMetrics).toEqual([]);
    expect(
      result.preview.proposedInput.items.every((item) => Number.isInteger(item.planned_grams)),
    ).toBe(true);
    expect(
      result.preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0),
    ).toBe(206);
    expect(classifyViolationBands(result.preview.proposedInput).hardMetrics).toEqual([]);
    expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);

    expect(result.preview.violationsAfter).toBe(0);
    expect(result.preview.hardResidualMetrics).toEqual([]);
    expect(result.preview.diagnosticOnly).toBe(false);
    expect(result.preview.diagnosticReason).toBeUndefined();
    expect(result.preview.formulation?.proof).toMatchObject({
      verdict: 'all_bands_in_range',
      bestEffort: false,
      bestEffortReasons: [],
    });

    expect(
      commitPreview(input, NO_CONSTRAINTS, result.preview, 'now', 'apply-whole-boundary').ok,
    ).toBe(true);
  });
});

describe('commitPreview — THE door (§17.2 hard guarantee)', () => {
  it('applies a verified preview; locked grams are byte-stable through the apply', () => {
    // ACCEPTANCE ADDENDUM (3), 2026-07-24: the BOTH-sugars-locked scenario now
    // ends with hard-NATIVE residuals and is diagnostic-only (pinned below) —
    // the apply-mechanics pin uses the hard-safe SINGLE-lock variant (dextrose
    // locked, sucrose free → the solver converges to zero violations).
    const input = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const set: ConstraintSet = { byLineId: { [DEXTROSE]: { mode: 'locked', grams: 40 } } };
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.diagnosticOnly).toBe(false);

    const outcome = commitPreview(input, set, built.preview, '2026-07-17T12:00:00.000Z', 'apply-1');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.is(lineGrams(outcome.verified.input, DEXTROSE), 40)).toBe(true);
    // The free over-sweet sucrose was genuinely moved by the solver.
    expect(lineGrams(outcome.verified.input, SUCROSE)).toBeLessThan(160);
    // §20.1 record: exact before snapshot + trace
    expect(outcome.verified.record.before.input.items.map((item) => item.planned_grams)).toEqual(
      input.items.map((item) => item.planned_grams),
    );
    expect(outcome.verified.record.configVersion.length).toBeGreaterThan(0);
    // Owner P0 batch invariant: the applied recipe keeps the target batch
    // (locked grams byte-stable; unlocked lines carry the batch restoration).
    const appliedSum = outcome.verified.input.items.reduce(
      (sum, item) => sum + item.planned_grams,
      0,
    );
    expect(Math.abs(appliedSum - outcome.verified.input.target_batch_grams)).toBeLessThanOrEqual(
      0.1,
    );
    // violations are REPORTED honestly (a heavily-locked recipe may trade band
    // precision for batch integrity — visible in the preview, never silent).
    expect(Number.isInteger(outcome.verified.record.violationsAfter)).toBe(true);
  });

  it('ADDENDUM (3): the both-locked scenario keeps hard-NATIVE residuals → diagnostic only, door-blocked', () => {
    const { input, set } = addFixScenario();
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Honest diagnostic marking on the preview itself…
    expect(built.preview.diagnosticOnly).toBe(true);
    expect(built.preview.hardResidualMetrics!.length).toBeGreaterThan(0);
    // …and the STRUCTURAL refusal at the door (recomputed, not flag-trusted).
    const outcome = commitPreview(input, set, built.preview, 'now', 'apply-diag');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('hard_residual_violations');
    expect(outcome.messagePl).toContain('Receptura pozostała bez zmian.');
  });

  it('BLOCKS a forged proposal that moves a locked line — Polish message, no state produced', () => {
    const { input, set } = addFixScenario();
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    // Forge: tamper with the proposed input behind the preview's back.
    const forged: ConstraintPreview = {
      ...built.preview,
      proposedInput: {
        ...built.preview.proposedInput,
        items: built.preview.proposedInput.items.map((item) =>
          item.id === SUCROSE ? { ...item, planned_grams: 159.9 } : item,
        ),
      },
    };

    const outcome = commitPreview(input, set, forged, 'now', 'apply-x');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('constraints_violated');
    if (outcome.code !== 'constraints_violated') return;
    expect(outcome.violations[0]?.code).toBe('locked_grams_changed');
    const sucroseName = input.items.find((item) => item.id === SUCROSE)?.ingredient.name ?? '';
    expect(outcome.messagePl).toContain('Propozycja zmieniłaby zablokowane gramatury');
    expect(outcome.messagePl).toContain(sucroseName);
    expect(outcome.messagePl).toContain('Receptura pozostała bez zmian');
  });

  it('BLOCKS even a 0.1 g drift on a locked line (§17.2 „nawet o 0,1 g”)', () => {
    const input = starterMilkBase();
    const set: ConstraintSet = {
      byLineId: { [MILK]: { mode: 'locked', grams: lineGrams(input, MILK) } },
    };
    const rescale = buildBatchRescalePreview(input, set, 1500, 'now');
    expect(rescale.ok).toBe(true);
    if (!rescale.ok) return;
    const drifted: ConstraintPreview = {
      ...rescale.preview,
      proposedInput: {
        ...rescale.preview.proposedInput,
        items: rescale.preview.proposedInput.items.map((item) =>
          item.id === MILK ? { ...item, planned_grams: item.planned_grams + 0.1 } : item,
        ),
      },
    };
    const outcome = commitPreview(input, set, drifted, 'now', 'apply-y');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // The independent executable recheck may reject the forged vector before
    // the legacy lock diagnostic; either way the 0.1 g drift never applies.
    expect(['constraints_violated', 'practicalization_invalid']).toContain(outcome.code);
  });

  it('refuses a STALE preview (recipe changed since it was built)', () => {
    const { input, set } = addFixScenario();
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const changed = withGrams(input, MILK, lineGrams(input, MILK) + 25);
    const outcome = commitPreview(changed, set, built.preview, 'now', 'apply-z');
    expect(outcome).toMatchObject({ ok: false, code: 'stale_preview' });
    if (outcome.ok) return;
    expect(outcome.messagePl).toBe(copy.blocked.stale);
  });

  it('refuses when the CONSTRAINTS changed since the preview was built', () => {
    const { input, set } = addFixScenario();
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const unlockedSet: ConstraintSet = {
      byLineId: { [SUCROSE]: { mode: 'locked', grams: 160 } },
    };
    const outcome = commitPreview(input, unlockedSet, built.preview, 'now', 'apply-w');
    expect(outcome).toMatchObject({ ok: false, code: 'stale_preview' });
  });

  it('rejects a forged Preview that removes authenticated constraints or moves the locked line', () => {
    const input = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const set: ConstraintSet = { byLineId: { [DEXTROSE]: { mode: 'locked', grams: 40 } } };
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const removed: ConstraintPreview = { ...built.preview, nextConstraints: { byLineId: {} } };
    expect(commitPreview(input, set, removed, 'now', 'forged-constraints')).toMatchObject({
      ok: false,
      code: 'stale_preview',
    });

    const moved: ConstraintPreview = {
      ...removed,
      proposedInput: {
        ...removed.proposedInput,
        items: removed.proposedInput.items.map((item) =>
          item.id === DEXTROSE ? { ...item, planned_grams: 41 } : item,
        ),
      },
    };
    expect(commitPreview(input, set, moved, 'now', 'forged-lock-and-constraints')).toMatchObject({
      ok: false,
      code: 'stale_preview',
    });
  });

  it.each([
    ['mode', (input: RecipeInput) => ({ ...input, mode: 'premium' as const })],
    ['category', (input: RecipeInput) => ({ ...input, category: 'sorbet' as const })],
    [
      'temperature',
      (input: RecipeInput) => ({
        ...input,
        target_temperature_c: input.target_temperature_c === -11 ? -12 : -11,
      }),
    ],
    ['machine capacity', (input: RecipeInput) => ({ ...input, machine_capacity_grams: 1500 })],
    [
      'goals',
      (input: RecipeInput) => ({ ...input, goals: { ...input.goals, sweetness: 'high' as const } }),
    ],
  ])('refuses a forged proposed %s context before Engine verification', (_field, forge) => {
    const input = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const set: ConstraintSet = { byLineId: { [DEXTROSE]: { mode: 'locked', grams: 40 } } };
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const forged: ConstraintPreview = {
      ...built.preview,
      proposedInput: forge(built.preview.proposedInput),
    };

    expect(commitPreview(input, set, forged, 'now', 'forged-context')).toMatchObject({
      ok: false,
      code: 'stale_preview',
    });
  });
});

describe('batch rescale preview (§17.4)', () => {
  it('keeps an awkward locked float byte-exact in Preview and blocks non-executable Apply', () => {
    const awkward = 600.3000000000001; // deliberately awkward float (round-trips exactly)
    const input = withGrams(starterMilkBase(), MILK, awkward);
    const set: ConstraintSet = { byLineId: { [MILK]: { mode: 'locked', grams: awkward } } };

    const built = buildBatchRescalePreview(input, set, 1500, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(Object.is(lineGrams(built.preview.proposedInput, MILK), awkward)).toBe(true);
    // The user-owned fractional exact lock wins; it is never rounded behind
    // the padlock.  The whole-gram execution contract therefore blocks Apply.
    const outcome = commitPreview(input, set, built.preview, 'now', 'apply-b');
    expect(outcome).toMatchObject({
      ok: false,
      code: 'practicalization_invalid',
      reason: 'exact_gram_lock_not_whole_gram',
    });

    // every non-locked line was still considered by the exact rescale
    const milkDiff = built.preview.lines.find((line) => line.lineId === MILK);
    expect(milkDiff).toMatchObject({ kind: 'unchanged', locked: true });
    expect(
      built.preview.lines
        .filter((line) => line.lineId !== MILK)
        .every((line) => line.kind === 'changed'),
    ).toBe(true);
  });

  it('refuses honestly when locked mass exceeds the new batch (computed minimum, no guess)', () => {
    const input = starterMilkBase();
    const set: ConstraintSet = {
      byLineId: {
        [MILK]: { mode: 'locked', grams: 800 },
        [SUCROSE]: { mode: 'locked', grams: 300 },
      },
    };
    const adjusted: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === MILK
          ? { ...item, planned_grams: 800 }
          : item.id === SUCROSE
            ? { ...item, planned_grams: 300 }
            : item,
      ),
    };
    const built = buildBatchRescalePreview(adjusted, set, 1000, 'now');
    // Milk + sucrose are user-locked (1100 g) and the 5 g established Tara
    // dose is internally template-controlled, so the real minimum is 1105 g.
    expect(built).toMatchObject({ ok: false, code: 'rescale_locked_sum', minimumBatchGrams: 1105 });
  });

  it('blocks before Preview when scaling would erase a positive Standard anchor below 1 g', () => {
    const base = starterMilkBase();
    const input: RecipeInput = {
      ...base,
      items: [
        ...base.items.map((item, index) =>
          index === 0 ? { ...item, planned_grams: item.planned_grams - 10 } : item,
        ),
        {
          id: 'positive-standard',
          ingredient: findDemoIngredient('inulin')!,
          planned_grams: 10,
          actual_grams: null,
          lock_type: 'unlocked',
          user_intent_anchor_grams: 10,
        },
      ],
    };

    expect(buildBatchRescalePreview(input, NO_CONSTRAINTS, 50, 'now')).toMatchObject({
      ok: false,
      code: 'rescale_invalid',
    });
  });
});

describe('suggested fix (§18.2 „Ustaw X g i przelicz”)', () => {
  it('applies the VERIFIED bound, updates the lock, and lands clean', () => {
    const input = overSweetStarter(220);
    const set: ConstraintSet = { byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } } };

    const analysis = analyzeConstraintFeasibility(input, set);
    expect(analysis.status).toBe('infeasible_with_bound');
    if (analysis.status !== 'infeasible_with_bound') return;
    const action = analysis.conflict.suggestedActions[0];
    expect(action?.type).toBe('set_max');
    if (action?.type !== 'set_max') return;

    const built = buildSuggestedFixPreview(
      input,
      set,
      { type: 'set_max', lineId: action.lineId, grams: action.grams },
      'now',
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    // the changed lock is explicit in the diff (changed + locked)
    const sucroseDiff = built.preview.lines.find((line) => line.lineId === SUCROSE);
    expect(sucroseDiff).toMatchObject({ kind: 'changed', locked: true });
    expect(built.preview.nextConstraints.byLineId[SUCROSE]).toEqual({
      mode: 'locked',
      grams: action.grams,
    });
    // Changing a sugar bound cannot silently rewrite the established,
    // template-controlled stabilizer contract.
    expect(Object.is(lineGrams(built.preview.proposedInput, TARA), lineGrams(input, TARA))).toBe(
      true,
    );

    const authorization = {
      baseFingerprint: built.preview.baseFingerprint,
      type: action.type,
      lineId: action.lineId,
      grams: action.grams,
    } as const;
    const outcome = commitPreview(
      input,
      set,
      built.preview,
      'now',
      'apply-s',
      [],
      undefined,
      null,
      null,
      null,
      authorization,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.is(lineGrams(outcome.verified.input, SUCROSE), action.grams)).toBe(true);
    // the bound was engine-verified clean → the applied state is clean
    expect(detectViolations(calculateRecipe(outcome.verified.input)).length).toBe(0);

    const unrelatedConstraint: ConstraintPreview = {
      ...built.preview,
      nextConstraints: {
        byLineId: {
          ...built.preview.nextConstraints.byLineId,
          [MILK]: { mode: 'locked', grams: lineGrams(input, MILK) },
        },
      },
    };
    expect(
      commitPreview(
        input,
        set,
        unrelatedConstraint,
        'now',
        'forged-suggested-fix',
        [],
        undefined,
        null,
        null,
        null,
        authorization,
      ),
    ).toMatchObject({ ok: false, code: 'stale_preview' });
  });
});

describe('plumbing', () => {
  it('fingerprint changes when grams, batch OR constraints change', () => {
    const input = starterMilkBase();
    const base = workingStateFingerprint(input, NO_CONSTRAINTS);
    expect(workingStateFingerprint(withGrams(input, SUCROSE, 131), NO_CONSTRAINTS)).not.toBe(base);
    expect(
      workingStateFingerprint(input, { byLineId: { [SUCROSE]: { mode: 'locked', grams: 130 } } }),
    ).not.toBe(base);
    expect(workingStateFingerprint(input, NO_CONSTRAINTS)).toBe(base);
  });

  it('ensureUniqueLineIds renames a colliding solver-added line, never a base line', () => {
    const base = starterMilkBase();
    const existing = { ...base.items[0]!, id: 'correction-dextrose-0' };
    const baseWithCorrection: RecipeInput = { ...base, items: [...base.items, existing] };
    const duplicate = { ...existing, planned_grams: 12 };
    const proposed: RecipeInput = {
      ...baseWithCorrection,
      items: [...baseWithCorrection.items, duplicate],
    };
    const fixed = ensureUniqueLineIds(baseWithCorrection, proposed);
    const ids = fixed.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('correction-dextrose-0');
    expect(ids).toContain('correction-dextrose-0~2');
  });
});
