/**
 * §17 lock/range/batch mechanics (spec §25.1):
 *  - lock preserves the EXACT grams (byte-stable) through apply + a REAL
 *    solver solve + re-solve;
 *  - unlock returns the ingredient to the solver;
 *  - range is respected;
 *  - batch change does NOT silently rescale locked grams.
 * Every solver interaction uses the real engine via the @/engine barrel.
 */
import { describe, expect, it } from 'vitest';
import { applyAutoFix, calculateRecipe, detectViolations, proposeAutoFix } from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  applyConstraintsToRecipe,
  rescaleBatchToTarget,
  validateConstraintSet,
  verifyConstraintsPreserved,
} from './constraintSet';
import { overSweetStarter, starterLine, starterMilkBase, withGrams } from './constraintFixtures';
import type { ConstraintSet } from './constraintTypes';

const SUCROSE = starterLine('sucrose');
const DEXTROSE = starterLine('dextrose');
const MILK = starterLine('milk_3_5');

const lockSet = (lineId: string, grams: number): ConstraintSet => ({
  byLineId: { [lineId]: { mode: 'locked', grams } },
});

describe('validateConstraintSet', () => {
  it('accepts a well-formed set', () => {
    const input = starterMilkBase();
    const result = validateConstraintSet(input, {
      byLineId: {
        [SUCROSE]: { mode: 'locked', grams: 130 },
        [DEXTROSE]: { mode: 'range', minGrams: 20, maxGrams: 40 },
        [MILK]: { mode: 'ai' },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects unknown lines, non-finite and negative grams, min>max', () => {
    const input = starterMilkBase();
    const result = validateConstraintSet(input, {
      byLineId: {
        ghost: { mode: 'locked', grams: 10 },
        [SUCROSE]: { mode: 'locked', grams: Number.NaN },
        [DEXTROSE]: { mode: 'range', minGrams: 50, maxGrams: 40 },
        [MILK]: { mode: 'locked', grams: -1 },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      'negative_grams',
      'non_finite_grams',
      'range_min_above_max',
      'unknown_line',
    ]);
  });

  it('rejects a range that does not contain the current grams (never silently clamped)', () => {
    const input = starterMilkBase(); // sucrose currently 130
    const result = validateConstraintSet(input, {
      byLineId: { [SUCROSE]: { mode: 'range', minGrams: 150, maxGrams: 200 } },
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('current_grams_outside_range');
  });
});

describe('applyConstraintsToRecipe (§17.1–§17.3)', () => {
  it('locked → engine lock_type grams with the EXACT (byte-stable) value', () => {
    const input = starterMilkBase();
    const exact = 137.30000000000001; // deliberately awkward float
    const applied = applyConstraintsToRecipe(input, lockSet(SUCROSE, exact));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const line = applied.input.items.find((item) => item.id === SUCROSE);
    expect(line?.lock_type).toBe('grams');
    expect(Object.is(line?.planned_grams, exact)).toBe(true);
    // never mutates the original
    expect(input.items.find((item) => item.id === SUCROSE)?.planned_grams).toBe(130);
  });

  it('ai explicitly unlocks a previously gram-locked line', () => {
    const base = starterMilkBase();
    const locked = applyConstraintsToRecipe(base, lockSet(SUCROSE, 130));
    if (!locked.ok) throw new Error('lock failed');
    const unlocked = applyConstraintsToRecipe(locked.input, {
      byLineId: { [SUCROSE]: { mode: 'ai' } },
    });
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) return;
    expect(unlocked.input.items.find((item) => item.id === SUCROSE)?.lock_type).toBe('unlocked');
    expect(unlocked.applied).toContainEqual({ lineId: SUCROSE, note: 'ai_unlocked' });
  });

  it('range → held at current grams for the solver (engine has no bounded moves)', () => {
    const input = starterMilkBase();
    const applied = applyConstraintsToRecipe(input, {
      byLineId: { [SUCROSE]: { mode: 'range', minGrams: 100, maxGrams: 160 } },
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const line = applied.input.items.find((item) => item.id === SUCROSE);
    expect(line?.lock_type).toBe('grams');
    expect(line?.planned_grams).toBe(130);
    expect(applied.applied).toContainEqual({ lineId: SUCROSE, note: 'range_held_at_current' });
  });

  it('ai on an engine-protected line keeps the engine lock (§18.1 hierarchy)', () => {
    const input = starterMilkBase();
    input.items[0] = { ...input.items[0]!, lock_type: 'main' };
    const mainLineId = input.items[0]!.id;
    const applied = applyConstraintsToRecipe(input, { byLineId: { [mainLineId]: { mode: 'ai' } } });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.input.items[0]?.lock_type).toBe('main');
    expect(applied.applied).toContainEqual({ lineId: mainLineId, note: 'ai_engine_lock_kept' });
  });

  it('locking a main line keeps lock_type main (scoring unchanged) but sets the exact grams', () => {
    const input = starterMilkBase();
    input.items[0] = { ...input.items[0]!, lock_type: 'main' };
    const mainLineId = input.items[0]!.id;
    const applied = applyConstraintsToRecipe(input, lockSet(mainLineId, 671.5));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.input.items[0]?.lock_type).toBe('main');
    expect(Object.is(applied.input.items[0]?.planned_grams, 671.5)).toBe(true);
    expect(applied.applied).toContainEqual({ lineId: mainLineId, note: 'locked_main_kept' });
  });

  it('a line with actual_grams is left untouched (physically poured, spec §15)', () => {
    const input = starterMilkBase();
    input.items[3] = { ...input.items[3]!, actual_grams: 131, lock_type: 'already_added' };
    const lineId = input.items[3]!.id;
    const applied = applyConstraintsToRecipe(input, lockSet(lineId, 90));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.input.items[3]?.planned_grams).toBe(130); // NOT overwritten
    expect(applied.applied).toContainEqual({ lineId, note: 'actuals_line_untouched' });
  });
});

describe('lock through a REAL solve (§17.2 / §25.1)', () => {
  it('locked grams survive apply + solver full fix + re-solve, bit for bit', () => {
    // Over-sweet + over-dextrosed starter: the real solver fully fixes it by
    // ADDING dairy (verified high confidence) while both sugar locks hold.
    const base = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const set: ConstraintSet = {
      byLineId: {
        [SUCROSE]: { mode: 'locked', grams: 160 },
        [DEXTROSE]: { mode: 'locked', grams: 40 },
      },
    };
    const applied = applyConstraintsToRecipe(base, set);
    if (!applied.ok) throw new Error('apply failed');

    const proposed = proposeAutoFix({
      input: applied.input,
      context: recipeContext(applied.input),
      exactCorrectionGrams: true,
    });
    if (proposed.redacted) throw new Error('unexpected redaction');
    const fullFix = proposed.proposals.find(
      (proposal) => proposal.kind === 'correction' && proposal.confidence === 'high',
    );
    expect(fullFix).toBeDefined();
    if (!fullFix) return;

    const afterApply = applyAutoFix({
      input: applied.input,
      proposal: fullFix,
      context: recipeContext(applied.input),
    });
    expect(afterApply.success).toBe(true);
    if (!afterApply.success) return;

    // §17.2: not changed "even by 0.1 g" — we assert BIT-FOR-BIT.
    const sucroseAfter = afterApply.newInput.items.find((item) => item.id === SUCROSE);
    const dextroseAfter = afterApply.newInput.items.find((item) => item.id === DEXTROSE);
    expect(Object.is(sucroseAfter?.planned_grams, 160)).toBe(true);
    expect(Object.is(dextroseAfter?.planned_grams, 40)).toBe(true);
    expect(verifyConstraintsPreserved(set, afterApply.newInput).ok).toBe(true);

    // independent engine verification: the fix really is a full fix
    const verified = calculateRecipe(afterApply.newInput);
    expect(detectViolations(verified)).toEqual([]);

    // re-solve on the corrected recipe: still nothing touches the locks
    const reProposed = proposeAutoFix({
      input: afterApply.newInput,
      context: recipeContext(afterApply.newInput),
      exactCorrectionGrams: true,
    });
    if (!reProposed.redacted) {
      for (const proposal of reProposed.proposals) {
        for (const action of proposal.actions) {
          expect(action.target_line_id === SUCROSE || action.target_line_id === DEXTROSE).toBe(
            false,
          );
        }
      }
    }
  });

  it('locked line blocks the reduce path; unlock returns it to the solver (§17.2 steps 4–6)', () => {
    const base = overSweetStarter(150); // pod_high only — fixed by reducing sucrose
    const locked = applyConstraintsToRecipe(base, lockSet(SUCROSE, 150));
    if (!locked.ok) throw new Error('apply failed');
    const lockedSolve = proposeAutoFix({
      input: locked.input,
      context: recipeContext(locked.input),
      exactCorrectionGrams: true,
    });
    if (lockedSolve.redacted) throw new Error('unexpected redaction');
    // With the lock: no action may touch the line; the engine reports the
    // locked ingredient as the blocking constraint.
    for (const proposal of lockedSolve.proposals) {
      for (const action of proposal.actions) {
        expect(action.target_line_id).not.toBe(SUCROSE);
      }
    }
    expect(
      lockedSolve.proposals.some(
        (proposal) => proposal.blocking?.constraint === 'locked_ingredient',
      ),
    ).toBe(true);

    // Unlock (mode 'ai') → the solver may now reduce the very same line.
    const unlocked = applyConstraintsToRecipe(locked.input, {
      byLineId: { [SUCROSE]: { mode: 'ai' } },
    });
    if (!unlocked.ok) throw new Error('unlock failed');
    const freeSolve = proposeAutoFix({
      input: unlocked.input,
      context: recipeContext(unlocked.input),
      exactCorrectionGrams: true,
    });
    if (freeSolve.redacted) throw new Error('unexpected redaction');
    const reduce = freeSolve.proposals
      .flatMap((proposal) => proposal.actions)
      .find((action) => action.type === 'reduce' && action.target_line_id === SUCROSE);
    expect(reduce).toBeDefined();

    const appliedFix = applyAutoFix({
      input: unlocked.input,
      proposal: freeSolve.proposals[0]!,
      context: recipeContext(unlocked.input),
    });
    expect(appliedFix.success).toBe(true);
    if (!appliedFix.success) return;
    const after = appliedFix.newInput.items.find((item) => item.id === SUCROSE);
    expect(after?.planned_grams).not.toBe(150); // the unlocked line moved again
  });

  it('range line is never moved outside [min,max] by the solver', () => {
    const base = withGrams(overSweetStarter(160), DEXTROSE, 40);
    const set: ConstraintSet = {
      byLineId: {
        [SUCROSE]: { mode: 'range', minGrams: 150, maxGrams: 170 },
        [DEXTROSE]: { mode: 'range', minGrams: 30, maxGrams: 50 },
      },
    };
    const applied = applyConstraintsToRecipe(base, set);
    if (!applied.ok) throw new Error('apply failed');
    const proposed = proposeAutoFix({
      input: applied.input,
      context: recipeContext(applied.input),
      exactCorrectionGrams: true,
    });
    if (proposed.redacted) throw new Error('unexpected redaction');
    for (const proposal of proposed.proposals) {
      if (proposal.actions.length === 0) continue;
      const outcome = applyAutoFix({
        input: applied.input,
        proposal,
        context: recipeContext(applied.input),
      });
      if (!outcome.success) continue;
      expect(verifyConstraintsPreserved(set, outcome.newInput).ok).toBe(true);
    }
  });
});

describe('batch change (§17.4)', () => {
  it('rescales only unlocked lines; locked grams stay bit-for-bit', () => {
    const input = starterMilkBase(); // total 1000
    const set = lockSet(SUCROSE, 130);
    const rescaled = rescaleBatchToTarget(input, set, 1500);
    expect(rescaled.ok).toBe(true);
    if (!rescaled.ok) return;

    const sucrose = rescaled.input.items.find((item) => item.id === SUCROSE);
    expect(Object.is(sucrose?.planned_grams, 130)).toBe(true); // NOT rescaled

    const total = rescaled.input.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(Math.abs(total - 1500)).toBeLessThan(1e-6);
    expect(rescaled.input.target_batch_grams).toBe(1500);
    // unlocked lines scaled by the single factor (1500 − 130) / (1000 − 130)
    expect(rescaled.scaleFactor).toBeCloseTo((1500 - 130) / 870, 12);
    const milk = rescaled.input.items.find((item) => item.id === MILK);
    expect(milk?.planned_grams).toBeCloseTo(670 * ((1500 - 130) / 870), 9);
    // original untouched
    expect(input.items.find((item) => item.id === MILK)?.planned_grams).toBe(670);
  });

  it('range lines are preserved (not scaled) under a batch change', () => {
    const input = starterMilkBase();
    const set: ConstraintSet = {
      byLineId: { [DEXTROSE]: { mode: 'range', minGrams: 20, maxGrams: 40 } },
    };
    const rescaled = rescaleBatchToTarget(input, set, 800);
    expect(rescaled.ok).toBe(true);
    if (!rescaled.ok) return;
    expect(rescaled.input.items.find((item) => item.id === DEXTROSE)?.planned_grams).toBe(30);
  });

  it('shrinking the batch below the locked sum is an immediate, honest conflict', () => {
    const input = starterMilkBase();
    const rescaled = rescaleBatchToTarget(input, lockSet(MILK, 670), 500);
    expect(rescaled.ok).toBe(false);
    if (rescaled.ok) return;
    expect(rescaled.reason).toBe('locked_sum_exceeds_batch');
    expect(rescaled.minimumBatchGrams).toBe(670);
  });

  it('refuses to rescale once anything was physically poured', () => {
    const input = starterMilkBase();
    input.items[0] = { ...input.items[0]!, actual_grams: 670 };
    const rescaled = rescaleBatchToTarget(input, lockSet(SUCROSE, 130), 1200);
    expect(rescaled.ok).toBe(false);
    if (rescaled.ok) return;
    expect(rescaled.reason).toBe('actuals_present');
  });

  it('refuses when nothing is scalable', () => {
    const input = starterMilkBase();
    const set: ConstraintSet = {
      byLineId: Object.fromEntries(
        input.items.map((item) => [item.id, { mode: 'locked', grams: item.planned_grams }]),
      ),
    };
    const rescaled = rescaleBatchToTarget(input, set, 1200);
    expect(rescaled.ok).toBe(false);
    if (rescaled.ok) return;
    expect(rescaled.reason).toBe('no_scalable_lines');
  });
});

describe('verifyConstraintsPreserved (§17.2 hard guarantee)', () => {
  it('flags even a 0.05 g drift on a locked line (Object.is, no epsilon)', () => {
    const input = starterMilkBase();
    const drifted = withGrams(input, SUCROSE, 130.05);
    const result = verifyConstraintsPreserved(lockSet(SUCROSE, 130), drifted);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([{ lineId: SUCROSE, code: 'locked_grams_changed' }]);
  });

  it('flags a range escape and a missing line', () => {
    const input = starterMilkBase();
    const escaped = withGrams(input, DEXTROSE, 41);
    const set: ConstraintSet = {
      byLineId: {
        [DEXTROSE]: { mode: 'range', minGrams: 20, maxGrams: 40 },
        [SUCROSE]: { mode: 'locked', grams: 130 },
      },
    };
    expect(verifyConstraintsPreserved(set, escaped).violations).toEqual([
      { lineId: DEXTROSE, code: 'range_exceeded' },
    ]);
    const removed = { ...input, items: input.items.filter((item) => item.id !== SUCROSE) };
    expect(verifyConstraintsPreserved(set, removed).violations).toEqual([
      { lineId: SUCROSE, code: 'line_missing' },
    ]);
  });
});
