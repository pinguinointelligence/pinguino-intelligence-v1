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
import {
  analyzeConstraintFeasibility,
  type ConstraintSet,
} from '@/features/recipe-constraints';
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
import { constraintStudioCopy as copy } from './constraintStudioCopy';

const SUCROSE = starterLine('sucrose');
const DEXTROSE = starterLine('dextrose');
const MILK = starterLine('milk_3_5');

const NO_CONSTRAINTS: ConstraintSet = { byLineId: {} };

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
});

describe('commitPreview — THE door (§17.2 hard guarantee)', () => {
  it('applies a verified preview; locked grams are byte-stable through the apply', () => {
    const { input, set } = addFixScenario();
    const built = buildOptimizePreview(input, set, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const outcome = commitPreview(input, set, built.preview, '2026-07-17T12:00:00.000Z', 'apply-1');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.is(lineGrams(outcome.verified.input, SUCROSE), 160)).toBe(true);
    expect(Object.is(lineGrams(outcome.verified.input, DEXTROSE), 40)).toBe(true);
    // §20.1 record: exact before snapshot + trace
    expect(outcome.verified.record.before.input.items.map((item) => item.planned_grams)).toEqual(
      input.items.map((item) => item.planned_grams),
    );
    expect(outcome.verified.record.configVersion.length).toBeGreaterThan(0);
    expect(outcome.verified.record.violationsAfter).toBeLessThanOrEqual(
      outcome.verified.record.violationsBefore,
    );
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
    expect(outcome.messagePl).toContain('Kontrola blokad zatrzymała');
    expect(outcome.messagePl).toContain(sucroseName);
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona');
  });

  it('BLOCKS even a 0.1 g drift on a locked line (§17.2 „nawet o 0,1 g”)', () => {
    const input = starterMilkBase();
    const set: ConstraintSet = { byLineId: { [MILK]: { mode: 'locked', grams: lineGrams(input, MILK) } } };
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
    expect(outcome.code).toBe('constraints_violated');
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
});

describe('batch rescale preview (§17.4)', () => {
  it('preserves an awkward locked float byte-for-byte while the rest scales', () => {
    const awkward = 600.3000000000001; // deliberately awkward float (round-trips exactly)
    const input = withGrams(starterMilkBase(), MILK, awkward);
    const set: ConstraintSet = { byLineId: { [MILK]: { mode: 'locked', grams: awkward } } };

    const built = buildBatchRescalePreview(input, set, 1500, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const outcome = commitPreview(input, set, built.preview, 'now', 'apply-b');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.is(lineGrams(outcome.verified.input, MILK), awkward)).toBe(true);
    const total = outcome.verified.input.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(Math.abs(total - 1500)).toBeLessThanOrEqual(0.1);
    expect(outcome.verified.input.target_batch_grams).toBe(1500);
    // every non-locked line actually moved
    const milkDiff = built.preview.lines.find((line) => line.lineId === MILK);
    expect(milkDiff).toMatchObject({ kind: 'unchanged', locked: true });
    expect(
      built.preview.lines.filter((line) => line.lineId !== MILK).every((line) => line.kind === 'changed'),
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
    expect(built).toMatchObject({ ok: false, code: 'rescale_locked_sum', minimumBatchGrams: 1100 });
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

    const outcome = commitPreview(input, set, built.preview, 'now', 'apply-s');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.is(lineGrams(outcome.verified.input, SUCROSE), action.grams)).toBe(true);
    // the bound was engine-verified clean → the applied state is clean
    expect(detectViolations(calculateRecipe(outcome.verified.input)).length).toBe(0);
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
